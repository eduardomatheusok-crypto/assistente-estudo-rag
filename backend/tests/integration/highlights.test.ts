import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestPdf } from '../helpers/build-pdf.ts';
import { createTestApp, type TestContext } from '../helpers/test-app.ts';

/** Fluxo completo de grifos, com LLM simulado, PDF real e banco real. */
const url = process.env.TEST_DATABASE_URL;

/** Rótulo (T1, T2...) do trecho que contém `needle` no prompt enviado ao LLM. */
function labelOf(user: string, needle: string): string {
  for (const match of user.matchAll(/<trecho id="(T\d+)">\n([\s\S]*?)\n<\/trecho>/g)) {
    if (match[2]!.includes(needle)) return match[1]!;
  }
  throw new Error(`trecho com "${needle}" não encontrado no prompt`);
}

describe.skipIf(!url)('grifos (integração com PostgreSQL)', () => {
  let ctx: TestContext;
  let notebookId: string;
  let documentId: string;
  let definitionsId: string;

  const api = (method: 'GET' | 'POST' | 'DELETE', path: string, payload?: object) =>
    ctx.app.app.inject({ method, url: path, ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    ctx = await createTestApp(url!, { CHUNK_SIZE: 150, CHUNK_OVERLAP: 30 });
    notebookId = (await api('POST', '/notebooks', { name: 'Cálculo' })).json().id;
    const pdf = buildTestPdf([
      [
        { text: 'Limites', x: 72, y: 740, size: 16 },
        { text: 'O limite descreve o valor do qual f(x) se aproxima.', x: 72, y: 700 },
      ],
      [{ text: 'A derivada mede a taxa de variação instantânea.', x: 100, y: 500 }],
    ]);
    documentId = (await ctx.app.documents.upload({ notebookId, filename: 'calculo.pdf', bytes: pdf })).id;
    await ctx.app.documents.whenIdle();
    const criteria = (await api('GET', `/notebooks/${notebookId}/highlight-criteria`)).json();
    definitionsId = criteria.find((c: { key: string }) => c.key === 'definicoes').id;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('lista os 5 critérios predefinidos e cria um personalizado', async () => {
    const criteria = (await api('GET', `/notebooks/${notebookId}/highlight-criteria`)).json();
    // predefinidos em ordem alfabética do nome
    expect(criteria.map((c: { label: string }) => c.label)).toEqual([
      'Conceitos fundamentais',
      'Datas',
      'Definições',
      'Exemplos',
      'Fórmulas',
    ]);

    const created = await api('POST', `/notebooks/${notebookId}/highlight-criteria`, {
      label: 'Cai na prova',
      instruction: 'Conceitos que o professor disse que caem na prova.',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ key: 'cai-na-prova', builtin: false });

    const duplicate = await api('POST', `/notebooks/${notebookId}/highlight-criteria`, {
      label: 'Definições',
      instruction: 'Tentativa de repetir um predefinido.',
    });
    expect(duplicate.statusCode).toBe(409);
    expect((await api('DELETE', `/highlight-criteria/${definitionsId}`)).statusCode).toBe(400);
  });

  it('grifa, valida literalmente, descarta o inventado e salva as coordenadas no PDF', async () => {
    ctx.llm.respond = (request) => ({
      text: JSON.stringify({
        highlights: [
          {
            passage: labelOf(request.user, 'A derivada'),
            text: 'A derivada mede a taxa de variação instantânea.',
            justification: 'Define o que a derivada mede.',
          },
          {
            passage: labelOf(request.user, 'O limite'),
            text: 'O limite é o valor que a função atinge.', // paráfrase: não existe no texto
            justification: 'Definição de limite.',
          },
        ],
      }),
    });

    const start = await api('POST', `/documents/${documentId}/highlight-runs`, { criterionIds: [definitionsId] });
    expect(start.statusCode).toBe(202);
    const [run] = start.json();
    expect(run).toMatchObject({ status: 'processing', criterion: { key: 'definicoes' } });

    await ctx.app.highlights.whenIdle();

    const done = (await api('GET', `/highlight-runs/${run.id}`)).json();
    expect(done).toMatchObject({ status: 'ready', highlightCount: 1, rejectedCount: 1, batchesDone: done.batchesTotal });
    expect(done.usage.calls).toBe(done.batchesTotal);
    expect(done.usage.inputTokens).toBe(100 * done.batchesTotal);

    const highlights = (await api('GET', `/documents/${documentId}/highlights`)).json();
    expect(highlights).toHaveLength(1);
    const [h] = highlights;
    expect(h).toMatchObject({
      text: 'A derivada mede a taxa de variação instantânea.',
      justification: 'Define o que a derivada mede.',
      pageNumber: 2,
      criterion: { key: 'definicoes', label: 'Definições' },
    });
    // Linha desenhada em x=100, y=500 com Helvetica 12: o retângulo cobre a linha inteira.
    expect(h.locations).toHaveLength(1);
    const [x1, y1, x2, y2] = h.locations[0].rects[0];
    expect(h.locations[0].page).toBe(2);
    expect(x1).toBeCloseTo(100, 0);
    expect(y1).toBeCloseTo(500 - 0.2 * 12, 0);
    expect(y2).toBeCloseTo(500 + 0.8 * 12, 0);
    expect(x2).toBeGreaterThan(300);

    // O texto do grifo bate com o texto da página nos offsets salvos.
    const page = (await api('GET', `/documents/${documentId}/pages/2`)).json();
    expect(page.text.slice(h.docCharStart - page.charStart, h.docCharEnd - page.charStart)).toBe(h.text);

    const { rows } = await ctx.db.query(`SELECT reject_reason FROM highlights WHERE run_id = $1 AND status = 'rejected'`, [run.id]);
    expect(rows).toEqual([{ reject_reason: 'not_found' }]);
  });

  it('recusa um segundo run do mesmo critério enquanto o primeiro processa', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = ctx.llm.generateJson.bind(ctx.llm);
    ctx.llm.generateJson = async (request) => {
      await gate;
      return original(request);
    };
    ctx.llm.respond = () => ({ text: '{"highlights":[]}' });

    expect((await api('POST', `/documents/${documentId}/highlight-runs`, { criterionIds: [definitionsId] })).statusCode).toBe(202);
    expect((await api('POST', `/documents/${documentId}/highlight-runs`, { criterionIds: [definitionsId] })).statusCode).toBe(409);
    release();
    await ctx.app.highlights.whenIdle();
    ctx.llm.generateJson = original;

    // O run mais recente (sem grifos) substitui o anterior na listagem.
    expect((await api('GET', `/documents/${documentId}/highlights`)).json()).toEqual([]);
  });

  it('falha do LLM marca o run como failed com o motivo', async () => {
    const original = ctx.llm.generateJson.bind(ctx.llm);
    ctx.llm.generateJson = async () => {
      throw new Error('cota esgotada');
    };
    const [run] = (await api('POST', `/documents/${documentId}/highlight-runs`, { criterionIds: [definitionsId] })).json();
    await ctx.app.highlights.whenIdle();
    ctx.llm.generateJson = original;
    expect((await api('GET', `/highlight-runs/${run.id}`)).json()).toMatchObject({ status: 'failed', error: 'cota esgotada' });
  });

  it('registra latência por etapa', async () => {
    const { rows } = await ctx.db.query(`SELECT DISTINCT step FROM step_timings WHERE operation = 'highlight'`);
    expect(rows.map((r) => r.step).sort()).toEqual(['generate', 'load', 'locate', 'persist', 'validate']);
  });

  it('valida a entrada', async () => {
    expect((await api('POST', `/documents/${documentId}/highlight-runs`, { criterionIds: [] })).statusCode).toBe(400);
    expect(
      (await api('POST', `/documents/${documentId}/highlight-runs`, { criterionIds: ['7c9e6679-7425-40de-944b-e07fc1f90ae7'] }))
        .statusCode,
    ).toBe(400);
  });
});
