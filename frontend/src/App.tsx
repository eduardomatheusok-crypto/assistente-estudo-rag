import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api/client.ts';
import type { Citation, GoalType, Highlight, Notebook, PageLocation, PracticeSession, StudyDocument } from './api/types.ts';
import { ChatPanel } from './components/ChatPanel.tsx';
import { HighlightsPanel } from './components/HighlightsPanel.tsx';
import { GoalSelector } from './components/practice/GoalSelector.tsx';
import { PracticeView } from './components/practice/PracticeView.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { DocumentViewer } from './components/viewer/DocumentViewer.tsx';
import type { FocusTarget, Overlay } from './components/viewer/types.ts';
import { usePolling } from './hooks/usePolling.ts';
import { CITATION_COLOR, criterionColor } from './lib/colors.ts';

/** Trecho a abrir no documento: citação do chat ou fonte de uma questão. */
type SourceTarget = {
  id: string;
  documentId: string;
  pageNumber: number;
  docCharStart: number;
  docCharEnd: number;
  locations: PageLocation[];
  title: string;
};

export function App() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebookId, setNotebookId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'chat' | 'highlights'>('chat');
  const [sourceOverlay, setSourceOverlay] = useState<(Overlay & { documentId: string }) | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [practice, setPractice] = useState<PracticeSession | null>(null);
  const [practiceVisible, setPracticeVisible] = useState(false);
  const [practiceBusy, setPracticeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const document = documents.find((d) => d.id === documentId) ?? null;

  useEffect(() => {
    api
      .listNotebooks()
      .then((list) => {
        setNotebooks(list);
        if (list[0]) setNotebookId(list[0].id);
      })
      .catch((e: Error) => setError(`Não foi possível falar com o backend: ${e.message}`));
  }, []);

  const loadDocuments = useCallback(async () => {
    if (!notebookId) return;
    try {
      setDocuments(await api.listDocuments(notebookId));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [notebookId]);

  useEffect(() => {
    setDocuments([]);
    setDocumentId(null);
    setSourceOverlay(null);
    setPractice(null);
    setPracticeVisible(false);
    setGoalType(null);
    void loadDocuments();
    if (notebookId) api.getProfile(notebookId).then((p) => setGoalType(p.goalType)).catch(() => {});
  }, [loadDocuments, notebookId]);

  usePolling(loadDocuments, 2000, documents.some((d) => d.status === 'processing'));

  const loadHighlights = useCallback(async () => {
    if (!document || document.status !== 'ready') {
      setHighlights([]);
      return;
    }
    try {
      setHighlights(await api.listHighlights(document.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [document?.id, document?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadHighlights();
  }, [loadHighlights]);

  /** Abre o documento no trecho pedido e o pinta (fecha a prática, que pode ser retomada). */
  function openSource(target: SourceTarget) {
    setPracticeVisible(false);
    setDocumentId(target.documentId);
    setSourceOverlay({
      id: target.id,
      documentId: target.documentId,
      color: CITATION_COLOR,
      title: target.title,
      docCharStart: target.docCharStart,
      docCharEnd: target.docCharEnd,
      locations: target.locations,
      focused: true,
    });
    setFocusedId(target.id);
    setFocus({ page: target.pageNumber, overlayId: target.id, nonce: Date.now() });
  }

  async function openCitation(citation: Citation) {
    try {
      const c = await api.getCitation(citation.id);
      openSource({ ...c, id: `citation-${c.id}`, title: `Citação ${c.label}: ${c.quote}` });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function openItemSource(itemId: string) {
    try {
      const s = await api.itemSource(itemId);
      openSource({ ...s, id: `item-${itemId}`, title: `Fonte da questão: ${s.quote}` });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function changeGoal(goal: GoalType) {
    if (!notebookId) return;
    try {
      setGoalType((await api.setProfile(notebookId, goal)).goalType);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function startPractice(body: Parameters<typeof api.startPractice>[1]) {
    if (!notebookId) return;
    if (!goalType) {
      setError('Escolha o objetivo do caderno (Prova ou Entrevista) no topo do chat antes de treinar.');
      return;
    }
    setPracticeBusy(true);
    setError(null);
    try {
      setPractice(await api.startPractice(notebookId, body));
      setPracticeVisible(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPracticeBusy(false);
    }
  }

  function openHighlight(highlight: Highlight) {
    setHidden((set) => {
      const next = new Set(set);
      next.delete(highlight.criterion.id);
      return next;
    });
    setFocusedId(highlight.id);
    setFocus({ page: highlight.pageNumber, overlayId: highlight.id, nonce: Date.now() });
  }

  const overlays = useMemo<Overlay[]>(() => {
    const list: Overlay[] = highlights
      .filter((h) => !hidden.has(h.criterion.id))
      .map((h) => ({
        id: h.id,
        color: criterionColor(h.criterion.key),
        title: `${h.criterion.label}: ${h.justification}`,
        docCharStart: h.docCharStart,
        docCharEnd: h.docCharEnd,
        locations: h.locations,
        focused: h.id === focusedId,
      }));
    if (sourceOverlay && sourceOverlay.documentId === documentId) {
      list.push({ ...sourceOverlay, focused: sourceOverlay.id === focusedId });
    }
    return list;
  }, [highlights, hidden, sourceOverlay, documentId, focusedId]);

  return (
    <div className="app">
      <Sidebar
        notebooks={notebooks}
        notebookId={notebookId}
        onSelectNotebook={setNotebookId}
        onNotebookCreated={(notebook) => {
          setNotebooks((list) => [notebook, ...list]);
          setNotebookId(notebook.id);
        }}
        documents={documents}
        documentId={documentId}
        onSelectDocument={(id) => {
          setDocumentId(id);
          setFocus(null);
          setPracticeVisible(false);
        }}
        onDocumentsChanged={loadDocuments}
      />

      <main className="viewer">
        {error && (
          <p className="error banner" onClick={() => setError(null)}>
            {error} (clique para fechar)
          </p>
        )}
        {practice && practiceVisible ? (
          <PracticeView
            key={practice.id}
            session={practice}
            onUpdate={setPractice}
            onClose={() => {
              setPractice(null);
              setPracticeVisible(false);
            }}
            onOpenSource={(item) => openItemSource(item.id)}
          />
        ) : (
          <>
            <div className="main-toolbar">
              <strong>{document?.title ?? 'Nenhum documento aberto'}</strong>
              {practice && (
                <button onClick={() => setPracticeVisible(true)}>Voltar à prática</button>
              )}
            </div>
            <div className="viewer-body">
              <DocumentViewer document={document} overlays={overlays} focus={focus} />
            </div>
          </>
        )}
      </main>

      <aside className="panel">
        <nav className="tabs">
          <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Perguntas</button>
          <button className={tab === 'highlights' ? 'active' : ''} onClick={() => setTab('highlights')}>
            Grifos{highlights.length > 0 ? ` (${highlights.length})` : ''}
          </button>
        </nav>
        {!notebookId ? (
          <p className="muted panel-pad">Crie ou selecione um caderno.</p>
        ) : tab === 'chat' ? (
          <ChatPanel
            notebookId={notebookId}
            onOpenCitation={openCitation}
            practiceBusy={practiceBusy}
            onTrainQuestion={(questionId, mode) => startPractice({ mode, focus: 'question', questionId })}
            header={<GoalSelector goalType={goalType} onChange={changeGoal} />}
          />
        ) : (
          <HighlightsPanel
            notebookId={notebookId}
            document={document}
            highlights={highlights}
            onReloadHighlights={loadHighlights}
            hidden={hidden}
            onToggleCriterion={(id) =>
              setHidden((set) => {
                const next = new Set(set);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onOpenHighlight={openHighlight}
          />
        )}
      </aside>
    </div>
  );
}
