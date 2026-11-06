import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.ts';
import type { Db } from '../../src/db/pool.ts';
import { EMBEDDING_DIMENSIONS } from '../../src/providers/embeddings/embedding-provider.ts';
import { createTestApp, type TestContext } from '../helpers/test-app.ts';

/**
 * Testa o SQL da busca (pgvector + full-text) num Postgres real.
 * Roda só com TEST_DATABASE_URL apontando para um banco cujo nome termina em
 * "_test" — o banco é zerado no início.
 */
const url = process.env.TEST_DATABASE_URL;

const PARAGRAPHS = [
  'A derivada de uma função mede a taxa de variação instantânea da função em um ponto do domínio.',
  'A integral definida calcula a área sob a curva de uma função contínua em um intervalo fechado.',
  'O limite descreve o comportamento de uma função quando a variável se aproxima de um valor dado.',
  'A regra da cadeia permite derivar a composição de funções multiplicando as derivadas envolvidas.',
];

describe.skipIf(!url)('busca (integração com PostgreSQL)', () => {
  let ctx: TestContext;
  let db: Db;
  let app: App;
  let notebookA: string;
  let notebookB: string;

  const search = (notebookId: string, body: object) =>
    app.app.inject({ method: 'POST', url: `/notebooks/${notebookId}/search`, payload: body });

  beforeAll(async () => {
    ctx = await createTestApp(url!);
    db = ctx.db;
    app = ctx.app;

    const create = async (name: string) =>
      (await app.app.inject({ method: 'POST', url: '/notebooks', payload: { name } })).json().id as string;
    notebookA = await create('Cálculo');
    notebookB = await create('Outro caderno');

    const text = (s: string) => new TextEncoder().encode(s);
    await app.documents.upload({ notebookId: notebookA, filename: 'calculo.txt', bytes: text(PARAGRAPHS.join('\n\n')) });
    await app.documents.upload({
      notebookId: notebookB,
      filename: 'outro.txt',
      bytes: text('Derivada aparece aqui também, mas em outro caderno, e não deve vazar para a busca do primeiro.'),
    });
    await app.documents.whenIdle();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('ingestão grava um chunk por parágrafo, com embedding e modelo', async () => {
    const { rows } = await db.query(
      `SELECT c.text, c.embedding_model, vector_dims(c.embedding) AS dims
         FROM chunks c JOIN documents d ON d.id = c.document_id
        WHERE d.notebook_id = $1 ORDER BY c.chunk_index`,
      [notebookA],
    );
    expect(rows.map((r) => r.text)).toEqual(PARAGRAPHS);
    expect(rows.every((r) => r.embedding_model === 'fake' && r.dims === EMBEDDING_DIMENSIONS)).toBe(true);
  });

  it('lexical: ignora acentos e plural ("funcao", "derivadas")', async () => {
    const res = await search(notebookA, { query: 'derivadas da funcao', strategy: 'lexical' });
    expect(res.statusCode).toBe(200);
    const results = res.json().results;
    expect(results[0].text).toBe(PARAGRAPHS[0]);
    expect(results[0]).toMatchObject({ rank: 1, pageStart: 1, documentTitle: 'calculo' });
  });

  it('lexical: combina termos com OU (um termo ausente não zera a busca)', async () => {
    const results = (await search(notebookA, { query: 'integral fotossíntese', strategy: 'lexical' })).json().results;
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe(PARAGRAPHS[1]);
  });

  it('lexical: pergunta só com palavras vazias não retorna nada', async () => {
    const results = (await search(notebookA, { query: 'o que é isso?', strategy: 'lexical' })).json().results;
    expect(results).toEqual([]);
  });

  it('vetorial: retorna os mais similares, limitado a k', async () => {
    const res = (await search(notebookA, { query: 'taxa de variação instantânea', strategy: 'vector', k: 2 })).json();
    expect(res.results).toHaveLength(2);
    expect(res.results[0].text).toBe(PARAGRAPHS[0]);
    expect(res.results[0].score).toBeGreaterThan(res.results[1].score);
  });

  it('híbrida (padrão): funde as duas buscas e informa a posição em cada uma', async () => {
    const res = (await search(notebookA, { query: 'área sob a curva da integral' })).json();
    expect(res.strategy).toBe('hybrid');
    expect(res.results.length).toBeLessThanOrEqual(5);
    expect(res.results[0].text).toBe(PARAGRAPHS[1]);
    expect(res.results[0].vector.rank).toBe(1);
    expect(res.results[0].lexical.rank).toBe(1);
    // chunk sem nenhum termo da pergunta aparece só pela busca vetorial
    expect(res.results.some((r: any) => r.lexical === null && r.vector !== null)).toBe(true);
  });

  it('nunca retorna trechos de outro caderno', async () => {
    for (const strategy of ['vector', 'lexical', 'hybrid']) {
      const results = (await search(notebookA, { query: 'derivada outro caderno', strategy, k: 20 })).json().results;
      expect(results.every((r: any) => !r.text.includes('outro caderno'))).toBe(true);
    }
  });

  it('registra latência por etapa e custo das chamadas de embedding', async () => {
    const steps = await db.query(
      `SELECT DISTINCT operation, step FROM step_timings ORDER BY operation, step`,
    );
    expect(steps.rows).toEqual(
      expect.arrayContaining([
        { operation: 'ingestion', step: 'embed' },
        { operation: 'search', step: 'embed_query' },
        { operation: 'search', step: 'vector_search' },
        { operation: 'search', step: 'lexical_search' },
        { operation: 'search', step: 'fuse' },
        { operation: 'search', step: 'total' },
      ]),
    );
    const calls = await db.query(`SELECT DISTINCT operation, ok FROM llm_calls ORDER BY operation`);
    expect(calls.rows).toEqual([
      { operation: 'embed_document', ok: true },
      { operation: 'embed_query', ok: true },
    ]);
  });

  it('valida a entrada e o caderno', async () => {
    expect((await search(notebookA, { query: 'x', strategy: 'semantica' })).statusCode).toBe(400);
    expect((await search(notebookA, { query: '   ' })).statusCode).toBe(400);
    expect((await search('7c9e6679-7425-40de-944b-e07fc1f90ae7', { query: 'x' })).statusCode).toBe(404);
  });
});
