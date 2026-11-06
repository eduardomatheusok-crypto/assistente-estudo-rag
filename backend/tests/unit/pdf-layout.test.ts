import { describe, expect, it } from 'vitest';
import { assemblePdfText, type RawPdfTextItem } from '../../src/domain/extraction/pdf-layout.ts';
import { ExtractionError, PAGE_SEPARATOR } from '../../src/domain/extraction/types.ts';

const item = (str: string, x: number, y: number, hasEOL = false, height = 12): RawPdfTextItem => ({
  str,
  transform: [12, 0, 0, 12, x, y],
  width: str.length * 6,
  height,
  hasEOL,
});

describe('assemblePdfText', () => {
  const doc = assemblePdfText([
    {
      pageNumber: 1,
      width: 612,
      height: 792,
      items: [item('Derivada', 72, 720), item(' ', 120, 720), item('é taxa.', 126, 720, true), item('Linha 2', 72, 700)],
    },
    { pageNumber: 2, width: 612, height: 792, items: [item('Integral', 72, 720)] },
  ]);

  it('concatena itens, quebras de linha e o separador de páginas', () => {
    expect(doc.text).toBe(`Derivada é taxa.\nLinha 2${PAGE_SEPARATOR}Integral`);
  });

  it('cada item aponta exatamente para o seu texto no texto canônico', () => {
    for (const page of doc.pages) {
      for (const it of page.items) {
        expect(doc.text.slice(it.charStart, it.charEnd)).not.toMatch(/^\s*$/);
      }
    }
    const [derivada, taxa, linha2] = doc.pages[0]!.items;
    expect(doc.text.slice(derivada!.charStart, derivada!.charEnd)).toBe('Derivada');
    expect(doc.text.slice(taxa!.charStart, taxa!.charEnd)).toBe('é taxa.');
    expect(doc.text.slice(linha2!.charStart, linha2!.charEnd)).toBe('Linha 2');
  });

  it('não guarda coordenadas para itens só de espaço', () => {
    expect(doc.pages[0]!.items).toHaveLength(3);
  });

  it('guarda as coordenadas do PDF (origem na linha de base)', () => {
    expect(doc.pages[0]!.items[0]).toMatchObject({ x: 72, y: 720, width: 48, height: 12 });
  });

  it('registra o intervalo e as dimensões de cada página', () => {
    const [page1, page2] = doc.pages;
    expect(doc.text.slice(page1!.charStart, page1!.charEnd)).toBe(page1!.text);
    expect(doc.text.slice(page2!.charStart, page2!.charEnd)).toBe('Integral');
    expect(page2!.charStart).toBe(page1!.charEnd + PAGE_SEPARATOR.length);
    expect(page1).toMatchObject({ width: 612, height: 792 });
    expect(page2!.items[0]!.charStart).toBe(page2!.charStart);
  });

  it('usa o tamanho da fonte quando o PDF.js informa altura zero', () => {
    const result = assemblePdfText([
      { pageNumber: 1, width: 100, height: 100, items: [item('Texto', 10, 10, false, 0)] },
    ]);
    expect(result.pages[0]!.items[0]!.height).toBe(12);
  });

  it('mantém páginas vazias no meio do documento', () => {
    const result = assemblePdfText([
      { pageNumber: 1, width: 100, height: 100, items: [item('A', 10, 10)] },
      { pageNumber: 2, width: 100, height: 100, items: [] },
      { pageNumber: 3, width: 100, height: 100, items: [item('B', 10, 10)] },
    ]);
    expect(result.pages.map((p) => p.text)).toEqual(['A', '', 'B']);
    expect(result.text.slice(result.pages[2]!.charStart, result.pages[2]!.charEnd)).toBe('B');
  });

  it('falha quando o PDF não tem texto selecionável', () => {
    expect(() =>
      assemblePdfText([{ pageNumber: 1, width: 100, height: 100, items: [item(' ', 0, 0)] }]),
    ).toThrow(ExtractionError);
  });
});
