import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { IdempotencyStore } from './idempotency.ts';
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

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const MAX_KEY_LENGTH = 200;

export type AiGuardOptions = {
  /** Requisições por minuto, por IP, somando todas as rotas de IA. */
  perMinute: number;
  now?: () => number;
};

const routeOf = (request: FastifyRequest) => `${request.method} ${request.routeOptions.url ?? ''}`;

/**
 * Protege as rotas de IA com:
 * 1. idempotência (cabeçalho `Idempotency-Key`): repetir o mesmo pedido devolve a
 *    mesma resposta, sem nova chamada ao Gemini;
 * 2. limite por minuto: o excesso recebe 429 com `Retry-After`.
 * Uma resposta repetida pela idempotência não conta no limite.
 */
export function registerAiGuards(app: FastifyInstance, options: AiGuardOptions): void {
  const limiter = new FixedWindowRateLimiter(options.perMinute, 60_000, options.now);
  const store = new IdempotencyStore(IDEMPOTENCY_TTL_MS, options.now);
  const keys = new WeakMap<FastifyRequest, string>();

  app.addHook('preHandler', async (request, reply) => {
    if (!AI_ROUTES.has(routeOf(request))) return;

    const header = request.headers['idempotency-key'];
    const key = typeof header === 'string' ? header.trim() : '';
    // Upload (multipart) não tem corpo para comparar; o upload duplicado já é recusado pelo hash do arquivo.
    const multipart = (request.headers['content-type'] ?? '').startsWith('multipart/');
    if (key && !multipart) {
      if (key.length > MAX_KEY_LENGTH) {
        return reply.code(400).send({ error: 'Idempotency-Key longa demais.' });
      }
      const fingerprint = `${request.method} ${request.url} ${createHash('sha256').update(JSON.stringify(request.body ?? null)).digest('hex')}`;
      const decision = store.begin(key, fingerprint);
      if (decision.kind === 'replay') {
        reply.header('idempotent-replayed', 'true').code(decision.response.statusCode);
        if (decision.response.contentType) reply.type(decision.response.contentType);
        return reply.send(decision.response.payload);
      }
      if (decision.kind === 'in_progress') {
        return reply.code(409).send({ error: 'Este pedido já está sendo processado. Aguarde a resposta.' });
      }
      if (decision.kind === 'mismatch') {
        return reply.code(422).send({ error: 'Idempotency-Key já usada para um pedido diferente.' });
      }
      keys.set(request, key);
    }

    const rate = limiter.hit(request.ip);
    if (!rate.allowed) {
      if (keys.has(request)) {
        store.release(keys.get(request)!);
        keys.delete(request);
      }
      const seconds = Math.ceil(rate.retryAfterMs / 1000);
      return reply
        .code(429)
        .header('retry-after', String(seconds))
        .send({ error: `Muitos pedidos à IA em pouco tempo. Tente de novo em ${seconds} s.` });
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const key = keys.get(request);
    if (!key) return payload;
    keys.delete(request);
    // Erro do servidor: libera a chave para o cliente tentar de novo de verdade.
    if (reply.statusCode >= 500 || typeof payload !== 'string') {
      store.release(key);
    } else {
      const contentType = reply.getHeader('content-type');
      store.complete(key, { statusCode: reply.statusCode, payload, contentType: typeof contentType === 'string' ? contentType : undefined });
    }
    return payload;
  });
}
