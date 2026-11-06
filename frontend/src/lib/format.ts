const DAY_MS = 24 * 60 * 60 * 1000;

/** "hoje", "ontem", "há 3 dias", "há 2 semanas" — para a atividade recente. */
export function relativeDay(date: string | Date, now: Date = new Date()): string {
  const d = new Date(date);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / DAY_MS);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 14) return `há ${days} dias`;
  return `há ${Math.floor(days / 7)} semanas`;
}

export const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`;
