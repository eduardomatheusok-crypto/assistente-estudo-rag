import { RetryableError, withRetry, type RetryOptions } from '../retry.ts';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Erro definitivo do Gemini (chave inválida, requisição malformada, conteúdo bloqueado). */
export class GeminiError extends Error {
  override name = 'GeminiError';
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export type GeminiHttpOptions = {
  apiKey: string;
  fetch?: typeof fetch;
  retry?: Partial<RetryOptions>;
  timeoutMs?: number;
};

/** Cliente HTTP mínimo do Gemini: autenticação, timeout, novas tentativas em 429/5xx. */
export class GeminiHttp {
  private readonly apiKey: string;
  private readonly fetch: typeof fetch;
  private readonly retry: RetryOptions;
  private readonly timeoutMs: number;

  constructor(options: GeminiHttpOptions) {
    this.apiKey = options.apiKey;
    this.fetch = options.fetch ?? fetch;
    this.retry = { retries: 5, baseDelayMs: 2_000, maxDelayMs: 60_000, ...options.retry };
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(() => this.once<T>(path, body), this.retry);
  }

  private async once<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetch(`${GEMINI_BASE_URL}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new RetryableError(`Falha de rede ao chamar o Gemini: ${(error as Error).message}`);
    }

    if (response.ok) return (await response.json()) as T;

    const text = await response.text();
    const message = `Gemini respondeu ${response.status}: ${extractMessage(text)}`;
    if (response.status === 429 || response.status >= 500) {
      throw new RetryableError(message, retryDelayMs(text, response.headers));
    }
    throw new GeminiError(message, response.status);
  }
}

function extractMessage(body: string): string {
  try {
    return (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? body;
  } catch {
    return body.slice(0, 500);
  }
}

/** Lê o tempo de espera sugerido: cabeçalho Retry-After ou RetryInfo.retryDelay ("17s"). */
export function retryDelayMs(body: string, headers: Headers): number | undefined {
  const header = headers.get('retry-after');
  if (header && !Number.isNaN(Number(header))) return Number(header) * 1000;
  const match = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return match ? Math.ceil(Number(match[1]) * 1000) : undefined;
}
