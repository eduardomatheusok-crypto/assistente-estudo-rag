import { useEffect, useRef, useState } from 'react';
import { getDocument, type PDFDocumentProxy, type PDFPageProxy } from '../../lib/pdf.ts';
import { PdfPage } from './PdfPage.tsx';
import type { FocusTarget, Overlay } from './types.ts';

type Props = {
  url: string;
  overlays: Overlay[];
  focus: FocusTarget | null;
};

const ZOOM_STEP = 0.15;

export function PdfViewer({ url, overlays, focus }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [scale, setScale] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPages([]);
    setScale(null);
    setError(null);
    const task = getDocument({ url });
    task.promise
      .then(async (doc: PDFDocumentProxy) => {
        const loaded = await Promise.all(Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1)));
        if (cancelled) return;
        // Zoom inicial: a largura da página ocupa a área disponível.
        const width = scrollRef.current?.clientWidth ?? 800;
        const pageWidth = loaded[0]?.getViewport({ scale: 1 }).width ?? 612;
        // desconta o recuo da área (2 × 20 px) e a barra de rolagem vertical
        setScale(Math.min(2, Math.max(0.5, (width - 72) / pageWidth)));
        setPages(loaded);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      // No PDF.js 6 quem libera o documento é a tarefa de carregamento.
      void task.destroy();
    };
  }, [url]);

  // Ir até a página (e o trecho) pedidos.
  useEffect(() => {
    if (!focus || pages.length === 0 || scale === null) return;
    const container = scrollRef.current;
    const pageElement = container?.querySelector<HTMLElement>(`[data-page="${focus.page}"]`);
    if (!container || !pageElement) return;
    const mark = focus.overlayId
      ? pageElement.querySelector<HTMLElement>(`[data-overlay="${CSS.escape(focus.overlayId)}"]`)
      : null;
    // .pdf-scroll e .pdf-page são position: relative: offsetTop da página é relativo à
    // área de rolagem, e o do retângulo, relativo à página.
    const top = pageElement.offsetTop + (mark ? mark.offsetTop - 120 : 0) - 16;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [focus, pages, scale]);

  if (error) return <div className="center-message">Não foi possível abrir o PDF: {error}</div>;

  return (
    <div className="pdf-viewer">
      {/* Zoom numa pílula flutuante: a barra do topo fica só com o título. */}
      <div className="zoom-pill">
        <button onClick={() => setScale((s) => Math.max(0.4, (s ?? 1) - ZOOM_STEP))} aria-label="Diminuir zoom">−</button>
        <span>{scale ? `${Math.round(scale * 100)}%` : '…'}</span>
        <button onClick={() => setScale((s) => Math.min(3, (s ?? 1) + ZOOM_STEP))} aria-label="Aumentar zoom">+</button>
        <span className="muted">{pages.length > 0 ? `${pages.length} p.` : 'carregando…'}</span>
      </div>
      <div className="pdf-scroll" ref={scrollRef}>
        {scale !== null &&
          pages.map((page) => <PdfPage key={page.pageNumber} page={page} scale={scale} overlays={overlays} />)}
      </div>
    </div>
  );
}
