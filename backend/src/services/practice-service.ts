import { randomUUID } from 'node:crypto';
import { pageAt } from '../domain/chunking/chunker.ts';
import type { Passage } from '../domain/highlights/batches.ts';
import { locateRange, type PageLocation } from '../domain/highlights/locate.ts';
import {
  buildEvaluationPrompt,
  EVALUATION_SYSTEM_PROMPT,
  evaluationJsonSchema,
  parseEvaluation,
} from '../domain/practice/evaluation.ts';
import {
  buildGenerationSystemPrompt,
  ITEMS_PER_SIMULATION,
  outputJsonSchema,
  validateGeneratedItems,
  type GoalType,
} from '../domain/practice/generation.ts';
import { rankPriorities, type Priority } from '../domain/practice/priorities.ts';
import { nextReview } from '../domain/practice/spaced-repetition.ts';
import { buildHighlightUserPrompt } from '../domain/highlights/prompt.ts';
import type { LlmProvider } from '../providers/llm/llm-provider.ts';
import type { ContentRepository } from '../repositories/content-repository.ts';
import type { NotebookRepository } from '../repositories/notebook-repository.ts';
import type {
  GenerationChunk,
  ItemSource,
  PracticeRepository,
  SessionFocus,
  SessionMode,
  StoredAttempt,
  StoredItem,
  StoredSession,
} from '../repositories/practice-repository.ts';
import { Trace, type TimingSink } from '../telemetry/trace.ts';
import { badRequest, conflict, notFound, ServiceError } from './errors.ts';

/** Flashcards por rodada. */
const FLASHCARDS_PER_SESSION = 10;
/** Texto máximo enviado numa geração (1 chamada). */
const GENERATION_MAX_CHARS = 12_000;

export type PracticeServiceDeps = {
  notebooks: NotebookRepository;
  practice: PracticeRepository;
  content: ContentRepository;
  llm: LlmProvider;
  timings: TimingSink;
  onSinkError: (error: unknown) => void;
};

/** Questão como a interface vê: a resposta só aparece depois de respondida (ou no verso do flashcard). */
export type ItemView = {
  id: string;
  kind: 'mcq' | 'open';
  topic: string;
  prompt: string;
  options: string[] | null;
  source: ItemSource;
  attempt: StoredAttempt | null;
  /** Revelados após a resposta (simulação) ou sempre (flashcards). */
  correctOption: number | null;
  referenceAnswer: string | null;
};

export type SessionView = StoredSession & {
  persona: 'examinador' | 'entrevistador';
  items: ItemView[];
  summary: { answered: number; total: number; correct: number; averageScore: number | null };
};

export class PracticeService {
  private readonly deps: PracticeServiceDeps;

  constructor(deps: PracticeServiceDeps) {
    this.deps = deps;
  }

  async getProfile(notebookId: string): Promise<{ goalType: GoalType | null }> {
    await this.requireNotebook(notebookId);
    return { goalType: (await this.deps.practice.getProfile(notebookId))?.goalType ?? null };
  }

  async setProfile(notebookId: string, goalType: GoalType): Promise<{ goalType: GoalType }> {
    await this.requireNotebook(notebookId);
    await this.deps.practice.setProfile(notebookId, goalType);
    return { goalType };
  }

  /**
   * Monta uma simulação ou rodada de flashcards. Reaproveita questões já
   * geradas e só chama o LLM para o que faltar (economia de cota).
   */
  async start(input: {
    notebookId: string;
    mode: SessionMode;
    focus: SessionFocus;
    questionId?: string;
  }): Promise<SessionView> {
    const { practice, timings, onSinkError } = this.deps;
    await this.requireNotebook(input.notebookId);
    const profile = await practice.getProfile(input.notebookId);
    if (!profile) throw badRequest('Escolha antes o objetivo deste caderno: prova ou entrevista.');
    const goal = profile.goalType;
    const kind = goal === 'prova' ? 'mcq' : 'open';
    const count = input.mode === 'simulation' ? ITEMS_PER_SIMULATION[goal] : FLASHCARDS_PER_SESSION;

    const id = randomUUID();
    const trace = new Trace('practice', timings, { sessionId: id, mode: input.mode, focus: input.focus, goal }, onSinkError);

    let itemIds: string[];
    if (input.focus === 'errors') {
      // Treinar os erros: só reaproveita, nunca gera (custo zero).
      const items = await trace.step('select_items', () =>
        practice.erroredItems(input.notebookId, input.mode === 'simulation' ? kind : null, count),
      );
      if (items.length === 0) throw conflict('Você ainda não tem erros para treinar. Faça uma simulação primeiro.');
      itemIds = items.map((i) => i.id);
    } else {
      let chunks: GenerationChunk[] | null = null;
      if (input.focus === 'question') {
        if (!input.questionId) throw badRequest('Informe a pergunta (questionId).');
        chunks = await practice.chunksOfQuestion(input.questionId);
        if (chunks.length === 0) throw badRequest('Esta resposta não tem citações do material para gerar questões.');
      }
      const reused = await trace.step('select_items', () =>
        practice.unusedItems(input.notebookId, kind, chunks ? chunks.map((c) => c.id) : null, count),
      );
      const missing = count - reused.length;
      const generated =
        missing > 0
          ? await this.generate(trace, id, input.notebookId, goal, missing, chunks ?? (await practice.sampleChunks(input.notebookId, GENERATION_MAX_CHARS)))
          : [];
      itemIds = [...reused.map((i) => i.id), ...generated];
      if (itemIds.length === 0) {
        throw new ServiceError(502, 'Não foi possível gerar questões a partir do material. Tente novamente.');
      }
    }

    await trace.step('persist', () =>
      practice.createSession(
        { id, notebookId: input.notebookId, goalType: goal, mode: input.mode, focus: input.focus, questionId: input.questionId ?? null },
        itemIds,
      ),
    );
    return this.get(id);
  }

