import { randomUUID } from 'node:crypto';
import { withTransaction, type Db } from '../db/pool.ts';
import type { GoalType } from '../domain/practice/generation.ts';
import type { TopicStats } from '../domain/practice/priorities.ts';

export type ItemKind = 'mcq' | 'open' | 'card';
export type SessionMode = 'simulation' | 'flashcards';
export type SessionFocus = 'general' | 'errors' | 'question';

export type ItemSource = {
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  quote: string;
  docCharStart: number;
  docCharEnd: number;
};

export type StoredItem = {
  id: string;
  kind: ItemKind;
  topic: string;
  prompt: string;
  options: string[] | null;
  correctOption: number | null;
  referenceAnswer: string;
  source: ItemSource;
};

export type StoredAttempt = {
  itemId: string;
  answerText: string | null;
  chosenOption: number | null;
  correct: boolean;
  score: number;
  feedback: string | null;
  evaluatedBy: 'code' | 'llm' | 'self';
  /** Entrevista: notas por critério (0 a 10), resposta-modelo, o que faltou e o formato usado. */
  rubric: Record<string, number> | null;
  modelAnswer: string | null;
  missingPoints: string[] | null;
  answerFormat: 'free' | 'guided' | 'star' | null;
  /** Quantas vezes a questão foi respondida nesta sessão ("Tentar de novo"). */
  tries: number;
  createdAt: Date;
};

export type StoredSession = {
  id: string;
  notebookId: string;
  goalType: GoalType;
  mode: SessionMode;
  focus: SessionFocus;
  questionId: string | null;
  status: 'active' | 'finished';
  createdAt: Date;
  finishedAt: Date | null;
};

export type NewItem = {
  kind: ItemKind;
  /** Obrigatório nos cartões: o objetivo para o qual a frente foi escrita. */
  goalType: GoalType | null;
  topic: string;
  prompt: string;
  options: string[] | null;
  correctOption: number | null;
  referenceAnswer: string;
  chunkId: string;
  documentId: string;
  sourceQuote: string;
  docCharStart: number;
  docCharEnd: number;
  pageNumber: number;
};

export type NotebookOverview = {
  counts: {
    questions: number;
    highlights: number;
    flashcardsReviewed: number;
    /** Média das notas nas simulações (0 a 1), ou null sem simulações. */
    simulationAverage: number | null;
    sessionsThisWeek: number;
  };
  documents: Array<{ documentId: string; highlights: number }>;
  recentQuestions: Array<{
    id: string;
    question: string;
    status: string;
    citations: number;
    firstCitationId: string | null;
    createdAt: Date;
  }>;
  recentSessions: Array<{
    id: string;
    mode: SessionMode;
    goalType: GoalType;
    topic: string | null;
    total: number;
    answered: number;
    correct: number;
    createdAt: Date;
  }>;
};

export type GenerationChunk = { id: string; documentId: string; text: string; charStart: number };

const ITEM_COLUMNS = `
  i.id, i.kind, i.topic, i.prompt, i.options, i.correct_option AS "correctOption",
  i.reference_answer AS "referenceAnswer",
  json_build_object(
    'documentId', i.document_id, 'documentTitle', d.title, 'pageNumber', i.page_number,
    'quote', i.source_quote, 'docCharStart', i.doc_char_start, 'docCharEnd', i.doc_char_end
  ) AS source`;

export class PracticeRepository {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async getProfile(notebookId: string): Promise<{ goalType: GoalType } | null> {
    const { rows } = await this.db.query<{ goalType: GoalType }>(
      `SELECT goal_type AS "goalType" FROM study_profiles WHERE notebook_id = $1`,
      [notebookId],
    );
    return rows[0] ?? null;
  }

  async setProfile(notebookId: string, goalType: GoalType): Promise<void> {
    await this.db.query(
      `INSERT INTO study_profiles (notebook_id, goal_type) VALUES ($1, $2)
       ON CONFLICT (notebook_id) DO UPDATE SET goal_type = EXCLUDED.goal_type, updated_at = now()`,
      [notebookId, goalType],
    );
  }

  /**
   * Trechos de uma resposta do chat (base do "Treinar este assunto"):
   * os citados primeiro, depois os demais recuperados pela busca (até 5 no total).
   */
  async chunksOfQuestion(questionId: string): Promise<GenerationChunk[]> {
    const { rows } = await this.db.query<GenerationChunk>(
      `SELECT c.id, c.document_id AS "documentId", c.text, c.char_start AS "charStart"
         FROM question_sources s
         JOIN chunks c ON c.id = s.chunk_id
        WHERE s.question_id = $1
        ORDER BY EXISTS (SELECT 1 FROM citations ct WHERE ct.question_id = $1 AND ct.chunk_id = c.id) DESC, s.rank`,
      [questionId],
    );
    return rows;
  }

