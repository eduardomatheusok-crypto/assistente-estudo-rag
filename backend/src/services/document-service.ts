import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { withTransaction, type Db } from '../db/pool.ts';
import { chunkText, type Chunk, type ChunkingOptions } from '../domain/chunking/chunker.ts';
import {
  EmbeddingProviderError,
  type EmbeddingProvider,
} from '../providers/embeddings/embedding-provider.ts';
import { RetryableError } from '../providers/retry.ts';
import { detectMimeType, fileExtension } from '../domain/extraction/file-type.ts';
import { ExtractionError, extractDocument } from '../domain/extraction/index.ts';
import type { FileStorage } from '../providers/storage/file-storage.ts';
import { ContentRepository, type ChunkRecord, type PageRecord } from '../repositories/content-repository.ts';
import type { DocumentRecord, DocumentRepository } from '../repositories/document-repository.ts';
import type { NotebookRepository } from '../repositories/notebook-repository.ts';
import { Trace, type TimingSink } from '../telemetry/trace.ts';
import { conflict, notFound, unsupportedMedia } from './errors.ts';

type Logger = { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };

export type DocumentServiceDeps = {
  db: Db;
  notebooks: NotebookRepository;
  documents: DocumentRepository;
  storage: FileStorage;
  timings: TimingSink;
  embeddings: EmbeddingProvider;
  chunking: ChunkingOptions;
  logger: Logger;
};

export class DocumentService {
  private readonly deps: DocumentServiceDeps;
  /** Processamentos em andamento (permite aguardar no desligamento e nos testes). */
  private readonly running = new Set<Promise<void>>();

  constructor(deps: DocumentServiceDeps) {
    this.deps = deps;
  }

  /**
   * Recebe o upload, grava o arquivo e registra o documento como 'processing'.
   * A extração e o chunking rodam em segundo plano; o cliente acompanha pelo status.
   */
  async upload(input: {
    notebookId: string;
    filename: string;
    bytes: Uint8Array;
    title?: string;
  }): Promise<DocumentRecord> {
    const { documents, notebooks, storage, timings, logger } = this.deps;
    if (!(await notebooks.findById(input.notebookId))) throw notFound('Caderno');

    const trace = new Trace('ingestion', timings, { notebookId: input.notebookId }, (error) =>
      logger.error({ err: error }, 'falha ao registrar latência'),
    );

    const mimeType = await trace.step('detect_type', () => detectMimeType(input.filename, input.bytes));
    if (!mimeType) {
      throw unsupportedMedia('Formato não suportado. Envie PDF, Markdown (.md) ou texto (.txt).');
    }

    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    const existing = await documents.findByNotebookAndSha(input.notebookId, sha256);
    if (existing) {
      throw conflict('Este arquivo já existe no caderno.', { documentId: existing.id });
    }

    const storagePath = `${sha256}.${fileExtension(mimeType)}`;
    const savedNow = await trace.step('store_file', () => storage.save(storagePath, input.bytes), {
      sizeBytes: input.bytes.byteLength,
    });

    let document: DocumentRecord;
    try {
      document = await documents.create({
        notebookId: input.notebookId,
        title: input.title?.trim() || titleFromFilename(input.filename),
        originalFilename: input.filename,
        mimeType,
        storagePath,
        sha256,
        sizeBytes: input.bytes.byteLength,
      });
    } catch (error) {
      if (savedNow && !(await documents.isStoragePathReferenced(storagePath))) {
        await storage.remove(storagePath);
      }
      if ((error as { code?: string }).code === '23505') {
        throw conflict('Este arquivo já existe no caderno.');
      }
      throw error;
    }

    this.track(this.process(document, input.bytes, trace));
    return document;
  }