  /** 1 chamada ao LLM; questões com fonte inventada são descartadas. */
  private async generate(
    trace: Trace,
    sessionId: string,
    notebookId: string,
    goal: GoalType,
    count: number,
    chunks: GenerationChunk[],
  ): Promise<string[]> {
    if (chunks.length === 0) return [];
    const { llm, practice, content } = this.deps;
    const passages: Passage[] = chunks.map((c, i) => ({ label: `T${i + 1}`, chunkId: c.id, text: c.text, charStart: c.charStart }));
    const generation = await trace.step('generate', () =>
      llm.generateJson(
        {
          system: buildGenerationSystemPrompt(goal, count),
          user: buildHighlightUserPrompt(passages),
          jsonSchema: outputJsonSchema(goal),
          maxOutputTokens: 8192,
        },
        { operation: 'generate_practice', refType: 'practice_session', refId: sessionId },
      ),
    );
    const { items } = await trace.step('validate', () =>
      validateGeneratedItems(goal, generation.text, generation.finishReason, passages),
    );
    const byChunk = new Map(chunks.map((c) => [c.id, c]));
    const documentIds = [...new Set(items.map((i) => byChunk.get(i.chunkId)!.documentId))];
    const pages = await content.pageRanges(documentIds);
    return practice.insertItems(
      notebookId,
      items.slice(0, count).map((item) => {
        const documentId = byChunk.get(item.chunkId)!.documentId;
        return { ...item, documentId, pageNumber: pageAt(pages.get(documentId) ?? [], item.docCharStart) };
      }),
    );
  }

  async get(id: string): Promise<SessionView> {
    const found = await this.deps.practice.findSession(id);
    if (!found) throw notFound('Sessão de prática');
    return toView(found.session, found.items, found.attempts);
  }

  /** Responde uma questão da simulação. Prova: corrige pelo código. Entrevista: 1 chamada ao LLM. */
  async answer(sessionId: string, input: { itemId: string; option?: number; text?: string }): Promise<SessionView> {
    const { practice, llm, timings, onSinkError } = this.deps;
    const found = await practice.findSession(sessionId);
    if (!found) throw notFound('Sessão de prática');
    const { session, items, attempts } = found;
    if (session.mode !== 'simulation') throw badRequest('Esta sessão é de flashcards: use a revisão.');
    if (session.status !== 'active') throw conflict('Esta simulação já terminou.');
    const item = items.find((i) => i.id === input.itemId);
    if (!item) throw notFound('Questão nesta sessão');
    if (attempts.some((a) => a.itemId === item.id)) throw conflict('Esta questão já foi respondida.');

    if (item.kind === 'mcq') {
      if (input.option === undefined) throw badRequest('Escolha uma alternativa.');
      const correct = input.option === item.correctOption;
      await practice.insertAttempt({
        sessionId,
        itemId: item.id,
        answerText: null,
        chosenOption: input.option,
        correct,
        score: correct ? 1 : 0,
        feedback: item.referenceAnswer,
        evaluatedBy: 'code',
      });
    } else {
      const text = input.text?.trim();
      if (!text) throw badRequest('Escreva sua resposta.');
      const trace = new Trace('practice_answer', timings, { sessionId, itemId: item.id }, onSinkError);
      const result = await trace.step('evaluate', () =>
        llm.generateJson(
          {
            system: EVALUATION_SYSTEM_PROMPT,
            user: buildEvaluationPrompt({
              question: item.prompt,
              referenceAnswer: item.referenceAnswer,
              sourceQuote: item.source.quote,
              answer: text,
            }),
            jsonSchema: evaluationJsonSchema(),
            maxOutputTokens: 2048,
          },
          { operation: 'evaluate_answer', refType: 'practice_session', refId: sessionId },
        ),
      );
      const evaluation = parseEvaluation(result.text, result.finishReason);
      // Sem avaliação válida, nada é gravado: o estudante pode reenviar.
      if (!evaluation) throw new ServiceError(502, 'Não foi possível avaliar a resposta agora. Tente enviar de novo.');
      const missing = evaluation.missingPoints.length > 0 ? `\nFaltou: ${evaluation.missingPoints.join('; ')}.` : '';
      await practice.insertAttempt({
        sessionId,
        itemId: item.id,
        answerText: text,
        chosenOption: null,
        correct: evaluation.correct,
        score: evaluation.score / 10,
        feedback: `${evaluation.feedback}${missing}`,
        evaluatedBy: 'llm',
      });
    }
    await this.finishIfComplete(sessionId, items.length, attempts.length + 1);
    return this.get(sessionId);
  }