  /** Amostra de trechos do caderno (simulado geral), até `maxChars` caracteres. */
  async sampleChunks(notebookId: string, maxChars: number): Promise<GenerationChunk[]> {
    const { rows } = await this.db.query<GenerationChunk>(
      `SELECT c.id, c.document_id AS "documentId", c.text, c.char_start AS "charStart"
         FROM chunks c JOIN documents d ON d.id = c.document_id
        WHERE d.notebook_id = $1 AND d.status = 'ready'
        ORDER BY random() LIMIT 40`,
      [notebookId],
    );
    const picked: GenerationChunk[] = [];
    let size = 0;
    for (const row of rows) {
      if (picked.length > 0 && size + row.text.length > maxChars) break;
      picked.push(row);
      size += row.text.length;
    }
    return picked;
  }

  /**
   * Questões/cartões ainda nunca respondidos (reaproveitamento: evita gerar de novo).
   * Cartões só se reaproveitam no mesmo objetivo (termo de prova ≠ pergunta de entrevista).
   */
  async unusedItems(
    notebookId: string,
    kind: ItemKind,
    chunkIds: string[] | null,
    limit: number,
    goalType: GoalType,
  ): Promise<StoredItem[]> {
    const { rows } = await this.db.query<StoredItem>(
      `SELECT ${ITEM_COLUMNS}
         FROM practice_items i JOIN documents d ON d.id = i.document_id
        WHERE i.notebook_id = $1 AND i.kind = $2
          AND ($3::uuid[] IS NULL OR i.chunk_id = ANY($3::uuid[]))
          AND (i.kind <> 'card' OR i.goal_type = $5)
          AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.item_id = i.id)
        ORDER BY i.created_at
        LIMIT $4`,
      [notebookId, kind, chunkIds, limit, goalType],
    );
    return rows;
  }

  /**
   * Questões cuja tentativa MAIS RECENTE foi um erro ("meus erros").
   * Acertou depois? Sai da lista. Os cartões vencidos vêm primeiro.
   */
  async erroredItems(notebookId: string, kind: ItemKind | null, limit: number): Promise<StoredItem[]> {
    const { rows } = await this.db.query<StoredItem>(
      `WITH latest AS (
         SELECT DISTINCT ON (a.item_id) a.item_id, a.correct
           FROM attempts a JOIN practice_items pi ON pi.id = a.item_id
          WHERE pi.notebook_id = $1
          ORDER BY a.item_id, a.created_at DESC
       )
       SELECT ${ITEM_COLUMNS}
         FROM latest l
         JOIN practice_items i ON i.id = l.item_id
         JOIN documents d ON d.id = i.document_id
         LEFT JOIN flashcard_state f ON f.item_id = i.id
        WHERE NOT l.correct AND ($2::text IS NULL OR i.kind = $2)
        ORDER BY f.due_at NULLS FIRST, i.created_at
        LIMIT $3`,
      [notebookId, kind, limit],
    );
    return rows;
  }

  /** Os ids são gerados aqui: a ordem devolvida é exatamente a ordem recebida. */
  async insertItems(notebookId: string, items: NewItem[]): Promise<string[]> {
    if (items.length === 0) return [];
    const ids = items.map(() => randomUUID());
    await this.db.query(
      `INSERT INTO practice_items
         (id, notebook_id, kind, goal_type, topic, prompt, options, correct_option, reference_answer,
          chunk_id, document_id, source_quote, doc_char_start, doc_char_end, page_number)
       SELECT x.id, $1, x.kind, x.goal_type, x.topic, x.prompt, x.options, x.correct_option, x.reference_answer,
              x.chunk_id, x.document_id, x.source_quote, x.doc_char_start, x.doc_char_end, x.page_number
         FROM jsonb_to_recordset($2::jsonb) AS x(
           id uuid, kind text, goal_type text, topic text, prompt text, options jsonb, correct_option int, reference_answer text,
           chunk_id uuid, document_id uuid, source_quote text, doc_char_start int, doc_char_end int,
           page_number int)`,
      [
        notebookId,
        JSON.stringify(
          items.map((it, i) => ({
            id: ids[i],
            kind: it.kind,
            goal_type: it.goalType,
            topic: it.topic,
            prompt: it.prompt,
            options: it.options,
            correct_option: it.correctOption,
            reference_answer: it.referenceAnswer,
            chunk_id: it.chunkId,
            document_id: it.documentId,
            source_quote: it.sourceQuote,
            doc_char_start: it.docCharStart,
            doc_char_end: it.docCharEnd,
            page_number: it.pageNumber,
          })),
        ),
      ],
    );
    return ids;
  }

  async findItems(ids: string[]): Promise<StoredItem[]> {
    const { rows } = await this.db.query<StoredItem>(
      `SELECT ${ITEM_COLUMNS} FROM practice_items i JOIN documents d ON d.id = i.document_id WHERE i.id = ANY($1::uuid[])`,
      [ids],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is StoredItem => r !== undefined);
  }

