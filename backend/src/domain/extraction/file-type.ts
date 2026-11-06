import type { SupportedMimeType } from './types.ts';

const EXTENSIONS: Record<string, SupportedMimeType> = {
  pdf: 'application/pdf',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
};

const PDF_MAGIC = '%PDF-';

/**
 * Define o tipo pelo nome do arquivo e confere a assinatura do conteúdo.
 * Não confiamos no Content-Type enviado pelo navegador, que varia por sistema.
 * Retorna null se o arquivo não for suportado.
 */
export function detectMimeType(filename: string, bytes: Uint8Array): SupportedMimeType | null {
  const extension = filename.toLowerCase().split('.').pop() ?? '';
  const mimeType = EXTENSIONS[extension];
  if (!mimeType) return null;

  const isPdf = new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes(PDF_MAGIC);
  if (mimeType === 'application/pdf') return isPdf ? mimeType : null;
  // Arquivo binário disfarçado de texto: byte nulo é um bom indício.
  if (isPdf || bytes.subarray(0, 8192).includes(0)) return null;
  return mimeType;
}

export function fileExtension(mimeType: SupportedMimeType): string {
  return mimeType === 'application/pdf' ? 'pdf' : mimeType === 'text/markdown' ? 'md' : 'txt';
}
