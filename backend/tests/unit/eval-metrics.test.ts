import { describe, expect, it } from 'vitest';
import {
  aggregate,
  citationIsCorrect,
  isHallucination,
  percentile,
  recallAtK,
  type QuestionOutcome,
  type Span,
} from '../../eval/lib/metrics.ts';

const span = (start: number, end: number, documentId = 'd'): Span => ({ documentId, start, end });

describe('recallAtK', () => {
  const evidence = [span(100, 200), span(500, 600)];

  it('conta evidências cobertas por algum chunk recuperado', () => {
    expect(recallAtK(evidence, [span(50, 250)])).toBe(0.5);
    expect(recallAtK(evidence, [span(50, 250), span(450, 650)])).toBe(1);
    expect(recallAtK(evidence, [span(700, 900)])).toBe(0);
  });

  it('exige que o chunk cubra pelo menos metade da evidência', () => {
    expect(recallAtK([span(100, 200)], [span(0, 150)])).toBe(1); // 50%
    expect(recallAtK([span(100, 200)], [span(0, 140)])).toBe(0); // 40%
  });

  it('não mistura documentos', () => {
    expect(recallAtK([span(100, 200, 'a')], [span(100, 200, 'b')])).toBe(0);
  });
});

describe('citationIsCorrect', () => {
  it('é correta quando sobrepõe alguma evidência esperada', () => {
    expect(citationIsCorrect(span(150, 160), [span(100, 200)])).toBe(true);
    expect(citationIsCorrect(span(200, 260), [span(100, 200)])).toBe(false);
  });
});

const rag = (over: Partial<NonNullable<QuestionOutcome['rag']>> = {}): NonNullable<QuestionOutcome['rag']> => ({
  answered: true,
  validCitations: 1,
  correctCitations: 1,
  droppedCitations: 0,
  judge: { correct: true, faithful: true },
  latencyMs: 1000,
  inputTokens: 500,
  outputTokens: 50,
  costUsd: 0.001,
  ...over,
});

describe('isHallucination', () => {
  it('responder pergunta sem resposta no material é alucinação', () => {
    expect(isHallucination({ id: 'x', answerable: false, recall: null, rag: rag({ judge: null }) })).toBe(true);
  });
  it('afirmação sem base (juiz) é alucinação; recusa nunca é', () => {
    expect(isHallucination({ id: 'x', answerable: true, recall: 1, rag: rag({ judge: { correct: true, faithful: false } }) })).toBe(true);
    expect(isHallucination({ id: 'x', answerable: true, recall: 1, rag: rag({ answered: false, judge: null }) })).toBe(false);
  });
});

describe('aggregate', () => {
  const outcomes: QuestionOutcome[] = [
    // respondível, certa, 2 citações (1 fora da evidência), 1 inventada descartada
    { id: 'a', answerable: true, recall: 1, rag: rag({ validCitations: 2, correctCitations: 1, droppedCitations: 1 }) },
    // respondível, recusada (recusa indevida)
    { id: 'b', answerable: true, recall: 0.5, rag: rag({ answered: false, validCitations: 0, correctCitations: 0, judge: null, latencyMs: 3000 }) },
    // sem resposta no material, recusada (recusa correta)
    { id: 'c', answerable: false, recall: null, rag: rag({ answered: false, validCitations: 0, correctCitations: 0, judge: null }) },
    // sem resposta no material, mas respondeu (alucinação)
    { id: 'd', answerable: false, recall: null, rag: rag({ correctCitations: 0, judge: null }) },
    { id: 'e', answerable: true, recall: null, rag: null, error: 'timeout' },
  ];
  const m = aggregate(outcomes);

  it('conta perguntas e erros', () => {
    expect(m).toMatchObject({ questions: 5, answerable: 3, unanswerable: 2, errors: 1 });
  });

  it('recuperação: média do recall e taxa de acerto total', () => {
    expect(m.retrieval.recallAt5).toBe(0.75);
    expect(m.retrieval.hitRateAt5).toBe(0.5);
  });

  it('respostas: correção, citações, recusas, alucinação', () => {
    expect(m.rag).toEqual({
      correctness: 0.5, // a certa / (a, b)
      citationPrecision: 0.5, // 1 correta / 2 válidas (só respondíveis respondidas)
      correctRefusalRate: 0.5, // c / (c, d)
      falseRefusalRate: 0.5, // b / (a, b)
      hallucinationRate: 0.5, // d / respostas dadas (a, d)
      inventedCitationRate: 1 / 4, // 1 descartada / (2 + 1 + 0 + 0 + 1 propostas)
      judgeMissing: 0,
    });
  });

  it('resposta sem veredito do juiz sai dos denominadores de correção e alucinação', () => {
    const m2 = aggregate([
      { id: 'a', answerable: true, recall: 1, rag: rag() },
      { id: 'b', answerable: true, recall: 1, rag: rag({ judge: null, judgeMissing: true }) },
    ]);
    expect(m2.rag).toMatchObject({ correctness: 1, hallucinationRate: 0, judgeMissing: 1 });
  });

  it('operação: latência, tokens e custo', () => {
    expect(m.operation).toMatchObject({ avgLatencyMs: 1500, p95LatencyMs: 3000, avgInputTokens: 500 });
    expect(m.operation!.totalCostUsd).toBeCloseTo(0.004);
  });

  it('sem RAG (só busca), as métricas de resposta ficam nulas', () => {
    const only = aggregate([{ id: 'a', answerable: true, recall: 1, rag: null }]);
    expect(only.rag).toBeNull();
    expect(only.operation).toBeNull();
    expect(only.retrieval.recallAt5).toBe(1);
  });
});

describe('percentile', () => {
  it('calcula pelo método do posto mais próximo', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    expect(percentile([], 95)).toBeNull();
  });
});
