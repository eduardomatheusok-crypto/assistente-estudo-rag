import { randomUUID } from 'node:crypto';
import { pageAt } from '../domain/chunking/chunker.ts';
import { buildBatches } from '../domain/highlights/batches.ts';
import { locateRange } from '../domain/highlights/locate.ts';
import {
  buildHighlightSystemPrompt,
  buildHighlightUserPrompt,
  llmHighlightsJsonSchema,
} from '../domain/highlights/prompt.ts';
import { validateHighlights } from '../domain/highlights/validate.ts';
import type { LlmProvider } from '../providers/llm/llm-provider.ts';
import type { ContentRepository } from '../repositories/content-repository.ts';
import type { DocumentRepository } from '../repositories/document-repository.ts';
import type {
  Criterion,
  HighlightRepository,
  HighlightView,
  RunView,
} from '../repositories/highlight-repository.ts';
import { Trace, type TimingSink } from '../telemetry/trace.ts';
import { badRequest, conflict, notFound } from './errors.ts';

type Logger = { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };

/** O LLM devolve só as frases grifadas: saída curta mesmo em lotes grandes. */
const MAX_OUTPUT_TOKENS = 8192;

export type HighlightServiceDeps = {
  documents: DocumentRepository;
  highlights: HighlightRepository;
  content: ContentRepository;
  llm: LlmProvider;
  timings: TimingSink;
  onSinkError: (error: unknown) => void;
  /** Tamanho máximo, em caracteres, dos trechos enviados numa chamada. */
  batchChars: number;
  logger: Logger;
};

type QueuedRun = { id: string; documentId: string; criterion: Criterion; trace: Trace };

export class HighlightService {
  private readonly deps: HighlightServiceDeps;
  /**
   * Fila única: os runs são processados um de cada vez, mesmo vindos de
   * pedidos diferentes. Respeita o limite de requisições por minuto do provedor.
   */
  private queue: Promise<void> = Promise.resolve();

  constructor(deps: HighlightServiceDeps) {
    this.deps = deps;
  }

  listCriteria(notebookId: string): Promise<Criterion[]> {
    return this.deps.highlights.listCriteria(notebookId);
  }

  async createCriterion(notebookId: string, input: { label: string; instruction: string }): Promise<Criterion> {
    const key = slugify(input.label);
    if (!key) throw badRequest('O nome do critério precisa ter letras ou números.');
    if (await this.deps.highlights.keyExists(notebookId, key)) {
      throw conflict('Já existe um critério com esse nome (predefinido ou neste caderno).');
    }
    return this.deps.highlights.createCriterion({ notebookId, key, ...input });
  }

  async deleteCriterion(id: string): Promise<void> {
    const criterion = await this.deps.highlights.findCriterion(id);
    if (!criterion) throw notFound('Critério');
    if (criterion.builtin) throw badRequest('Critérios predefinidos não podem ser apagados.');
    await this.deps.highlights.deleteCriterion(id);
  }

  /** Cria um run por critério e coloca na fila. Responde na hora; o progresso sai em GET /highlight-runs/:id. */
  async start(documentId: string, criterionIds: string[]): Promise<RunView[]> {
    const { documents, highlights, timings, onSinkError, llm } = this.deps;
    const document = await documents.findById(documentId);
    if (!document) throw notFound('Documento');
    if (document.status !== 'ready') throw conflict('O documento ainda não está pronto (status: ' + document.status + ').');

    const unique = [...new Set(criterionIds)];
    const criteria = await highlights.findCriteria(unique, document.notebookId);
    if (criteria.length !== unique.length) throw badRequest('Critério inexistente ou de outro caderno.');
    for (const criterion of criteria) {
      if (await highlights.hasProcessingRun(documentId, criterion.id)) {
        throw conflict(`Já há grifos de "${criterion.label}" em processamento para este documento.`);
      }
    }

    const runs: QueuedRun[] = [];
    for (const criterion of criteria) {
      const id = randomUUID();
      const trace = new Trace('highlight', timings, { runId: id, documentId, criterion: criterion.key }, onSinkError);
      await highlights.createRun({ id, documentId, criterionId: criterion.id, model: llm.model, traceId: trace.id });
      runs.push({ id, documentId, criterion, trace });
    }
    for (const run of runs) {
      this.queue = this.queue.then(() => this.process(run));
    }
    return Promise.all(runs.map((run) => this.getRun(run.id)));
  }

