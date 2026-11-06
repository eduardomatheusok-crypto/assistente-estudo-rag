import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api.js';
import { assemblePdfText, type RawPdfPage } from './pdf-layout.ts';
import { ExtractionError, type ExtractedDocument } from './types.ts';

const STANDARD_FONTS_DIR =
  join(dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json'))), 'standard_fonts') +
  '/';

/**
 * Extrai o texto de um PDF com o PDF.js — a mesma biblioteca que exibirá o
 * documento no frontend, para que as coordenadas coincidam.
 */
export async function extractPdf(bytes: Uint8Array): Promise<ExtractedDocument> {
  const loadingTask = getDocument({
    // O PDF.js transfere o buffer para o worker; passamos uma cópia.
    data: new Uint8Array(bytes),
    standardFontDataUrl: STANDARD_FONTS_DIR,
    disableFontFace: true,
    verbosity: 0,
  });

  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    await loadingTask.destroy().catch(() => {});
    const name = (error as { name?: string }).name;
    if (name === 'PasswordException') {
      throw new ExtractionError('PDF protegido por senha.');
    }
    throw new ExtractionError(`PDF inválido ou corrompido: ${(error as Error).message}`);
  }

  try {
    const rawPages: RawPdfPage[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      rawPages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        items: content.items
          .filter((item): item is TextItem => 'str' in item)
          .map((item) => ({
            str: item.str,
            transform: item.transform as number[],
            width: item.width,
            height: item.height,
            hasEOL: item.hasEOL,
          })),
      });
      page.cleanup();
    }
    return assemblePdfText(rawPages);
  } finally {
    await loadingTask.destroy();
  }
}
