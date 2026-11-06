import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api/client.ts';
import type { Notebook, StudyDocument } from '../api/types.ts';

type Props = {
  notebooks: Notebook[];
  notebookId: string | null;
  onSelectNotebook: (id: string) => void;
  onNotebookCreated: (notebook: Notebook) => void;
  documents: StudyDocument[];
  documentId: string | null;
  onSelectDocument: (id: string) => void;
  onDocumentsChanged: () => void;
};

const STATUS_LABEL: Record<StudyDocument['status'], string> = {
  processing: 'processando',
  ready: 'pronto',
  failed: 'falhou',
};

export function Sidebar(props: Props) {
  const [name, setName] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function createNotebook(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      const notebook = await api.createNotebook(name.trim(), discipline.trim() || null);
      setName('');
      setDiscipline('');
      props.onNotebookCreated(notebook);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function upload(files: FileList | null) {
    if (!files || !props.notebookId) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await api.uploadDocument(props.notebookId, file);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
      props.onDocumentsChanged();
    }
  }

  async function remove(document: StudyDocument) {
    if (!window.confirm(`Apagar “${document.title}”? Grifos e citações dele também serão apagados.`)) return;
    try {
      await api.deleteDocument(document.id);
      props.onDocumentsChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <aside className="sidebar">
      <section>
        <h2>Cadernos</h2>
        <ul className="list">
          {props.notebooks.map((notebook) => (
            <li key={notebook.id}>
              <button
                className={notebook.id === props.notebookId ? 'item active' : 'item'}
                onClick={() => props.onSelectNotebook(notebook.id)}
              >
                <strong>{notebook.name}</strong>
                {notebook.discipline && <small>{notebook.discipline}</small>}
              </button>
            </li>
          ))}
        </ul>
        <form className="stack" onSubmit={createNotebook}>
          <input placeholder="Novo caderno" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Disciplina (opcional)" value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
          <button type="submit" disabled={!name.trim()}>Criar caderno</button>
        </form>
      </section>

      {props.notebookId && (
        <section>
          <h2>Documentos</h2>
          <ul className="list">
            {props.documents.map((document) => (
              <li key={document.id} className="document-row">
                <button
                  className={document.id === props.documentId ? 'item active' : 'item'}
                  onClick={() => props.onSelectDocument(document.id)}
                  title={document.error ?? document.originalFilename}
                >
                  <strong>{document.title}</strong>
                  <small className={`status ${document.status}`}>
                    {STATUS_LABEL[document.status]}
                    {document.pageCount ? ` · ${document.pageCount} p.` : ''}
                  </small>
                </button>
                <button className="icon" onClick={() => remove(document)} aria-label={`Apagar ${document.title}`}>
                  ×
                </button>
              </li>
            ))}
            {props.documents.length === 0 && <li className="muted">Nenhum documento ainda.</li>}
          </ul>
          <label className="upload">
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.md,.markdown,.txt"
              multiple
              disabled={uploading}
              onChange={(e) => upload(e.target.files)}
            />
            {uploading ? 'Enviando…' : 'Enviar PDF, Markdown ou TXT'}
          </label>
        </section>
      )}
      {error && <p className="error">{error}</p>}
    </aside>
  );
}
