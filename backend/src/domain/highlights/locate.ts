import type { PositionedTextItem } from '../extraction/types.ts';

/** Retângulo no espaço do PDF: [x1, y1, x2, y2], pontos, origem no canto inferior esquerdo. */
export type Rect = [number, number, number, number];

export type PageLocation = { page: number; rects: Rect[] };

export type PageItems = { pageNumber: number; items: PositionedTextItem[] };

/**
 * Parte de uma letra que fica abaixo da linha de base (g, p, q), como fração
 * do tamanho da fonte. O resto (0,8) fica acima. Aproximação suficiente para
 * desenhar o grifo atrás do texto.
 */
const DESCENT = 0.2;

/**
 * Converte um intervalo do texto canônico [start, end) em retângulos por página.
 *
 * Cada item do PDF.js sabe seus caracteres e sua caixa. Item coberto por
 * inteiro entra inteiro; item coberto em parte é cortado na proporção dos
 * caracteres (aproximação: em fonte proporcional, "i" e "m" têm larguras
 * diferentes). Pedaços na mesma linha viram um retângulo só.
 * Assume texto horizontal (sem rotação).
 */
export function locateRange(pages: PageItems[], start: number, end: number): PageLocation[] {
  const locations: PageLocation[] = [];
  for (const page of pages) {
    const pieces: Rect[] = [];
    for (const item of page.items) {
      const a = Math.max(start, item.charStart);
      const b = Math.min(end, item.charEnd);
      if (a >= b) continue;
      const length = item.charEnd - item.charStart;
      const x1 = item.x + (item.width * (a - item.charStart)) / length;
      const x2 = item.x + (item.width * (b - item.charStart)) / length;
      pieces.push([x1, item.y - DESCENT * item.height, x2, item.y + (1 - DESCENT) * item.height]);
    }
    if (pieces.length > 0) locations.push({ page: page.pageNumber, rects: mergeLines(pieces) });
  }
  return locations;
}

/** Junta os pedaços de uma mesma linha (mesma faixa vertical) num retângulo, de cima para baixo. */
function mergeLines(pieces: Rect[]): Rect[] {
  const lines: Rect[] = [];
  for (const piece of [...pieces].sort((p, q) => q[1] - p[1] || p[0] - q[0])) {
    const line = lines.find((l) => Math.abs(l[1] - piece[1]) < 0.5 * (piece[3] - piece[1]));
    if (line) {
      line[0] = Math.min(line[0], piece[0]);
      line[1] = Math.min(line[1], piece[1]);
      line[2] = Math.max(line[2], piece[2]);
      line[3] = Math.max(line[3], piece[3]);
    } else {
      lines.push([...piece]);
    }
  }
  return lines.map((r) => r.map((v) => Math.round(v * 100) / 100) as Rect);
}
