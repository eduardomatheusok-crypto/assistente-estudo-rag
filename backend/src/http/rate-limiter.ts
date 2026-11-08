/**
 * Limite de requisições por janela fixa (ex.: 20 por minuto), em memória.
 * Serve porque o sistema roda num processo só, para um estudante só.
 * Com vários servidores, o contador teria de ir para um lugar compartilhado.
 */
export type RateDecision = { allowed: true; remaining: number } | { allowed: false; retryAfterMs: number };

export class FixedWindowRateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Conta uma requisição para `key` (ex.: o IP) e diz se ela pode seguir. */
  hit(key: string): RateDecision {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || now - window.start >= this.windowMs) {
      window = { start: now, count: 0 };
      this.windows.set(key, window);
      this.prune(now);
    }
    if (window.count >= this.limit) {
      return { allowed: false, retryAfterMs: window.start + this.windowMs - now };
    }
    window.count++;
    return { allowed: true, remaining: this.limit - window.count };
  }

  /** Remove janelas vencidas para o mapa não crescer para sempre. */
  private prune(now: number): void {
    for (const [key, w] of this.windows) {
      if (now - w.start >= this.windowMs) this.windows.delete(key);
    }
  }
}