  /** Flashcard: o estudante diz se lembrou; o código agenda a próxima revisão (sem LLM). */
  async review(sessionId: string, input: { itemId: string; correct: boolean }): Promise<SessionView> {
    const { practice } = this.deps;
    const found = await practice.findSession(sessionId);
    if (!found) throw notFound('Sessão de prática');
    const { session, items, attempts } = found;
    if (session.mode !== 'flashcards') throw badRequest('Esta sessão é uma simulação: use as respostas.');
    if (!items.some((i) => i.id === input.itemId)) throw notFound('Cartão nesta sessão');
    if (attempts.some((a) => a.itemId === input.itemId)) throw conflict('Este cartão já foi revisado nesta rodada.');

    await practice.insertAttempt({
      sessionId,
      itemId: input.itemId,
      answerText: null,
      chosenOption: null,
      correct: input.correct,
      score: input.correct ? 1 : 0,
      feedback: null,
      evaluatedBy: 'self',
    });
    const box = await practice.getFlashcardBox(input.itemId);
    const next = nextReview(box, input.correct, new Date());
    await practice.saveFlashcardState(input.itemId, next.box, next.dueAt);
    await this.finishIfComplete(sessionId, items.length, attempts.length + 1);
    return this.get(sessionId);
  }

  async finish(sessionId: string): Promise<SessionView> {
    await this.get(sessionId);
    await this.deps.practice.finishSession(sessionId);
    return this.get(sessionId);
  }

  /** Assuntos a priorizar, pelo desempenho (sem LLM), com o trecho do material de um erro recente. */
  async priorities(notebookId: string): Promise<Array<Priority & { source: (ItemSource & { itemId: string }) | null }>> {
    await this.requireNotebook(notebookId);
    const stats = await this.deps.practice.topicStats(notebookId);
    const sources = new Map(stats.map((s) => [s.topic, s.source]));
    return rankPriorities(
      stats.map((s) => ({ ...s, lastPracticedAt: new Date(s.lastPracticedAt) })),
      new Date(),
    ).map((p) => ({ ...p, source: sources.get(p.topic) ?? null }));
  }

  /** Onde pintar a fonte de uma questão no PDF (para "ver no material"). */
  async itemSource(itemId: string): Promise<ItemSource & { locations: PageLocation[] }> {
    const [item] = await this.deps.practice.findItems([itemId]);
    if (!item) throw notFound('Questão');
    const pages = await this.deps.content.pageItems(item.source.documentId);
    return { ...item.source, locations: locateRange(pages, item.source.docCharStart, item.source.docCharEnd) };
  }

  private async finishIfComplete(sessionId: string, total: number, answered: number): Promise<void> {
    if (answered >= total) await this.deps.practice.finishSession(sessionId);
  }

  private async requireNotebook(id: string): Promise<void> {
    if (!(await this.deps.notebooks.findById(id))) throw notFound('Caderno');
  }
}

function toView(session: StoredSession, items: StoredItem[], attempts: StoredAttempt[]): SessionView {
  const byItem = new Map(attempts.map((a) => [a.itemId, a]));
  const answered = attempts.length;
  return {
    ...session,
    persona: session.goalType === 'prova' ? 'examinador' : 'entrevistador',
    items: items.map((item) => {
      const attempt = byItem.get(item.id) ?? null;
      const reveal = session.mode === 'flashcards' || attempt !== null;
      return {
        id: item.id,
        kind: item.kind,
        topic: item.topic,
        prompt: item.prompt,
        options: item.options,
        source: item.source,
        attempt,
        correctOption: reveal ? item.correctOption : null,
        referenceAnswer: reveal ? item.referenceAnswer : null,
      };
    }),
    summary: {
      answered,
      total: items.length,
      correct: attempts.filter((a) => a.correct).length,
      averageScore: answered === 0 ? null : attempts.reduce((sum, a) => sum + a.score, 0) / answered,
    },
  };
}
