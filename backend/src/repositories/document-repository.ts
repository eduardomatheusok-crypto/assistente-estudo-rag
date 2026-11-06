import type { Queryable } from '../db/pool.ts';
import type { SupportedMimeType } from '../domain/extraction/types.ts';

export type DocumentStatus = 'processing' | 'ready' | 'failed';

export type DocumentRecord = {
  id: string;
  notebookId: string;
  title: string;
  originalFilename: string;
  mimeType: SupportedMimeType;
  storagePath: string;
  sha256: string;
  sizeBytes: number;
  status: DocumentStatus;
  error: string | null;
  pageCount: number | null;
  chunkCount: number | null;
  createdAt: Date;
  updatedAt: Date;
};

const COLUMNS = `
  id, notebook_id AS "notebookId", title, original_filename AS "originalFilename",
  mime_type AS "mimeType", storage_path AS "storagePath", sha256, size_bytes AS "sizeBytes",
  status, error, page_count AS "pageCount", chunk_count AS "chunkCount",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export type NewDocument = {
  notebookId: string;
  title: string;
  originalFilename: string;
  mimeType: SupportedMimeType;
  storagePath: string;
  sha256: string;
  sizeBytes: number;
};

export class DocumentRepository {
  private readonly db: Queryable;

  constructor(db: Queryable) {
    this.db = db;
  }

  async create(input: NewDocument): Promise<DocumentRecord> {
    const { rows } = await this.db.query<DocumentRecord>(
      `INSERT INTO documents
         (notebook_id, title, original_filename, mime_type, storage_path, sha256, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [
        input.notebookId,
        input.title,
        input.originalFilename,
        input.mimeType,
        input.storagePath,
        input.sha256,
        input.sizeBytes,
      ],
    );
    return rows[0]!;
  }

  async findById(id: string): Promise<DocumentRecord | null> {
    const { rows } = await this.db.query<DocumentRecord>(
      `SELECT ${COLUMNS} FROM documents WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByNotebookAndSha(notebookId: string, sha256: string): Promise<DocumentRecord | null> {
    const { rows } = await this.db.query<DocumentRecord>(
      `SELECT ${COLUMNS} FROM documents WHERE notebook_id = $1 AND sha256 = $2`,
      [notebookId, sha256],
    );
    return rows[0] ?? null;
  }

  async listByNotebook(notebookId: string): Promise<DocumentRecord[]> {
    const { rows } = await this.db.query<DocumentRecord>(
      `SELECT ${COLUMNS} FROM documents WHERE notebook_id = $1 ORDER BY created_at DESC`,
      [notebookId],
    );
    return rows;
  }

  async listStoragePathsByNotebook(notebookId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ storagePath: string }>(
      `SELECT DISTINCT storage_path AS "storagePath" FROM documents WHERE notebook_id = $1`,
      [notebookId],
    );
    return rows.map((row) => row.storagePath);
  }

  async isStoragePathReferenced(storagePath: string): Promise<boolean> {
    const { rows } = await this.db.query(
      'SELECT 1 FROM documents WHERE storage_path = $1 LIMIT 1',
      [storagePath],
    );
    return rows.length > 0;
  }

  async markReady(id: string, counts: { pageCount: number; chunkCount: number }): Promise<void> {
    await this.db.query(
      `UPDATE documents
          SET status = 'ready', error = NULL, page_count = $2, chunk_count = $3, updated_at = now()
        WHERE id = $1`,
      [id, counts.pageCount, counts.chunkCount],
    );
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE documents SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
      [id, error],
    );
  }

  /** Documentos que ficaram em 'processing' porque o servidor parou no meio. */
  async failInterrupted(message: string): Promise<number> {
    const { rowCount } = await this.db.query(
      `UPDATE documents SET status = 'failed', error = $1, updated_at = now()
        WHERE status = 'processing'`,
      [message],
    );
    return rowCount ?? 0;
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.db.query('DELETE FROM documents WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}
