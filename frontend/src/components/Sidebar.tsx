import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api/client.ts';
import type { Notebook, StudyDocument } from '../api/types.ts';
import { useToast } from './Toasts.tsx';

type Props = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  notebooks: Notebook[];
  notebookId: string | null;
  /** Abre a tela inicial do caderno. */
  onSelectNotebook: (id: string) => void;
  onNotebookCreated: (notebook: Notebook) => void;
  documents: StudyDocument[];
  /** Documento aberto no centro (null na tela inicial). */
  documentId: string | null;
  onSelectDocument: (id: string) => void;
  onDocumentsChanged: () => void;
};

const STATUS: Record<StudyDocument['status'], string> = { processing: 'processando…', ready: 'pronto', failed: 'falhou' };
const KIND: Record<StudyDocument['mimeType'], string> = { 'application/pdf': 'PDF', 'text/markdown': 'MD', 'text/plain': 'TXT' };
const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

export function Sidebar(props: Props) {
  const notify = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      const notebook = await api.createNotebook(name.trim(), discipline.trim() || null);
      setName('');
      setDiscipline('');
      setCreating(false);
      props.onNotebookCreated(notebook);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length || !props.notebookId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await api.uploadDocument(props.notebookId, file);
        notify(`“${file.name}” enviado. Processando…`);
      }
    } catch (e) {
      notify((e as Error).message, 'error');
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
      notify((e as Error).message, 'error');
    }
  }

  const activeNotebook = props.documentId === null ? props.notebookId : null;

  return (
    <aside className="side">
      <div className="brand">
        <div className="logo">E</div>
        <b className="fade-collapse">Estudo</b>
        <button
          className="collapse-btn ghost"
          onClick={props.onToggleCollapse}
          aria-label={props.collapsed ? 'Expandir a barra lateral' : 'Recolher a barra lateral'}
          title={props.collapsed ? 'Expandir' : 'Recolher'}
        >
          {props.collapsed ? '⟩' : '⟨'}
        </button>
      </div>

      <div className="side-head">
        <h4 className="fade-collapse">Cadernos</h4>
        {!props.collapsed && (
          <button className="ghost" onClick={() => setCreating((c) => !c)} aria-label="Novo caderno" title="Novo caderno">
            {creating ? '×' : '+'}
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {creating && !props.collapsed && (
          <motion.form
            className="new-notebook"
            onSubmit={create}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <label className="visually-hidden" htmlFor="nb-name">Nome do caderno</label>
            <input id="nb-name" placeholder="Nome do caderno" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <label className="visually-hidden" htmlFor="nb-disc">Disciplina</label>
            <input id="nb-disc" placeholder="Disciplina (opcional)" value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
            <button className="primary" type="submit" disabled={!name.trim()}>Criar caderno</button>
          </motion.form>
        )}
      </AnimatePresence>
      <nav className="nav" aria-label="Cadernos">
        {props.notebooks.map((nb) => (
          <button
            key={nb.id}
            className={nb.id === activeNotebook ? 'nav-item active' : 'nav-item'}
            onClick={() => props.onSelectNotebook(nb.id)}
            title={nb.name}
          >
            {nb.id === activeNotebook && <motion.span layoutId="nav-active" className="nav-active-bg" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="ico">{initial(nb.name)}</span>
            <span className="label fade-collapse">
              <strong>{nb.name}</strong>
              {nb.discipline && <small>{nb.discipline}</small>}
            </span>
          </button>
        ))}
        {props.notebooks.length === 0 && <p className="muted fade-collapse" style={{ padding: '4px 10px' }}>Crie seu primeiro caderno no +.</p>}
      </nav>

      {props.notebookId && (
        <>
          <div className="side-head">
            <h4 className="fade-collapse">Documentos</h4>
          </div>
          <nav className="nav" aria-label="Documentos">
            <AnimatePresence initial={false}>
              {props.documents.map((doc) => (
                <motion.div
                  key={doc.id}
                  className="doc-row"
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                >
                  <button
                    className={doc.id === props.documentId ? 'nav-item active' : 'nav-item'}
                    onClick={() => props.onSelectDocument(doc.id)}
                    title={doc.error ?? doc.originalFilename}
                  >
                    {doc.id === props.documentId && <motion.span layoutId="nav-active" className="nav-active-bg" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                    <span className="ico">{KIND[doc.mimeType]}</span>
                    <span className="label fade-collapse">
                      <strong>{doc.title}</strong>
                      <small className={`status-${doc.status}`}>
                        {doc.pageCount ? `${doc.pageCount} p. · ` : ''}
                        {STATUS[doc.status]}
                      </small>
                    </span>
                  </button>
                  <button className="remove" onClick={() => remove(doc)} aria-label={`Apagar ${doc.title}`} title="Apagar">×</button>
                </motion.div>
              ))}
            </AnimatePresence>
          </nav>

          <label
            className={dragging ? 'upload dragging' : 'upload'}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void upload(e.dataTransfer.files);
            }}
            title="Enviar PDF, Markdown ou TXT"
          >
            <input ref={fileInput} type="file" accept=".pdf,.md,.markdown,.txt" multiple disabled={uploading} onChange={(e) => upload(e.target.files)} />
            <span className="ico">{uploading ? '…' : '+'}</span>
            <span className="fade-collapse">{uploading ? 'Enviando…' : 'Enviar PDF, MD ou TXT'}</span>
          </label>
        </>
      )}
    </aside>
  );
}
