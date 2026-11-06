import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestContext } from '../helpers/test-app.ts';
import { buildTestPdf } from '../helpers/build-pdf.ts';

/** Fluxo completo de pergunta, com LLM simulado e banco real. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('perguntas (integração com PostgreSQL)', () => {
  let ctx: TestContext;
  let notebookId: string;

  const ask = (question: string, notebook = notebookId) =>
    ctx.app.app.inject({ method: 'POST', url: `/notebooks/${notebook}/questions`, payload: { question } });

  beforeAll(async () => {
    ctx = await createTestApp(url!, { CHUNK_SIZE: 200 });
    notebookId = (await ctx.app.app.inject({ method: 'POST', url: '/notebooks', payload: { name: 'Cálculo' } })).json().id;
    // Página 1 fala de limite; página 2, de derivada.
    const pdf = buildTestPdf([
      [{ text: 'O limite descreve o comportamento de uma função perto de um ponto.', x: 72, y: 720 }],
      [{ text: 'A derivada mede a taxa de variação instantânea de uma função.', x: 72, y: 720 }],
    ]);
    await ctx.app.documents.upload({ notebookId, filename: 'calculo.pdf', bytes: pdf });
    await ctx.app.documents.whenIdle();
  });

  beforeEach(() => {
    ctx.llm.requests.length = 0;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('responde com citação validada, página correta e trecho clicável', async () => {
    ctx.llm.respond = (request) => {
      // descobre qual fonte (S1, S2...) contém a derivada, como o modelo faria
      const label = /<fonte id="(S\d+)"[^>]*>[^<]*A derivada/.exec(request.user)![1];
      return {
        text: JSON.stringify({
          status: 'answered',
          answer: `A derivada mede a taxa de variação instantânea [${label}].`,
          citations: [{ source: label, quote: 'mede a taxa de variação instantânea' }],
        }),
      };
    };

    const res = await ask('O que a derivada mede?');
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('answered');
    expect(body.refusalReason).toBeNull();
    expect(body.citations).toHaveLength(1);
    expect(body.citations[0]).toMatchObject({
      documentTitle: 'calculo',
      pageNumber: 2,
      quote: 'mede a taxa de variação instantânea',
    });
    expect(body.sources.length).toBeGreaterThan(0);

    // o LLM recebeu as regras e as fontes delimitadas
    expect(ctx.llm.requests[0]!.system).toMatch(/SOMENTE as fontes/);
    expect(ctx.llm.requests[0]!.user).toContain('Pergunta do estudante: O que a derivada mede?');

    // clicar na citação devolve o trecho original e a posição exata
    const citation = (await ctx.app.app.inject({ url: `/citations/${body.citations[0].id}` })).json();
    expect(citation.chunkText.slice(citation.quoteStartInChunk, citation.quoteEndInChunk)).toBe(
      'mede a taxa de variação instantânea',
    );
    const page = (await ctx.app.app.inject({ url: `/documents/${citation.documentId}/pages/2` })).json();
    expect(page.text.slice(citation.docCharStart - page.charStart, citation.docCharEnd - page.charStart)).toBe(
      'mede a taxa de variação instantânea',
    );

    // a citação traz o retângulo no PDF (página 2), para pintar ao clicar
    expect(citation.locations).toHaveLength(1);
    expect(citation.locations[0].page).toBe(2);
    expect(citation.locations[0].rects[0][0]).toBeGreaterThan(72); // começa depois de "A derivada "

    // o histórico do caderno lista a pergunta
    const history = (await ctx.app.app.inject({ url: `/notebooks/${notebookId}/questions` })).json();
    expect(history.at(-1).id).toBe(body.id);

    // a pergunta fica salva
    const saved = (await ctx.app.app.inject({ url: `/questions/${body.id}` })).json();
    expect(saved.answer).toBe(body.answer);
  });

  it('recusa quando o LLM inventa a citação', async () => {
    ctx.llm.respond = () => ({
      text: JSON.stringify({
        status: 'answered',
        answer: 'A derivada foi inventada por Leibniz [S1].',
        citations: [{ source: 'S1', quote: 'inventada por Leibniz' }],
      }),
    });
    const body = (await ask('Quem inventou a derivada?')).json();
    expect(body).toMatchObject({ status: 'not_found', refusalReason: 'no_valid_citations', answer: 'Não encontrei no material.' });
    expect(body.citations).toEqual([]);

    const { rows } = await ctx.db.query('SELECT dropped_citations FROM questions WHERE id = $1', [body.id]);
    expect(rows[0].dropped_citations[0].reason).toBe('quote_not_found');
  });

  it('recusa sem chamar o LLM quando a busca não encontra nada', async () => {
    const empty = (await ctx.app.app.inject({ method: 'POST', url: '/notebooks', payload: { name: 'Vazio' } })).json().id;
    const body = (await ask('O que é derivada?', empty)).json();
    expect(body).toMatchObject({ status: 'not_found', refusalReason: 'no_results' });
    expect(ctx.llm.requests).toHaveLength(0);
  });

  it('registra tokens e custo da chamada ao LLM e a latência de cada etapa', async () => {
    const calls = await ctx.db.query(
      `SELECT operation, input_tokens, output_tokens FROM llm_calls WHERE operation = 'answer_question'`,
    );
    expect(calls.rows.length).toBeGreaterThanOrEqual(2);
    expect(calls.rows[0]).toMatchObject({ input_tokens: 100, output_tokens: 20 });

    const steps = await ctx.db.query(`SELECT DISTINCT step FROM step_timings WHERE operation = 'question'`);
    expect(steps.rows.map((r) => r.step).sort()).toEqual(
      expect.arrayContaining(['retrieve', 'embed_query', 'generate', 'validate', 'persist']),
    );
  });

  it('valida a entrada', async () => {
    expect((await ask('   ')).statusCode).toBe(400);
    expect((await ask('x', '7c9e6679-7425-40de-944b-e07fc1f90ae7')).statusCode).toBe(404);
  });
});
