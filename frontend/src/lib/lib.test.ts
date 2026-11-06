import { describe, expect, it } from 'vitest';
import { splitAnswer } from './answer.ts';
import { pdfRectToCss } from './geometry.ts';
import { segmentText } from './text-marks.ts';
import { shuffled } from './shuffle.ts';

describe('pdfRectToCss', () => {
  // Página de 792 pt de altura, zoom 2: y do PDF cresce para cima, o da tela para baixo.
  const toViewport = (x: number, y: number) => [x * 2, (792 - y) * 2];

  it('inverte o eixo y, aplica o zoom e normaliza o canto superior esquerdo', () => {
    expect(pdfRectToCss([72, 698, 172, 708], toViewport)).toEqual({ left: 144, top: 168, width: 200, height: 20 });
  });
});

describe('splitAnswer', () => {
  it('separa texto e marcadores de fonte', () => {
    expect(splitAnswer('A derivada mede variação [S1]. Integral é área [S2][S3].')).toEqual([
      { kind: 'text', text: 'A derivada mede variação ' },
      { kind: 'source', label: 'S1' },
      { kind: 'text', text: '. Integral é área ' },
      { kind: 'source', label: 'S2' },
      { kind: 'source', label: 'S3' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('texto sem marcadores fica inteiro', () => {
    expect(splitAnswer('Não encontrei no material.')).toEqual([{ kind: 'text', text: 'Não encontrei no material.' }]);
  });
});

describe('segmentText', () => {
  it('corta o texto nas bordas das marcas, inclusive sobrepostas', () => {
    const segments = segmentText('abcdefghij', [
      { start: 2, end: 6, className: 'a' },
      { start: 4, end: 8, className: 'b' },
    ]);
    expect(segments.map((s) => [s.text, s.marks.map((m) => m.className).join('+')])).toEqual([
      ['ab', ''],
      ['cd', 'a'],
      ['ef', 'a+b'],
      ['gh', 'b'],
      ['ij', ''],
    ]);
  });

  it('ignora marcas vazias ou fora do texto', () => {
    expect(segmentText('abc', [{ start: 5, end: 9, className: 'x' }])).toEqual([{ text: 'abc', start: 0, marks: [] }]);
  });
});

describe('shuffled', () => {
  it('mantém os mesmos itens e não altera a lista original', () => {
    const original = [1, 2, 3, 4, 5];
    const result = shuffled(original, () => 0);
    expect(result).toEqual([2, 3, 4, 5, 1]);
    expect([...result].sort()).toEqual(original);
    expect(original).toEqual([1, 2, 3, 4, 5]);
  });

  it('lista vazia ou com 1 item volta igual', () => {
    expect(shuffled([])).toEqual([]);
    expect(shuffled(['a'])).toEqual(['a']);
  });
});
