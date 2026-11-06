import multipart from '@fastify/multipart';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from './config/env.ts';
import type { Db } from './db/pool.ts';
import { validateChunkingOptions } from './domain/chunking/chunker.ts';
import {
  EMBEDDING_DIMENSIONS,
  EmbeddingProviderError,
  type EmbeddingProvider,
} from './providers/embeddings/embedding-provider.ts';
import { FakeEmbeddingProvider } from './providers/embeddings/fake-embedding-provider.ts';
import { GeminiEmbeddingProvider } from './providers/embeddings/gemini-embedding-provider.ts';
import { MeteredEmbeddingProvider } from './providers/embeddings/metered-embedding-provider.ts';
import { GeminiLlmProvider } from './providers/llm/gemini-llm-provider.ts';
import { LlmProviderError, type LlmProvider } from './providers/llm/llm-provider.ts';
import { MeteredLlmProvider } from './providers/llm/metered-llm-provider.ts';
import { RetryableError } from './providers/retry.ts';
import { LocalFileStorage } from './providers/storage/file-storage.ts';
import { ContentRepository } from './repositories/content-repository.ts';
import { DocumentRepository } from './repositories/document-repository.ts';
import { HighlightRepository } from './repositories/highlight-repository.ts';
import { LlmCallRepository } from './repositories/llm-call-repository.ts';
import { NotebookRepository } from './repositories/notebook-repository.ts';
import { QuestionRepository } from './repositories/question-repository.ts';
import { SearchRepository } from './repositories/search-repository.ts';
import { StepTimingRepository } from './repositories/step-timing-repository.ts';
import { documentRoutes } from './routes/document-routes.ts';
import { highlightRoutes } from './routes/highlight-routes.ts';
import { notebookRoutes } from './routes/notebook-routes.ts';
import { questionRoutes } from './routes/question-routes.ts';
import { searchRoutes } from './routes/search-routes.ts';
import { DocumentService } from './services/document-service.ts';
import { ServiceError } from './services/errors.ts';
import { HighlightService } from './services/highlight-service.ts';
import { NotebookService } from './services/notebook-service.ts';
import { QuestionService } from './services/question-service.ts';
import { SearchService } from './services/search-service.ts';

export type App = { app: FastifyInstance; documents: DocumentService; highlights: HighlightService };

function createEmbeddingProvider(env: Env): EmbeddingProvider {
  if (env.EMBEDDING_PROVIDER === 'fake') return new FakeEmbeddingProvider(EMBEDDING_DIMENSIONS);
  return new GeminiEmbeddingProvider({
    apiKey: env.GEMINI_API_KEY!,
    model: env.GEMINI_EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
  });
}

/** Raiz de composição: instancia provedores, repositórios, serviços e rotas. */
export async function buildApp(
  env: Env,
  db: Db,
  options: { logger?: boolean; embeddings?: EmbeddingProvider; llm?: LlmProvider } = {},
): Promise<App> {
  const chunking = { chunkSize: env.CHUNK_SIZE, chunkOverlap: env.CHUNK_OVERLAP };
  validateChunkingOptions(chunking);

  const app = Fastify({ logger: options.logger ?? true });
  await app.register(multipart, {
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  });

  const onSinkError = (error: unknown) => app.log.error({ err: error }, 'falha ao registrar métrica');
  const timings = new StepTimingRepository(db);
  // Os serviços só recebem o provedor medido: toda chamada registra tokens, custo e latência.
  const embeddings = new MeteredEmbeddingProvider(
    options.embeddings ?? createEmbeddingProvider(env),
    new LlmCallRepository(db),
    onSinkError,
  );
  const llm = new MeteredLlmProvider(
    options.llm ??
      new GeminiLlmProvider({
        apiKey: env.GEMINI_API_KEY!,
        model: env.GEMINI_LLM_MODEL,
        thinkingLevel: env.GEMINI_THINKING_LEVEL,
      }),
    new LlmCallRepository(db),
    onSinkError,
  );

  const storage = new LocalFileStorage(env.STORAGE_DIR);
  const notebookRepository = new NotebookRepository(db);
  const documentRepository = new DocumentRepository(db);

  const notebooks = new NotebookService({
    notebooks: notebookRepository,
    documents: documentRepository,
    storage,
  });
  const documents = new DocumentService({
    db,
    notebooks: notebookRepository,
    documents: documentRepository,
    storage,
    timings,
    embeddings,
    chunking,
    logger: app.log,
  });
  const search = new SearchService({
    notebooks: notebookRepository,
    search: new SearchRepository(db),
    embeddings,
    timings,
    onSinkError,
  });
  const questions = new QuestionService({
    notebooks: notebookRepository,
    questions: new QuestionRepository(db),
    content: new ContentRepository(db),
    search,
    llm,
    timings,
    onSinkError,
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ServiceError) {
      return reply.code(error.statusCode).send({ error: error.message, ...error.details });
    }
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: 'Requisição inválida.', issues: z.flattenError(error) });
    }
    if (error instanceof RetryableError) {
      request.log.warn({ err: error }, 'provedor indisponível');
      return reply.code(503).send({ error: 'Provedor de IA indisponível ou no limite de uso. Tente novamente.' });
    }
    if (error instanceof EmbeddingProviderError || error instanceof LlmProviderError) {
      request.log.error({ err: error }, 'erro do provedor de IA');
      return reply.code(502).send({ error: 'Erro no provedor de IA.' });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    request.log.error({ err: error }, 'erro não tratado');
    return reply.code(500).send({ error: 'Erro interno.' });
  });

  const highlights = new HighlightService({
    documents: documentRepository,
    highlights: new HighlightRepository(db),
    content: new ContentRepository(db),
    llm,
    timings,
    onSinkError,
    batchChars: env.HIGHLIGHT_BATCH_CHARS,
    logger: app.log,
  });

  notebookRoutes(app, notebooks);
  documentRoutes(app, documents);
  searchRoutes(app, search);
  questionRoutes(app, questions);
  highlightRoutes(app, highlights);
  app.get('/health', () => ({ ok: true }));

  return { app, documents, highlights };
}
