import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPool, withTransaction, type Db } from './pool.ts';

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');

/**
 * Aplica, em ordem, os arquivos .sql de db/migrations que ainda não constam
 * em schema_migrations. Cada arquivo roda numa transação própria.
 */
export async function migrate(db: Db, log: (message: string) => void = console.log): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((row) => row.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    await withTransaction(db, async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    log(`migração aplicada: ${file}`);
  }
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida.');
  const db = createPool(url);
  try {
    await migrate(db);
  } finally {
    await db.end();
  }
}
