import { randomUUID } from 'node:crypto';

export type StepTiming = {
  traceId: string;
  operation: string;
  step: string;
  latencyMs: number;
  ok: boolean;
  meta: Record<string, unknown>;
};

export interface TimingSink {
  record(timing: StepTiming): Promise<void>;
}

/**
 * Agrupa as etapas de uma operação (ex.: uma ingestão) sob o mesmo trace_id
 * e mede a latência de cada uma, com sucesso ou falha.
 */
export class Trace {
  readonly id = randomUUID();
  readonly operation: string;
  private readonly sink: TimingSink;
  private readonly meta: Record<string, unknown>;
  private readonly onSinkError: (error: unknown) => void;

  constructor(
    operation: string,
    sink: TimingSink,
    meta: Record<string, unknown> = {},
    onSinkError: (error: unknown) => void = () => {},
  ) {
    this.operation = operation;
    this.sink = sink;
    this.meta = meta;
    this.onSinkError = onSinkError;
  }

  async step<T>(name: string, fn: () => Promise<T> | T, meta: Record<string, unknown> = {}): Promise<T> {
    const started = performance.now();
    let ok = false;
    try {
      const result = await fn();
      ok = true;
      return result;
    } finally {
      const timing: StepTiming = {
        traceId: this.id,
        operation: this.operation,
        step: name,
        latencyMs: performance.now() - started,
        ok,
        meta: { ...this.meta, ...meta },
      };
      // Falha ao registrar métrica nunca derruba a operação principal.
      await this.sink.record(timing).catch(this.onSinkError);
    }
  }
}
