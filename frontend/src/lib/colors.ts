/** Cor de cada critério (predefinidos fixos; personalizados por hash da chave). */
const BUILTIN: Record<string, string> = {
  definicoes: '255, 214, 0',
  formulas: '0, 176, 255',
  datas: '255, 112, 67',
  exemplos: '102, 187, 106',
  'conceitos-fundamentais': '171, 71, 188',
};
const EXTRA = ['255, 64, 129', '0, 150, 136', '121, 85, 72', '63, 81, 181', '205, 220, 57'];

export function criterionColor(key: string): string {
  const builtin = BUILTIN[key];
  if (builtin) return builtin;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return EXTRA[hash % EXTRA.length]!;
}

/** Cor da citação aberta a partir do chat. */
export const CITATION_COLOR = '255, 82, 82';
