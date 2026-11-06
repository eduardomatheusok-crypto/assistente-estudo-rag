import { describe, expect, it } from 'vitest';
import { FakeEmbeddingProvider } from '../../src/providers/embeddings/fake-embedding-provider.ts';

const cosine = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i]!, 0);

describe('FakeEmbeddingProvider', () => {
  const provider = new FakeEmbeddingProvider(256);

  it('é determinístico e gera vetores normalizados na dimensão pedida', async () => {
    const a = await provider.embedQuery('Derivada', { operation: 't' });
    const b = await provider.embedQuery('derivada', { operation: 't' });
    expect(a.vectors[0]).toHaveLength(256);
    expect(a.vectors[0]).toEqual(b.vectors[0]);
    expect(Math.hypot(...a.vectors[0]!)).toBeCloseTo(1);
  });

  it('aproxima textos com palavras em comum', async () => {
    const { vectors } = await provider.embedDocuments(
      [
        { title: '', text: 'derivada taxa de variação' },
        { title: '', text: 'revolução francesa em 1789' },
      ],
      { operation: 't' },
    );
    const { vectors: [query] } = await provider.embedQuery('taxa de variação da derivada', { operation: 't' });
    expect(cosine(query!, vectors[0]!)).toBeGreaterThan(cosine(query!, vectors[1]!));
  });
});
