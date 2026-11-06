import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { JsonGenerationRequest } from '../../src/providers/llm/llm-provider.ts';
import { buildTestPdf } from '../helpers/build-pdf.ts';
import { createTestApp, type TestContext } from '../helpers/test-app.ts';

/** Prática completa (prova e entrevista) com LLM simulado e banco real. */
const url = process.env.TEST_DATABASE_URL;

const DERIVADA = 'A derivada mede a taxa de variação instantânea de uma função.';
const LIMITE = 'O limite descreve o comportamento de uma função perto de um ponto.';

function firstLabel(user: string): string {
  return /<(?:trecho|fonte) id="([ST]\d+)"/.exec(user)![1]!;
}

const mcq = (label: string, topic: string, quote: string, correctOption = 1) => ({
  topic,
  passage: label,
  quote,
  question: `Pergunta sobre ${topic}?`,
  options: ['Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D'],
  correctOption,
  explanation: `Explicação de ${topic}.`,
});

/** Respostas do LLM simulado conforme o tipo de pedido. */
let evaluationScore: number | null = 4;
function respond(request: JsonGenerationRequest) {
  if (request.system.includes('avaliando a resposta')) {
    return evaluationScore === null
      ? { text: 'saída quebrada' }
      : {
          text: JSON.stringify({
            score: evaluationScore,
            criteria: { precisao: evaluationScore, estrutura: 8, clareza: 7, exemplo: 3 },
            feedback: 'Faltou precisão.',
            missingPoints: ['instantânea'],
            modelAnswer: 'A derivada mede a taxa de variação instantânea.',
          }),
        };
  }
  const label = firstLabel(request.user);
  const cards = /Gere (\d+) flashcards/.exec(request.system);
  if (cards) {
    // frentes numeradas a partir das que já existem (o "gerar mais" manda a lista para evitar)
    const avoidList = request.system.split('Não repita estas frentes (já existem):')[1] ?? '';
    const existing = (avoidList.match(/^- /gm) ?? []).length;
    const count = Number(cards[1]);
    return {
      text: JSON.stringify({
        items: Array.from({ length: count }, (_, i) => ({
          topic: 'Derivada',
          passage: label,
          quote: DERIVADA,
          front: `Termo ${existing + i + 1}`,
          back: `Explicação do termo ${existing + i + 1}.`,
        })),
      }),
    };
  }
  if (request.system.includes('EXAMINADOR')) {
    return {
      text: JSON.stringify({
        items: [
          mcq(label, 'derivada', DERIVADA),
          mcq(label, 'Limites', LIMITE),
          mcq(label, 'Limites', LIMITE, 2),
          mcq(label, 'Inventado', 'Esta frase não existe no material.'),
        ],
      }),
    };
  }
  if (request.system.includes('ENTREVISTADOR conduzindo')) {
    return {
      text: JSON.stringify({
        items: [1, 2].map((n) => ({
          topic: 'Derivada',
          passage: label,
          quote: DERIVADA,
          question: `Explique a derivada (${n}).`,
          referenceAnswer: 'Taxa de variação instantânea.',
        })),
      }),
    };
  }
  // pergunta do chat: cita a frase da derivada
  return {
    text: JSON.stringify({ status: 'answered', answer: `Mede a taxa de variação [${label}].`, citations: [{ source: label, quote: DERIVADA }] }),
  };
}

