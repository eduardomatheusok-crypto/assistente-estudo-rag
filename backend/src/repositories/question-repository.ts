import { withTransaction, type Db } from '../db/pool.ts';
import type { DroppedCitation, RefusalReason } from '../domain/rag/validate-answer.ts';

export type NewQuestion = {
  id: string;
  notebookId: string;
  question: string;
  strategy: string;
  status: 'answered' | 'not_found';
  refusalReason: RefusalReason | null;
  answer: string;
  model: string | null;
  rawOutput: string | null;
  droppedCitations: DroppedCitation[];
  traceId: string;
  latencyMs: number;
  sources: Array<{ label: string; chunkId: string; rank: number; score: number }>;
  citations: Array<{
    label: string;
    chunkId: string;
    documentId: string;
    quote: string;
    docCharStart: number;
    docCharEnd: number;
    pageNumber: number;
  }>;
};

export type CitationView = {
  id: string;
  position: number;
  label: string;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  quote: string;
  docCharStart: number;
  docCharEnd: number;
  pageNumber: number;
};

export type SourceView = {
  label: string;
  rank: number;
  score: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageStart: number;
  pageEnd: number;
};

export type QuestionView = {
  id: string;
  notebookId: string;
  question: string;
  strategy: string;
  status: 'answered' | 'not_found';
  refusalReason: RefusalReason | null;
  answer: string;
  model: string | null;
  traceId: string;
  latencyMs: number;
  createdAt: Date;
  citations: CitationView[];
  sources: SourceView[];
};

/** Citação com o trecho original ao redor, para o estudante conferir a fonte. */
export type CitationContext = CitationView & {
  mimeType: string;
  chunkText: string;
  chunkCharStart: number;
  /** Posição da citação dentro de chunkText. */
  quoteStartInChunk: number;
  quoteEndInChunk: number;
};

const CITATION_COLUMNS = `
  ct.id, ct.position, ct.label, ct.chunk_id AS "chunkId", ct.document_id AS "documentId",
  d.title AS "documentTitle", ct.quote, ct.doc_char_start AS "docCharStart",
  ct.doc_char_end AS "docCharEnd", ct.page_number AS "pageNumber"`;

export class QuestionRepository {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async insert(q: NewQuestion): Promise<void> {
    await withTransaction(this.db, async (client) => {
      await client.query(
        `INSERT INTO questions
           (id, notebook_id, question, strategy, status, refusal_reason, answer, model,
            raw_output, dropped_citations, trace_id, latency_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          q.id,
          q.notebookId,
          q.question,
          q.strategy,
          q.status,
          q.refusalReason,
          q.answer,
          q.model,
          q.rawOutput,
          JSON.stringify(q.droppedCitations),
          q.traceId,
          q.latencyMs,
        ],
      );
      if (q.sources.length > 0) {
        await client.query(
          `INSERT INTO question_sources (question_id, label, chunk_id, rank, score)
           SELECT $1, s.label, s.chunk_id, s.rank, s.score
             FROM jsonb_to_recordset($2::jsonb) AS s(label text, chunk_id uuid, rank int, score float8)`,
          [q.id, JSON.stringify(q.sources.map((s) => ({ label: s.label, chunk_id: s.chunkId, rank: s.rank, score: s.score })))],
        );
      }
      if (q.citations.length > 0) {
        await client.query(
          `INSERT INTO citations
             (question_id, position, label, chunk_id, document_id, quote, doc_char_start, doc_char_end, page_number)
           SELECT $1, c.position, c.label, c.chunk_id, c.document_id, c.quote,
                  c.doc_char_start, c.doc_char_end, c.page_number
             FROM jsonb_to_recordset($2::jsonb) AS c(
               position int, label text, chunk_id uuid, document_id uuid, quote text,
               doc_char_start int, doc_char_end int, page_number int)`,
          [
            q.id,
            JSON.stringify(
              q.citations.map((c, position) => ({
                position,
                label: c.label,
                chunk_id: c.chunkId,
                document_id: c.documentId,
                quote: c.quote,
                doc_char_start: c.docCharStart,
                doc_char_end: c.docCharEnd,
                page_number: c.pageNumber,
              })),
            ),
          ],
        );
      }
    });
  }

  async findById(id: string): Promise<QuestionView | null> {
    const { rows } = await this.db.query<Omit<QuestionView, 'citations' | 'sources'>>(
      `SELECT id, notebook_id AS "notebookId", question, strategy, status,
              refusal_reason AS "refusalReason", answer, model, trace_id AS "traceId",
              latency_ms AS "latencyMs", created_at AS "createdAt"
         FROM questions WHERE id = $1`,
      [id],
    );
    const question = rows[0];
    if (!question) return null;

    const [citations, sources] = await Promise.all([
      this.db.query<CitationView>(
        `SELECT ${CITATION_COLUMNS}
           FROM citations ct JOIN documents d ON d.id = ct.document_id
          WHERE ct.question_id = $1 ORDER BY ct.position`,
        [id],
      ),
      this.db.query<SourceView>(
        `SELECT s.label, s.rank, s.score, s.chunk_id AS "chunkId", c.document_id AS "documentId",
                d.title AS "documentTitle", c.page_start AS "pageStart", c.page_end AS "pageEnd"
           FROM question_sources s
           JOIN chunks c ON c.id = s.chunk_id
           JOIN documents d ON d.id = c.document_id
          WHERE s.question_id = $1 ORDER BY s.rank`,
        [id],
      ),
    ]);
    return { ...question, citations: citations.rows, sources: sources.rows };
  }

  async listByNotebook(notebookId: string, limit: number): Promise<QuestionView[]> {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id FROM (
         SELECT id, created_at FROM questions WHERE notebook_id = $1 ORDER BY created_at DESC LIMIT $2
       ) recent ORDER BY created_at`,
      [notebookId, limit],
    );
    const questions = await Promise.all(rows.map((row) => this.findById(row.id)));
    return questions.filter((q): q is QuestionView => q !== null);
  }

  async findCitation(id: string): Promise<CitationContext | null> {
    const { rows } = await this.db.query<CitationContext>(
      `SELECT ${CITATION_COLUMNS}, d.mime_type AS "mimeType", c.text AS "chunkText",
              c.char_start AS "chunkCharStart",
              ct.doc_char_start - c.char_start AS "quoteStartInChunk",
              ct.doc_char_end - c.char_start AS "quoteEndInChunk"
         FROM citations ct
         JOIN documents d ON d.id = ct.document_id
         JOIN chunks c ON c.id = ct.chunk_id
        WHERE ct.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }
}
