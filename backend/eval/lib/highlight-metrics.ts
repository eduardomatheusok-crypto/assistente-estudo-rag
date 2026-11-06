import { z } from 'zod';

/**
 * Avaliação de grifos: o sistema grifou os trechos certos?
 *
 * Um grifo previsto "acerta" um grifo esperado quando os dois intervalos se
 * sobrepõem com IoU (interseção / união) >= MIN_IOU. Cada esperado só pode ser
 * acertado uma vez (pareamento 1 para 1, maiores sobreposições primeiro).
 * IoU aceita pequenas diferenças de fronteira (com ou sem "Por exemplo,"),
 * mas não aceita grifar um parágrafo inteiro para "acertar" uma frase.
 */
export const MIN_IOU = 0.5;

export type Range = { start: number; end: number };

export function iou(a: Range, b: Range): number {
  const inter = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const union = Math.max(a.end, b.end) - Math.min(a.start, b.start);
  return union === 0 ? 0 : inter / union;
}

export type MatchResult = { truePositives: number; falsePositives: number; falseNegatives: number };

export function matchHighlights(predicted: Range[], expected: Range[], minIou = MIN_IOU): MatchResult {
  const pairs: Array<{ p: number; e: number; score: number }> = [];
  predicted.forEach((p, pi) =>
    expected.forEach((e, ei) => {
      const score = iou(p, e);
      if (score >= minIou) pairs.push({ p: pi, e: ei, score });
    }),
  );
  pairs.sort((a, b) => b.score - a.score);
  const usedP = new Set<number>();
  const usedE = new Set<number>();
  for (const pair of pairs) {
    if (usedP.has(pair.p) || usedE.has(pair.e)) continue;
    usedP.add(pair.p);
    usedE.add(pair.e);
  }
  return {
    truePositives: usedP.size,
    falsePositives: predicted.length - usedP.size,
    falseNegatives: expected.length - usedE.size,
  };
}

export type Scores = { precision: number | null; recall: number | null; f1: number | null };

/** Precisão = acertos / grifados; revocação = acertos / esperados; F1 = média harmônica. */
export function scores(m: MatchResult): Scores {
  const predicted = m.truePositives + m.falsePositives;
  const expected = m.truePositives + m.falseNegatives;
  const precision = predicted === 0 ? null : m.truePositives / predicted;
  const recall = expected === 0 ? null : m.truePositives / expected;
  const f1 =
    precision === null || recall === null ? null : precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

export function sumMatches(results: MatchResult[]): MatchResult {
  return results.reduce(
    (acc, r) => ({
      truePositives: acc.truePositives + r.truePositives,
      falsePositives: acc.falsePositives + r.falsePositives,
      falseNegatives: acc.falseNegatives + r.falseNegatives,
    }),
    { truePositives: 0, falsePositives: 0, falseNegatives: 0 },
  );
}

/** Dataset de grifos: para cada documento e critério, as frases que deveriam ser grifadas. */
export const highlightDatasetSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  documents: z.array(z.object({ id: z.string().min(1), file: z.string().min(1), title: z.string().optional() })).min(1),
  tasks: z
    .array(
      z.object({
        document: z.string().min(1),
        /** Chave de um critério predefinido (ex.: "definicoes")... */
        criterion: z.string().min(1).optional(),
        /** ...ou um critério personalizado. */
        custom: z.object({ label: z.string().min(1), instruction: z.string().min(10) }).optional(),
        /** Trechos literais esperados. Lista vazia = nada deveria ser grifado. */
        expected: z.array(z.string().trim().min(1)),
      }),
    )
    .min(1),
});

export type HighlightDataset = z.infer<typeof highlightDatasetSchema>;

export function parseHighlightDataset(json: unknown): HighlightDataset {
  const result = highlightDatasetSchema.safeParse(json);
  if (!result.success) throw new Error(`Dataset de grifos inválido:\n${z.prettifyError(result.error)}`);
  const ids = new Set(result.data.documents.map((d) => d.id));
  for (const [i, task] of result.data.tasks.entries()) {
    if (!ids.has(task.document)) throw new Error(`tarefa ${i}: documento "${task.document}" não existe em documents`);
    if (!task.criterion === !task.custom) throw new Error(`tarefa ${i}: informe "criterion" OU "custom"`);
  }
  return result.data;
}
