import { describe, expect, it } from 'vitest';
import { Trace, type StepTiming } from '../../src/telemetry/trace.ts';

function memorySink() {
  const timings: StepTiming[] = [];
  return { timings, record: async (t: StepTiming) => void timings.push(t) };
}

describe('Trace', () => {
  it('registra latência e sucesso de cada etapa sob o mesmo trace', async () => {
    const sink = memorySink();
    const trace = new Trace('ingestion', sink, { documentId: 'd1' });
    expect(await trace.step('extract', () => 42, { pages: 3 })).toBe(42);
    await trace.step('chunk', async () => 'ok');

    expect(sink.timings).toHaveLength(2);
    expect(sink.timings[0]).toMatchObject({
      traceId: trace.id,
      operation: 'ingestion',
      step: 'extract',
      ok: true,
      meta: { documentId: 'd1', pages: 3 },
    });
    expect(sink.timings[0]!.latencyMs).toBeGreaterThanOrEqual(0);
    expect(sink.timings[1]!.traceId).toBe(trace.id);
  });

  it('registra a etapa que falhou e repassa o erro', async () => {
    const sink = memorySink();
    const trace = new Trace('ingestion', sink);
    await expect(trace.step('extract', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(sink.timings[0]).toMatchObject({ step: 'extract', ok: false });
  });

  it('não derruba a operação se o registro da métrica falhar', async () => {
    const errors: unknown[] = [];
    const trace = new Trace(
      'ingestion',
      { record: () => Promise.reject(new Error('db fora')) },
      {},
      (e) => errors.push(e),
    );
    expect(await trace.step('extract', () => 'ok')).toBe('ok');
    expect(errors).toHaveLength(1);
  });
});
