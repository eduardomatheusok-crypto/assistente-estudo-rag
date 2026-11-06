import type {
  CitationContext,
  Criterion,
  DocumentPage,
  Highlight,
  HighlightRun,
  Notebook,
  Question,
  StudyDocument,
} from './types.ts';

const BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      message = ((await response.json()) as { error?: string }).error ?? message;
    } catch {
      // corpo sem JSON: fica a mensagem genérica
    }
    throw new ApiError(response.status, message);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  listNotebooks: () => request<Notebook[]>('/notebooks'),
  createNotebook: (name: string, discipline: string | null) =>
    request<Notebook>('/notebooks', json('POST', { name, discipline })),

  listDocuments: (notebookId: string) => request<StudyDocument[]>(`/notebooks/${notebookId}/documents`),
  uploadDocument: (notebookId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<StudyDocument>(`/notebooks/${notebookId}/documents`, { method: 'POST', body: form });
  },
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, { method: 'DELETE' }),
  documentFileUrl: (id: string) => `${BASE}/documents/${id}/file`,
  getPage: (id: string, page: number) => request<DocumentPage>(`/documents/${id}/pages/${page}`),

  listQuestions: (notebookId: string) => request<Question[]>(`/notebooks/${notebookId}/questions`),
  ask: (notebookId: string, question: string) =>
    request<Question>(`/notebooks/${notebookId}/questions`, json('POST', { question })),
  getCitation: (id: string) => request<CitationContext>(`/citations/${id}`),

  listCriteria: (notebookId: string) => request<Criterion[]>(`/notebooks/${notebookId}/highlight-criteria`),
  createCriterion: (notebookId: string, label: string, instruction: string) =>
    request<Criterion>(`/notebooks/${notebookId}/highlight-criteria`, json('POST', { label, instruction })),
  startHighlights: (documentId: string, criterionIds: string[]) =>
    request<HighlightRun[]>(`/documents/${documentId}/highlight-runs`, json('POST', { criterionIds })),
  getRun: (id: string) => request<HighlightRun>(`/highlight-runs/${id}`),
  listHighlights: (documentId: string) => request<Highlight[]>(`/documents/${documentId}/highlights`),
};
