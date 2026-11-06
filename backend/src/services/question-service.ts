import { randomUUID } from 'node:crypto';
import { pageAt } from '../domain/chunking/chunker.ts';
import { locateRange, type PageLocation } from '../domain/highlights/locate.ts';
import { llmAnswerJsonSchema } from '../domain/rag/answer-schema.ts';
import { buildUserPrompt, SYSTEM_PROMPT } from '../domain/rag/prompt.ts';
import { refusal, validateAnswer, type ValidatedAnswer } from '../domain/rag/validate-answer.ts';
import type { LlmProvider } from '../providers/llm/llm-provider.ts';
import type { ContentRepository } from '../repositories/content-repository.ts';
import type { NotebookRepository } from '../repositories/notebook-repository.ts';
import type {
  CitationContext,
  NewQuestion,
  QuestionRepository,
  QuestionView,
} from '../repositories/question-repository.ts';
import { Trace, type TimingSink } from '../telemetry/trace.ts';
import { notFound } from './errors.ts';
import { DEFAULT_TOP_K, type SearchResult, type SearchService, type SearchStrategy } from './search-service.ts';

/** Limite de saída: a resposta é curta; evita custo descontrolado se o modelo divagar. */
const MAX_OUTPUT_TOKENS = 4096;

export type QuestionServiceDeps = {
  notebooks: NotebookRepository;
  questions: QuestionRepository;
  content: ContentRepository;
  search: SearchService;
  llm: LlmProvider;
  timings: TimingSink;
  onSinkError: (error: unknown) => void;
};

export class QuestionService {
  private readonly deps: QuestionServiceDeps;

  constructor(deps: QuestionServiceDeps) {
    this.deps = deps;
  }

  /**
   * Pergunta → busca os 5 trechos → LLM responde só com eles → valida as
   * citações contra o texto original → grava e devolve.
   */
  async ask(input: { notebookId: string; question: string; strategy: SearchStrategy }): Promise<QuestionView> {
    const { notebookId, question, strategy } = input;
    const { notebooks, questions, search, llm, timings, onSinkError } = this.deps;
    if (!(await notebooks.findById(notebookId))) throw notFound('Caderno');

    const id = randomUUID();
    const trace = new Trace('question', timings, { notebookId, questionId: id, strategy }, onSinkError);
    const started = performance.now();

    const hits = await trace.step('retrieve', () =>
      search.retrieve(trace, notebookId, question, strategy, DEFAULT_TOP_K, { refType: 'question', refId: id }),
    );
    const sources = hits.map((hit, index) => ({ ...hit, label: `S${index + 1}` }));

    let validated: ValidatedAnswer;
    let rawOutput: string | null = null;
    if (sources.length === 0) {
      // Nada recuperado: recusa sem chamar o LLM (economiza custo e evita invenção).
      validated = refusal('no_results');
    } else {
      const generation = await trace.step('generate', () =>
        llm.generateJson(
          {
            system: SYSTEM_PROMPT,
            user: buildUserPrompt(question, sources),
            jsonSchema: llmAnswerJsonSchema(),
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
          { operation: 'answer_question', refType: 'question', refId: id },
        ),
      );
      rawOutput = generation.text;
      validated = await trace.step('validate', () =>
        validateAnswer(generation.text, generation.finishReason, sources),
      );
    }

    const record = await this.toRecord({
      id,
      notebookId,
      question,
      strategy,
      sources,
      validated,
      rawOutput,
      traceId: trace.id,
      latencyMs: performance.now() - started,
    });
    await trace.step('persist', () => questions.insert(record));

    const view = await questions.findById(id);
    return view!;
  }

  async get(id: string): Promise<QuestionView> {
    const question = await this.deps.questions.findById(id);
    if (!question) throw notFound('Pergunta');
    return question;
  }

  /** Histórico do caderno, da mais antiga para a mais recente (para o chat). */
  async listByNotebook(notebookId: string, limit: number): Promise<QuestionView[]> {
    if (!(await this.deps.notebooks.findById(notebookId))) throw notFound('Caderno');
    return this.deps.questions.listByNotebook(notebookId, limit);
  }

  /** Citação com o trecho original e onde pintá-lo no PDF (vazio em MD/TXT). */
  async getCitation(id: string): Promise<CitationContext & { locations: PageLocation[] }> {
    const citation = await this.deps.questions.findCitation(id);
    if (!citation) throw notFound('Citação');
    const pages = await this.deps.content.pageItems(citation.documentId);
    return { ...citation, locations: locateRange(pages, citation.docCharStart, citation.docCharEnd) };
  }

  /** Converte offsets do chunk em offsets do documento e descobre a página de cada citação. */
  private async toRecord(input: {
    id: string;
    notebookId: string;
    question: string;
    strategy: SearchStrategy;
    sources: Array<SearchResult & { label: string }>;
    validated: ValidatedAnswer;
    rawOutput: string | null;
    traceId: string;
    latencyMs: number;
  }): Promise<NewQuestion> {
    const { validated, sources } = input;
    const byChunk = new Map(sources.map((source) => [source.chunkId, source]));
    const pages = await this.deps.content.pageRanges([
      ...new Set(validated.citations.map((c) => byChunk.get(c.chunkId)!.documentId)),
    ]);

    return {
      id: input.id,
      notebookId: input.notebookId,
      question: input.question,
      strategy: input.strategy,
      status: validated.status,
      refusalReason: validated.status === 'not_found' ? validated.reason : null,
      answer: validated.answer,
      model: input.rawOutput === null ? null : this.deps.llm.model,
      rawOutput: input.rawOutput,
      droppedCitations: validated.dropped,
      traceId: input.traceId,
      latencyMs: input.latencyMs,
      sources: sources.map((s) => ({ label: s.label, chunkId: s.chunkId, rank: s.rank, score: s.score })),
      citations: validated.citations.map((citation) => {
        const chunk = byChunk.get(citation.chunkId)!;
        const docCharStart = chunk.charStart + citation.start;
        return {
          label: citation.label,
          chunkId: citation.chunkId,
          documentId: chunk.documentId,
          quote: citation.quote,
          docCharStart,
          docCharEnd: chunk.charStart + citation.end,
          pageNumber: pageAt(pages.get(chunk.documentId) ?? [], docCharStart),
        };
      }),
    };
  }
}
