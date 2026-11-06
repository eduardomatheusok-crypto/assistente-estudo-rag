import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api/client.ts';
import type { Citation, GoalType, Highlight, Notebook, PageLocation, PracticeSession, StudyDocument } from './api/types.ts';
import { ChatPanel } from './components/ChatPanel.tsx';
import { HighlightsPanel } from './components/HighlightsPanel.tsx';
import { NotebookHome } from './components/NotebookHome.tsx';
import { GoalSelector } from './components/practice/GoalSelector.tsx';
import { PracticeView } from './components/practice/PracticeView.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { useToast } from './components/Toasts.tsx';
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

type Tab = 'chat' | 'highlights';

function storedCollapsed(): boolean {
  try {
    return localStorage.getItem('sidebar-collapsed') === '1';
  } catch {
    return false;
  }
}

export function App() {
  const notify = useToast();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebookId, setNotebookId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  /** null = tela inicial do caderno. */
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sourceOverlay, setSourceOverlay] = useState<(Overlay & { documentId: string }) | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [practice, setPractice] = useState<PracticeSession | null>(null);
  const [practiceVisible, setPracticeVisible] = useState(false);
  const [practiceBusy, setPracticeBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(storedCollapsed);
  const [tab, setTab] = useState<Tab>('chat');
  const [chatOpen, setChatOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const notebook = notebooks.find((n) => n.id === notebookId) ?? null;
  const document = documents.find((d) => d.id === documentId) ?? null;
  const inPractice = !!practice && practiceVisible;
  const view: 'home' | 'document' | 'practice' = inPractice ? 'practice' : documentId ? 'document' : 'home';
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    api
      .listNotebooks()
      .then((list) => {
        setNotebooks(list);
        if (list[0]) setNotebookId(list[0].id);
      })
      .catch((e: Error) => notify(`Não foi possível falar com o backend: ${e.message}`, 'error'));
  }, [notify]);

  const loadDocuments = useCallback(async () => {
    if (!notebookId) return;
    try {
      setDocuments(await api.listDocuments(notebookId));
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }, [notebookId, notify]);

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

  // Enquanto algum documento processa, atualiza o status (e a tela inicial quando termina).
  const processing = documents.some((d) => d.status === 'processing');
  usePolling(loadDocuments, 2000, processing);
  useEffect(() => {
    if (!processing) refresh();
  }, [processing, refresh]);

  const loadHighlights = useCallback(async () => {
    if (!document || document.status !== 'ready') {
      setHighlights([]);
      return;
    }
    try {
      setHighlights(await api.listHighlights(document.id));
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }, [document?.id, document?.status, notify]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadHighlights();
  }, [loadHighlights]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem('sidebar-collapsed', c ? '0' : '1');
      } catch {
        // preferência só não é lembrada
      }
      return !c;
    });
  }

  function openDocument(id: string) {
    setDocumentId(id);
    setFocus(null);
    setPracticeVisible(false);
  }

  function openNotebook(id: string) {
    if (id === notebookId) {
      setDocumentId(null);
      setPracticeVisible(false);
      refresh();
    } else {
      setNotebookId(id);
    }
  }

  /** Abre o documento no trecho pedido e o pinta (a prática pode ser retomada). */
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
      openSource({ ...c, id: `citation-${c.id}-${Date.now()}`, title: `Citação ${c.label}: ${c.quote}` });
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function openItemSource(itemId: string) {
    try {
      const s = await api.itemSource(itemId);
      openSource({ ...s, id: `item-${itemId}-${Date.now()}`, title: `Fonte da questão: ${s.quote}` });
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function changeGoal(goal: GoalType) {
    if (!notebookId) return;
    try {
      setGoalType((await api.setProfile(notebookId, goal)).goalType);
      notify(`Objetivo: ${goal === 'prova' ? 'Prova' : 'Entrevista'}. A Simulação abre nesse formato.`);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  async function startPractice(body: Parameters<typeof api.startPractice>[1]) {
    if (!notebookId) return;
    if (!goalType) {
      notify('Escolha o objetivo do caderno (Prova ou Entrevista) no topo do chat antes de treinar.', 'error');
      return;
    }
    setPracticeBusy(true);
    try {
      setPractice(await api.startPractice(notebookId, body));
      setPracticeVisible(true);
      setChatOpen(false);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setPracticeBusy(false);
    }
  }

  async function openSession(id: string) {
    try {
      setPractice(await api.getPractice(id));
      setPracticeVisible(true);
      setChatOpen(false);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  function closePractice() {
    setPractice(null);
    setPracticeVisible(false);
    setChatOpen(false);
    refresh();
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

  const classes = ['app', collapsed && 'collapsed', view === 'home' && 'home', view === 'practice' && 'focus', chatOpen && 'chat-open']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        notebooks={notebooks}
        notebookId={notebookId}
        onSelectNotebook={openNotebook}
        onNotebookCreated={(nb) => {
          setNotebooks((list) => [nb, ...list]);
          setNotebookId(nb.id);
        }}
        documents={documents}
        documentId={view === 'home' ? null : documentId}
        onSelectDocument={openDocument}
        onDocumentsChanged={() => {
          void loadDocuments();
          refresh();
        }}
      />

      <main className="main">
        {!notebook ? (
          <div className="center-message">Crie um caderno no + da barra lateral para começar.</div>
        ) : (
          <>
            {view === 'home' && (
              <NotebookHome
                notebook={notebook}
                documents={documents}
                refreshKey={refreshKey}
                onOpenDocument={openDocument}
                onOpenSession={openSession}
              />
            )}
            {view !== 'home' && (
              <motion.div
                key={documentId ?? 'none'}
                style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="toolbar">
                  <h2>
                    <span className="crumb">{notebook.name} /</span> {document?.title ?? ''}
                  </h2>
                  {practice && !practiceVisible && (
                    <motion.button className="primary" onClick={() => setPracticeVisible(true)} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                      Voltar à prática
                    </motion.button>
                  )}
                </div>
                <DocumentViewer document={document} overlays={overlays} focus={focus} />
              </motion.div>
            )}
            <AnimatePresence>
              {inPractice && (
                <PracticeView
                  key={practice!.id}
                  session={practice!}
                  onUpdate={setPractice}
                  onClose={closePractice}
                  onOpenSource={(item) => openItemSource(item.id)}
                  chatOpen={chatOpen}
                  onToggleChat={() => setChatOpen((o) => !o)}
                />
              )}
            </AnimatePresence>
          </>
        )}
      </main>

      <aside className="panel" aria-hidden={view === 'home' || (view === 'practice' && !chatOpen)}>
        <nav className="tabs">
          {(
            [
              ['chat', 'Perguntas'],
              ['highlights', `Grifos${highlights.length ? ` (${highlights.length})` : ''}`],
            ] as Array<[Tab, string]>
          ).map(([value, label]) => (
            <button key={value} className={tab === value ? 'tab active' : 'tab'} onClick={() => setTab(value)}>
              {label}
              {tab === value && <motion.span layoutId="tab-ink" className="tab-ink" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            </button>
          ))}
        </nav>
        {!notebookId ? (
          <p className="muted" style={{ padding: 16 }}>Crie ou selecione um caderno.</p>
        ) : tab === 'chat' ? (
          <ChatPanel
            notebookId={notebookId}
            header={<GoalSelector goalType={goalType} onChange={changeGoal} />}
            onOpenCitation={openCitation}
            practiceBusy={practiceBusy}
            onTrainQuestion={(questionId, mode) => startPractice({ mode, focus: 'question', questionId })}
            onAsked={refresh}
          />
        ) : (
          <HighlightsPanel
            notebookId={notebookId}
            document={document}
            highlights={highlights}
            onReloadHighlights={() => {
              void loadHighlights();
              refresh();
            }}
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
