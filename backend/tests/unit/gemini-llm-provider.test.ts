import { describe, expect, it } from 'vitest';
import { GeminiLlmProvider } from '../../src/providers/llm/gemini-llm-provider.ts';
import { LlmProviderError } from '../../src/providers/llm/llm-provider.ts';

function fakeFetch(responses: Response[]) {
  const bodies: any[] = [];
  const urls: string[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    urls.push(url);
    bodies.push(JSON.parse(init.body as string));
    return responses.shift()!;
  }) as unknown as typeof fetch;
  return { fn, bodies, urls };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

const provider = (fetchFn: typeof fetch) =>
  new GeminiLlmProvider({
    apiKey: 'k',
    model: 'gemini-3.5-flash-lite',
    thinkingLevel: 'LOW',
    fetch: fetchFn,
    retry: { baseDelayMs: 0, maxDelayMs: 0, sleep: async () => {} },
  });

const request = { system: 'regras', user: 'fontes + pergunta', jsonSchema: { type: 'object' }, maxOutputTokens: 100 };

describe('GeminiLlmProvider', () => {
  it('envia sistema, usuário, schema JSON e nível de raciocínio no formato da API', async () => {
    const { fn, bodies, urls } = fakeFetch([
      json(200, {
        candidates: [{ content: { parts: [{ text: '{"a":1}' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 40, thoughtsTokenCount: 60 },
      }),
    ]);
    const result = await provider(fn).generateJson(request, { operation: 't' });

    expect(urls[0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    );
    expect(bodies[0]).toEqual({
      systemInstruction: { parts: [{ text: 'regras' }] },
      contents: [{ role: 'user', parts: [{ text: 'fontes + pergunta' }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object' },
        maxOutputTokens: 100,
        thinkingConfig: { thinkingLevel: 'LOW' },
      },
    });
    // tokens de raciocínio contam como saída (são cobrados assim)
    expect(result).toEqual({ text: '{"a":1}', finishReason: 'STOP', inputTokens: 500, outputTokens: 100 });
  });

  it('ignora partes de "pensamento" e junta o texto', async () => {
    const { fn } = fakeFetch([
      json(200, {
        candidates: [
          { content: { parts: [{ text: 'pensando...', thought: true }, { text: '{"a"' }, { text: ':1}' }] }, finishReason: 'STOP' },
        ],
      }),
    ]);
    expect((await provider(fn).generateJson(request, { operation: 't' })).text).toBe('{"a":1}');
  });

  it('informa resposta cortada pelo limite de tokens', async () => {
    const { fn } = fakeFetch([
      json(200, { candidates: [{ content: { parts: [{ text: '{"a":' }] }, finishReason: 'MAX_TOKENS' }] }),
    ]);
    expect((await provider(fn).generateJson(request, { operation: 't' })).finishReason).toBe('MAX_TOKENS');
  });

  it('erro definitivo e pedido bloqueado viram LlmProviderError', async () => {
    const bad = fakeFetch([json(400, { error: { message: 'API key not valid' } })]);
    await expect(provider(bad.fn).generateJson(request, { operation: 't' })).rejects.toBeInstanceOf(LlmProviderError);

    const blocked = fakeFetch([json(200, { promptFeedback: { blockReason: 'SAFETY' } })]);
    await expect(provider(blocked.fn).generateJson(request, { operation: 't' })).rejects.toThrow(/SAFETY/);
  });
});
