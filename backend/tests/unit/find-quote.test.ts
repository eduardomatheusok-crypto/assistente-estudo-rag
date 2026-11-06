import { describe, expect, it } from 'vitest';
import { findQuote } from '../../src/domain/text/find-quote.ts';

const text = 'A derivada mede a taxa\nde variação instantânea. Ela é (muito) usada em física.';

describe('findQuote', () => {
  it('encontra o trecho exato e devolve os offsets', () => {
    const match = findQuote(text, 'taxa\nde variação');
    expect(match).toEqual({ start: 18, end: 34, exact: true });
    expect(text.slice(match!.start, match!.end)).toBe('taxa\nde variação');
  });

  it('aceita diferença só de espaços (quebra de linha do PDF virou espaço)', () => {
    const match = findQuote(text, 'a taxa de variação instantânea.');
    expect(match?.exact).toBe(false);
    expect(text.slice(match!.start, match!.end)).toBe('a taxa\nde variação instantânea.');
  });

  it('trata caracteres especiais de regex como texto', () => {
    expect(findQuote(text, 'é (muito) usada')).not.toBeNull();
    expect(findQuote('custo = 2*x + 1', '2*x + 1')).not.toBeNull();
  });

  it('rejeita paráfrase, palavra trocada, acento ou pontuação diferente', () => {
    expect(findQuote(text, 'A derivada calcula a taxa')).toBeNull();
    expect(findQuote(text, 'variacao instantanea')).toBeNull();
    expect(findQuote(text, 'variação instantânea!')).toBeNull();
    expect(findQuote(text, 'A Derivada mede')).toBeNull();
  });

  it('rejeita citação vazia', () => {
    expect(findQuote(text, '   ')).toBeNull();
  });
});
