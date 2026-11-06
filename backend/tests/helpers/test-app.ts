import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type App } from '../../src/app.ts';
import type { Env } from '../../src/config/env.ts';
import { migrate } from '../../src/db/migrate.ts';
import { createPool, type Db } from '../../src/db/pool.ts';
import { EMBEDDING_DIMENSIONS } from '../../src/providers/embeddings/embedding-provider.ts';
import { FakeEmbeddingProvider } from '../../src/providers/embeddings/fake-embedding-provider.ts';
import type {
  JsonGenerationRequest,
  JsonGenerationResult,
  LlmProvider,
} from '../../src/providers/llm/llm-provider.ts';

/** LLM de teste: devolve o que a função `respond` decidir e guarda os pedidos. */
export class StubLlm implements LlmProvider {
  readonly provider = 'fake';
  readonly model = 'fake';
  readonly requests: JsonGenerationRequest[] = [];
  respond: (request: JsonGenerationRequest) => Partial<JsonGenerationResult> & { text: string } = () => ({
    text: '{"status":"not_found","answer":"","citations":[]}',
  });

  async generateJson(request: JsonGenerationRequest): Promise<JsonGenerationResult> {
    this.requests.push(request);
    return { finishReason: 'STOP', inputTokens: 100, outputTokens: 20, ...this.respond(request) };
  }
}

export type TestContext = { db: Db; app: App; llm: StubLlm; close: () => Promise<void> };

/**
 * Sobe o app contra TEST_DATABASE_URL (banco zerado e migrado), com
 * embeddings e LLM falsos. O nome do banco precisa terminar em "_test".
 */
export async function createTestApp(url: string, overrides: Partial<Env> = {}): Promise<TestContext> {
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL precisa apontar para um banco terminado em _test.');
  }
  const db = createPool(url);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db, () => {});

  const storageDir = await mkdtemp(join(tmpdir(), 'notebook-test-'));
  const env: Env = {
    DATABASE_URL: url,
    PORT: 0,
    STORAGE_DIR: storageDir,
    MAX_UPLOAD_MB: 5,
    CHUNK_SIZE: 120,
    CHUNK_OVERLAP: 0,
    EMBEDDING_PROVIDER: 'fake',
    GEMINI_API_KEY: 'unused',
    GEMINI_EMBEDDING_MODEL: 'unused',
    GEMINI_LLM_MODEL: 'unused',
    GEMINI_THINKING_LEVEL: 'LOW',
    HIGHLIGHT_BATCH_CHARS: 6000,
    ...overrides,
  };
  const llm = new StubLlm();
  const app = await buildApp(env, db, {
    logger: process.env.TEST_LOG === '1',
    embeddings: new FakeEmbeddingProvider(EMBEDDING_DIMENSIONS),
    llm,
  });

  return {
    db,
    app,
    llm,
    close: async () => {
      await app.app.close();
      await db.end();
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}
