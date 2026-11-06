import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import type { App } from '../../src/app.ts';
import { migrate } from '../../src/db/migrate.ts';
import type { Db } from '../../src/db/pool.ts';
import { PAGE_SEPARATOR } from '../../src/domain/extraction/types.ts';

/** Partes comuns aos scripts de avaliação: banco, ingestão e texto dos documentos. */

/** URL do banco de avaliação; recusa qualquer banco que não termine em _eval (ele é zerado). */
export function evalDatabaseUrl(): string {
  const url = process.env.EVAL_DATABASE_URL;
  if (!url) throw new Error('Defina EVAL_DATABASE_URL no .env (banco terminado em _eval).');
  if (!new URL(url).pathname.endsWith('_eval')) {
    throw new Error('EVAL_DATABASE_URL precisa apontar para um banco terminado em _eval (ele é zerado).');
  }
  return url;
}

export async function resetDatabase(db: Db): Promise<void> {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db, () => {});
}

/** Texto canônico do documento, reconstruído das páginas (mesma regra da extração). */
export async function canonicalText(db: Db, documentId: string): Promise<string> {
  const { rows } = await db.query<{ text: string; charStart: number }>(
    `SELECT text, char_start AS "charStart" FROM document_pages WHERE document_id = $1 ORDER BY page_number`,
    [documentId],
  );
  let offset = 0;
  for (const row of rows) {
    if (row.charStart !== offset) throw new Error(`Páginas inconsistentes no documento ${documentId}`);
    offset += row.text.length + PAGE_SEPARATOR.length;
  }
  return rows.map((r) => r.text).join(PAGE_SEPARATOR);
}

export type IngestedDocument = { datasetId: string; documentId: string; text: string };

/** Cria um caderno, envia os documentos do dataset e espera ficarem prontos. */
export async function ingestDocuments(
  app: App,
  db: Db,
  datasetPath: string,
  notebookName: string,
  documents: Array<{ id: string; file: string; title?: string }>,
): Promise<{ notebookId: string; docs: Map<string, IngestedDocument> }> {
  const notebookId = (
    await app.app.inject({ method: 'POST', url: '/notebooks', payload: { name: notebookName } })
  ).json().id as string;

  const docs = new Map<string, IngestedDocument>();
  for (const doc of documents) {
    const bytes = await readFile(resolve(dirname(datasetPath), doc.file));
    const record = await app.documents.upload({ notebookId, filename: basename(doc.file), bytes, title: doc.title });
    docs.set(doc.id, { datasetId: doc.id, documentId: record.id, text: '' });
  }
  await app.documents.whenIdle();

  for (const doc of docs.values()) {
    const { rows } = await db.query<{ status: string; error: string | null }>(
      'SELECT status, error FROM documents WHERE id = $1',
      [doc.documentId],
    );
    if (rows[0]?.status !== 'ready') throw new Error(`Falha ao ingerir "${doc.datasetId}": ${rows[0]?.error}`);
    doc.text = await canonicalText(db, doc.documentId);
  }
  return { notebookId, docs };
}
