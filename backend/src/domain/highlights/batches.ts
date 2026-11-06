export type Passage = {
  /** Rótulo curto que o LLM usa para apontar o trecho: T1, T2... (por lote). */
  label: string;
  chunkId: string;
  text: string;
  /** Offset do chunk no texto canônico do documento. */
  charStart: number;
};

export type ChunkInput = { id: string; text: string; charStart: number };

/**
 * Agrupa os chunks em lotes de até `maxChars` caracteres, na ordem do
 * documento. Um chunk maior que o limite vai sozinho num lote (nunca é cortado:
 * cortar quebraria a correspondência literal).
 *
 * Lotes economizam chamadas (e cota): uma chamada por lote, não por chunk.
 */
export function buildBatches(chunks: ChunkInput[], maxChars: number): Passage[][] {
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new Error('maxChars deve ser um inteiro positivo.');
  const batches: Passage[][] = [];
  let current: Passage[] = [];
  let size = 0;

  for (const chunk of chunks) {
    if (current.length > 0 && size + chunk.text.length > maxChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push({ label: `T${current.length + 1}`, chunkId: chunk.id, text: chunk.text, charStart: chunk.charStart });
    size += chunk.text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
