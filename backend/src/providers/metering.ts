import { estimateCostUsd } from '../config/pricing.ts';

/** Contexto de uma chamada, para registrar custo e latência associados à entidade certa. */
export type CallContext = {
  operation: string;
  refType?: string;
  refId?: string;
};

export type LlmCallRecord = {
  operation: string;
  refType: string | null;
  refId: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  tokensEstimated: boolean;
  costUsd: number;
  latencyMs: number;
  ok: boolean;
  error: string | null;
};

export interface LlmCallSink {
  record(call: LlmCallRecord): Promise<void>;
}

export type Usage = { inputTokens: number; outputTokens: number; tokensEstimated: boolean };

/**
 * Executa `fn` medindo latência e registrando tokens e custo estimado,
 * com sucesso ou falha. Falha ao registrar nunca derruba a chamada.
 */
export async function metered<T>(
  target: { provider: string; model: string },
  ctx: CallContext,
  sink: LlmCallSink,
  onSinkError: (error: unknown) => void,
  fn: () => Promise<T>,
  usageOf: (result: T) => Usage,
): Promise<T> {
  const started = performance.now();
  let usage: Usage = { inputTokens: 0, outputTokens: 0, tokensEstimated: false };
  let error: unknown;
  try {
    const result = await fn();
    usage = usageOf(result);
    return result;
  } catch (caught) {
    error = caught;
    throw caught;
  } finally {
    await sink
      .record({
        operation: ctx.operation,
        refType: ctx.refType ?? null,
        refId: ctx.refId ?? null,
        provider: target.provider,
        model: target.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        tokensEstimated: usage.tokensEstimated,
        costUsd: estimateCostUsd(target.model, { input: usage.inputTokens, output: usage.outputTokens }),
        latencyMs: performance.now() - started,
        ok: error === undefined,
        error: error === undefined ? null : String((error as Error).message ?? error),
      })
      .catch(onSinkError);
  }
}

/** Falha já na inicialização se o modelo não tiver preço cadastrado. */
export function assertPriced(model: string): void {
  estimateCostUsd(model, { input: 0, output: 0 });
}
