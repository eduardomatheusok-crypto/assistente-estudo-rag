/** Constante usual da literatura (Cormack et al., 2009); suaviza o peso das primeiras posições. */
export const RRF_K = 60;

export type FusedItem = {
  id: string;
  score: number;
  /** Posição (1 = primeiro) em cada lista de entrada; null se não apareceu nela. */
  ranks: Array<number | null>;
};

/**
 * Reciprocal Rank Fusion: score(d) = Σ 1 / (k + posição de d em cada lista).
 *
 * Usa só a posição, não o score bruto, por isso combina listas com escalas
 * incomparáveis (similaridade de cosseno × ts_rank). Um item bem colocado nas
 * duas listas supera um que aparece só no topo de uma.
 * Empates: melhor posição em qualquer lista, depois ordem de primeira aparição.
 */
export function reciprocalRankFusion(lists: string[][], limit: number, k = RRF_K): FusedItem[] {
  const items = new Map<string, FusedItem & { firstSeen: number }>();
  let seen = 0;

  lists.forEach((list, listIndex) => {
    list.forEach((id, position) => {
      let item = items.get(id);
      if (!item) {
        item = { id, score: 0, ranks: lists.map(() => null), firstSeen: seen++ };
        items.set(id, item);
      }
      if (item.ranks[listIndex] !== null) return; // id repetido na mesma lista: vale a 1ª posição
      item.ranks[listIndex] = position + 1;
      item.score += 1 / (k + position + 1);
    });
  });

  const bestRank = (item: FusedItem) =>
    Math.min(...item.ranks.map((rank) => rank ?? Number.POSITIVE_INFINITY));

  return [...items.values()]
    .sort((a, b) => b.score - a.score || bestRank(a) - bestRank(b) || a.firstSeen - b.firstSeen)
    .slice(0, limit)
    .map(({ id, score, ranks }) => ({ id, score, ranks }));
}
