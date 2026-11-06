import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// O PDF.js decodifica o arquivo num Web Worker, fora da thread da interface.
GlobalWorkerOptions.workerSrc = workerUrl;

export { getDocument };
export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
