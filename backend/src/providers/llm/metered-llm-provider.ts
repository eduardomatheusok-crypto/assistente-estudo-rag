import { assertPriced, metered, type CallContext, type LlmCallSink } from '../metering.ts';
import type { JsonGenerationRequest, JsonGenerationResult, LlmProvider } from './llm-provider.ts';

/** Registra tokens, custo e latência de toda chamada ao LLM. */
export class MeteredLlmProvider implements LlmProvider {
  private readonly inner: LlmProvider;
  private readonly sink: LlmCallSink;
  private readonly onSinkError: (error: unknown) => void;

  constructor(inner: LlmProvider, sink: LlmCallSink, onSinkError: (error: unknown) => void = () => {}) {
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

  generateJson(request: JsonGenerationRequest, ctx: CallContext): Promise<JsonGenerationResult> {
    return metered(
      this.inner,
      ctx,
      this.sink,
      this.onSinkError,
      () => this.inner.generateJson(request, ctx),
      (result) => ({
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        tokensEstimated: false,
      }),
    );
  }
}
