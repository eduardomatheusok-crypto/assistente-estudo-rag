import { describe, expect, it } from 'vitest';
import { splitAnswer } from './answer.ts';
import { pdfRectToCss } from './geometry.ts';
import { segmentText } from './text-marks.ts';
import { shuffled } from './shuffle.ts';
import { composeAnswer, speechEstimate } from './interview.ts';
import { relativeDay } from './format.ts';

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

describe('composeAnswer', () => {
  it('modo livre devolve o texto como está', () => {
    expect(composeAnswer('free', ['  Minha resposta.  '])).toBe('Minha resposta.');
  });

  it('modos com partes rotulam cada linha e ignoram partes vazias', () => {
    expect(composeAnswer('guided', ['Mede a variação.', '', 'Física.'])).toBe('Definição: Mede a variação.\nPor que importa: Física.');
    expect(composeAnswer('star', ['', '', '', ''])).toBe('');
  });
});

describe('speechEstimate', () => {
  it('estima o tempo de fala a 130 palavras por minuto', () => {
    expect(speechEstimate('')).toEqual({ words: 0, seconds: 0, status: 'short' });
    const ideal = speechEstimate(Array(130).fill('palavra').join(' '));
    expect(ideal).toEqual({ words: 130, seconds: 60, status: 'ideal' });
    expect(speechEstimate(Array(300).fill('palavra').join(' ')).status).toBe('long');
  });

  it('não conta pontuação solta como palavra', () => {
    expect(speechEstimate('Derivada: — taxa , de variação.').words).toBe(4);
  });
});

describe('relativeDay', () => {
  const now = new Date(2026, 10, 20, 15, 0);
  it('fala de dias de calendário', () => {
    expect(relativeDay(new Date(2026, 10, 20, 1, 0), now)).toBe('hoje');
    expect(relativeDay(new Date(2026, 10, 19, 23, 0), now)).toBe('ontem');
    expect(relativeDay(new Date(2026, 10, 15), now)).toBe('há 5 dias');
    expect(relativeDay(new Date(2026, 9, 30), now)).toBe('há 3 semanas');
  });
});
