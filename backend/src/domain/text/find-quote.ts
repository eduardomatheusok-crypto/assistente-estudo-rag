export type QuoteMatch = { start: number; end: number; exact: boolean };

/**
 * Procura `quote` literalmente dentro de `text`.
 *
 * 1. Busca exata.
 * 2. Se falhar, aceita diferença APENAS em espaços em branco (o LLM costuma
 *    trocar a quebra de linha do PDF por espaço). Todas as palavras e a
 *    pontuação precisam ser idênticas.
 *
 * Retorna os offsets do trecho no texto original, ou null.
 */
export function findQuote(text: string, quote: string): QuoteMatch | null {
  const needle = quote.trim();
  if (needle.length === 0) return null;

  const exact = text.indexOf(needle);
  if (exact >= 0) return { start: exact, end: exact + needle.length, exact: true };

  const words = needle.split(/\s+/).map(escapeRegExp);
  const match = new RegExp(words.join('\\s+'), 'u').exec(text);
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length, exact: false };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