describe.skipIf(!url)('prática (integração com PostgreSQL)', () => {
  let ctx: TestContext;
  let notebookId: string;
  let questionId: string;

  const api = (method: 'GET' | 'POST' | 'PUT', path: string, payload?: object) =>
    ctx.app.app.inject({ method, url: path, ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    ctx = await createTestApp(url!, { CHUNK_SIZE: 1000 });
    ctx.llm.respond = respond;
    notebookId = (await api('POST', '/notebooks', { name: 'Cálculo' })).json().id;
    const pdf = buildTestPdf([[{ text: LIMITE, x: 72, y: 720 }], [{ text: DERIVADA, x: 72, y: 720 }]]);
    await ctx.app.documents.upload({ notebookId, filename: 'calculo.pdf', bytes: pdf });
    await ctx.app.documents.whenIdle();
    questionId = (await api('POST', `/notebooks/${notebookId}/questions`, { question: 'O que a derivada mede?' })).json().id;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('exige o objetivo antes de praticar', async () => {
    expect((await api('GET', `/notebooks/${notebookId}/profile`)).json()).toEqual({ goalType: null });
    const res = await api('POST', `/notebooks/${notebookId}/practice-sessions`, { mode: 'simulation', focus: 'general' });
    expect(res.statusCode).toBe(400);
  });

  it('prova: "Treinar este assunto" gera questões validadas e corrige pelo código', async () => {
    expect((await api('PUT', `/notebooks/${notebookId}/profile`, { goalType: 'prova' })).json()).toEqual({ goalType: 'prova' });

    const start = await api('POST', `/notebooks/${notebookId}/practice-sessions`, {
      mode: 'simulation',
      focus: 'question',
      questionId,
    });
    expect(start.statusCode).toBe(201);
    const session = start.json();
    expect(session).toMatchObject({ persona: 'examinador', mode: 'simulation', status: 'active' });
    // a questão com fonte inventada foi descartada
    expect(session.items).toHaveLength(3);
    expect(session.items[0]).toMatchObject({ kind: 'mcq', topic: 'Derivada', correctOption: null, referenceAnswer: null });
    expect(session.items[0].source).toMatchObject({ documentTitle: 'calculo', pageNumber: 2, quote: DERIVADA });

    // acerta a 1ª, erra a 2ª e a 3ª
    const [a, b, c] = session.items;
    let view = (await api('POST', `/practice-sessions/${session.id}/answers`, { itemId: a.id, option: 1 })).json();
    expect(view.items[0]).toMatchObject({ correctOption: 1, attempt: { correct: true, evaluatedBy: 'code' } });
    expect((await api('POST', `/practice-sessions/${session.id}/answers`, { itemId: a.id, option: 1 })).statusCode).toBe(409);
    await api('POST', `/practice-sessions/${session.id}/answers`, { itemId: b.id, option: 0 });
    view = (await api('POST', `/practice-sessions/${session.id}/answers`, { itemId: c.id, option: 0 })).json();
    expect(view.status).toBe('finished');
    expect(view.summary).toMatchObject({ answered: 3, total: 3, correct: 1 });

    // a fonte da questão pode ser aberta no PDF
    const source = (await api('GET', `/practice-items/${a.id}/source`)).json();
    expect(source.locations[0].page).toBe(2);
  });

  it('prioridades vêm dos erros, com justificativa e trecho do material (sem LLM)', async () => {
    const calls = ctx.llm.requests.length;
    const priorities = (await api('GET', `/notebooks/${notebookId}/priorities`)).json();
    expect(priorities).toHaveLength(1);
    expect(priorities[0]).toMatchObject({
      topic: 'Limites',
      errors: 2,
      attempts: 2,
      justification: 'Você errou 2 de 2 · praticado hoje',
      source: { quote: LIMITE, pageNumber: 1 },
    });
    expect(priorities[0].source.itemId).toBeTruthy();
    expect(ctx.llm.requests.length).toBe(calls);
  });

  it('"Treinar meus erros" reaproveita as questões erradas sem chamar o LLM', async () => {
    const calls = ctx.llm.requests.length;
    const simulation = (await api('POST', `/notebooks/${notebookId}/practice-sessions`, { mode: 'simulation', focus: 'errors' })).json();
    expect(simulation.items.map((i: { topic: string }) => i.topic)).toEqual(['Limites', 'Limites']);

    const cards = (await api('POST', `/notebooks/${notebookId}/practice-sessions`, { mode: 'flashcards', focus: 'errors' })).json();
    expect(cards.mode).toBe('flashcards');
    // no flashcard o verso (resposta) já vem revelado
    expect(cards.items[0].correctOption).not.toBeNull();
    expect(cards.items[0].referenceAnswer).toMatch(/Explicação/);
    expect(ctx.llm.requests.length).toBe(calls);

    // lembrou do 1º cartão: sobe de caixa e sai dos erros
    await api('POST', `/practice-sessions/${cards.id}/reviews`, { itemId: cards.items[0].id, correct: true });
    const { rows } = await ctx.db.query('SELECT box FROM flashcard_state WHERE item_id = $1', [cards.items[0].id]);
    expect(rows[0].box).toBe(2);
    const again = (await api('POST', `/notebooks/${notebookId}/practice-sessions`, { mode: 'flashcards', focus: 'errors' })).json();
    expect(again.items).toHaveLength(1);
  });

  it('entrevista: perguntas abertas avaliadas pelo LLM; avaliação inválida não grava nada', async () => {
    await api('PUT', `/notebooks/${notebookId}/profile`, { goalType: 'entrevista' });
    const session = (await api('POST', `/notebooks/${notebookId}/practice-sessions`, { mode: 'simulation', focus: 'general' })).json();
    expect(session).toMatchObject({ persona: 'entrevistador' });
    expect(session.items).toHaveLength(2);
    expect(session.items[0]).toMatchObject({ kind: 'open', options: null });

    evaluationScore = null;
    const broken = await api('POST', `/practice-sessions/${session.id}/answers`, { itemId: session.items[0].id, text: 'Minha resposta.' });
    expect(broken.statusCode).toBe(502);

    evaluationScore = 4;
    const view = (
      await api('POST', `/practice-sessions/${session.id}/answers`, { itemId: session.items[0].id, text: 'Minha resposta.' })
    ).json();
    expect(view.items[0].attempt).toMatchObject({
      correct: false,
      score: 0.4,
      evaluatedBy: 'llm',
      feedback: 'Faltou precisão.',
      missingPoints: ['instantânea'],
      rubric: { precisao: 4, estrutura: 8, clareza: 7, exemplo: 3 },
      modelAnswer: 'A derivada mede a taxa de variação instantânea.',
      answerFormat: 'free',
      tries: 1,
    });

    // "Tentar de novo": a mesma pergunta é reavaliada; a tentativa mais recente vale
    evaluationScore = 8;
    const retry = (
      await api('POST', `/practice-sessions/${session.id}/answers`, {
        itemId: session.items[0].id,
        text: 'Situação: ... Resultado: ...',
        format: 'star',
      })
    ).json();
    expect(retry.items[0].attempt).toMatchObject({ correct: true, score: 0.8, answerFormat: 'star', tries: 2 });
    expect(retry.status).toBe('active'); // entrevista só termina no Fechar
    expect(ctx.llm.requests.at(-1)!.user).toContain('método STAR');
    evaluationScore = 4;
    expect(view.items[0].referenceAnswer).toBe('Taxa de variação instantânea.');

    // a pergunta não respondida é reaproveitada na próxima entrevista
    const next = (await api('POST', `/notebooks/${notebookId}/practice-sessions`, { mode: 'simulation', focus: 'general' })).json();
    expect(next.items.map((i: { id: string }) => i.id)).toContain(session.items[1].id);
  });

  it('flashcards de uma resposta: cartões frente/verso, "gerar mais" sem repetir e rodada só termina no Fechar', async () => {
    await api('PUT', `/notebooks/${notebookId}/profile`, { goalType: 'prova' });
    const session = (
      await api('POST', `/notebooks/${notebookId}/practice-sessions`, { mode: 'flashcards', focus: 'question', questionId })
    ).json();
    expect(session.items).toHaveLength(10);
    expect(session.items[0]).toMatchObject({
      kind: 'card',
      prompt: 'Termo 1',
      referenceAnswer: 'Explicação do termo 1.',
      options: null,
      source: { pageNumber: 2 },
    });

    // revisar o último cartão não encerra a rodada
    for (const item of session.items) {
      await api('POST', `/practice-sessions/${session.id}/reviews`, { itemId: item.id, correct: item.prompt !== 'Termo 3' });
    }
    let view = (await api('GET', `/practice-sessions/${session.id}`)).json();
    expect(view).toMatchObject({ status: 'active', summary: { answered: 10, correct: 9 } });

    // gerar mais 5: entram no fim, sem repetir frentes, e o prompt pediu para evitar as existentes
    const before = ctx.llm.requests.length;
    view = (await api('POST', `/practice-sessions/${session.id}/more`, { count: 5 })).json();
    expect(ctx.llm.requests.length).toBe(before + 1);
    expect(ctx.llm.requests.at(-1)!.system).toContain('Não repita estas frentes (já existem):\n- Termo 1');
    expect(view.items.map((i: { prompt: string }) => i.prompt).slice(10)).toEqual([
      'Termo 11',
      'Termo 12',
      'Termo 13',
      'Termo 14',
      'Termo 15',
    ]);
    expect(new Set(view.items.map((i: { prompt: string }) => i.prompt)).size).toBe(15);
    expect((await api('POST', `/practice-sessions/${session.id}/more`, { count: 7 })).statusCode).toBe(400);

    // cartões de prova não revisados (os 5 novos) não são reaproveitados numa rodada de entrevista
    await api('PUT', `/notebooks/${notebookId}/profile`, { goalType: 'entrevista' });
    const interview = (
      await api('POST', `/notebooks/${notebookId}/practice-sessions`, { mode: 'flashcards', focus: 'question', questionId })
    ).json();
    const proveFronts = new Set(view.items.map((i: { id: string }) => i.id));
    expect(interview.items.some((i: { id: string }) => proveFronts.has(i.id))).toBe(false);
    expect(ctx.llm.requests.at(-1)!.system).toContain('ENTREVISTA');
    await api('PUT', `/notebooks/${notebookId}/profile`, { goalType: 'prova' });

    // Fechar encerra; depois disso não gera mais
    expect((await api('POST', `/practice-sessions/${session.id}/finish`)).json().status).toBe('finished');
    expect((await api('POST', `/practice-sessions/${session.id}/more`, { count: 5 })).statusCode).toBe(409);
  });

  it('visão geral do caderno: contagens, atividade recente e acertos por assunto (sem LLM)', async () => {
    const calls = ctx.llm.requests.length;
    const overview = (await api('GET', `/notebooks/${notebookId}/overview`)).json();
    expect(overview.counts).toMatchObject({ questions: 1, highlights: 0 });
    expect(overview.counts.flashcardsReviewed).toBeGreaterThan(0);
    expect(overview.counts.simulationAverage).toBeGreaterThan(0);
    expect(overview.recentQuestions[0]).toMatchObject({ question: 'O que a derivada mede?', citations: 1 });
    expect(overview.recentSessions.length).toBeGreaterThan(0);
    expect(overview.topics.find((t: { topic: string }) => t.topic === 'Limites')).toBeTruthy();
    expect(overview.documents).toHaveLength(1);
    expect(ctx.llm.requests.length).toBe(calls);
  });

  it('registra custo das chamadas de geração e avaliação', async () => {
    const { rows } = await ctx.db.query(
      `SELECT DISTINCT operation FROM llm_calls WHERE ref_type = 'practice_session' ORDER BY operation`,
    );
    expect(rows.map((r) => r.operation)).toEqual(['evaluate_answer', 'generate_flashcards', 'generate_practice']);
  });
});
