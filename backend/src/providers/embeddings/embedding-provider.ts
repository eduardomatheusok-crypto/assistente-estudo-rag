/** Dimensão dos vetores; precisa bater com a coluna chunks.embedding (migração 002). */
export const EMBEDDING_DIMENSIONS = 768;

export type DocumentInput = { title: string; text: string };

export type EmbeddingResult = {
  vectors: number[][];
  inputTokens: number;
  /** true quando o provedor não informou o uso e os tokens foram estimados. */
  tokensEstimated: boolean;
};

import type { CallContext } from '../metering.ts';

export type { CallContext } from '../metering.ts';

/**
 * Provedor de embeddings trocável. Cada chamada a embedDocuments/embedQuery
 * corresponde a uma requisição ao provedor (o chamador divide em lotes).
 */
export interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly maxBatchSize: number;
  embedDocuments(inputs: DocumentInput[], ctx: CallContext): Promise<EmbeddingResult>;
  embedQuery(query: string, ctx: CallContext): Promise<EmbeddingResult>;
}

export class EmbeddingProviderError extends Error {
  override name = 'EmbeddingProviderError';
}

/** Normaliza para norma 1 (a distância de cosseno fica equivalente ao produto interno). */
export function normalize(vector: number[]): number[] {
  const norm = Math.hypot(...vector);
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

/** Estimativa grosseira (~4 caracteres por token), usada só quando o provedor não informa. */
export function estimateTokens(texts: string[]): number {
  return texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);
}
