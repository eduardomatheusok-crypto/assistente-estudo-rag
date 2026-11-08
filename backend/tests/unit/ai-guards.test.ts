import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerAiGuards } from '../../src/http/ai-guards.ts';
import { IdempotencyStore } from '../../src/http/idempotency.ts';
import { FixedWindowRateLimiter } from '../../src/http/rate-limiter.ts';

describe('FixedWindowRateLimiter', () => {
  it('permite até o limite na janela e informa quanto esperar', () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter(2, 60_000, () => now);
    expect(limiter.hit('ip')).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.hit('ip')).toEqual({ allowed: true, remaining: 0 });
    now = 15_000;
    expect(limiter.hit('ip')).toEqual({ allowed: false, retryAfterMs: 45_000 });
    expect(limiter.hit('outro-ip').allowed).toBe(true); // cada IP tem a sua janela
    now = 60_000;
    expect(limiter.hit('ip').allowed).toBe(true); // nova janela
  });
});

describe('IdempotencyStore', () => {
  it('processa a primeira vez, repete a resposta depois e expira', () => {
    let now = 0;
    const store = new IdempotencyStore(1000, () => now);
    expect(store.begin('k', 'POST /a {}')).toEqual({ kind: 'proceed' });
    expect(store.begin('k', 'POST /a {}')).toEqual({ kind: 'in_progress' });
    const response = { statusCode: 201, payload: '{"ok":true}', contentType: 'application/json' };
    store.complete('k', response);
    expect(store.begin('k', 'POST /a {}')).toEqual({ kind: 'replay', response });
    expect(store.begin('k', 'POST /b {}')).toEqual({ kind: 'mismatch' });
    now = 2000;
    expect(store.begin('k', 'POST /a {}')).toEqual({ kind: 'proceed' });
  });

  it('libera a chave quando o pedido falha', () => {
    const store = new IdempotencyStore(1000);
    store.begin('k', 'f');
    store.release('k');
    expect(store.begin('k', 'f')).toEqual({ kind: 'proceed' });
  });
});

/** Servidor mínimo com uma rota "de IA" que conta quantas vezes foi realmente executada. */
async function server(perMinute: number, status = 201) {
  const app = Fastify();
  registerAiGuards(app, { perMinute });
  let calls = 0;
  app.post('/notebooks/:id/questions', async (_request, reply) => {
    calls++;
    return reply.code(status).send({ answer: `resposta ${calls}` });
  });
  app.post('/notebooks', async () => ({ ok: true })); // rota sem IA: sem proteção
  await app.ready();
  return { app, calls: () => calls };
}

const ask = (app: Awaited<ReturnType<typeof server>>['app'], key?: string, question = 'O que é derivada?') =>
  app.inject({
    method: 'POST',
    url: '/notebooks/abc/questions',
    payload: { question },
    headers: key ? { 'idempotency-key': key } : {},
  });

describe('registerAiGuards', () => {
  it('mesma Idempotency-Key devolve a mesma resposta sem executar de novo', async () => {
    const s = await server(100);
    const first = await ask(s.app, 'chave-1');
    const second = await ask(s.app, 'chave-1');
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(s.calls()).toBe(1);
  });

  it('mesma chave com outro pedido é recusada; sem chave executa sempre', async () => {
    const s = await server(100);
    await ask(s.app, 'chave-1');
    expect((await ask(s.app, 'chave-1', 'Outra pergunta')).statusCode).toBe(422);
    await ask(s.app);
    await ask(s.app);
    expect(s.calls()).toBe(3);
  });

  it('erro do servidor não fica guardado: a nova tentativa executa de verdade', async () => {
    const s = await server(100, 503);
    await ask(s.app, 'chave-1');
    await ask(s.app, 'chave-1');
    expect(s.calls()).toBe(2);
  });

  it('limita por minuto com 429 e Retry-After; resposta repetida não conta', async () => {
    const s = await server(2);
    await ask(s.app, 'a');
    await ask(s.app, 'a'); // repetição: não conta no limite
    await ask(s.app, 'b');
    const blocked = await ask(s.app, 'c');
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.json().error).toMatch(/Tente de novo em/);
    expect(s.calls()).toBe(2);
    // a chave recusada pelo limite fica livre para depois
    expect((await ask(s.app, 'c')).statusCode).toBe(429);
  });

  it('rotas sem IA não são limitadas', async () => {
    const s = await server(1);
    for (let i = 0; i < 5; i++) {
      expect((await s.app.inject({ method: 'POST', url: '/notebooks', payload: {} })).statusCode).toBe(200);
    }
  });
});
