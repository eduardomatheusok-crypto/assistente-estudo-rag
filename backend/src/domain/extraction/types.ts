/**
 * Resultado da extração de um documento.
 *
 * O "texto canônico" do documento é a concatenação das páginas separadas por
 * PAGE_SEPARATOR. Todos os offsets (páginas, itens, chunks e, futuramente,
 * citações e grifos) são relativos a esse texto canônico.
 */
export const PAGE_SEPARATOR = '\n\n';

/** Trecho de texto posicionado na página (apenas PDF). */
export type PositionedTextItem = {
  /** Offset inicial no texto canônico (inclusivo). */
  charStart: number;
  /** Offset final no texto canônico (exclusivo). */
  charEnd: number;
  /** Coordenadas no espaço do PDF (pontos, origem no canto inferior esquerdo). */
  x: number;
  /** Linha de base do texto. */
  y: number;
  width: number;
  height: number;
};

export type ExtractedPage = {
  pageNumber: number;
  /** Dimensões da página em pontos; null para MD/TXT. */
  width: number | null;
  height: number | null;
  charStart: number;
  charEnd: number;
  text: string;
  items: PositionedTextItem[];
};

export type ExtractedDocument = {
  text: string;
  pages: ExtractedPage[];
};

export type SupportedMimeType = 'application/pdf' | 'text/markdown' | 'text/plain';

export class ExtractionError extends Error {
  override name = 'ExtractionError';
}
