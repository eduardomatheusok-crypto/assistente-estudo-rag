import { GeminiError, GeminiHttp, type GeminiHttpOptions } from '../gemini/gemini-http.ts';
import {
  EmbeddingProviderError,
  estimateTokens,
  normalize,
  type CallContext,
  type DocumentInput,
  type EmbeddingProvider,
  type EmbeddingResult,
} from './embedding-provider.ts';

export type GeminiEmbeddingOptions = GeminiHttpOptions & {
  model: string;
  dimensions: number;
};

type BatchResponse = {
  embeddings?: Array<{ values?: number[] }>;
  usageMetadata?: { promptTokenCount?: number };
};

/**
 * Embeddings via API REST do Gemini (batchEmbedContents), com fetch nativo,
 * sem SDK. Documentação: https://aistudio.google.com/docs/embeddings
 *
 * - gemini-embedding-2 não aceita taskType: a tarefa vai como prefixo no texto.
 * - gemini-embedding-001 usa taskType (RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY).
 * Os vetores são sempre normalizados (o 001 exige isso fora de 3072 dimensões).
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly provider = 'gemini';
  readonly model: string;
  // A documentação não informa o limite do lote; 100 é um valor conservador.
  readonly maxBatchSize = 100;
  private readonly dimensions: number;
  private readonly http: GeminiHttp;

  constructor(options: GeminiEmbeddingOptions) {
    this.model = options.model;
    this.dimensions = options.dimensions;
    this.http = new GeminiHttp(options);
  }

  embedDocuments(inputs: DocumentInput[], _ctx?: CallContext): Promise<EmbeddingResult> {
    return this.embed(
      inputs.map((input) =>
        this.usesTaskPrefix() ? `title: ${input.title || 'none'} | text: ${input.text}` : input.text,
      ),
      'RETRIEVAL_DOCUMENT',
    );
  }

  embedQuery(query: string, _ctx?: CallContext): Promise<EmbeddingResult> {
    return this.embed(
      [this.usesTaskPrefix() ? `task: search result | query: ${query}` : query],
      'RETRIEVAL_QUERY',
    );
  }

  private usesTaskPrefix(): boolean {
    return !this.model.startsWith('gemini-embedding-001');
  }

  private async embed(texts: string[], taskType: string): Promise<EmbeddingResult> {
    if (texts.length === 0) return { vectors: [], inputTokens: 0, tokensEstimated: false };
    if (texts.length > this.maxBatchSize) {
      throw new EmbeddingProviderError(`Lote acima do limite (${this.maxBatchSize}).`);
    }

    const body = {
      requests: texts.map((text) => ({
        model: `models/${this.model}`,
        content: { parts: [{ text }] },
        embedContentConfig: {
          outputDimensionality: this.dimensions,
          ...(this.usesTaskPrefix() ? {} : { taskType }),
        },
      })),
    };

    let data: BatchResponse;
    try {
      data = await this.http.post<BatchResponse>(`models/${this.model}:batchEmbedContents`, body);
    } catch (error) {
      if (error instanceof GeminiError) throw new EmbeddingProviderError(error.message);
      throw error;
    }

    const vectors = (data.embeddings ?? []).map((embedding) => embedding.values ?? []);
    if (vectors.length !== texts.length) {
      throw new EmbeddingProviderError(
        `Gemini devolveu ${vectors.length} embeddings para ${texts.length} textos.`,
      );
    }
    for (const vector of vectors) {
      if (vector.length !== this.dimensions) {
        throw new EmbeddingProviderError(
          `Dimensão inesperada: ${vector.length} (esperado ${this.dimensions}).`,
        );
      }
    }

    const reported = data.usageMetadata?.promptTokenCount;
    return {
      vectors: vectors.map(normalize),
      inputTokens: reported ?? estimateTokens(texts),
      tokensEstimated: reported === undefined,
    };
  }
}
