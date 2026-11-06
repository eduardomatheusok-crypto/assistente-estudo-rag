import { extractPdf } from './pdf.ts';
import { extractPlainText } from './plain-text.ts';
import type { ExtractedDocument, SupportedMimeType } from './types.ts';

export function extractDocument(
  bytes: Uint8Array,
  mimeType: SupportedMimeType,
): Promise<ExtractedDocument> {
  switch (mimeType) {
    case 'application/pdf':
      return extractPdf(bytes);
    case 'text/markdown':
    case 'text/plain':
      return Promise.resolve(extractPlainText(bytes));
  }
}

export * from './types.ts';
