/**
 * Métricas de qualidade técnica do RAG (recuperação, citações, correção,
 * recusa, alucinação) e de operação (latência, tokens, custo).
 * Métricas de aprendizagem do estudante NÃO entram aqui (etapa 8).
 */

/** Intervalo no texto canônico de um documento. */
export type Span = { documentId: string; start: number; end: number };

/** Fração mínima de uma evidência que um chunk precisa cobrir para contar como recuperada. */
export const MIN_EVIDENCE_COVERAGE = 0.5;

export function overlap(a: Span, b: Span): number {
  if (a.documentId !== b.documentId) return 0;
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/**
 * Recall@k de uma pergunta: fração das evidências esperadas cobertas pelos
 * chunks recuperados. Uma evidência conta como coberta se algum chunk contém
 * pelo menos MIN_EVIDENCE_COVERAGE dela (uma frase dividida entre dois chunks
 * ainda é encontrada pelo LLM).
 */
export function recallAtK(evidence: Span[], retrieved: Span[]): number {
  if (evidence.length === 0) return 0;
  const covered = evidence.filter((span) =>
    retrieved.some((chunk) => overlap(span, chunk) / (span.end - span.start) >= MIN_EVIDENCE_COVERAGE),
  );
  return covered.length / evidence.length;
}

/** Citação "correta" = aponta para (sobrepõe) alguma evidência esperada. */
export function citationIsCorrect(citation: Span, evidence: Span[]): boolean {
  return evidence.some((span) => overlap(citation, span) > 0);
}

export type QuestionOutcome = {
  id: string;
  answerable: boolean;
  /** Recall@5 da busca (só perguntas respondíveis). */
  recall: number | null;
  /** Resultado do RAG; null quando a avaliação rodou só a busca. */
  rag: {
    answered: boolean;
    validCitations: number;
    correctCitations: number;
    /** Citações que o LLM inventou e a validação descartou. */
    droppedCitations: number;
    /** Veredito do juiz; null se não houve juiz (recusa ou pergunta sem resposta). */
    judge: { correct: boolean; faithful: boolean } | null;
    /** true quando o juiz deveria ter avaliado mas falhou (cota, erro, saída inválida). */
    judgeMissing?: boolean;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null;
  error?: string;
};

export type Metrics = {
  questions: number;
  answerable: number;
  unanswerable: number;
  errors: number;
  retrieval: { recallAt5: number | null; hitRateAt5: number | null };
  rag: {
    /** Respondíveis respondidas corretamente / respondíveis (recusa conta como erro). */
    correctness: number | null;
    /** Citações que apontam para a evidência esperada / citações válidas. */
    citationPrecision: number | null;
    /** Recusas em perguntas sem resposta no material / perguntas sem resposta. */
    correctRefusalRate: number | null;
    /** Recusas em perguntas respondíveis / respondíveis. */
    falseRefusalRate: number | null;
    /** Respostas com conteúdo sem base nas fontes (ou a pergunta sem resposta) / respostas dadas. */
    hallucinationRate: number | null;
    /** Citações inventadas pelo LLM (descartadas) / citações propostas. */
    inventedCitationRate: number | null;
    /** Respostas que ficaram sem veredito do juiz (fora de correção e alucinação). */
    judgeMissing: number;
  } | null;
  operation: {
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
    avgInputTokens: number | null;
    avgOutputTokens: number | null;
    avgCostUsd: number | null;
    totalCostUsd: number | null;
  } | null;
};

const ratio = (part: number, whole: number) => (whole === 0 ? null : part / whole);
const mean = (values: number[]) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted.at(Math.max(0, index)) ?? null;
}

/** Hallucinação: respondeu o que o material não responde, ou o juiz achou afirmação sem base. */
export function isHallucination(outcome: QuestionOutcome): boolean {
  const rag = outcome.rag;
  if (!rag?.answered) return false;
  if (!outcome.answerable) return true;
  return rag.judge !== null && !rag.judge.faithful;
}

export function aggregate(outcomes: QuestionOutcome[]): Metrics {
  const ok = outcomes.filter((o) => !o.error);
  const answerable = ok.filter((o) => o.answerable);
  const unanswerable = ok.filter((o) => !o.answerable);
  const recalls = answerable.map((o) => o.recall).filter((r): r is number => r !== null);

  const withRag = ok.filter((o) => o.rag !== null);
  let rag: Metrics['rag'] = null;
  let operation: Metrics['operation'] = null;

  if (withRag.length > 0) {
    // Sem veredito do juiz não dá para julgar correção/alucinação: a pergunta sai desses denominadores.
    const judged = (o: QuestionOutcome) => !o.rag!.judgeMissing;
    const ansRag = withRag.filter((o) => o.answerable);
    const ansJudged = ansRag.filter(judged);
    const unansRag = withRag.filter((o) => !o.answerable);
    const answered = withRag.filter((o) => o.rag!.answered);
    const answeredAnswerable = ansRag.filter((o) => o.rag!.answered);
    const validCitations = answeredAnswerable.reduce((sum, o) => sum + o.rag!.validCitations, 0);
    const correctCitations = answeredAnswerable.reduce((sum, o) => sum + o.rag!.correctCitations, 0);
    const proposed = withRag.reduce((sum, o) => sum + o.rag!.validCitations + o.rag!.droppedCitations, 0);
    const dropped = withRag.reduce((sum, o) => sum + o.rag!.droppedCitations, 0);

    rag = {
      correctness: ratio(ansJudged.filter((o) => o.rag!.answered && o.rag!.judge?.correct).length, ansJudged.length),
      citationPrecision: ratio(correctCitations, validCitations),
      correctRefusalRate: ratio(unansRag.filter((o) => !o.rag!.answered).length, unansRag.length),
      falseRefusalRate: ratio(ansRag.filter((o) => !o.rag!.answered).length, ansRag.length),
      hallucinationRate: ratio(answered.filter(isHallucination).length, answered.filter(judged).length),
      inventedCitationRate: ratio(dropped, proposed),
      judgeMissing: withRag.filter((o) => o.rag!.judgeMissing).length,
    };

    const latencies = withRag.map((o) => o.rag!.latencyMs);
    const costs = withRag.map((o) => o.rag!.costUsd);
    operation = {
      avgLatencyMs: mean(latencies),
      p95LatencyMs: percentile(latencies, 95),
      avgInputTokens: mean(withRag.map((o) => o.rag!.inputTokens)),
      avgOutputTokens: mean(withRag.map((o) => o.rag!.outputTokens)),
      avgCostUsd: mean(costs),
      totalCostUsd: costs.reduce((a, b) => a + b, 0),
    };
  }

  return {
    questions: outcomes.length,
    answerable: outcomes.filter((o) => o.answerable).length,
    unanswerable: outcomes.filter((o) => !o.answerable).length,
    errors: outcomes.length - ok.length,
    retrieval: {
      recallAt5: mean(recalls),
      hitRateAt5: ratio(recalls.filter((r) => r === 1).length, recalls.length),
    },
    rag,
    operation,
  };
}
