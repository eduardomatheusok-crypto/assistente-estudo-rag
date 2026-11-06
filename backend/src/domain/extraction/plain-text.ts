import { ExtractionError, type ExtractedDocument } from './types.ts';

/**
 * Decodifica bytes de um arquivo de texto.
 * Tenta UTF-8 estrito; se falhar, assume Windows-1252 (comum em arquivos
 * em português salvos no Windows).
 */
export function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/**
 * Extrai TXT e Markdown. O Markdown é mantido cru (com a sintaxe), para que
 * citações e grifos correspondam literalmente ao arquivo enviado.
 * Não há paginação: o documento inteiro é a "página" 1, sem coordenadas.
 */
export function extractPlainText(bytes: Uint8Array): ExtractedDocument {
  const text = decodeText(bytes);
  if (text.trim().length === 0) {
    throw new ExtractionError('Arquivo sem conteúdo de texto.');
  }
  return {
    text,
    pages: [
      {
        pageNumber: 1,
        width: null,
        height: null,
        charStart: 0,
        charEnd: text.length,
        text,
        items: [],
      },
    ],
  };
}
