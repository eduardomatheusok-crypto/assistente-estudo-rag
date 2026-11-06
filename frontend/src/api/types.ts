/** Formatos das respostas da API (espelham o backend). */

export type Notebook = {
  id: string;
  name: string;
  discipline: string | null;
  createdAt: string;
};

export type DocumentStatus = 'processing' | 'ready' | 'failed';

export type StudyDocument = {
  id: string;
  notebookId: string;
  title: string;
  originalFilename: string;
  mimeType: 'application/pdf' | 'text/markdown' | 'text/plain';
  status: DocumentStatus;
  error: string | null;
  pageCount: number | null;
  chunkCount: number | null;
  createdAt: string;
};

export type DocumentPage = {
  pageNumber: number;
  width: number | null;
  height: number | null;
  charStart: number;
  charEnd: number;
  text: string;
};

/** [x1, y1, x2, y2] no espaço do PDF (pontos, origem embaixo à esquerda). */
export type PdfRect = [number, number, number, number];
export type PageLocation = { page: number; rects: PdfRect[] };

export type Citation = {
  id: string;
  position: number;
  label: string;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  quote: string;
  docCharStart: number;
  docCharEnd: number;
  pageNumber: number;
};

export type CitationContext = Citation & {
  mimeType: StudyDocument['mimeType'];
  chunkText: string;
  quoteStartInChunk: number;
  quoteEndInChunk: number;
  locations: PageLocation[];
};

export type Question = {
  id: string;
  question: string;
  status: 'answered' | 'not_found';
  refusalReason: string | null;
  answer: string;
  latencyMs: number;
  createdAt: string;
  citations: Citation[];
};

export type Criterion = {
  id: string;
  key: string;
  label: string;
  instruction: string;
  builtin: boolean;
};

export type HighlightRun = {
  id: string;
  documentId: string;
  criterion: { id: string; key: string; label: string };
  status: 'processing' | 'ready' | 'failed';
  batchesTotal: number;
  batchesDone: number;
  highlightCount: number;
  rejectedCount: number;
  error: string | null;
  usage: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
  latencyMs: number;
};

export type Highlight = {
  id: string;
  runId: string;
  criterion: { id: string; key: string; label: string };
  text: string;
  justification: string;
  pageNumber: number;
  docCharStart: number;
  docCharEnd: number;
  locations: PageLocation[];
};
