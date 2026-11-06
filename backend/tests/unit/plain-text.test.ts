import { describe, expect, it } from 'vitest';
import { decodeText, extractPlainText } from '../../src/domain/extraction/plain-text.ts';
import { ExtractionError } from '../../src/domain/extraction/types.ts';

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('decodeText', () => {
  it('decodifica UTF-8 com acentos', () => {
    expect(decodeText(utf8('Função e derivação'))).toBe('Função e derivação');
  });

  it('remove BOM e normaliza quebras de linha', () => {
    expect(decodeText(utf8('﻿linha 1\r\nlinha 2\rlinha 3'))).toBe('linha 1\nlinha 2\nlinha 3');
  });

  it('usa Windows-1252 quando o arquivo não é UTF-8 válido', () => {
    // "ação" em Windows-1252: a=0x61, ç=0xE7, ã=0xE3, o=0x6F
    expect(decodeText(new Uint8Array([0x61, 0xe7, 0xe3, 0x6f]))).toBe('ação');
  });
});

describe('extractPlainText', () => {
  it('gera uma única página sem coordenadas, cobrindo todo o texto', () => {
    const markdown = '# Limites\n\nO **limite** de f(x) quando x tende a a.';
    const doc = extractPlainText(utf8(markdown));
    expect(doc.text).toBe(markdown);
    expect(doc.pages).toEqual([
      {
        pageNumber: 1,
        width: null,
        height: null,
        charStart: 0,
        charEnd: markdown.length,
        text: markdown,
        items: [],
      },
    ]);
  });

  it('rejeita arquivo vazio', () => {
    expect(() => extractPlainText(utf8('  \n '))).toThrow(ExtractionError);
  });
});
