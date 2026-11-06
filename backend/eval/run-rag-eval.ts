/**
 * Avaliação automática do RAG.
 *
 *   npm run eval -- --dataset eval/datasets/calculo-exemplo/dataset.json
 *   npm run eval -- --dataset <arquivo> --chunks 500:75,1000:150,1500:200 --strategies lexical,vector,hybrid
 *   npm run eval -- --dataset <arquivo> --retrieval-only        (só busca: rápido e barato)
 *
 * Usa o banco EVAL_DATABASE_URL (nome terminado em "_eval"), que é ZERADO a
 * cada execução, e as chaves/modelos do .env. Para cada tamanho de chunk,
 * ingere os documentos; para cada estratégia, roda a busca e o RAG em cada
 * pergunta. Grava o relatório em JSON e Markdown em eval/results/.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildApp } from '../src/app.ts';
import { loadEnv } from '../src/config/env.ts';
import { createPool, type Db } from '../src/db/pool.ts';
import { findQuote } from '../src/domain/text/find-quote.ts';
import { GeminiLlmProvider, THINKING_LEVELS, type ThinkingLevel } from '../src/providers/llm/gemini-llm-provider.ts';
import type { LlmProvider } from '../src/providers/llm/llm-provider.ts';
import { MeteredLlmProvider } from '../src/providers/llm/metered-llm-provider.ts';
import { LlmCallRepository } from '../src/repositories/llm-call-repository.ts';
import { SEARCH_STRATEGIES, type SearchStrategy } from '../src/services/search-service.ts';
import { parseDataset, type Dataset, type DatasetQuestion } from './lib/dataset.ts';
import { evalDatabaseUrl, ingestDocuments, resetDatabase, type IngestedDocument } from './lib/harness.ts';
import { buildJudgePrompt, JUDGE_SYSTEM_PROMPT, judgeJsonSchema, parseVerdict } from './lib/judge.ts';
import { aggregate, citationIsCorrect, recallAtK, type QuestionOutcome, type Span } from './lib/metrics.ts';
import { formatReport, type EvalReport, type IngestionResult, type RunResult } from './lib/report.ts';

const TOP_K = 5;

const { values: args } = parseArgs({
  options: {
    dataset: { type: 'string' },
    chunks: { type: 'string', default: '1000:150' },
    strategies: { type: 'string', default: SEARCH_STRATEGIES.join(',') },
    'retrieval-only': { type: 'boolean', default: false },
    'judge-model': { type: 'string', default: process.env.GEMINI_JUDGE_MODEL ?? 'gemini-3.8-flash' },
    'judge-thinking': { type: 'string', default: 'MEDIUM' },
    out: { type: 'string', default: 'eval/results' },
  },
});

const log = (message: string) => process.stderr.write(`${message}\n`);

function parseChunkConfigs(value: string): Array<{ size: number; overlap: number }> {
  return value.split(',').map((pair) => {
    const [size, overlap] = pair.split(':').map(Number);
    if (!Number.isInteger(size) || !Number.isInteger(overlap)) {
      throw new Error(`--chunks inválido: "${pair}" (use tamanho:overlap, ex.: 1000:150)`);
    }
    return { size: size!, overlap: overlap! };
  });
}

function parseStrategies(value: string): SearchStrategy[] {
  return value.split(',').map((s) => {
    if (!(SEARCH_STRATEGIES as readonly string[]).includes(s)) throw new Error(`--strategies inválida: "${s}"`);
    return s as SearchStrategy;
  });
}

/** Localiza cada evidência no texto do documento; evidência inexistente = dataset errado. */
function evidenceSpans(question: DatasetQuestion, docs: Map<string, IngestedDocument>): Span[] {
  if (!question.answerable) return [];
  return question.evidence.map((evidence) => {
    const doc = docs.get(evidence.document)!;
    const match = findQuote(doc.text, evidence.text);
    if (!match) {
      throw new Error(
        `Dataset: a evidência da pergunta "${question.id}" não existe literalmente em "${evidence.document}": "${evidence.text}"`,
      );
    }
    return { documentId: evidence.document, start: match.start, end: match.end };
  });
}

async function usageOf(db: Db, refType: string, refId: string) {
  const { rows } = await db.query<{ input: number; output: number; cost: number }>(
    `SELECT coalesce(sum(input_tokens), 0)::int AS input, coalesce(sum(output_tokens), 0)::int AS output,
            coalesce(sum(cost_usd), 0)::float8 AS cost
       FROM llm_calls WHERE ref_type = $1 AND ref_id = $2 AND operation <> 'eval_judge'`,
    [refType, refId],
  );
  return rows[0]!;
}

