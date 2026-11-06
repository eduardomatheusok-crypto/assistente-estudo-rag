import { describe, expect, it } from 'vitest';
import { estimateCostUsd } from '../../src/config/pricing.ts';
import type { EmbeddingProvider } from '../../src/providers/embeddings/embedding-provider.ts';
import {
  MeteredEmbeddingProvider,
  type LlmCallRecord,
} from '../../src/providers/embeddings/metered-embedding-provider.ts';

function stub(model: string, behavior: 'ok' | 'fail'): EmbeddingProvider {
  const respond = async () => {
    if (behavior === 'fail') throw new Error('cota esgotada');
    return { vectors: [[1]], inputTokens: 2_000_000, tokensEstimated: false };
  };
  return { provider: 'gemini', model, maxBatchSize: 10, embedDocuments: respond, embedQuery: respond };
}

function sink() {
  const calls: LlmCallRecord[] = [];
  return { calls, record: async (call: LlmCallRecord) => void calls.push(call) };
}

describe('MeteredEmbeddingProvider', () => {
  it('registra tokens, custo estimado e latência de cada chamada', async () => {
    const records = sink();
    const metered = new MeteredEmbeddingProvider(stub('gemini-embedding-2', 'ok'), records);
    await metered.embedDocuments([{ title: '', text: 'x' }], {
      operation: 'embed_document',
      refType: 'document',
      refId: 'doc-1',
    });

    expect(records.calls).toHaveLength(1);
    expect(records.calls[0]).toMatchObject({
      operation: 'embed_document',
      refType: 'document',
      refId: 'doc-1',
      provider: 'gemini',
      model: 'gemini-embedding-2',
      inputTokens: 2_000_000,
      costUsd: 0.4, // 2M tokens × US$ 0,20 por milhão
      ok: true,
      error: null,
    });
    expect(records.calls[0]!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('registra a falha e repassa o erro', async () => {
    const records = sink();
    const metered = new MeteredEmbeddingProvider(stub('gemini-embedding-2', 'fail'), records);
    await expect(metered.embedQuery('x', { operation: 'embed_query' })).rejects.toThrow('cota esgotada');
    expect(records.calls[0]).toMatchObject({ ok: false, error: 'cota esgotada', inputTokens: 0, costUsd: 0 });
  });

  it('não aceita modelo sem preço cadastrado', () => {
    expect(() => new MeteredEmbeddingProvider(stub('modelo-desconhecido', 'ok'), sink())).toThrow(
      /sem preço cadastrado/,
    );
  });
});

describe('estimateCostUsd', () => {
  it('calcula entrada e saída por milhão de tokens', () => {
    const pricing = { m: { inputPerMillion: 1, outputPerMillion: 4 } };
    expect(estimateCostUsd('m', { input: 500_000, output: 250_000 }, pricing)).toBeCloseTo(1.5);
  });
});
