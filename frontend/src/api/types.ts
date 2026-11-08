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

export type GoalType = 'prova' | 'entrevista';

export type ItemSource = {
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  quote: string;
  docCharStart: number;
  docCharEnd: number;
};

export type Attempt = {
  itemId: string;
  answerText: string | null;
  chosenOption: number | null;
  correct: boolean;
  score: number;
  feedback: string | null;
  evaluatedBy: 'code' | 'llm' | 'self';
  /** Entrevista: notas de 0 a 10 por critério. `exemplo` é null quando a pergunta não pede exemplo. */
  rubric: { precisao: number; estrutura: number; clareza: number; exemplo: number | null } | null;
  modelAnswer: string | null;
  missingPoints: string[] | null;
  answerFormat: 'free' | 'guided' | 'star' | null;
  tries: number;
};

export type PracticeItem = {
  id: string;
  /** card = flashcard (prompt = frente, referenceAnswer = verso). */
  kind: 'mcq' | 'open' | 'card';
  topic: string;
  prompt: string;
  options: string[] | null;
  source: ItemSource;
  attempt: Attempt | null;
  correctOption: number | null;
  referenceAnswer: string | null;
};

export type PracticeSession = {
  id: string;
  goalType: GoalType;
  mode: 'simulation' | 'flashcards';
  focus: 'general' | 'errors' | 'question';
  status: 'active' | 'finished';
  persona: 'examinador' | 'entrevistador';
  items: PracticeItem[];
  summary: { answered: number; total: number; correct: number; averageScore: number | null };
};

export type Priority = {
  topic: string;
  attempts: number;
  errors: number;
  errorRate: number;
  justification: string;
  source: (ItemSource & { itemId: string }) | null;
};

export type NotebookOverview = {
  goalType: GoalType | null;
  counts: {
    questions: number;
    highlights: number;
    flashcardsReviewed: number;
    simulationAverage: number | null;
    sessionsThisWeek: number;
  };
  documents: Array<{ documentId: string; highlights: number }>;
  recentQuestions: Array<{
    id: string;
    question: string;
    status: string;
    citations: number;
    /** Primeira citação da resposta (null se a pergunta foi recusada). */
    firstCitationId: string | null;
    createdAt: string;
  }>;
  recentSessions: Array<{
    id: string;
    mode: 'simulation' | 'flashcards';
    goalType: GoalType;
    topic: string | null;
    total: number;
    answered: number;
    correct: number;
    createdAt: string;
  }>;
  topics: Array<{ topic: string; attempts: number; accuracy: number }>;
};
