import type { Metrics, QuestionOutcome } from './metrics.ts';

export type RunResult = {
  chunkSize: number;
  chunkOverlap: number;
  strategy: string;
  metrics: Metrics;
  questions: Array<QuestionOutcome & { question: string; answer?: string; judgeJustification?: string }>;
};

export type IngestionResult = {
  chunkSize: number;
  chunkOverlap: number;
  documents: Array<{ id: string; chunks: number; latencyMs: number; inputTokens: number; costUsd: number }>;
};

export type EvalReport = {
  dataset: string;
  startedAt: string;
  models: { embedding: string; llm: string; judge: string | null };
  ingestion: IngestionResult[];
  runs: RunResult[];
  /** Custo das chamadas do juiz (não entra no custo por pergunta). */
  judgeCostUsd: number;
};

const pct = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(0)}%`);
const ms = (value: number | null) => (value === null ? '—' : `${Math.round(value)} ms`);
const usd = (value: number | null) => (value === null ? '—' : `US$ ${value.toFixed(6)}`);
const num = (value: number | null) => (value === null ? '—' : `${Math.round(value)}`);
const chunk = (r: { chunkSize: number; chunkOverlap: number }) => `${r.chunkSize}/${r.chunkOverlap}`;

function table(header: string[], rows: string[][]): string {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

/** Relatório legível. Qualidade técnica e operação ficam separadas; aprendizagem não é medida aqui. */
export function formatReport(report: EvalReport): string {
  const out: string[] = [];
  out.push(`# Avaliação do RAG: ${report.dataset}`);
  out.push(
    `Execução: ${report.startedAt} · embeddings: ${report.models.embedding} · LLM: ${report.models.llm} · juiz: ${report.models.judge ?? 'não usado'}`,
  );
  const first = report.runs[0]?.metrics;
  if (first) {
    out.push(`Perguntas: ${first.questions} (${first.answerable} com resposta no material, ${first.unanswerable} sem).`);
  }

  out.push('## Qualidade técnica: recuperação (top 5)');
  out.push(
    table(
      ['Chunk (tam/overlap)', 'Estratégia', 'Recall@5', 'Hit@5 (todas as evidências)', 'Erros'],
      report.runs.map((r) => [
        chunk(r),
        r.strategy,
        pct(r.metrics.retrieval.recallAt5),
        pct(r.metrics.retrieval.hitRateAt5),
        String(r.metrics.errors),
      ]),
    ),
  );

  const ragRuns = report.runs.filter((r) => r.metrics.rag);
  if (ragRuns.length > 0) {
    out.push('## Qualidade técnica: respostas');
    out.push(
      table(
        ['Chunk', 'Estratégia', 'Correção', 'Precisão das citações', 'Recusa correta', 'Recusa indevida', 'Alucinação', 'Citações inventadas', 'Sem veredito do juiz'],
        ragRuns.map((r) => {
          const m = r.metrics.rag!;
          return [
            chunk(r),
            r.strategy,
            pct(m.correctness),
            pct(m.citationPrecision),
            pct(m.correctRefusalRate),
            pct(m.falseRefusalRate),
            pct(m.hallucinationRate),
            pct(m.inventedCitationRate),
            String(m.judgeMissing),
          ];
        }),
      ),
    );
    out.push(
      '_Correção e alucinação vêm de um juiz LLM: são estimativas. "Citações inventadas" foram descartadas pela validação e não chegaram ao estudante._',
    );

    out.push('## Operação: por pergunta');
    out.push(
      table(
        ['Chunk', 'Estratégia', 'Latência média', 'Latência p95', 'Tokens entrada', 'Tokens saída', 'Custo médio', 'Custo total'],
        ragRuns.map((r) => {
          const o = r.metrics.operation!;
          return [chunk(r), r.strategy, ms(o.avgLatencyMs), ms(o.p95LatencyMs), num(o.avgInputTokens), num(o.avgOutputTokens), usd(o.avgCostUsd), usd(o.totalCostUsd)];
        }),
      ),
    );
  }

  out.push('## Operação: por documento (ingestão)');
  out.push(
    table(
      ['Chunk', 'Documento', 'Chunks', 'Latência', 'Tokens', 'Custo'],
      report.ingestion.flatMap((ing) =>
        ing.documents.map((d) => [chunk(ing), d.id, String(d.chunks), ms(d.latencyMs), String(d.inputTokens), usd(d.costUsd)]),
      ),
    ),
  );
  out.push(`Custo do juiz nesta avaliação: ${usd(report.judgeCostUsd)} (fora do custo por pergunta).`);

  const problems = report.runs.flatMap((r) =>
    r.questions
      .filter((q) => q.error || (q.answerable && q.recall !== null && q.recall < 1) || (q.rag && problemOf(q)))
      .map((q) => [chunk(r), r.strategy, q.id, q.error ?? describeProblem(q)]),
  );
  if (problems.length > 0) {
    out.push('## Perguntas com problema');
    out.push(table(['Chunk', 'Estratégia', 'Pergunta', 'Problema'], problems));
  }

  out.push('## Métricas de aprendizagem');
  out.push('Não avaliadas aqui. Desempenho em exercícios, evolução e retenção entram na etapa 8, separadas destas métricas técnicas.');
  return out.join('\n\n') + '\n';
}

function problemOf(q: QuestionOutcome): boolean {
  const rag = q.rag!;
  if (!q.answerable) return rag.answered;
  return !rag.answered || rag.judgeMissing === true || rag.judge?.correct === false || rag.judge?.faithful === false || rag.correctCitations < rag.validCitations;
}

function describeProblem(q: QuestionOutcome): string {
  const issues: string[] = [];
  if (q.answerable && q.recall !== null && q.recall < 1) issues.push(`evidência não recuperada (recall ${pct(q.recall)})`);
  const rag = q.rag;
  if (rag) {
    if (!q.answerable && rag.answered) issues.push('respondeu pergunta sem resposta no material');
    if (q.answerable && !rag.answered) issues.push('recusou pergunta respondível');
    if (rag.judge?.correct === false) issues.push('resposta incorreta (juiz)');
    if (rag.judge?.faithful === false) issues.push('afirmação sem base nas fontes (juiz)');
    if (rag.judgeMissing) issues.push('sem veredito do juiz');
    if (rag.answered && rag.correctCitations < rag.validCitations) issues.push('citação fora da evidência esperada');
  }
  return issues.join('; ');
}
