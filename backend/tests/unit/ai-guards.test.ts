import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerAiGuards } from '../../src/http/ai-guards.ts';
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

/** Servidor mínimo com uma rota "de IA" que conta quantas vezes foi realmente executada. */
async function server(perMinute: number) {
  const app = Fastify();
  registerAiGuards(app, { perMinute });
  let calls = 0;
  app.post('/notebooks/:id/questions', async (_request, reply) => {
    calls++;
    return reply.code(201).send({ answer: `resposta ${calls}` });
  });
  app.post('/notebooks', async () => ({ ok: true })); // rota sem IA: sem limite
  await app.ready();
  return { app, calls: () => calls };
}

const ask = (app: Awaited<ReturnType<typeof server>>['app']) =>
  app.inject({ method: 'POST', url: '/notebooks/abc/questions', payload: { question: 'O que é derivada?' } });

describe('registerAiGuards', () => {
  it('limita por minuto com 429 e Retry-After, sem executar a rota', async () => {
    const s = await server(2);
    expect((await ask(s.app)).statusCode).toBe(201);
    expect((await ask(s.app)).statusCode).toBe(201);
    const blocked = await ask(s.app);
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.json().error).toMatch(/Tente de novo em/);
    expect(s.calls()).toBe(2);
  });

  it('rotas sem IA não são limitadas', async () => {
    const s = await server(1);
    for (let i = 0; i < 5; i++) {
      expect((await s.app.inject({ method: 'POST', url: '/notebooks', payload: {} })).statusCode).toBe(200);
    }
  });
});
