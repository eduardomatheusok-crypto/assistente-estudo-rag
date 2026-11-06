export type AnswerPart = { kind: 'text'; text: string } | { kind: 'source'; label: string };

/**
 * Separa a resposta em texto e marcadores de fonte, para desenhar cada
 * [S1] como um botão clicável. "[S1][S2]" vira dois marcadores.
 */
export function splitAnswer(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const match of answer.matchAll(/\[(S\d+)\]/g)) {
    if (match.index > last) parts.push({ kind: 'text', text: answer.slice(last, match.index) });
    parts.push({ kind: 'source', label: match[1]! });
    last = match.index + match[0].length;
  }
  if (last < answer.length) parts.push({ kind: 'text', text: answer.slice(last) });
  return parts;
}
