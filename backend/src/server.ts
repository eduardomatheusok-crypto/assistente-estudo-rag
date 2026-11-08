import { buildApp } from './app.ts';
import { loadEnv } from './config/env.ts';
import { migrate } from './db/migrate.ts';
import { createPool } from './db/pool.ts';

const env = loadEnv();
const db = createPool(env.DATABASE_URL);
await migrate(db);

const { app, documents, highlights } = await buildApp(env, db);

const interrupted = await documents.failInterrupted();
if (interrupted > 0) app.log.warn({ interrupted }, 'documentos interrompidos marcados como failed');
const interruptedRuns = await highlights.failInterrupted();
if (interruptedRuns > 0) app.log.warn({ interruptedRuns }, 'grifos interrompidos marcados como failed');

const shutdown = async () => {
  await app.close();
  await documents.whenIdle();
  await highlights.whenIdle();
  await db.end();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ port: env.PORT, host: env.HOST });
