import { describe, expect, it } from 'vitest';
import { RRF_K, reciprocalRankFusion } from '../../src/domain/search/rrf.ts';

describe('reciprocalRankFusion', () => {
  it('soma 1/(k + posição) de cada lista', () => {
    const [first] = reciprocalRankFusion([['a', 'b'], ['b', 'a']], 10);
    expect(first!.score).toBeCloseTo(1 / (RRF_K + 1) + 1 / (RRF_K + 2));
  });

  it('item presente nas duas listas supera item no topo de uma só', () => {
    const fused = reciprocalRankFusion(
      [
        ['so-vetor', 'ambos'],
        ['so-lexical', 'ambos'],
      ],
      3,
    );
    expect(fused[0]!.id).toBe('ambos');
    expect(fused[0]!.ranks).toEqual([2, 2]);
  });

  it('registra a posição em cada lista, ou null quando ausente', () => {
    const fused = reciprocalRankFusion([['a', 'b'], ['c']], 10);
    const byId = Object.fromEntries(fused.map((item) => [item.id, item.ranks]));
    expect(byId).toEqual({ a: [1, null], b: [2, null], c: [null, 1] });
  });

  it('desempata pela melhor posição e depois pela ordem de aparição', () => {
    // a e c têm o mesmo score (1º lugar numa lista só); a apareceu antes.
    expect(reciprocalRankFusion([['a', 'b'], ['c', 'd']], 4).map((i) => i.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('respeita o limite e aceita listas vazias', () => {
    expect(reciprocalRankFusion([['a', 'b', 'c'], []], 2).map((i) => i.id)).toEqual(['a', 'b']);
    expect(reciprocalRankFusion([[], []], 5)).toEqual([]);
  });

  it('ignora repetição do mesmo id dentro de uma lista', () => {
    const [item] = reciprocalRankFusion([['a', 'a']], 5);
    expect(item!.score).toBeCloseTo(1 / (RRF_K + 1));
  });
});
