import { withTransaction, type Db } from '../db/pool.ts';
import type { PageLocation } from '../domain/highlights/locate.ts';
import type { RejectReason } from '../domain/highlights/validate.ts';

export type Criterion = {
  id: string;
  notebookId: string | null;
  key: string;
  label: string;
  instruction: string;
  builtin: boolean;
};

export type RunStatus = 'processing' | 'ready' | 'failed';

export type RunView = {
  id: string;
  documentId: string;
  criterion: { id: string; key: string; label: string };
  status: RunStatus;
  batchesTotal: number;
  batchesDone: number;
  highlightCount: number;
  rejectedCount: number;
  error: string | null;
  model: string;
  traceId: string;
  createdAt: Date;
  finishedAt: Date | null;
  /** Soma das chamadas ao LLM deste run. */
  usage: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
  /** Do início ao fim (ou até agora, se ainda processando). */
  latencyMs: number;
};

export type HighlightView = {
  id: string;
  runId: string;
  criterion: { id: string; key: string; label: string };
  text: string;
  justification: string;
  pageNumber: number;
  docCharStart: number;
  docCharEnd: number;
  locations: PageLocation[];
};

export type NewValidHighlight = {
  chunkId: string;
  text: string;
  justification: string;
  docCharStart: number;
  docCharEnd: number;
  pageNumber: number;
  locations: PageLocation[];
};

export type NewRejectedHighlight = {
  chunkId: string | null;
  text: string;
  justification: string;
  reason: RejectReason;
};

const CRITERION_COLUMNS = `
  id, notebook_id AS "notebookId", key, label, instruction, (notebook_id IS NULL) AS builtin`;

export class HighlightRepository {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  /** Predefinidos primeiro, depois os do caderno. */
  async listCriteria(notebookId: string): Promise<Criterion[]> {
    const { rows } = await this.db.query<Criterion>(
      `SELECT ${CRITERION_COLUMNS} FROM highlight_criteria
        WHERE notebook_id IS NULL OR notebook_id = $1
        ORDER BY (notebook_id IS NULL) DESC, created_at, label`,
      [notebookId],
    );
    return rows;
  }

  async findCriteria(ids: string[], notebookId: string): Promise<Criterion[]> {
    const { rows } = await this.db.query<Criterion>(
      `SELECT ${CRITERION_COLUMNS} FROM highlight_criteria
        WHERE id = ANY($1::uuid[]) AND (notebook_id IS NULL OR notebook_id = $2)`,
      [ids, notebookId],
    );
    return rows;
  }

