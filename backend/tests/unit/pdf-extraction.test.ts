import { describe, expect, it } from 'vitest';
import { extractPdf } from '../../src/domain/extraction/pdf.ts';
import { ExtractionError, PAGE_SEPARATOR } from '../../src/domain/extraction/types.ts';
import { buildTestPdf } from '../helpers/build-pdf.ts';

describe('extractPdf (PDF.js real)', () => {
  it('extrai o texto por página, com acentos e coordenadas', async () => {
    const pdf = buildTestPdf([
      [
        { text: 'Definição: derivada é a taxa de variação.', x: 72, y: 720 },
        { text: 'Exemplo (simples): f(x) = x².', x: 72, y: 700 },
      ],
      [{ text: 'Integral é a área sob a curva.', x: 100, y: 500, size: 14 }],
    ]);

    const doc = await extractPdf(pdf);

    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[0]!.text).toContain('Definição: derivada é a taxa de variação.');
    expect(doc.pages[0]!.text).toContain('Exemplo (simples): f(x) = x².');
    expect(doc.pages[1]!.text).toBe('Integral é a área sob a curva.');
    expect(doc.pages[1]!.charStart).toBe(doc.pages[0]!.charEnd + PAGE_SEPARATOR.length);
    expect(doc.pages[0]).toMatchObject({ width: 612, height: 792 });

    const first = doc.pages[0]!.items[0]!;
    expect(doc.text.slice(first.charStart, first.charEnd)).toBe(
      'Definição: derivada é a taxa de variação.',
    );
    expect(first.x).toBeCloseTo(72);
    expect(first.y).toBeCloseTo(720);
    expect(first.width).toBeGreaterThan(100);
    expect(first.height).toBeCloseTo(12);

    const second = doc.pages[1]!.items[0]!;
    expect(second).toMatchObject({ x: 100, y: 500 });
    expect(second.height).toBeCloseTo(14);
  });

  it('falha com mensagem clara quando o PDF não tem texto', async () => {
    await expect(extractPdf(buildTestPdf([[]]))).rejects.toThrow(/sem texto selecionável/);
  });

  it('falha com ExtractionError para PDF corrompido', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4\nlixo sem estrutura');
    await expect(extractPdf(bytes)).rejects.toBeInstanceOf(ExtractionError);
  });
});
