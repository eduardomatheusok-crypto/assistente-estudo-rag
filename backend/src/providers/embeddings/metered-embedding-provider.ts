import { assertPriced, metered, type CallContext, type LlmCallSink } from '../metering.ts';
import type { DocumentInput, EmbeddingProvider, EmbeddingResult } from './embedding-provider.ts';

export type { LlmCallRecord, LlmCallSink } from '../metering.ts';

/**
 * Envolve qualquer provedor de embeddings e registra cada chamada (tokens,
 * custo, latência, sucesso/erro). Os serviços só recebem a versão medida,
 * então nenhuma chamada escapa do registro.
 */
export class MeteredEmbeddingProvider implements EmbeddingProvider {
  private readonly inner: EmbeddingProvider;
  private readonly sink: LlmCallSink;
  private readonly onSinkError: (error: unknown) => void;

  constructor(inner: EmbeddingProvider, sink: LlmCallSink, onSinkError: (error: unknown) => void = () => {}) {
    assertPriced(inner.model);
    this.inner = inner;
    this.sink = sink;
    this.onSinkError = onSinkError;
  }

  get provider() {
    return this.inner.provider;
  }
  get model() {
    return this.inner.model;
  }
  get maxBatchSize() {
    return this.inner.maxBatchSize;
  }

  embedDocuments(inputs: DocumentInput[], ctx: CallContext): Promise<EmbeddingResult> {
    return this.measure(ctx, () => this.inner.embedDocuments(inputs, ctx));
  }

  embedQuery(query: string, ctx: CallContext): Promise<EmbeddingResult> {
    return this.measure(ctx, () => this.inner.embedQuery(query, ctx));
  }

  private measure(ctx: CallContext, fn: () => Promise<EmbeddingResult>): Promise<EmbeddingResult> {
    return metered(this.inner, ctx, this.sink, this.onSinkError, fn, (result) => ({
      inputTokens: result.inputTokens,
      outputTokens: 0,
      tokensEstimated: result.tokensEstimated,
    }));
  }
}