  async keyExists(notebookId: string, key: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `SELECT 1 FROM highlight_criteria WHERE key = $1 AND (notebook_id IS NULL OR notebook_id = $2)`,
      [key, notebookId],
    );
    return rows.length > 0;
  }

  async createCriterion(input: { notebookId: string; key: string; label: string; instruction: string }): Promise<Criterion> {
    const { rows } = await this.db.query<Criterion>(
      `INSERT INTO highlight_criteria (notebook_id, key, label, instruction)
       VALUES ($1, $2, $3, $4) RETURNING ${CRITERION_COLUMNS}`,
      [input.notebookId, input.key, input.label, input.instruction],
    );
    return rows[0]!;
  }

  /** Só critérios do caderno (predefinidos não são apagados). */
  async deleteCriterion(id: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      'DELETE FROM highlight_criteria WHERE id = $1 AND notebook_id IS NOT NULL',
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  async findCriterion(id: string): Promise<Criterion | null> {
    const { rows } = await this.db.query<Criterion>(`SELECT ${CRITERION_COLUMNS} FROM highlight_criteria WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async hasProcessingRun(documentId: string, criterionId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `SELECT 1 FROM highlight_runs WHERE document_id = $1 AND criterion_id = $2 AND status = 'processing'`,
      [documentId, criterionId],
    );
    return rows.length > 0;
  }

  async createRun(input: { id: string; documentId: string; criterionId: string; model: string; traceId: string }): Promise<void> {
    await this.db.query(
      `INSERT INTO highlight_runs (id, document_id, criterion_id, model, trace_id) VALUES ($1, $2, $3, $4, $5)`,
      [input.id, input.documentId, input.criterionId, input.model, input.traceId],
    );
  }

  async setBatchesTotal(runId: string, total: number): Promise<void> {
    await this.db.query('UPDATE highlight_runs SET batches_total = $2 WHERE id = $1', [runId, total]);
  }

  /** Grava o resultado de um lote e avança o progresso, numa transação. */
  async saveBatch(
    run: { id: string; documentId: string; criterionId: string },
    valid: NewValidHighlight[],
    rejected: NewRejectedHighlight[],
  ): Promise<void> {
    await withTransaction(this.db, async (client) => {
      const rows = [
        ...valid.map((h) => ({
          chunk_id: h.chunkId,
          status: 'valid',
          reject_reason: null,
          text: h.text,
          justification: h.justification,
          doc_char_start: h.docCharStart,
          doc_char_end: h.docCharEnd,
          page_number: h.pageNumber,
          locations: h.locations,
        })),
        ...rejected.map((h) => ({
          chunk_id: h.chunkId,
          status: 'rejected',
          reject_reason: h.reason,
          text: h.text,
          justification: h.justification,
          doc_char_start: null,
          doc_char_end: null,
          page_number: null,
          locations: [],
        })),
      ];
      if (rows.length > 0) {
        await client.query(
          `INSERT INTO highlights
             (run_id, document_id, criterion_id, chunk_id, status, reject_reason, text, justification,
              doc_char_start, doc_char_end, page_number, locations)
           SELECT $1, $2, $3, h.chunk_id, h.status, h.reject_reason, h.text, h.justification,
                  h.doc_char_start, h.doc_char_end, h.page_number, h.locations
             FROM jsonb_to_recordset($4::jsonb) AS h(
               chunk_id uuid, status text, reject_reason text, text text, justification text,
               doc_char_start int, doc_char_end int, page_number int, locations jsonb)`,
          [run.id, run.documentId, run.criterionId, JSON.stringify(rows)],
        );
      }
      await client.query(
        `UPDATE highlight_runs
            SET batches_done = batches_done + 1,
                highlight_count = highlight_count + $2,
                rejected_count = rejected_count + $3
          WHERE id = $1`,
        [run.id, valid.length, rejected.length],
      );
    });
  }

  async finishRun(runId: string, status: 'ready' | 'failed', error: string | null = null): Promise<void> {
    await this.db.query(
      `UPDATE highlight_runs SET status = $2, error = $3, finished_at = now() WHERE id = $1`,
      [runId, status, error],
    );
  }

  async failInterruptedRuns(message: string): Promise<number> {
    const { rowCount } = await this.db.query(
      `UPDATE highlight_runs SET status = 'failed', error = $1, finished_at = now() WHERE status = 'processing'`,
      [message],
    );
    return rowCount ?? 0;
  }

  async findRun(id: string): Promise<RunView | null> {
    const { rows } = await this.db.query<RunView>(
      `SELECT r.id, r.document_id AS "documentId",
              json_build_object('id', c.id, 'key', c.key, 'label', c.label) AS criterion,
              r.status, r.batches_total AS "batchesTotal", r.batches_done AS "batchesDone",
              r.highlight_count AS "highlightCount", r.rejected_count AS "rejectedCount",
              r.error, r.model, r.trace_id AS "traceId", r.created_at AS "createdAt", r.finished_at AS "finishedAt",
              json_build_object(
                'calls', count(l.id)::int,
                'inputTokens', coalesce(sum(l.input_tokens), 0)::int,
                'outputTokens', coalesce(sum(l.output_tokens), 0)::int,
                'costUsd', coalesce(sum(l.cost_usd), 0)::float8
              ) AS usage,
              extract(epoch FROM (coalesce(r.finished_at, now()) - r.created_at)) * 1000 AS "latencyMs"
         FROM highlight_runs r
         JOIN highlight_criteria c ON c.id = r.criterion_id
         LEFT JOIN llm_calls l ON l.ref_type = 'highlight_run' AND l.ref_id = r.id
        WHERE r.id = $1
        GROUP BY r.id, c.id`,
      [id],
    );
    return rows[0] ?? null;
  }

  /**
   * Grifos válidos do documento. Sem runId: os do run mais recente de cada
   * critério (rodar de novo substitui o resultado anterior na visualização).
   */
  async listValid(documentId: string, filter: { criterionId?: string; runId?: string }): Promise<HighlightView[]> {
    const { rows } = await this.db.query<HighlightView>(
      `WITH chosen AS (
         SELECT DISTINCT ON (criterion_id) id FROM highlight_runs
          WHERE document_id = $1 AND ($2::uuid IS NULL OR criterion_id = $2)
          ORDER BY criterion_id, created_at DESC
       )
       SELECT h.id, h.run_id AS "runId",
              json_build_object('id', c.id, 'key', c.key, 'label', c.label) AS criterion,
              h.text, h.justification, h.page_number AS "pageNumber",
              h.doc_char_start AS "docCharStart", h.doc_char_end AS "docCharEnd", h.locations
         FROM highlights h
         JOIN highlight_criteria c ON c.id = h.criterion_id
        WHERE h.document_id = $1 AND h.status = 'valid'
          AND ($2::uuid IS NULL OR h.criterion_id = $2)
          AND (CASE WHEN $3::uuid IS NULL THEN h.run_id IN (SELECT id FROM chosen) ELSE h.run_id = $3 END)
        ORDER BY h.doc_char_start, c.label`,
      [documentId, filter.criterionId ?? null, filter.runId ?? null],
    );
    return rows;
  }
}
