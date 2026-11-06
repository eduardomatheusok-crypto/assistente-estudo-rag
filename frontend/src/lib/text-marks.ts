export type Mark = { start: number; end: number; className: string; id?: string };
export type TextSegment = { text: string; start: number; marks: Mark[] };

/**
 * Divide um texto em segmentos para destacar intervalos (MD/TXT, sem PDF).
 * Cada segmento sabe quais marcas o cobrem; marcas sobrepostas são permitidas
 * (um trecho pode ser definição e citação ao mesmo tempo).
 */
export function segmentText(text: string, marks: Mark[]): TextSegment[] {
  const valid = marks
    .map((m) => ({ ...m, start: Math.max(0, m.start), end: Math.min(text.length, m.end) }))
    .filter((m) => m.start < m.end);
  const cuts = new Set<number>([0, text.length]);
  for (const m of valid) {
    cuts.add(m.start);
    cuts.add(m.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const segments: TextSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!;
    const end = points[i + 1]!;
    if (start === end) continue;
    segments.push({ text: text.slice(start, end), start, marks: valid.filter((m) => m.start <= start && m.end >= end) });
  }
  return segments;
}
