import { findQuote } from '../text/find-quote.ts';
import type { Passage } from './batches.ts';
import { llmHighlightsSchema } from './prompt.ts';

/** Um grifo maior que isto é um parágrafo, não uma frase: descartado. */
export const MAX_HIGHLIGHT_CHARS = 600;
/** Menor que isto não carrega informação (ex.: "x", "2."). */
export const MIN_HIGHLIGHT_CHARS = 3;

export type AcceptedHighlight = {
  chunkId: string;
  /** Texto exatamente como está no documento. */
  text: string;
  justification: string;
  docCharStart: number;
  docCharEnd: number;
};

export type RejectReason = 'unknown_passage' | 'not_found' | 'too_short' | 'too_long' | 'duplicate';

export type RejectedHighlight = {
  chunkId: string | null;
  text: string;
  justification: string;
  reason: RejectReason;
};

export type ValidatedBatch =
  | { ok: true; accepted: AcceptedHighlight[]; rejected: RejectedHighlight[] }
  | { ok: false; error: 'invalid_output' };

/**
 * Valida os grifos propostos pelo LLM para um lote:
 * - a saída precisa ser JSON no schema;
 * - o trecho de origem precisa existir no lote;
 * - o texto precisa existir LITERALMENTE no trecho (tolerando só espaços);
 * - tamanho razoável;
 * - sem repetir um grifo já aceito (chunks com overlap mostram a mesma frase duas vezes).
 *
 * `seen` guarda os intervalos já aceitos no run inteiro (é atualizado aqui).
 */
export function validateHighlights(
  rawText: string,
  finishReason: string,
  passages: Passage[],
  seen: Set<string>,
): ValidatedBatch {
  if (finishReason !== 'STOP') return { ok: false, error: 'invalid_output' };
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    return { ok: false, error: 'invalid_output' };
  }
  const parsed = llmHighlightsSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: 'invalid_output' };

  const byLabel = new Map(passages.map((p) => [p.label, p]));
  const accepted: AcceptedHighlight[] = [];
  const rejected: RejectedHighlight[] = [];

  for (const item of parsed.data.highlights) {
    const passage = byLabel.get(item.passage.trim());
    const reject = (reason: RejectReason) =>
      rejected.push({ chunkId: passage?.chunkId ?? null, text: item.text, justification: item.justification, reason });

    if (!passage) {
      reject('unknown_passage');
      continue;
    }
    const match = findQuote(passage.text, item.text);
    if (!match) {
      reject('not_found');
      continue;
    }
    const length = match.end - match.start;
    if (length < MIN_HIGHLIGHT_CHARS) {
      reject('too_short');
      continue;
    }
    if (length > MAX_HIGHLIGHT_CHARS) {
      reject('too_long');
      continue;
    }
    const docCharStart = passage.charStart + match.start;
    const docCharEnd = passage.charStart + match.end;
    const key = `${docCharStart}:${docCharEnd}`;
    if (seen.has(key)) {
      reject('duplicate');
      continue;
    }
    seen.add(key);
    accepted.push({
      chunkId: passage.chunkId,
      text: passage.text.slice(match.start, match.end),
      justification: item.justification.trim(),
      docCharStart,
      docCharEnd,
    });
  }
  return { ok: true, accepted, rejected };
}
