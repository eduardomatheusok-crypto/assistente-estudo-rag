import type { Queryable } from '../db/pool.ts';
import type { StepTiming, TimingSink } from '../telemetry/trace.ts';

export class StepTimingRepository implements TimingSink {
  private readonly db: Queryable;

  constructor(db: Queryable) {
    this.db = db;
  }

  async record(timing: StepTiming): Promise<void> {
    await this.db.query(
      `INSERT INTO step_timings (trace_id, operation, step, latency_ms, ok, meta)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [timing.traceId, timing.operation, timing.step, timing.latencyMs, timing.ok, timing.meta],
    );
  }
}
