/** Erro temporário (limite de requisições, indisponibilidade): vale tentar de novo. */
export class RetryableError extends Error {
  override name = 'RetryableError';
  readonly retryAfterMs: number | undefined;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

export type RetryOptions = {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Repete `fn` quando lança RetryableError, com espera exponencial
 * (base, 2×base, 4×base…, limitada a maxDelayMs). Se o provedor indicar
 * quanto esperar (retryAfterMs), esse valor é respeitado.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof RetryableError) || attempt >= options.retries) throw error;
      const backoff = Math.min(options.baseDelayMs * 2 ** attempt, options.maxDelayMs);
      await sleep(Math.min(error.retryAfterMs ?? backoff, options.maxDelayMs));
    }
  }
}
