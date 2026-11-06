export type ChunkingOptions = {
  /** Tamanho máximo do chunk, em caracteres. */
  chunkSize: number;
  /** Caracteres repetidos entre um chunk e o seguinte. */
  chunkOverlap: number;
};

export type PageRange = {
  pageNumber: number;
  charStart: number;
  charEnd: number;
};

export type Chunk = {
  index: number;
  text: string;
  /** Offsets no texto canônico; text === canonical.slice(charStart, charEnd). */
  charStart: number;
  charEnd: number;
  pageStart: number;
  pageEnd: number;
};

export const MIN_CHUNK_SIZE = 100;

export class ChunkingOptionsError extends Error {
  override name = 'ChunkingOptionsError';
}

export function validateChunkingOptions({ chunkSize, chunkOverlap }: ChunkingOptions): void {
  if (!Number.isInteger(chunkSize) || chunkSize < MIN_CHUNK_SIZE) {
    throw new ChunkingOptionsError(`chunkSize deve ser um inteiro >= ${MIN_CHUNK_SIZE}.`);
  }
  if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0 || chunkOverlap >= chunkSize / 2) {
    throw new ChunkingOptionsError('chunkOverlap deve ser um inteiro >= 0 e menor que chunkSize / 2.');
  }
}

/**
 * Divide o texto canônico em chunks de até `chunkSize` caracteres.
 *
 * O corte procura, nesta ordem, o melhor limite na segunda metade da janela:
 * fim de parágrafo, fim de frase, quebra de linha, espaço. Só corta no meio
 * de uma palavra se não houver nenhum desses limites.
 * O overlap recua `chunkOverlap` caracteres e avança até o início da próxima
 * palavra, para que o chunk seguinte não comece com uma palavra cortada.
 *
 * Chunks podem atravessar páginas; pageStart/pageEnd registram o intervalo.
 */
export function chunkText(text: string, pages: PageRange[], options: ChunkingOptions): Chunk[] {
  validateChunkingOptions(options);
  const { chunkSize, chunkOverlap } = options;
  const chunks: Chunk[] = [];

  let start = skipWhitespace(text, 0);
  while (start < text.length) {
    const hardEnd = Math.min(start + chunkSize, text.length);
    const end =
      hardEnd === text.length
        ? hardEnd
        : findBreak(text, start + Math.floor(chunkSize / 2), hardEnd) ?? hardEnd;
    const trimmedEnd = trimEnd(text, start, end);

    chunks.push({
      index: chunks.length,
      text: text.slice(start, trimmedEnd),
      charStart: start,
      charEnd: trimmedEnd,
      pageStart: pageAt(pages, start),
      pageEnd: pageAt(pages, trimmedEnd - 1),
    });

    if (end >= text.length) break;
    let next = chunkOverlap > 0 ? nextWordStart(text, end - chunkOverlap, end) : end;
    if (next <= start) next = end;
    start = skipWhitespace(text, next);
  }
  return chunks;
}

/** Procura, de trás para frente em [min, max], a posição de corte preferida. */
function findBreak(text: string, min: number, max: number): number | null {
  const rules: Array<(p: number) => boolean> = [
    (p) => text.startsWith('\n\n', p),
    (p) => /[.!?…:;]/.test(text[p - 1] ?? '') && /\s/.test(text[p] ?? ''),
    (p) => text[p] === '\n',
    (p) => /\s/.test(text[p] ?? ''),
  ];
  for (const rule of rules) {
    for (let p = max; p >= min; p--) {
      if (rule(p)) return p;
    }
  }
  return null;
}

function nextWordStart(text: string, from: number, limit: number): number {
  let p = Math.max(from, 0);
  if (p > 0 && !/\s/.test(text[p - 1] ?? '')) {
    while (p < limit && !/\s/.test(text[p] ?? '')) p++;
  }
  return p;
}

function skipWhitespace(text: string, from: number): number {
  let p = from;
  while (p < text.length && /\s/.test(text[p] ?? '')) p++;
  return p;
}

function trimEnd(text: string, start: number, end: number): number {
  let p = end;
  while (p > start && /\s/.test(text[p - 1] ?? '')) p--;
  return p;
}

/** Página que contém o offset (busca binária; offsets entre páginas vão para a anterior). */
export function pageAt(pages: PageRange[], offset: number): number {
  let low = 0;
  let high = pages.length - 1;
  let found = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if ((pages[mid]?.charStart ?? 0) <= offset) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return pages[found]?.pageNumber ?? 1;
}
