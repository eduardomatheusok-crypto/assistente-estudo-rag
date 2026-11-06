import type { Queryable } from '../db/pool.ts';
import type { LlmCallRecord, LlmCallSink } from '../providers/embeddings/metered-embedding-provider.ts';

export class LlmCallRepository implements LlmCallSink {
  private readonly db: Queryable;

  constructor(db: Queryable) {
    this.db = db;
  }

  async record(call: LlmCallRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO llm_calls
         (operation, ref_type, ref_id, provider, model, input_tokens, output_tokens,
          tokens_estimated, cost_usd, latency_ms, ok, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        call.operation,
        call.refType,
        call.refId,
        call.provider,
        call.model,
        call.inputTokens,
        call.outputTokens,
        call.tokensEstimated,
        call.costUsd,
        call.latencyMs,
        call.ok,
        call.error,
      ],
    );
  }
}
