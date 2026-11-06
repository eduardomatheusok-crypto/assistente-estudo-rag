/**
 * Avaliação automática dos grifos: precisão, revocação e F1 por critério,
 * mais taxa de grifos inventados (descartados) e custo/latência por execução.
 *
 *   npm run eval:highlights -- --dataset eval/datasets/calculo-exemplo/highlights.json
 *
 * Usa EVAL_DATABASE_URL (zerado a cada execução) e o LLM configurado no .env.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildApp } from '../src/app.ts';
import { loadEnv } from '../src/config/env.ts';
import { createPool } from '../src/db/pool.ts';
import { findQuote } from '../src/domain/text/find-quote.ts';
import { evalDatabaseUrl, ingestDocuments, resetDatabase } from './lib/harness.ts';
import {
  matchHighlights,
  parseHighlightDataset,
  scores,
  sumMatches,
  type MatchResult,
  type Range,
} from './lib/highlight-metrics.ts';

const { values: args } = parseArgs({
  options: {
    dataset: { type: 'string' },
    out: { type: 'string', default: 'eval/results' },
  },
});

const log = (message: string) => process.stderr.write(`${message}\n`);
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(0)}%`);

type TaskResult = {
  document: string;
  criterion: string;
  status: string;
  error: string | null;
  match: MatchResult;
  proposed: number;
  rejected: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  falsePositiveTexts: string[];
  missedTexts: string[];
};

async function main() {
  if (!args.dataset) throw new Error('Informe --dataset <arquivo.json>');
  const evalUrl = evalDatabaseUrl();
  const datasetPath = resolve(args.dataset);
  const dataset = parseHighlightDataset(JSON.parse(await readFile(datasetPath, 'utf8')));

  const env = loadEnv({ ...process.env, DATABASE_URL: evalUrl });
  const db = createPool(evalUrl);
  const storageDir = await mkdtemp(join(tmpdir(), 'notebook-eval-'));
  const startedAt = new Date().toISOString();
  const app = await buildApp({ ...env, STORAGE_DIR: storageDir }, db, { logger: false });
  const results: TaskResult[] = [];

  try {
    log('Zerando o banco de avaliação e ingerindo os documentos...');
    await resetDatabase(db);
    const { notebookId, docs } = await ingestDocuments(app, db, datasetPath, dataset.name, dataset.documents);
    const criteria: Array<{ id: string; key: string; label: string }> = (
      await app.app.inject({ url: `/notebooks/${notebookId}/highlight-criteria` })
    ).json();

    for (const task of dataset.tasks) {
      const doc = docs.get(task.document)!;
      let criterion = criteria.find((c) => c.key === task.criterion);
      if (task.custom) {
        const res = await app.app.inject({ method: 'POST', url: `/notebooks/${notebookId}/highlight-criteria`, payload: task.custom });
        criterion = res.json();
      }
      if (!criterion?.id) throw new Error(`Critério "${task.criterion ?? task.custom?.label}" não encontrado.`);

      const expected: Range[] = task.expected.map((text) => {
        const match = findQuote(doc.text, text);
        if (!match) throw new Error(`Dataset: trecho esperado não existe em "${task.document}": "${text}"`);
        return { start: match.start, end: match.end };
      });

      log(`-- ${task.document} · ${criterion.label}`);
      const [run] = (
        await app.app.inject({ method: 'POST', url: `/documents/${doc.documentId}/highlight-runs`, payload: { criterionIds: [criterion.id] } })
      ).json();
      await app.highlights.whenIdle();
      const view = (await app.app.inject({ url: `/highlight-runs/${run.id}` })).json();
      const predicted: Array<{ text: string; docCharStart: number; docCharEnd: number }> = (
        await app.app.inject({ url: `/documents/${doc.documentId}/highlights?runId=${run.id}` })
      ).json();

      const predictedRanges = predicted.map((h) => ({ start: h.docCharStart, end: h.docCharEnd }));
      const match = matchHighlights(predictedRanges, expected);
      // Para o relatório: quais grifos não bateram com nenhum esperado, e vice-versa (pela mesma regra).
      const falsePositiveTexts = predicted
        .filter((_, i) => matchHighlights([predictedRanges[i]!], expected).truePositives === 0)
        .map((h) => h.text);
      const missedTexts = task.expected.filter((_, i) => matchHighlights(predictedRanges, [expected[i]!]).truePositives === 0);

      results.push({
        document: task.document,
        criterion: criterion.label,
        status: view.status,
        error: view.error,
        match,
        proposed: view.highlightCount + view.rejectedCount,
        rejected: view.rejectedCount,
        latencyMs: view.latencyMs,
        inputTokens: view.usage.inputTokens,
        outputTokens: view.usage.outputTokens,
        costUsd: view.usage.costUsd,
        falsePositiveTexts,
        missedTexts,
      });
      const s = scores(match);
      log(`   ${view.status} · P ${pct(s.precision)} · R ${pct(s.recall)} · F1 ${pct(s.f1)}`);
    }

    const markdown = format(dataset.name, startedAt, env.GEMINI_LLM_MODEL, results);
    await mkdir(args.out!, { recursive: true });
    const base = join(args.out!, `${dataset.name}-grifos-${startedAt.replace(/[:.]/g, '-')}`);
    await writeFile(`${base}.json`, JSON.stringify({ dataset: dataset.name, startedAt, model: env.GEMINI_LLM_MODEL, results }, null, 2));
    await writeFile(`${base}.md`, markdown);
    process.stdout.write(`\n${markdown}`);
    log(`\nRelatório salvo em ${base}.md e ${base}.json`);
  } finally {
    await app.app.close();
    await db.end();
    await rm(storageDir, { recursive: true, force: true });
  }
}

function format(dataset: string, startedAt: string, model: string, results: TaskResult[]): string {
  const row = (cells: string[]) => `| ${cells.join(' | ')} |`;
  const out: string[] = [`# Avaliação de grifos: ${dataset}`, `Execução: ${startedAt} · LLM: ${model}`];

  out.push('## Qualidade técnica');
  out.push(
    [
      row(['Documento', 'Critério', 'Esperados', 'Grifados', 'Precisão', 'Revocação', 'F1', 'Inventados (descartados)', 'Status']),
      row(Array(9).fill('---')),
      ...results.map((r) => {
        const s = scores(r.match);
        return row([
          r.document,
          r.criterion,
          String(r.match.truePositives + r.match.falseNegatives),
          String(r.match.truePositives + r.match.falsePositives),
          pct(s.precision),
          pct(s.recall),
          pct(s.f1),
          `${r.rejected} de ${r.proposed}`,
          r.error ? `${r.status}: ${r.error}` : r.status,
        ]);
      }),
    ].join('\n'),
  );
  const total = scores(sumMatches(results.map((r) => r.match)));
  out.push(`**Total (micro):** precisão ${pct(total.precision)} · revocação ${pct(total.recall)} · F1 ${pct(total.f1)}`);
  out.push('_Acerto = sobreposição (IoU) de pelo menos 50% com um trecho esperado. "Inventados" são grifos que não existiam literalmente no texto e foram descartados._');

  out.push('## Operação: por documento e critério');
  out.push(
    [
      row(['Documento', 'Critério', 'Latência', 'Tokens entrada', 'Tokens saída', 'Custo']),
      row(Array(6).fill('---')),
      ...results.map((r) =>
        row([r.document, r.criterion, `${Math.round(r.latencyMs)} ms`, String(r.inputTokens), String(r.outputTokens), `US$ ${r.costUsd.toFixed(6)}`]),
      ),
    ].join('\n'),
  );

  const misses = results.filter((r) => r.falsePositiveTexts.length > 0 || r.missedTexts.length > 0);
  if (misses.length > 0) {
    out.push('## Diferenças em relação ao esperado');
    for (const r of misses) {
      out.push(`**${r.document} · ${r.criterion}**`);
      out.push(
        [
          ...r.falsePositiveTexts.map((t) => `- Grifou sem ser esperado: "${t}"`),
          ...r.missedTexts.map((t) => `- Não grifou: "${t}"`),
        ].join('\n'),
      );
    }
  }
  out.push('## Métricas de aprendizagem');
  out.push('Não avaliadas aqui (etapa 8).');
  return out.join('\n\n') + '\n';
}

main().catch((error) => {
  log(`Avaliação interrompida: ${(error as Error).message}`);
  process.exitCode = 1;
});
