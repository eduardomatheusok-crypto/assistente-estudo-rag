import { createHash } from 'node:crypto';
import {
  estimateTokens,
  normalize,
  type CallContext,
  type DocumentInput,
  type EmbeddingProvider,
  type EmbeddingResult,
} from './embedding-provider.ts';

/**
 * Provedor local e determinístico para testes e desenvolvimento sem chave.
 * Cada palavra é espalhada numa posição do vetor (hashing trick), então textos
 * com palavras em comum ficam próximos. Não tem semântica real: sinônimos não
 * se aproximam. Nunca usar para avaliar qualidade de busca.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly provider = 'fake';
  readonly model = 'fake';
  readonly maxBatchSize = 100;
  private readonly dimensions: number;

  constructor(dimensions: number) {
    this.dimensions = dimensions;
  }

  async embedDocuments(inputs: DocumentInput[], _ctx?: CallContext): Promise<EmbeddingResult> {
    const texts = inputs.map((input) => input.text);
    return { vectors: texts.map((t) => this.vector(t)), inputTokens: estimateTokens(texts), tokensEstimated: true };
  }

  async embedQuery(query: string, _ctx?: CallContext): Promise<EmbeddingResult> {
    return { vectors: [this.vector(query)], inputTokens: estimateTokens([query]), tokensEstimated: true };
  }

  private vector(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const words = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .match(/\p{L}[\p{L}\p{N}]*/gu) ?? [];
    for (const word of words) {
      const hash = createHash('sha1').update(word).digest();
      const index = hash.readUInt32BE(0) % this.dimensions;
      vector[index] = (vector[index] ?? 0) + 1;
    }
    return normalize(vector);
  }
}