  private async process(run: QueuedRun): Promise<void> {
    const { content, highlights, llm, logger, batchChars } = this.deps;
    const runRef = { id: run.id, documentId: run.documentId, criterionId: run.criterion.id };
    try {
      const [chunks, pages, ranges] = await run.trace.step('load', () =>
        Promise.all([
          content.chunksOf(run.documentId),
          content.pageItems(run.documentId),
          content.pageRanges([run.documentId]).then((m) => m.get(run.documentId) ?? []),
        ]),
      );
      const batches = buildBatches(chunks, batchChars);
      await highlights.setBatchesTotal(run.id, batches.length);

      const seen = new Set<string>();
      const system = buildHighlightSystemPrompt(run.criterion);
      for (const [index, passages] of batches.entries()) {
        const meta = { batch: index + 1, of: batches.length };
        const generation = await run.trace.step(
          'generate',
          () =>
            llm.generateJson(
              {
                system,
                user: buildHighlightUserPrompt(passages),
                jsonSchema: llmHighlightsJsonSchema(),
                maxOutputTokens: MAX_OUTPUT_TOKENS,
              },
              { operation: 'highlight_batch', refType: 'highlight_run', refId: run.id },
            ),
          meta,
        );
        const validated = await run.trace.step(
          'validate',
          () => validateHighlights(generation.text, generation.finishReason, passages, seen),
          meta,
        );
        if (!validated.ok) {
          // Saída inválida num lote não derruba o run: o lote é registrado sem grifos.
          logger.error({ runId: run.id, ...meta }, 'saída inválida do LLM no lote de grifos');
          await highlights.saveBatch(runRef, [], []);
          continue;
        }
        const located = await run.trace.step(
          'locate',
          () =>
            validated.accepted.map((h) => ({
              ...h,
              pageNumber: pageAt(ranges, h.docCharStart),
              // PDF: retângulos por página. MD/TXT: sem coordenadas (lista vazia), só os offsets.
              locations: locateRange(pages, h.docCharStart, h.docCharEnd),
            })),
          meta,
        );
        await run.trace.step('persist', () => highlights.saveBatch(runRef, located, validated.rejected), meta);
      }
      await highlights.finishRun(run.id, 'ready');
      logger.info({ runId: run.id, batches: batches.length }, 'grifos concluídos');
    } catch (error) {
      // Grifos de lotes já concluídos ficam salvos; o run fica 'failed' com o motivo.
      logger.error({ runId: run.id, err: error }, 'falha nos grifos');
      await highlights.finishRun(run.id, 'failed', (error as Error).message).catch(() => {});
    }
  }

  /** Aguarda a fila (desligamento e testes). */
  async whenIdle(): Promise<void> {
    let current: Promise<void>;
    do {
      current = this.queue;
      await current;
    } while (current !== this.queue);
  }

  failInterrupted(): Promise<number> {
    return this.deps.highlights.failInterruptedRuns('Processamento interrompido (servidor reiniciado). Rode os grifos novamente.');
  }

  async getRun(id: string): Promise<RunView> {
    const run = await this.deps.highlights.findRun(id);
    if (!run) throw notFound('Execução de grifos');
    return run;
  }

  async list(documentId: string, filter: { criterionId?: string; runId?: string }): Promise<HighlightView[]> {
    if (!(await this.deps.documents.findById(documentId))) throw notFound('Documento');
    return this.deps.highlights.listValid(documentId, filter);
  }
}

/** "Erros comuns!" → "erros-comuns" */
export function slugify(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
