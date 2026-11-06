import type { Queryable } from '../db/pool.ts';
import type { Chunk, ChunkingOptions, PageRange } from '../domain/chunking/chunker.ts';
import type { ExtractedPage, PositionedTextItem } from '../domain/extraction/types.ts';

export type PageRecord = {
  pageNumber: number;
  width: number | null;
  height: number | null;
  charStart: number;
  charEnd: number;
  text: string;
  textItems: PositionedTextItem[];
};

export type ChunkRecord = {
  id: string;
  chunkIndex: number;
  text: string;
  charStart: number;
  charEnd: number;
  pageStart: number;
  pageEnd: number;
  chunkSize: number;
  chunkOverlap: number;
};

/** Páginas e chunks extraídos de um documento. */
export class ContentRepository {
  private readonly db: Queryable;

  constructor(db: Queryable) {
    this.db = db;
  }

  async insertPages(documentId: string, pages: ExtractedPage[]): Promise<void> {
    if (pages.length === 0) return;
    await this.db.query(
      `INSERT INTO document_pages
         (document_id, page_number, width, height, char_start, char_end, text, text_items)
       SELECT $1, p.page_number, p.width, p.height, p.char_start, p.char_end, p.text, p.text_items
         FROM jsonb_to_recordset($2::jsonb) AS p(
           page_number int, width real, height real, char_start int, char_end int,
           text text, text_items jsonb)`,
      [
        documentId,
        JSON.stringify(
          pages.map((page) => ({
            page_number: page.pageNumber,
            width: page.width,
            height: page.height,
            char_start: page.charStart,
            char_end: page.charEnd,
            text: page.text,
            text_items: page.items,
          })),
        ),
      ],
    );
  }

  /** Grava os chunks com seus embeddings (embeddings[i] pertence a chunks[i]). */
  async insertChunks(
    documentId: string,
    chunks: Chunk[],
    options: ChunkingOptions,
    embeddings: { model: string; vectors: number[][] },
  ): Promise<void> {
    if (chunks.length === 0) return;
    if (embeddings.vectors.length !== chunks.length) {
      throw new Error(`${chunks.length} chunks e ${embeddings.vectors.length} embeddings.`);
    }
    await this.db.query(
      `INSERT INTO chunks
         (document_id, chunk_index, text, char_start, char_end, page_start, page_end,
          chunk_size, chunk_overlap, embedding, embedding_model)
       SELECT $1, c.chunk_index, c.text, c.char_start, c.char_end, c.page_start, c.page_end,
              $3, $4, c.embedding::vector, $5
         FROM jsonb_to_recordset($2::jsonb) AS c(
           chunk_index int, text text, char_start int, char_end int, page_start int, page_end int,
           embedding text)`,
      [
        documentId,
        JSON.stringify(
          chunks.map((chunk, i) => ({
            chunk_index: chunk.index,
            text: chunk.text,
            char_start: chunk.charStart,
            char_end: chunk.charEnd,
            page_start: chunk.pageStart,
            page_end: chunk.pageEnd,
            embedding: JSON.stringify(embeddings.vectors[i]),
          })),
        ),
        options.chunkSize,
        options.chunkOverlap,
        embeddings.model,
      ],
    );
  }

  async findPage(documentId: string, pageNumber: number): Promise<PageRecord | null> {
    const { rows } = await this.db.query<PageRecord>(
      `SELECT page_number AS "pageNumber", width, height, char_start AS "charStart",
              char_end AS "charEnd", text, text_items AS "textItems"
         FROM document_pages WHERE document_id = $1 AND page_number = $2`,
      [documentId, pageNumber],
    );
    return rows[0] ?? null;
  }

  /** Intervalos de caracteres de cada página, por documento (para achar a página de um offset). */
  async pageRanges(documentIds: string[]): Promise<Map<string, PageRange[]>> {
    const { rows } = await this.db.query<PageRange & { documentId: string }>(
      `SELECT document_id AS "documentId", page_number AS "pageNumber",
              char_start AS "charStart", char_end AS "charEnd"
         FROM document_pages WHERE document_id = ANY($1::uuid[])
        ORDER BY document_id, page_number`,
      [documentIds],
    );
    const byDocument = new Map<string, PageRange[]>();
    for (const { documentId, ...range } of rows) {
      const list = byDocument.get(documentId) ?? [];
      list.push(range);
      byDocument.set(documentId, list);
    }
    return byDocument;
  }

  /** Itens posicionados de cada página (base para converter grifos em retângulos). */
  async pageItems(documentId: string): Promise<Array<{ pageNumber: number; items: PositionedTextItem[] }>> {
    const { rows } = await this.db.query<{ pageNumber: number; items: PositionedTextItem[] }>(
      `SELECT page_number AS "pageNumber", text_items AS items
         FROM document_pages WHERE document_id = $1 ORDER BY page_number`,
      [documentId],
    );
    return rows;
  }

  /** Chunks do documento em ordem (entrada do grifo por lotes). */
  async chunksOf(documentId: string): Promise<Array<{ id: string; text: string; charStart: number }>> {
    const { rows } = await this.db.query<{ id: string; text: string; charStart: number }>(
      `SELECT id, text, char_start AS "charStart" FROM chunks WHERE document_id = $1 ORDER BY chunk_index`,
      [documentId],
    );
    return rows;
  }

  async listChunks(
    documentId: string,
    page: { limit: number; offset: number },
  ): Promise<{ total: number; items: ChunkRecord[] }> {
    const [list, count] = await Promise.all([
      this.db.query<ChunkRecord>(
        `SELECT id, chunk_index AS "chunkIndex", text, char_start AS "charStart",
                char_end AS "charEnd", page_start AS "pageStart", page_end AS "pageEnd",
                chunk_size AS "chunkSize", chunk_overlap AS "chunkOverlap"
           FROM chunks WHERE document_id = $1
          ORDER BY chunk_index LIMIT $2 OFFSET $3`,
        [documentId, page.limit, page.offset],
      ),
      this.db.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM chunks WHERE document_id = $1',
        [documentId],
      ),
    ]);
    return { total: count.rows[0]?.total ?? 0, items: list.rows };
  }
}