  async createSession(session: Omit<StoredSession, 'status' | 'createdAt' | 'finishedAt'>, itemIds: string[]): Promise<void> {
    await withTransaction(this.db, async (client) => {
      await client.query(
        `INSERT INTO practice_sessions (id, notebook_id, goal_type, mode, focus, question_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [session.id, session.notebookId, session.goalType, session.mode, session.focus, session.questionId],
      );
      await client.query(
        `INSERT INTO session_items (session_id, item_id, position)
         SELECT $1, item_id, ord FROM unnest($2::uuid[]) WITH ORDINALITY AS t(item_id, ord)`,
        [session.id, itemIds],
      );
    });
  }

  /** Acrescenta itens ao fim de uma sessão ("gerar mais" flashcards). */
  async appendItems(sessionId: string, itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;
    await this.db.query(
      `INSERT INTO session_items (session_id, item_id, position)
       SELECT $1, item_id, (SELECT coalesce(max(position), 0) FROM session_items WHERE session_id = $1) + ord
         FROM unnest($2::uuid[]) WITH ORDINALITY AS t(item_id, ord)`,
      [sessionId, itemIds],
    );
  }

  async findSession(id: string): Promise<{ session: StoredSession; items: StoredItem[]; attempts: StoredAttempt[] } | null> {
    const { rows } = await this.db.query<StoredSession>(
      `SELECT id, notebook_id AS "notebookId", goal_type AS "goalType", mode, focus, question_id AS "questionId",
              status, created_at AS "createdAt", finished_at AS "finishedAt"
         FROM practice_sessions WHERE id = $1`,
      [id],
    );
    const session = rows[0];
    if (!session) return null;
    const [items, attempts] = await Promise.all([
      this.db.query<StoredItem>(
        `SELECT ${ITEM_COLUMNS}
           FROM session_items si
           JOIN practice_items i ON i.id = si.item_id
           JOIN documents d ON d.id = i.document_id
          WHERE si.session_id = $1 ORDER BY si.position`,
        [id],
      ),
      // Só a tentativa mais recente de cada questão vale (as anteriores ficam no histórico).
      this.db.query<StoredAttempt>(
        `SELECT DISTINCT ON (item_id)
                item_id AS "itemId", answer_text AS "answerText", chosen_option AS "chosenOption", correct, score,
                feedback, evaluated_by AS "evaluatedBy", rubric, model_answer AS "modelAnswer",
                missing_points AS "missingPoints", answer_format AS "answerFormat",
                (count(*) OVER (PARTITION BY item_id))::int AS tries, created_at AS "createdAt"
           FROM attempts WHERE session_id = $1
          ORDER BY item_id, created_at DESC`,
        [id],
      ),
    ]);
    return { session, items: items.rows, attempts: attempts.rows };
  }

  async insertAttempt(input: {
    sessionId: string;
    itemId: string;
    answerText: string | null;
    chosenOption: number | null;
    correct: boolean;
    score: number;
    feedback: string | null;
    evaluatedBy: 'code' | 'llm' | 'self';
    rubric?: Record<string, number> | null;
    modelAnswer?: string | null;
    missingPoints?: string[] | null;
    answerFormat?: 'free' | 'guided' | 'star' | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO attempts
         (session_id, item_id, answer_text, chosen_option, correct, score, feedback, evaluated_by,
          rubric, model_answer, missing_points, answer_format)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        input.sessionId,
        input.itemId,
        input.answerText,
        input.chosenOption,
        input.correct,
        input.score,
        input.feedback,
        input.evaluatedBy,
        input.rubric ? JSON.stringify(input.rubric) : null,
        input.modelAnswer ?? null,
        input.missingPoints ? JSON.stringify(input.missingPoints) : null,
        input.answerFormat ?? null,
      ],
    );
  }

  async finishSession(id: string): Promise<void> {
    await this.db.query(
      `UPDATE practice_sessions SET status = 'finished', finished_at = now() WHERE id = $1 AND status = 'active'`,
      [id],
    );
  }

  async getFlashcardBox(itemId: string): Promise<number> {
    const { rows } = await this.db.query<{ box: number }>('SELECT box FROM flashcard_state WHERE item_id = $1', [itemId]);
    return rows[0]?.box ?? 1;
  }

  async saveFlashcardState(itemId: string, box: number, dueAt: Date): Promise<void> {
    await this.db.query(
      `INSERT INTO flashcard_state (item_id, box, due_at) VALUES ($1, $2, $3)
       ON CONFLICT (item_id) DO UPDATE SET box = EXCLUDED.box, due_at = EXCLUDED.due_at, updated_at = now()`,
      [itemId, box, dueAt],
    );
  }

  /**
   * Visão geral do caderno (tela inicial). Métricas de aprendizagem vêm das
   * tentativas; nada aqui chama o LLM.
   */
  async overview(notebookId: string): Promise<NotebookOverview> {
    const [counts, documents, recentQuestions, recentSessions] = await Promise.all([
      this.db.query<NotebookOverview['counts']>(
        `SELECT
           (SELECT count(*)::int FROM questions WHERE notebook_id = $1) AS questions,
           (SELECT count(*)::int FROM highlights h JOIN documents d ON d.id = h.document_id
             WHERE d.notebook_id = $1 AND h.status = 'valid') AS highlights,
           (SELECT count(*)::int FROM attempts a JOIN practice_sessions s ON s.id = a.session_id
             WHERE s.notebook_id = $1 AND a.evaluated_by = 'self') AS "flashcardsReviewed",
           (SELECT avg(a.score)::float8 FROM attempts a JOIN practice_sessions s ON s.id = a.session_id
             WHERE s.notebook_id = $1 AND a.evaluated_by IN ('code', 'llm')) AS "simulationAverage",
           (SELECT count(*)::int FROM practice_sessions WHERE notebook_id = $1 AND created_at > now() - interval '7 days') AS "sessionsThisWeek"`,
        [notebookId],
      ),
      this.db.query<{ documentId: string; highlights: number }>(
        `SELECT d.id AS "documentId", count(h.id) FILTER (WHERE h.status = 'valid')::int AS highlights
           FROM documents d LEFT JOIN highlights h ON h.document_id = d.id
          WHERE d.notebook_id = $1 GROUP BY d.id`,
        [notebookId],
      ),
      this.db.query<NotebookOverview['recentQuestions'][number]>(
        `SELECT q.id, q.question, q.status, q.created_at AS "createdAt",
                (SELECT count(*)::int FROM citations c WHERE c.question_id = q.id) AS citations,
                -- A primeira citação: clicar na pergunta abre o documento nesse trecho.
                (SELECT c.id FROM citations c WHERE c.question_id = q.id ORDER BY c.position LIMIT 1) AS "firstCitationId"
           FROM questions q WHERE q.notebook_id = $1 ORDER BY q.created_at DESC LIMIT 3`,
        [notebookId],
      ),
      this.db.query<NotebookOverview['recentSessions'][number]>(
        `SELECT s.id, s.mode, s.goal_type AS "goalType", s.created_at AS "createdAt",
                (SELECT count(*)::int FROM session_items si WHERE si.session_id = s.id) AS total,
                (SELECT count(DISTINCT a.item_id)::int FROM attempts a WHERE a.session_id = s.id) AS answered,
                (SELECT count(*)::int FROM (
                   SELECT DISTINCT ON (a.item_id) a.correct FROM attempts a
                    WHERE a.session_id = s.id ORDER BY a.item_id, a.created_at DESC) last WHERE last.correct) AS correct,
                (SELECT i.topic FROM session_items si JOIN practice_items i ON i.id = si.item_id
                  WHERE si.session_id = s.id ORDER BY si.position LIMIT 1) AS topic
           FROM practice_sessions s WHERE s.notebook_id = $1 ORDER BY s.created_at DESC LIMIT 3`,
        [notebookId],
      ),
    ]);
    return {
      counts: counts.rows[0]!,
      documents: documents.rows,
      recentQuestions: recentQuestions.rows,
      recentSessions: recentSessions.rows,
    };
  }

  /** Desempenho por assunto: base das prioridades (métricas de aprendizagem). */
  async topicStats(notebookId: string): Promise<Array<TopicStats & { source: (ItemSource & { itemId: string }) | null }>> {
    const { rows } = await this.db.query<TopicStats & { source: (ItemSource & { itemId: string }) | null }>(
      `SELECT i.topic,
              count(*)::int AS attempts,
              count(*) FILTER (WHERE NOT a.correct)::int AS errors,
              max(a.created_at) AS "lastPracticedAt",
              (SELECT json_build_object(
                        'itemId', i2.id, 'documentId', i2.document_id, 'documentTitle', d2.title, 'pageNumber', i2.page_number,
                        'quote', i2.source_quote, 'docCharStart', i2.doc_char_start, 'docCharEnd', i2.doc_char_end)
                 FROM attempts a2
                 JOIN practice_items i2 ON i2.id = a2.item_id
                 JOIN documents d2 ON d2.id = i2.document_id
                WHERE i2.notebook_id = $1 AND i2.topic = i.topic AND NOT a2.correct
                ORDER BY a2.created_at DESC LIMIT 1) AS source
         FROM attempts a JOIN practice_items i ON i.id = a.item_id
        WHERE i.notebook_id = $1
        GROUP BY i.topic`,
      [notebookId],
    );
    return rows;
  }
}