  private async process(document: DocumentRecord, bytes: Uint8Array, trace: Trace): Promise<void> {
    const { db, documents, chunking, logger } = this.deps;
    const meta = { documentId: document.id };
    try {
      const extracted = await trace.step('extract', () => extractDocument(bytes, document.mimeType), {
        ...meta,
        mimeType: document.mimeType,
      });
      const chunks = await trace.step('chunk', () => chunkText(extracted.text, extracted.pages, chunking), {
        ...meta,
        ...chunking,
        textLength: extracted.text.length,
      });
      // Embeddings antes de gravar: se o provedor falhar, nada fica pela metade no banco.
      const vectors = await trace.step('embed', () => this.embedChunks(document, chunks), {
        ...meta,
        chunks: chunks.length,
        model: this.deps.embeddings.model,
      });
      await trace.step(
        'persist',
        () =>
          withTransaction(db, async (client) => {
            const content = new ContentRepository(client);
            await content.insertPages(document.id, extracted.pages);
            await content.insertChunks(document.id, chunks, chunking, {
              model: this.deps.embeddings.model,
              vectors,
            });
          }),
        { ...meta, pages: extracted.pages.length, chunks: chunks.length },
      );
      await documents.markReady(document.id, {
        pageCount: extracted.pages.length,
        chunkCount: chunks.length,
      });
      logger.info({ ...meta, traceId: trace.id, chunks: chunks.length }, 'documento processado');
    } catch (error) {
      const message =
        error instanceof ExtractionError
          ? error.message
          : error instanceof EmbeddingProviderError || error instanceof RetryableError
            ? `Falha ao gerar embeddings: ${error.message}`
            : 'Erro interno ao processar o documento.';
      logger.error({ ...meta, traceId: trace.id, err: error }, 'falha na ingestão');
      await documents.markFailed(document.id, message).catch(() => {});
    }
  }

  /** Lotes sequenciais: respeita o limite de requisições da cota gratuita. */
  private async embedChunks(document: DocumentRecord, chunks: Chunk[]): Promise<number[][]> {
    const { embeddings } = this.deps;
    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += embeddings.maxBatchSize) {
      const batch = chunks.slice(i, i + embeddings.maxBatchSize);
      const result = await embeddings.embedDocuments(
        batch.map((chunk) => ({ title: document.title, text: chunk.text })),
        { operation: 'embed_document', refType: 'document', refId: document.id },
      );
      vectors.push(...result.vectors);
    }
    return vectors;
  }

  private track(promise: Promise<void>): void {
    this.running.add(promise);
    void promise.finally(() => this.running.delete(promise));
  }

  /** Aguarda todos os processamentos em andamento. */
  async whenIdle(): Promise<void> {
    await Promise.all([...this.running]);
  }

  /** Na inicialização: documentos interrompidos por uma parada do servidor viram 'failed'. */
  failInterrupted(): Promise<number> {
    return this.deps.documents.failInterrupted(
      'Processamento interrompido (servidor reiniciado). Envie o arquivo novamente.',
    );
  }

  async listByNotebook(notebookId: string): Promise<DocumentRecord[]> {
    if (!(await this.deps.notebooks.findById(notebookId))) throw notFound('Caderno');
    return this.deps.documents.listByNotebook(notebookId);
  }

  async get(id: string): Promise<DocumentRecord> {
    const document = await this.deps.documents.findById(id);
    if (!document) throw notFound('Documento');
    return document;
  }

  async openFile(id: string): Promise<{ document: DocumentRecord; stream: Readable }> {
    const document = await this.get(id);
    return { document, stream: this.deps.storage.stream(document.storagePath) };
  }

  async getPage(id: string, pageNumber: number): Promise<PageRecord> {
    await this.get(id);
    const page = await new ContentRepository(this.deps.db).findPage(id, pageNumber);
    if (!page) throw notFound('Página');
    return page;
  }

  async listChunks(
    id: string,
    page: { limit: number; offset: number },
  ): Promise<{ total: number; items: ChunkRecord[] }> {
    await this.get(id);
    return new ContentRepository(this.deps.db).listChunks(id, page);
  }

  async delete(id: string): Promise<void> {
    const document = await this.get(id);
    await this.deps.documents.delete(id);
    if (!(await this.deps.documents.isStoragePathReferenced(document.storagePath))) {
      await this.deps.storage.remove(document.storagePath);
    }
  }
}

function titleFromFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.replace(/\.[^.]+$/, '') || base;
}
