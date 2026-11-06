import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDataset } from '../../eval/lib/dataset.ts';
import { buildJudgePrompt, judgeJsonSchema, parseVerdict } from '../../eval/lib/judge.ts';
import { formatReport, type EvalReport } from '../../eval/lib/report.ts';
import { aggregate } from '../../eval/lib/metrics.ts';
import { decodeText } from '../../src/domain/extraction/plain-text.ts';
import { findQuote } from '../../src/domain/text/find-quote.ts';

const SAMPLE = join(import.meta.dirname, '../../eval/datasets/calculo-exemplo/dataset.json');

describe('dataset de exemplo', () => {
  it('é válido e toda evidência existe literalmente no documento', async () => {
    const dataset = parseDataset(JSON.parse(await readFile(SAMPLE, 'utf8')));
    const texts = new Map<string, string>();
    for (const doc of dataset.documents) {
      texts.set(doc.id, decodeText(await readFile(join(dirname(SAMPLE), doc.file))));
    }
    for (const question of dataset.questions) {
      if (!question.answerable) continue;
      for (const evidence of question.evidence) {
        expect(findQuote(texts.get(evidence.document)!, evidence.text), `${question.id}: ${evidence.text}`).not.toBeNull();
      }
    }
    expect(dataset.questions.some((q) => !q.answerable)).toBe(true);
  });
});

describe('parseDataset', () => {
  const base = {
    name: 'x',
    documents: [{ id: 'd', file: 'd.md' }],
    questions: [{ id: 'q', question: 'p?', answerable: true, referenceAnswer: 'r', evidence: [{ document: 'd', text: 't' }] }],
  };

  it('aceita um dataset mínimo', () => {
    expect(parseDataset(base).questions).toHaveLength(1);
  });

  it('rejeita evidência de documento inexistente, ids repetidos e campos faltando', () => {
    expect(() =>
      parseDataset({ ...base, questions: [{ ...base.questions[0], evidence: [{ document: 'zzz', text: 't' }] }] }),
    ).toThrow(/não existe em documents/);
    expect(() => parseDataset({ ...base, questions: [base.questions[0], base.questions[0]] })).toThrow(/repetidos/);
    expect(() =>
      parseDataset({ ...base, questions: [{ id: 'q', question: 'p?', answerable: true, evidence: [] }] }),
    ).toThrow(/Dataset inválido/);
  });
});

describe('juiz', () => {
  it('monta o prompt com pergunta, referência, resposta e fontes', () => {
    const prompt = buildJudgePrompt({
      question: 'O que é derivada?',
      referenceAnswer: 'Taxa de variação.',
      answer: 'É a taxa de variação [S1].',
      sources: [{ label: 'S1', text: 'A derivada mede a taxa de variação.' }],
    });
    expect(prompt).toContain('Resposta de referência: Taxa de variação.');
    expect(prompt).toContain('<fonte id="S1">\nA derivada mede a taxa de variação.\n</fonte>');
  });

  it('valida o veredito e descarta saída inválida ou cortada', () => {
    const ok = JSON.stringify({ correct: true, faithful: false, unsupportedClaims: ['x'], justification: 'j' });
    expect(parseVerdict(ok, 'STOP')).toMatchObject({ correct: true, faithful: false });
    expect(parseVerdict(ok, 'MAX_TOKENS')).toBeNull();
    expect(parseVerdict('{"correct":true}', 'STOP')).toBeNull();
    expect(parseVerdict('não é json', 'STOP')).toBeNull();
    expect(judgeJsonSchema()).not.toHaveProperty('$schema');
  });
});

describe('formatReport', () => {
  it('separa qualidade técnica, operação e aprendizagem', () => {
    const report: EvalReport = {
      dataset: 'x',
      startedAt: '2026-11-06T00:00:00Z',
      models: { embedding: 'e', llm: 'l', judge: 'j' },
      ingestion: [{ chunkSize: 1000, chunkOverlap: 150, documents: [{ id: 'd', chunks: 3, latencyMs: 900, inputTokens: 100, costUsd: 0.00002 }] }],
      runs: [
        {
          chunkSize: 1000,
          chunkOverlap: 150,
          strategy: 'hybrid',
          metrics: aggregate([{ id: 'q', answerable: true, recall: 0.5, rag: null }]),
          questions: [{ id: 'q', question: 'p?', answerable: true, recall: 0.5, rag: null }],
        },
      ],
      judgeCostUsd: 0,
    };
    const md = formatReport(report);
    expect(md).toContain('## Qualidade técnica: recuperação (top 5)');
    expect(md).toContain('| 1000/150 | hybrid | 50% | 0% | 0 |');
    expect(md).toContain('## Operação: por documento (ingestão)');
    expect(md).toContain('evidência não recuperada (recall 50%)');
    expect(md).toContain('## Métricas de aprendizagem');
  });
});
