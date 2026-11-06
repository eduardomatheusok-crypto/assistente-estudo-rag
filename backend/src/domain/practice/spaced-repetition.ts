/**
 * Repetição espaçada pelo método Leitner, feita só pelo código (sem LLM).
 * Acertou → o cartão sobe uma caixa e volta mais tarde.
 * Errou → volta para a caixa 1 e reaparece amanhã.
 */
export const BOX_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export function nextReview(box: number, correct: boolean, now: Date): { box: number; dueAt: Date } {
  const next = correct ? Math.min(BOX_INTERVAL_DAYS.length, box + 1) : 1;
  return { box: next, dueAt: new Date(now.getTime() + BOX_INTERVAL_DAYS[next - 1]! * DAY_MS) };
}
