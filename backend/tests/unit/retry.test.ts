import { describe, expect, it } from 'vitest';
import { RetryableError, withRetry } from '../../src/providers/retry.ts';

function recorder() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

describe('withRetry', () => {
  it('repete erros temporários com espera exponencial e devolve o resultado', async () => {
    const { waits, sleep } = recorder();
    let calls = 0;
    const result = await withRetry(
      async () => {
        if (++calls < 3) throw new RetryableError('429');
        return 'ok';
      },
      { retries: 5, baseDelayMs: 100, maxDelayMs: 10_000, sleep },
    );
    expect(result).toBe('ok');
    expect(waits).toEqual([100, 200]);
  });

  it('respeita o tempo sugerido pelo provedor, limitado ao máximo', async () => {
    const { waits, sleep } = recorder();
    let calls = 0;
    await withRetry(
      async () => {
        calls++;
        if (calls === 1) throw new RetryableError('429', 1_500);
        if (calls === 2) throw new RetryableError('429', 999_999);
        return 'ok';
      },
      { retries: 5, baseDelayMs: 100, maxDelayMs: 5_000, sleep },
    );
    expect(waits).toEqual([1_500, 5_000]);
  });

  it('desiste após o número máximo de tentativas', async () => {
    const { sleep } = recorder();
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new RetryableError('503');
        },
        { retries: 2, baseDelayMs: 1, maxDelayMs: 1, sleep },
      ),
    ).rejects.toThrow('503');
    expect(calls).toBe(3);
  });

  it('não repete erros definitivos', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error('400');
        },
        { retries: 5, baseDelayMs: 1, maxDelayMs: 1 },
      ),
    ).rejects.toThrow('400');
    expect(calls).toBe(1);
  });
});
