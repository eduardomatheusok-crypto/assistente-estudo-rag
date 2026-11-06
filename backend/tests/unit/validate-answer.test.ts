import { describe, expect, it } from 'vitest';
import {
  cleanMarkers,
  NOT_FOUND_MESSAGE,
  validateAnswer,
  type AnswerSource,
} from '../../src/domain/rag/validate-answer.ts';

const sources: AnswerSource[] = [
  { label: 'S1', chunkId: 'c1', text: 'A derivada mede a taxa de variação instantânea de uma função.' },
  { label: 'S2', chunkId: 'c2', text: 'A integral definida calcula a área sob a curva.' },
];

const output = (value: unknown) => JSON.stringify(value);

describe('validateAnswer', () => {
  it('aceita resposta com citações literais e calcula a posição no chunk', () => {
    const result = validateAnswer(
      output({
        status: 'answered',
        answer: 'A derivada mede a taxa de variação [S1].',
        citations: [{ source: 'S1', quote: 'mede a taxa de variação instantânea' }],
      }),
      'STOP',
      sources,
    );
    expect(result.status).toBe('answered');
    expect(result.citations).toEqual([
      { label: 'S1', chunkId: 'c1', quote: 'mede a taxa de variação instantânea', start: 11, end: 46 },
    ]);
    expect(result.dropped).toEqual([]);
  });

  it('descarta citação inventada e remove o marcador correspondente do texto', () => {
    const result = validateAnswer(
      output({
        status: 'answered',
        answer: 'A derivada mede variação [S1]. Ela foi criada por Newton [S2].',
        citations: [
          { source: 'S1', quote: 'A derivada mede a taxa' },
          { source: 'S2', quote: 'criada por Newton' }, // não existe em S2
        ],
      }),
      'STOP',
      sources,
    );
    expect(result.status).toBe('answered');
    expect(result.answer).toBe('A derivada mede variação [S1]. Ela foi criada por Newton.');
    expect(result.citations.map((c) => c.label)).toEqual(['S1']);
    expect(result.dropped).toEqual([{ source: 'S2', quote: 'criada por Newton', reason: 'quote_not_found' }]);
  });

  it('descarta citação de fonte que não foi recuperada', () => {
    const result = validateAnswer(
      output({
        status: 'answered',
        answer: 'Algo [S7].',
        citations: [{ source: 'S7', quote: 'qualquer coisa' }],
      }),
      'STOP',
      sources,
    );
    expect(result).toMatchObject({ status: 'not_found', reason: 'no_valid_citations', answer: NOT_FOUND_MESSAGE });
    expect(result.dropped[0]!.reason).toBe('unknown_source');
  });

  it('sem nenhuma citação válida, vira "não encontrei no material"', () => {
    const result = validateAnswer(
      output({ status: 'answered', answer: 'A resposta é 42 [S1].', citations: [{ source: 'S1', quote: 'é 42' }] }),
      'STOP',
      sources,
    );
    expect(result).toMatchObject({ status: 'not_found', reason: 'no_valid_citations', citations: [] });
  });

  it('resposta sem citações também é recusada', () => {
    const result = validateAnswer(output({ status: 'answered', answer: 'Sei a resposta.', citations: [] }), 'STOP', sources);
    expect(result).toMatchObject({ status: 'not_found', reason: 'no_valid_citations' });
  });

  it('respeita quando o modelo diz que não encontrou', () => {
    const result = validateAnswer(output({ status: 'not_found', answer: '', citations: [] }), 'STOP', sources);
    expect(result).toMatchObject({ status: 'not_found', reason: 'model_not_found', answer: NOT_FOUND_MESSAGE });
  });

  it('recusa saída que não é JSON, fora do schema ou cortada', () => {
    expect(validateAnswer('isto não é json', 'STOP', sources)).toMatchObject({ reason: 'invalid_output' });
    expect(validateAnswer(output({ answer: 'faltou status' }), 'STOP', sources)).toMatchObject({
      reason: 'invalid_output',
    });
    const valid = output({ status: 'answered', answer: 'x [S1]', citations: [{ source: 'S1', quote: 'A derivada' }] });
    expect(validateAnswer(valid, 'MAX_TOKENS', sources)).toMatchObject({ reason: 'invalid_output' });
  });

  it('ignora citação repetida', () => {
    const result = validateAnswer(
      output({
        status: 'answered',
        answer: 'Integral é área [S2].',
        citations: [
          { source: 'S2', quote: 'área sob a curva' },
          { source: 'S2', quote: 'área sob a curva' },
        ],
      }),
      'STOP',
      sources,
    );
    expect(result.citations).toHaveLength(1);
    expect(result.dropped[0]!.reason).toBe('duplicate');
  });
});

describe('cleanMarkers', () => {
  it('mantém só marcadores válidos, inclusive em grupos', () => {
    const valid = new Set(['S1', 'S3']);
    expect(cleanMarkers('Frase [S1, S2]. Outra [S2]. Mais [S3]!', valid)).toBe('Frase [S1]. Outra. Mais [S3]!');
    expect(cleanMarkers('Juntas [S1,S3].', valid)).toBe('Juntas [S1][S3].');
  });
});
