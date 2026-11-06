import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api/client.ts';
import type { Citation, Highlight, Notebook, StudyDocument } from './api/types.ts';
import { ChatPanel } from './components/ChatPanel.tsx';
import { HighlightsPanel } from './components/HighlightsPanel.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { DocumentViewer } from './components/viewer/DocumentViewer.tsx';
import type { FocusTarget, Overlay } from './components/viewer/types.ts';
import { usePolling } from './hooks/usePolling.ts';
import { CITATION_COLOR, criterionColor } from './lib/colors.ts';

type Tab = 'chat' | 'highlights';

export function App() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebookId, setNotebookId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [citationOverlay, setCitationOverlay] = useState<(Overlay & { documentId: string }) | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [tab, setTab] = useState<Tab>('chat');
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
    setCitationOverlay(null);
    void loadDocuments();
  }, [loadDocuments]);

  // Enquanto algum documento processa, atualiza o status.
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

  async function openCitation(citation: Citation) {
    try {
      const context = await api.getCitation(citation.id);
      const overlayId = `citation-${citation.id}`;
      setDocumentId(context.documentId);
      setCitationOverlay({
        id: overlayId,
        documentId: context.documentId,
        color: CITATION_COLOR,
        title: `Citação ${citation.label}: ${citation.quote}`,
        docCharStart: context.docCharStart,
        docCharEnd: context.docCharEnd,
        locations: context.locations,
        focused: true,
      });
      setFocusedId(overlayId);
      setFocus({ page: context.pageNumber, overlayId, nonce: Date.now() });
    } catch (e) {
      setError((e as Error).message);
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
    if (citationOverlay && citationOverlay.documentId === documentId) {
      list.push({ ...citationOverlay, focused: citationOverlay.id === focusedId });
    }
    return list;
  }, [highlights, hidden, citationOverlay, documentId, focusedId]);

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
        }}
        onDocumentsChanged={loadDocuments}
      />

      <main className="viewer">
        {error && (
          <p className="error banner" onClick={() => setError(null)}>
            {error} (clique para fechar)
          </p>
        )}
        <DocumentViewer document={document} overlays={overlays} focus={focus} />
      </main>

      <aside className="panel">
        <nav className="tabs">
          <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Perguntas</button>
          <button className={tab === 'highlights' ? 'active' : ''} onClick={() => setTab('highlights')}>Grifos</button>
        </nav>
        {!notebookId ? (
          <p className="muted panel-pad">Crie ou selecione um caderno.</p>
        ) : tab === 'chat' ? (
          <ChatPanel notebookId={notebookId} onOpenCitation={openCitation} />
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
