import { describe, expect, it } from 'vitest';
import {
  ChunkingOptionsError,
  chunkText,
  pageAt,
  type Chunk,
  type PageRange,
} from '../../src/domain/chunking/chunker.ts';

const singlePage = (text: string): PageRange[] => [
  { pageNumber: 1, charStart: 0, charEnd: text.length },
];

function sentences(count: number): string {
  return Array.from(
    { length: count },
    (_, i) => `A frase número ${i + 1} explica um conceito importante de cálculo.`,
  ).join(' ');
}

function expectInvariants(text: string, chunks: Chunk[], chunkSize: number) {
  chunks.forEach((chunk, i) => {
    expect(chunk.index).toBe(i);
    expect(chunk.text).toBe(text.slice(chunk.charStart, chunk.charEnd));
    expect(chunk.text.length).toBeLessThanOrEqual(chunkSize);
    expect(chunk.text).toBe(chunk.text.trim());
    if (i > 0) expect(chunk.charStart).toBeGreaterThan(chunks[i - 1]!.charStart);
  });
}

/** Todo caractere não-branco do texto aparece em pelo menos um chunk. */
function expectFullCoverage(text: string, chunks: Chunk[]) {
  for (let p = 0; p < text.length; p++) {
    if (/\s/.test(text[p]!)) continue;
    const covered = chunks.some((c) => c.charStart <= p && p < c.charEnd);
    expect(covered, `caractere ${p} ("${text[p]}") sem chunk`).toBe(true);
  }
}

describe('chunkText', () => {
  it('retorna um único chunk quando o texto cabe no tamanho', () => {
    const text = '  Derivada é a taxa de variação instantânea.  ';
    const chunks = chunkText(text, singlePage(text), { chunkSize: 200, chunkOverlap: 20 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe('Derivada é a taxa de variação instantânea.');
    expect(chunks[0]!.charStart).toBe(2);
  });

  it('retorna lista vazia para texto vazio ou só com espaços', () => {
    expect(chunkText('', [], { chunkSize: 200, chunkOverlap: 0 })).toEqual([]);
    expect(chunkText(' \n\n ', singlePage(' \n\n '), { chunkSize: 200, chunkOverlap: 0 })).toEqual([]);
  });

  it('mantém os invariantes de offset, tamanho e cobertura', () => {
    const text = sentences(60);
    const options = { chunkSize: 300, chunkOverlap: 60 };
    const chunks = chunkText(text, singlePage(text), options);
    expect(chunks.length).toBeGreaterThan(1);
    expectInvariants(text, chunks, options.chunkSize);
    expectFullCoverage(text, chunks);
  });

  it('corta no fim de frase quando possível', () => {
    const text = sentences(30);
    const chunks = chunkText(text, singlePage(text), { chunkSize: 250, chunkOverlap: 0 });
    for (const chunk of chunks.slice(0, -1)) expect(chunk.text.endsWith('.')).toBe(true);
  });

  it('prefere o fim de parágrafo ao fim de frase', () => {
    const paragraph1 = 'Primeiro parágrafo. ' + 'Texto de apoio. '.repeat(8);
    const text = `${paragraph1.trim()}\n\nSegundo parágrafo. ${'Mais texto aqui. '.repeat(10)}`;
    const chunks = chunkText(text, singlePage(text), { chunkSize: 200, chunkOverlap: 0 });
    expect(chunks[0]!.text).toBe(paragraph1.trim());
    expect(chunks[1]!.text.startsWith('Segundo parágrafo.')).toBe(true);
  });

  it('sem overlap, os chunks não se sobrepõem', () => {
    const text = sentences(40);
    const chunks = chunkText(text, singlePage(text), { chunkSize: 300, chunkOverlap: 0 });
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.charStart).toBeGreaterThanOrEqual(chunks[i - 1]!.charEnd);
    }
  });

  it('com overlap, repete o final do chunk anterior começando numa palavra inteira', () => {
    const text = sentences(40);
    const options = { chunkSize: 300, chunkOverlap: 80 };
    const chunks = chunkText(text, singlePage(text), options);
    for (let i = 1; i < chunks.length; i++) {
      const previous = chunks[i - 1]!;
      const current = chunks[i]!;
      expect(current.charStart).toBeLessThan(previous.charEnd);
      expect(previous.charEnd - current.charStart).toBeLessThanOrEqual(options.chunkOverlap);
      expect(/\s/.test(text[current.charStart - 1]!)).toBe(true);
    }
  });

  it('corta no meio quando não há nenhum limite (palavra gigante) e ainda avança', () => {
    const text = 'x'.repeat(1050);
    const options = { chunkSize: 200, chunkOverlap: 50 };
    const chunks = chunkText(text, singlePage(text), options);
    expectInvariants(text, chunks, options.chunkSize);
    expectFullCoverage(text, chunks);
    expect(chunks.at(-1)!.charEnd).toBe(text.length);
  });

  it('registra o intervalo de páginas de cada chunk', () => {
    const page1 = sentences(4);
    const page2 = sentences(4);
    const text = `${page1}\n\n${page2}`;
    const pages: PageRange[] = [
      { pageNumber: 1, charStart: 0, charEnd: page1.length },
      { pageNumber: 2, charStart: page1.length + 2, charEnd: text.length },
    ];
    const chunks = chunkText(text, pages, { chunkSize: 400, chunkOverlap: 100 });
    expect(chunks[0]!.pageStart).toBe(1);
    expect(chunks.at(-1)!.pageEnd).toBe(2);
    expect(chunks.some((c) => c.pageStart === 1 && c.pageEnd === 2)).toBe(true);
  });

  it('rejeita opções inválidas', () => {
    const text = sentences(5);
    expect(() => chunkText(text, singlePage(text), { chunkSize: 50, chunkOverlap: 0 })).toThrow(
      ChunkingOptionsError,
    );
    expect(() => chunkText(text, singlePage(text), { chunkSize: 300, chunkOverlap: 150 })).toThrow(
      ChunkingOptionsError,
    );
    expect(() => chunkText(text, singlePage(text), { chunkSize: 300, chunkOverlap: -1 })).toThrow(
      ChunkingOptionsError,
    );
    expect(() => chunkText(text, singlePage(text), { chunkSize: 300.5, chunkOverlap: 0 })).toThrow(
      ChunkingOptionsError,
    );
  });
});

describe('pageAt', () => {
  const pages: PageRange[] = [
    { pageNumber: 1, charStart: 0, charEnd: 10 },
    { pageNumber: 2, charStart: 12, charEnd: 20 },
    { pageNumber: 3, charStart: 22, charEnd: 30 },
  ];

  it('encontra a página do offset', () => {
    expect(pageAt(pages, 0)).toBe(1);
    expect(pageAt(pages, 9)).toBe(1);
    expect(pageAt(pages, 12)).toBe(2);
    expect(pageAt(pages, 29)).toBe(3);
  });

  it('atribui offsets do separador à página anterior', () => {
    expect(pageAt(pages, 11)).toBe(1);
  });
});
