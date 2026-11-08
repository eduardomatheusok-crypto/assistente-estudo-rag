import type { FastifyInstance, FastifyRequest } from 'fastify';
import { FixedWindowRateLimiter } from './rate-limiter.ts';

/** Rotas que chamam o Gemini (gastam cota). Formato: "MÉTODO rota-do-fastify". */
export const AI_ROUTES = new Set([
  'POST /notebooks/:id/questions',
  'POST /notebooks/:id/search',
  'POST /notebooks/:id/documents',
  'POST /notebooks/:id/practice-sessions',
  'POST /practice-sessions/:id/answers',
  'POST /practice-sessions/:id/more',
  'POST /documents/:id/highlight-runs',
]);

export type AiGuardOptions = {
  /** Requisições por minuto, por IP, somando todas as rotas de IA. */
  perMinute: number;
  now?: () => number;
};

const routeOf = (request: FastifyRequest) => `${request.method} ${request.routeOptions.url ?? ''}`;

/** Limita as rotas de IA por minuto: o excesso recebe 429 com `Retry-After`. */
export function registerAiGuards(app: FastifyInstance, options: AiGuardOptions): void {
  const limiter = new FixedWindowRateLimiter(options.perMinute, 60_000, options.now);

  app.addHook('preHandler', async (request, reply) => {
    if (!AI_ROUTES.has(routeOf(request))) return;
    const rate = limiter.hit(request.ip);
    if (rate.allowed) return;
    const seconds = Math.ceil(rate.retryAfterMs / 1000);
    return reply
      .code(429)
      .header('retry-after', String(seconds))
      .send({ error: `Muitos pedidos à IA em pouco tempo. Tente de novo em ${seconds} s.` });
  });
}
