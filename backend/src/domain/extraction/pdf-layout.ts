import {
  ExtractionError,
  PAGE_SEPARATOR,
  type ExtractedDocument,
  type ExtractedPage,
  type PositionedTextItem,
} from './types.ts';

/** Item de texto como o PDF.js entrega (subconjunto usado). */
export type RawPdfTextItem = {
  str: string;
  /** Matriz [a, b, c, d, e, f]; (e, f) é a origem do texto na linha de base. */
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
};

export type RawPdfPage = {
  pageNumber: number;
  width: number;
  height: number;
  items: RawPdfTextItem[];
};

/**
 * Monta o texto canônico a partir dos itens do PDF.js, guardando para cada
 * item o intervalo de caracteres que ele ocupa e suas coordenadas.
 * É esse mapa caractere → coordenada que permite, depois, transformar um
 * grifo (intervalo de texto) em retângulos na página.
 *
 * Função pura: não depende do PDF.js, para ser testada isoladamente.
 */
export function assemblePdfText(rawPages: RawPdfPage[]): ExtractedDocument {
  const pages: ExtractedPage[] = [];
  let text = '';

  for (const [index, raw] of rawPages.entries()) {
    if (index > 0) text += PAGE_SEPARATOR;
    const pageStart = text.length;
    const items: PositionedTextItem[] = [];
    let pageText = '';

    for (const item of raw.items) {
      if (item.str.length > 0) {
        const charStart = pageStart + pageText.length;
        pageText += item.str;
        // Espaços isolados não precisam de coordenada: nunca são grifados sozinhos.
        if (item.str.trim().length > 0) {
          items.push({
            charStart,
            charEnd: charStart + item.str.length,
            x: item.transform[4] ?? 0,
            y: item.transform[5] ?? 0,
            width: item.width,
            height: item.height > 0 ? item.height : fontSizeFromTransform(item.transform),
          });
        }
      }
      if (item.hasEOL) pageText += '\n';
    }

    pageText = pageText.replace(/\s+$/, '');
    text += pageText;
    pages.push({
      pageNumber: raw.pageNumber,
      width: raw.width,
      height: raw.height,
      charStart: pageStart,
      charEnd: pageStart + pageText.length,
      text: pageText,
      items,
    });
  }

  if (text.trim().length === 0) {
    throw new ExtractionError(
      'PDF sem texto selecionável (provavelmente escaneado). OCR não é suportado.',
    );
  }
  return { text, pages };
}

function fontSizeFromTransform(transform: number[]): number {
  return Math.hypot(transform[2] ?? 0, transform[3] ?? 0);
}
