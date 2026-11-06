import { describe, expect, it } from 'vitest';
import { EmbeddingProviderError } from '../../src/providers/embeddings/embedding-provider.ts';
import {
  GeminiEmbeddingProvider,

} from '../../src/providers/embeddings/gemini-embedding-provider.ts';
import { retryDelayMs } from '../../src/providers/gemini/gemini-http.ts';
import { RetryableError } from '../../src/providers/retry.ts';

type Call = { url: string; init: RequestInit; body: any };

/** fetch falso: devolve as respostas em sequência e guarda as requisições. */
function fakeFetch(responses: Array<Response | (() => Response)>) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(init.body as string) });
    const next = responses.shift();
    if (!next) throw new Error('sem resposta configurada');
    return typeof next === 'function' ? next() : next;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const ok = (vectors: number[][], promptTokenCount?: number) =>
  new Response(
    JSON.stringify({
      embeddings: vectors.map((values) => ({ values })),
      ...(promptTokenCount === undefined ? {} : { usageMetadata: { promptTokenCount } }),
    }),
    { status: 200 },
  );

const error = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function provider(fetchFn: typeof fetch, model = 'gemini-embedding-2') {
  return new GeminiEmbeddingProvider({
    apiKey: 'chave-teste',
    model,
    dimensions: 3,
    fetch: fetchFn,
    retry: { baseDelayMs: 0, maxDelayMs: 0, sleep: async () => {} },
  });
}

const ctx = { operation: 'test' };

describe('GeminiEmbeddingProvider', () => {
  it('envia o lote no formato da API, com prefixo de documento e chave no cabeçalho', async () => {
    const { fn, calls } = fakeFetch([ok([[3, 0, 4], [0, 1, 0]], 42)]);
    const result = await provider(fn).embedDocuments(
      [
        { title: 'Cálculo', text: 'Derivada é a taxa de variação.' },
        { title: '', text: 'Integral.' },
      ],
      ctx,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents',
    );
    expect((calls[0]!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('chave-teste');
    expect(calls[0]!.body.requests[0]).toEqual({
      model: 'models/gemini-embedding-2',
      content: { parts: [{ text: 'title: Cálculo | text: Derivada é a taxa de variação.' }] },
      embedContentConfig: { outputDimensionality: 3 },
    });
    expect(calls[0]!.body.requests[1].content.parts[0].text).toBe('title: none | text: Integral.');

    expect(result.inputTokens).toBe(42);
    expect(result.tokensEstimated).toBe(false);
    // vetores normalizados (norma 1)
    expect(result.vectors[0]).toEqual([0.6, 0, 0.8]);
  });

  it('usa o prefixo de consulta para perguntas', async () => {
    const { fn, calls } = fakeFetch([ok([[1, 0, 0]], 5)]);
    await provider(fn).embedQuery('o que é derivada?', ctx);
    expect(calls[0]!.body.requests[0].content.parts[0].text).toBe(
      'task: search result | query: o que é derivada?',
    );
  });

  it('com gemini-embedding-001, usa taskType em vez de prefixo', async () => {
    const { fn, calls } = fakeFetch([ok([[1, 0, 0]]), ok([[1, 0, 0]])]);
    const p = provider(fn, 'gemini-embedding-001');
    await p.embedDocuments([{ title: 't', text: 'texto' }], ctx);
    await p.embedQuery('pergunta', ctx);
    expect(calls[0]!.body.requests[0]).toMatchObject({
      content: { parts: [{ text: 'texto' }] },
      embedContentConfig: { outputDimensionality: 3, taskType: 'RETRIEVAL_DOCUMENT' },
    });
    expect(calls[1]!.body.requests[0].embedContentConfig.taskType).toBe('RETRIEVAL_QUERY');
  });

  it('estima os tokens quando a API não informa o uso', async () => {
    const { fn } = fakeFetch([ok([[1, 0, 0]])]);
    const result = await provider(fn).embedQuery('12345678', ctx);
    expect(result.tokensEstimated).toBe(true);
    expect(result.inputTokens).toBeGreaterThan(0);
  });

  it('tenta de novo em 429 e 503 e então conclui', async () => {
    const { fn, calls } = fakeFetch([
      error(429, { error: { message: 'Resource exhausted' } }),
      error(503, { error: { message: 'Unavailable' } }),
      ok([[1, 0, 0]], 1),
    ]);
    const result = await provider(fn).embedQuery('x', ctx);
    expect(calls).toHaveLength(3);
    expect(result.vectors).toHaveLength(1);
  });

  it('não tenta de novo em erro definitivo (400) e repassa a mensagem', async () => {
    const { fn, calls } = fakeFetch([error(400, { error: { message: 'API key not valid' } })]);
    const promise = provider(fn).embedQuery('x', ctx);
    await expect(promise).rejects.toBeInstanceOf(EmbeddingProviderError);
    await expect(promise).rejects.toThrow(/400: API key not valid/);
    expect(calls).toHaveLength(1);
  });

  it('desiste depois de esgotar as tentativas', async () => {
    const responses = Array.from({ length: 6 }, () => () => error(429, {}));
    const { fn, calls } = fakeFetch(responses);
    await expect(provider(fn).embedQuery('x', ctx)).rejects.toBeInstanceOf(RetryableError);
    expect(calls).toHaveLength(6);
  });

  it('rejeita resposta com dimensão ou quantidade errada', async () => {
    const wrongDim = fakeFetch([ok([[1, 0]])]);
    await expect(provider(wrongDim.fn).embedQuery('x', ctx)).rejects.toThrow(/Dimensão inesperada/);

    const wrongCount = fakeFetch([ok([[1, 0, 0]])]);
    await expect(
      provider(wrongCount.fn).embedDocuments(
        [
          { title: '', text: 'a' },
          { title: '', text: 'b' },
        ],
        ctx,
      ),
    ).rejects.toThrow(/1 embeddings para 2 textos/);
  });

  it('não chama a API para lista vazia', async () => {
    const { fn, calls } = fakeFetch([]);
    expect((await provider(fn).embedDocuments([], ctx)).vectors).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('retryDelayMs', () => {
  it('lê Retry-After e RetryInfo.retryDelay', () => {
    expect(retryDelayMs('{}', new Headers({ 'retry-after': '3' }))).toBe(3000);
    expect(retryDelayMs('{"details":[{"retryDelay": "17s"}]}', new Headers())).toBe(17000);
    expect(retryDelayMs('{}', new Headers())).toBeUndefined();
  });
});
