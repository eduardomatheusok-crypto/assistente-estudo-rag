import { describe, expect, it } from 'vitest';
import { detectMimeType } from '../../src/domain/extraction/file-type.ts';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('detectMimeType', () => {
  it('aceita PDF com assinatura válida', () => {
    expect(detectMimeType('Apostila.PDF', bytes('%PDF-1.7\n...'))).toBe('application/pdf');
  });

  it('rejeita .pdf sem assinatura de PDF', () => {
    expect(detectMimeType('falso.pdf', bytes('apenas texto'))).toBeNull();
  });

  it('aceita Markdown e TXT', () => {
    expect(detectMimeType('notas.md', bytes('# Título'))).toBe('text/markdown');
    expect(detectMimeType('notas.markdown', bytes('# Título'))).toBe('text/markdown');
    expect(detectMimeType('notas.txt', bytes('texto'))).toBe('text/plain');
  });

  it('rejeita binário com extensão de texto e PDF renomeado para .txt', () => {
    expect(detectMimeType('imagem.txt', new Uint8Array([0x89, 0x50, 0x00, 0x47]))).toBeNull();
    expect(detectMimeType('apostila.txt', bytes('%PDF-1.4\n'))).toBeNull();
  });

  it('rejeita extensões não suportadas', () => {
    expect(detectMimeType('slides.pptx', bytes('x'))).toBeNull();
    expect(detectMimeType('sem-extensao', bytes('x'))).toBeNull();
  });
});