async function judgeAnswer(
  db: Db,
  judge: LlmProvider,
  question: Extract<DatasetQuestion, { answerable: true }>,
  questionId: string,
  answer: string,
) {
  const { rows: sources } = await db.query<{ label: string; text: string }>(
    `SELECT s.label, c.text FROM question_sources s JOIN chunks c ON c.id = s.chunk_id
      WHERE s.question_id = $1 ORDER BY s.rank`,
    [questionId],
  );
  const result = await judge.generateJson(
    {
      system: JUDGE_SYSTEM_PROMPT,
      user: buildJudgePrompt({ question: question.question, referenceAnswer: question.referenceAnswer, answer, sources }),
      jsonSchema: judgeJsonSchema(),
      maxOutputTokens: 4096,
    },
    { operation: 'eval_judge', refType: 'question', refId: questionId },
  );
  return parseVerdict(result.text, result.finishReason);
}

async function main() {
  if (!args.dataset) throw new Error('Informe --dataset <arquivo.json>');
  const evalUrl = evalDatabaseUrl();

  const datasetPath = resolve(args.dataset);
  const dataset: Dataset = parseDataset(JSON.parse(await readFile(datasetPath, 'utf8')));
  const chunkConfigs = parseChunkConfigs(args.chunks!);
  const strategies = parseStrategies(args.strategies!);
  const withRag = !args['retrieval-only'];
  const thinking = args['judge-thinking'] as ThinkingLevel;
  if (!THINKING_LEVELS.includes(thinking)) throw new Error(`--judge-thinking inválido: ${thinking}`);

  const env = loadEnv({ ...process.env, DATABASE_URL: evalUrl });
  const db = createPool(evalUrl);
  const storageDir = await mkdtemp(join(tmpdir(), 'notebook-eval-'));
  const startedAt = new Date().toISOString();

  const judge: LlmProvider | null = withRag
    ? new MeteredLlmProvider(
        new GeminiLlmProvider({ apiKey: env.GEMINI_API_KEY!, model: args['judge-model']!, thinkingLevel: thinking }),
        new LlmCallRepository(db),
      )
    : null;

  const ingestion: IngestionResult[] = [];
  const runs: RunResult[] = [];

  try {
    log(`Zerando ${new URL(evalUrl).pathname.slice(1)} e aplicando migrações...`);
    await resetDatabase(db);

    for (const config of chunkConfigs) {
      log(`\n== Chunks ${config.size}/${config.overlap}: ingerindo ${dataset.documents.length} documento(s)`);
      const built = await buildApp(
        { ...env, STORAGE_DIR: storageDir, CHUNK_SIZE: config.size, CHUNK_OVERLAP: config.overlap },
        db,
        { logger: false },
      );
      const { app } = built;
      try {
        const { notebookId, docs } = await ingestDocuments(
          built,
          db,
          datasetPath,
          `${dataset.name} ${config.size}/${config.overlap}`,
          dataset.documents,
        );
        const byDocumentId = new Map([...docs.values()].map((d) => [d.documentId, d.datasetId]));

        const ingested: IngestionResult = { chunkSize: config.size, chunkOverlap: config.overlap, documents: [] };
        for (const doc of docs.values()) {
          const { rows } = await db.query<{ chunks: number }>(
            `SELECT chunk_count AS chunks FROM documents WHERE id = $1`,
            [doc.documentId],
          );
          const usage = await usageOf(db, 'document', doc.documentId);
          const latency = await db.query<{ ms: number }>(
            `SELECT coalesce(sum(latency_ms), 0)::float8 AS ms FROM step_timings
              WHERE operation = 'ingestion' AND meta->>'documentId' = $1`,
            [doc.documentId],
          );
          ingested.documents.push({
            id: doc.datasetId,
            chunks: rows[0]!.chunks,
            latencyMs: latency.rows[0]!.ms,
            inputTokens: usage.input,
            costUsd: usage.cost,
          });
        }
        ingestion.push(ingested);

        const spans = new Map(dataset.questions.map((q) => [q.id, evidenceSpans(q, docs)]));

        for (const strategy of strategies) {
          log(`-- Estratégia ${strategy}`);
          const details: RunResult['questions'] = [];
          for (const question of dataset.questions) {
            const evidence = spans.get(question.id)!;
            const base = { id: question.id, question: question.question, answerable: question.answerable };
            try {
              const search = await app.inject({
                method: 'POST',
                url: `/notebooks/${notebookId}/search`,
                payload: { query: question.question, strategy, k: TOP_K },
              });
              if (search.statusCode !== 200) throw new Error(`busca ${search.statusCode}: ${search.json().error}`);
              const retrieved: Span[] = search.json().results.map((r: { documentId: string; charStart: number; charEnd: number }) => ({
                documentId: byDocumentId.get(r.documentId)!,
                start: r.charStart,
                end: r.charEnd,
              }));
              const recall = question.answerable ? recallAtK(evidence, retrieved) : null;

              let rag: QuestionOutcome['rag'] = null;
              let answer: string | undefined;
              let judgeJustification: string | undefined;
              if (withRag) {
                const res = await app.inject({
                  method: 'POST',
                  url: `/notebooks/${notebookId}/questions`,
                  payload: { question: question.question, strategy },
                });
                if (res.statusCode !== 201) throw new Error(`pergunta ${res.statusCode}: ${res.json().error}`);
                const body = res.json();
                answer = body.answer;
                const answered = body.status === 'answered';
                const citations: Span[] = body.citations.map(
                  (c: { documentId: string; docCharStart: number; docCharEnd: number }) => ({
                    documentId: byDocumentId.get(c.documentId)!,
                    start: c.docCharStart,
                    end: c.docCharEnd,
                  }),
                );
                const dropped = await db.query<{ n: number }>(
                  `SELECT count(*)::int AS n FROM questions q, jsonb_array_elements(q.dropped_citations) d
                    WHERE q.id = $1 AND d->>'reason' IN ('quote_not_found', 'unknown_source')`,
                  [body.id],
                );
                // o juiz fica fora do custo da pergunta: é custo da avaliação, não do produto
                const usage = await usageOf(db, 'question', body.id);

                let judgeVerdict: { correct: boolean; faithful: boolean } | null = null;
                let judgeMissing = false;
                if (answered && question.answerable && judge) {
                  // Falha do juiz não apaga o resultado do RAG: a pergunta só fica sem veredito.
                  try {
                    const verdict = await judgeAnswer(db, judge, question, body.id, body.answer);
                    if (verdict) {
                      judgeVerdict = { correct: verdict.correct, faithful: verdict.faithful };
                      judgeJustification = verdict.justification;
                    } else {
                      judgeMissing = true;
                      judgeJustification = 'juiz devolveu saída inválida';
                    }
                  } catch (error) {
                    judgeMissing = true;
                    judgeJustification = `juiz falhou: ${(error as Error).message}`;
                  }
                }

                rag = {
                  answered,
                  validCitations: citations.length,
                  correctCitations: question.answerable ? citations.filter((c) => citationIsCorrect(c, evidence)).length : 0,
                  droppedCitations: dropped.rows[0]!.n,
                  judge: judgeVerdict,
                  judgeMissing,
                  latencyMs: body.latencyMs,
                  inputTokens: usage.input,
                  outputTokens: usage.output,
                  costUsd: usage.cost,
                };
              }
              details.push({ ...base, recall, rag, answer, judgeJustification });
              log(`   ${question.id}: recall ${recall ?? '-'}${rag ? ` · ${rag.answered ? 'respondeu' : 'recusou'}` : ''}`);
            } catch (error) {
              details.push({ ...base, recall: null, rag: null, error: (error as Error).message });
              log(`   ${question.id}: ERRO ${(error as Error).message}`);
            }
          }
          runs.push({ chunkSize: config.size, chunkOverlap: config.overlap, strategy, metrics: aggregate(details), questions: details });
        }
      } finally {
        await app.close();
      }
    }

    const judgeCost = await db.query<{ cost: number }>(
      `SELECT coalesce(sum(cost_usd), 0)::float8 AS cost FROM llm_calls WHERE operation = 'eval_judge'`,
    );
    const report: EvalReport = {
      dataset: dataset.name,
      startedAt,
      models: {
        embedding: env.EMBEDDING_PROVIDER === 'fake' ? 'fake' : env.GEMINI_EMBEDDING_MODEL,
        llm: env.GEMINI_LLM_MODEL,
        judge: judge ? judge.model : null,
      },
      ingestion,
      runs,
      judgeCostUsd: judgeCost.rows[0]!.cost,
    };

    const markdown = formatReport(report);
    await mkdir(args.out!, { recursive: true });
    const stamp = startedAt.replace(/[:.]/g, '-');
    const base = join(args.out!, `${dataset.name}-${stamp}`);
    await writeFile(`${base}.json`, JSON.stringify(report, null, 2));
    await writeFile(`${base}.md`, markdown);
    process.stdout.write(`\n${markdown}`);
    log(`\nRelatório salvo em ${base}.md e ${base}.json`);
  } finally {
    await db.end();
    await rm(storageDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  log(`Avaliação interrompida: ${(error as Error).message}`);
  process.exitCode = 1;
});
