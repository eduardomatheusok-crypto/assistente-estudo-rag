import { findQuote } from '../text/find-quote.ts';
import { llmAnswerSchema } from './answer-schema.ts';

export const NOT_FOUND_MESSAGE = 'Não encontrei no material.';

export type RefusalReason =
  /** A busca não trouxe nenhum trecho; o LLM nem foi chamado. */
  | 'no_results'
  /** O próprio LLM disse que as fontes não têm a resposta. */
  | 'model_not_found'
  /** A saída não era JSON válido no schema (ou veio cortada). */
  | 'invalid_output'
  /** O LLM respondeu, mas nenhuma citação foi comprovada nas fontes. */
  | 'no_valid_citations';

export type AnswerSource = { label: string; chunkId: string; text: string };

export type ValidCitation = {
  label: string;
  chunkId: string;
  /** Texto exatamente como está no chunk (pode diferir do enviado só em espaços). */
  quote: string;
  /** Offsets dentro do texto do chunk. */
  start: number;
  end: number;
};

export type DroppedCitation = {
  source: string;
  quote: string;
  reason: 'unknown_source' | 'quote_not_found' | 'duplicate';
};

export type ValidatedAnswer =
  | { status: 'answered'; answer: string; citations: ValidCitation[]; dropped: DroppedCitation[] }
  | {
      status: 'not_found';
      answer: string;
      citations: [];
      dropped: DroppedCitation[];
      reason: RefusalReason;
    };

export function refusal(reason: RefusalReason, dropped: DroppedCitation[] = []): ValidatedAnswer {
  return { status: 'not_found', answer: NOT_FOUND_MESSAGE, citations: [], dropped, reason };
}

/**
 * Valida a saída do LLM. Regras:
 * - precisa ser JSON no schema (Zod);
 * - cada citação precisa apontar para uma fonte recuperada E o trecho citado
 *   precisa existir literalmente nessa fonte; as que falham são descartadas;
 * - marcadores [Sx] sem citação válida são removidos do texto;
 * - sem nenhuma citação válida, a resposta vira "não encontrei no material".
 */
export function validateAnswer(
  rawText: string,
  finishReason: string,
  sources: AnswerSource[],
): ValidatedAnswer {
  if (finishReason !== 'STOP') return refusal('invalid_output');

  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    return refusal('invalid_output');
  }
  const parsed = llmAnswerSchema.safeParse(json);
  if (!parsed.success) return refusal('invalid_output');
  if (parsed.data.status === 'not_found') return refusal('model_not_found');

  const byLabel = new Map(sources.map((source) => [source.label, source]));
  const citations: ValidCitation[] = [];
  const dropped: DroppedCitation[] = [];

  for (const { source: label, quote } of parsed.data.citations) {
    const source = byLabel.get(label.trim());
    if (!source) {
      dropped.push({ source: label, quote, reason: 'unknown_source' });
      continue;
    }
    const match = findQuote(source.text, quote);
    if (!match) {
      dropped.push({ source: label, quote, reason: 'quote_not_found' });
      continue;
    }
    if (citations.some((c) => c.chunkId === source.chunkId && c.start === match.start && c.end === match.end)) {
      dropped.push({ source: label, quote, reason: 'duplicate' });
      continue;
    }
    citations.push({
      label: source.label,
      chunkId: source.chunkId,
      quote: source.text.slice(match.start, match.end),
      start: match.start,
      end: match.end,
    });
  }

  if (citations.length === 0) return refusal('no_valid_citations', dropped);

  const answer = cleanMarkers(parsed.data.answer, new Set(citations.map((c) => c.label)));
  if (answer.length === 0) return refusal('invalid_output', dropped);
  return { status: 'answered', answer, citations, dropped };
}

/**
 * Mantém só marcadores de fontes com citação válida.
 * "[S1, S9]" com S9 inválido vira "[S1]"; "[S9]" some.
 */
export function cleanMarkers(answer: string, validLabels: Set<string>): string {
  return answer
    .replace(/\[\s*(S\d+(?:\s*,\s*S\d+)*)\s*\]/g, (_, group: string) =>
      group
        .split(',')
        .map((label) => label.trim())
        .filter((label) => validLabels.has(label))
        .map((label) => `[${label}]`)
        .join(''),
    )
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
