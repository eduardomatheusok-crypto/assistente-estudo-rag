import { randomUUID } from 'node:crypto';
import { pageAt } from '../domain/chunking/chunker.ts';
import type { Passage } from '../domain/highlights/batches.ts';
import { locateRange, type PageLocation } from '../domain/highlights/locate.ts';
import {
  type AnswerFormat,
  buildEvaluationPrompt,
  EVALUATION_SYSTEM_PROMPT,
  evaluationJsonSchema,
  parseEvaluation,
} from '../domain/practice/evaluation.ts';
import {
  buildCardSystemPrompt,
  buildGenerationSystemPrompt,
  CARDS_PER_SESSION,
  cardJsonSchema,
  ITEMS_PER_SIMULATION,
  outputJsonSchema,
  validateGeneratedCards,
  validateGeneratedItems,
  type GeneratedItem,
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
  kind: 'mcq' | 'open' | 'card';
  topic: string;
  /** Enunciado; no cartão, a frente. */
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
    const questionKind = goal === 'prova' ? 'mcq' : 'open';
    // Flashcards têm tipo próprio (frente curta + verso); "erros" reaproveita as questões erradas.
    const kind = input.mode === 'flashcards' && input.focus !== 'errors' ? 'card' : questionKind;
    const count = input.mode === 'simulation' ? ITEMS_PER_SIMULATION[goal] : CARDS_PER_SESSION;

    const id = randomUUID();
    const trace = new Trace('practice', timings, { sessionId: id, mode: input.mode, focus: input.focus, goal }, onSinkError);

    let itemIds: string[];
    if (input.focus === 'errors') {
      // Treinar os erros: só reaproveita, nunca gera (custo zero).
      const items = await trace.step('select_items', () =>
        practice.erroredItems(input.notebookId, input.mode === 'simulation' ? questionKind : null, count),
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
        practice.unusedItems(input.notebookId, kind, chunks ? chunks.map((c) => c.id) : null, count, goal),
      );
      const missing = count - reused.length;
      const generated =
        missing > 0
          ? await this.generate(trace, id, input.notebookId, goal, kind === 'card', missing,
              chunks ?? (await practice.sampleChunks(input.notebookId, GENERATION_MAX_CHARS)))
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

  /**
   * 1 chamada ao LLM; itens com fonte inventada são descartados.
   * `cards` = flashcards (frente/verso); senão, questões da simulação.
   * `avoidFronts` = frentes que já existem (o "gerar mais" não repete).
   */
  private async generate(
    trace: Trace,
    sessionId: string,
    notebookId: string,
    goal: GoalType,
    cards: boolean,
    count: number,
    chunks: GenerationChunk[],
    avoidFronts: string[] = [],
  ): Promise<string[]> {
    if (chunks.length === 0) return [];
    const { llm, practice, content } = this.deps;
    const passages: Passage[] = chunks.map((c, i) => ({ label: `T${i + 1}`, chunkId: c.id, text: c.text, charStart: c.charStart }));
    const generation = await trace.step('generate', () =>
      llm.generateJson(
        {
          system: cards ? buildCardSystemPrompt(goal, count, avoidFronts) : buildGenerationSystemPrompt(goal, count),
          user: buildHighlightUserPrompt(passages),
          jsonSchema: cards ? cardJsonSchema() : outputJsonSchema(goal),
          maxOutputTokens: 8192,
        },
        { operation: cards ? 'generate_flashcards' : 'generate_practice', refType: 'practice_session', refId: sessionId },
      ),
    );
    const items: GeneratedItem[] = await trace.step('validate', () =>
      cards
        ? validateGeneratedCards(goal, generation.text, generation.finishReason, passages, avoidFronts).items
        : validateGeneratedItems(goal, generation.text, generation.finishReason, passages).items,
    );
    const byChunk = new Map(chunks.map((c) => [c.id, c]));
    const documentIds = [...new Set(items.map((i) => byChunk.get(i.chunkId)!.documentId))];
    const pages = await content.pageRanges(documentIds);
    return practice.insertItems(
      notebookId,
      items.slice(0, count).map((item) => {
        const documentId = byChunk.get(item.chunkId)!.documentId;
        return {
          ...item,
          goalType: cards ? goal : null,
          documentId,
          pageNumber: pageAt(pages.get(documentId) ?? [], item.docCharStart),
        };
      }),
    );
  }

  /**
   * "Gerar mais" flashcards: 1 chamada, a partir dos mesmos trechos da
   * sessão, sem repetir as frentes que já existem nela.
   */
  async more(sessionId: string, count: number): Promise<SessionView> {
    const { practice, timings, onSinkError } = this.deps;
    const found = await practice.findSession(sessionId);
    if (!found) throw notFound('Sessão de prática');
    const { session, items } = found;
    if (session.mode !== 'flashcards' || session.focus === 'errors') {
      throw badRequest('Só é possível gerar mais cartões numa rodada de flashcards.');
    }
    if (session.status !== 'active') throw conflict('Esta rodada de flashcards já foi encerrada.');

    const trace = new Trace('practice_more', timings, { sessionId, count }, onSinkError);
    const chunks = session.questionId
      ? await practice.chunksOfQuestion(session.questionId)
      : await practice.sampleChunks(session.notebookId, GENERATION_MAX_CHARS);
    const generated = await this.generate(
      trace,
      sessionId,
      session.notebookId,
      session.goalType,
      true,
      count,
      chunks,
      items.map((i) => i.prompt),
    );
    if (generated.length === 0) {
      throw new ServiceError(502, 'Não foi possível gerar novos cartões sem repetir os atuais. Tente novamente.');
    }
    await trace.step('persist', () => practice.appendItems(sessionId, generated));
    return this.get(sessionId);
  }

  async get(id: string): Promise<SessionView> {
    const found = await this.deps.practice.findSession(id);
    if (!found) throw notFound('Sessão de prática');
    return toView(found.session, found.items, found.attempts);
  }

  /** Responde uma questão da simulação. Prova: corrige pelo código. Entrevista: 1 chamada ao LLM. */
  async answer(
    sessionId: string,
    input: { itemId: string; option?: number; text?: string; format?: AnswerFormat },
  ): Promise<SessionView> {
    const { practice, llm, timings, onSinkError } = this.deps;
    const found = await practice.findSession(sessionId);
    if (!found) throw notFound('Sessão de prática');
    const { session, items, attempts } = found;
    if (session.mode !== 'simulation') throw badRequest('Esta sessão é de flashcards: use a revisão.');
    if (session.status !== 'active') throw conflict('Esta simulação já terminou.');
    const item = items.find((i) => i.id === input.itemId);
    if (!item) throw notFound('Questão nesta sessão');
    // Múltipla escolha: uma resposta só. Entrevista: "Tentar de novo" reavalia (a mais recente vale).
    if (item.kind !== 'open' && attempts.some((a) => a.itemId === item.id)) {
      throw conflict('Esta questão já foi respondida.');
    }

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
              format: input.format,
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
      await practice.insertAttempt({
        sessionId,
        itemId: item.id,
        answerText: text,
        chosenOption: null,
        correct: evaluation.correct,
        score: evaluation.score / 10,
        feedback: evaluation.feedback,
        evaluatedBy: 'llm',
        rubric: evaluation.rubric,
        modelAnswer: evaluation.modelAnswer,
        missingPoints: evaluation.missingPoints,
        answerFormat: input.format ?? 'free',
      });
    }
    // Prova termina sozinha na última resposta; a entrevista termina no Fechar (permite "Tentar de novo").
    if (item.kind === 'mcq') {
      const answered = new Set([...attempts.map((a) => a.itemId), item.id]).size;
      await this.finishIfComplete(sessionId, items.length, answered);
    }
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
    // A rodada de flashcards não termina sozinha: o estudante pode "gerar mais". Termina no Fechar.
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

  /** Tela inicial do caderno: contagens, atividade recente e acertos por assunto (sem LLM). */
  async overview(notebookId: string) {
    await this.requireNotebook(notebookId);
    const [overview, stats, profile] = await Promise.all([
      this.deps.practice.overview(notebookId),
      this.deps.practice.topicStats(notebookId),
      this.deps.practice.getProfile(notebookId),
    ]);
    return {
      goalType: profile?.goalType ?? null,
      ...overview,
      topics: stats
        .map((s) => ({ topic: s.topic, attempts: s.attempts, accuracy: (s.attempts - s.errors) / s.attempts }))
        .sort((a, b) => b.attempts - a.attempts)
        .slice(0, 5),
    };
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
