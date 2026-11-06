/**
 * Prioridades por desempenho, calculadas pelo código (sem LLM).
 * Sobem os assuntos em que o estudante mais erra e que não pratica há mais tempo.
 */

export type TopicStats = {
  topic: string;
  attempts: number;
  errors: number;
  lastPracticedAt: Date;
};

export type Priority = TopicStats & {
  errorRate: number;
  daysSincePractice: number;
  score: number;
  justification: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** A partir de 14 dias sem praticar, o peso do esquecimento é máximo. */
const FORGETTING_DAYS = 14;

/**
 * score = 0,7 × taxa de erro + 0,3 × esquecimento.
 * O erro pesa mais: é a evidência de que o estudante ainda não domina.
 * Só entram assuntos com pelo menos um erro.
 */
export function rankPriorities(stats: TopicStats[], now: Date): Priority[] {
  return stats
    .filter((s) => s.errors > 0)
    .map((s) => {
      const errorRate = s.errors / s.attempts;
      const daysSincePractice = Math.max(0, Math.floor((now.getTime() - s.lastPracticedAt.getTime()) / DAY_MS));
      const forgetting = Math.min(1, daysSincePractice / FORGETTING_DAYS);
      return {
        ...s,
        errorRate,
        daysSincePractice,
        score: 0.7 * errorRate + 0.3 * forgetting,
        justification: justify(s, daysSincePractice),
      };
    })
    .sort((a, b) => b.score - a.score || b.errors - a.errors || a.topic.localeCompare(b.topic));
}

function justify(s: TopicStats, days: number): string {
  const when = days === 0 ? 'praticado hoje' : days === 1 ? 'última prática ontem' : `última prática há ${days} dias`;
  return `Você errou ${s.errors} de ${s.attempts} · ${when}`;
}
