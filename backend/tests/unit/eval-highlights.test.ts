import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  iou,
  matchHighlights,
  parseHighlightDataset,
  scores,
  sumMatches,
} from '../../eval/lib/highlight-metrics.ts';
import { decodeText } from '../../src/domain/extraction/plain-text.ts';
import { findQuote } from '../../src/domain/text/find-quote.ts';

const r = (start: number, end: number) => ({ start, end });

describe('iou', () => {
  it('interseção sobre união', () => {
    expect(iou(r(0, 10), r(0, 10))).toBe(1);
    expect(iou(r(0, 10), r(5, 15))).toBeCloseTo(5 / 15);
    expect(iou(r(0, 10), r(10, 20))).toBe(0);
  });
});

describe('matchHighlights', () => {
  it('aceita pequena diferença de fronteira e recusa grifo grande demais', () => {
    const expected = [r(100, 200)];
    expect(matchHighlights([r(110, 200)], expected).truePositives).toBe(1); // IoU 0,9
    expect(matchHighlights([r(0, 400)], expected).truePositives).toBe(0); // parágrafo inteiro: IoU 0,25
  });

  it('pareia 1 para 1: dois grifos sobre a mesma frase contam um acerto e um erro', () => {
    expect(matchHighlights([r(100, 200), r(105, 200)], [r(100, 200)])).toEqual({
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 0,
    });
  });

  it('prefere o par de maior sobreposição', () => {
    // p0 cobre e0 e e1 parcialmente; p1 é exato em e1 → p0 fica com e0.
    const result = matchHighlights([r(0, 110), r(100, 200)], [r(0, 100), r(100, 200)]);
    expect(result).toEqual({ truePositives: 2, falsePositives: 0, falseNegatives: 0 });
  });
});

describe('scores', () => {
  it('precisão, revocação e F1', () => {
    expect(scores({ truePositives: 3, falsePositives: 1, falseNegatives: 3 })).toEqual({
      precision: 0.75,
      recall: 0.5,
      f1: 0.6,
    });
  });

  it('sem grifos previstos ou sem esperados, a métrica correspondente fica indefinida', () => {
    expect(scores({ truePositives: 0, falsePositives: 0, falseNegatives: 2 })).toEqual({ precision: null, recall: 0, f1: null });
    expect(scores({ truePositives: 0, falsePositives: 2, falseNegatives: 0 })).toEqual({ precision: 0, recall: null, f1: null });
  });

  it('soma micro de várias tarefas', () => {
    expect(
      sumMatches([
        { truePositives: 1, falsePositives: 0, falseNegatives: 1 },
        { truePositives: 2, falsePositives: 1, falseNegatives: 0 },
      ]),
    ).toEqual({ truePositives: 3, falsePositives: 1, falseNegatives: 1 });
  });
});

describe('dataset de grifos de exemplo', () => {
  const path = join(import.meta.dirname, '../../eval/datasets/calculo-exemplo/highlights.json');

  it('é válido e todo trecho esperado existe literalmente no documento', async () => {
    const dataset = parseHighlightDataset(JSON.parse(await readFile(path, 'utf8')));
    for (const task of dataset.tasks) {
      const file = dataset.documents.find((d) => d.id === task.document)!.file;
      const text = decodeText(await readFile(join(dirname(path), file)));
      for (const expected of task.expected) {
        expect(findQuote(text, expected), `${task.document}/${task.criterion}: ${expected}`).not.toBeNull();
      }
    }
  });

  it('recusa tarefa sem critério, com os dois tipos de critério ou documento inexistente', () => {
    const base = { name: 'x', documents: [{ id: 'd', file: 'd.md' }] };
    expect(() => parseHighlightDataset({ ...base, tasks: [{ document: 'd', expected: [] }] })).toThrow(/criterion" OU "custom/);
    expect(() =>
      parseHighlightDataset({
        ...base,
        tasks: [{ document: 'd', criterion: 'datas', custom: { label: 'a', instruction: 'instrução longa' }, expected: [] }],
      }),
    ).toThrow(/criterion" OU "custom/);
    expect(() => parseHighlightDataset({ ...base, tasks: [{ document: 'zzz', criterion: 'datas', expected: [] }] })).toThrow(
      /não existe/,
    );
  });
});
