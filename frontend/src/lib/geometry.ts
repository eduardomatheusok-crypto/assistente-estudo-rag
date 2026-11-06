import type { PdfRect } from '../api/types.ts';

export type CssRect = { left: number; top: number; width: number; height: number };

/**
 * Converte um retângulo do PDF (pontos, origem embaixo à esquerda) em
 * posição CSS sobre a página desenhada (pixels, origem em cima à esquerda).
 * `toViewport` é o viewport.convertToViewportPoint do PDF.js, que já aplica
 * zoom, rotação e a inversão do eixo y.
 */
export function pdfRectToCss(rect: PdfRect, toViewport: (x: number, y: number) => number[]): CssRect {
  const [ax, ay] = toViewport(rect[0], rect[1]);
  const [bx, by] = toViewport(rect[2], rect[3]);
  const left = Math.min(ax!, bx!);
  const top = Math.min(ay!, by!);
  return { left, top, width: Math.abs(bx! - ax!), height: Math.abs(by! - ay!) };
}
