import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.ts';
import { segmentText } from '../../lib/text-marks.ts';
import type { FocusTarget, Overlay } from './types.ts';

type Props = { documentId: string; overlays: Overlay[]; focus: FocusTarget | null };

/**
 * Markdown e TXT não têm páginas nem coordenadas: o texto é mostrado como
 * está (cru, igual ao que o sistema cita) e os grifos usam os offsets.
 */
export function TextViewer({ documentId, overlays, focus }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(null);
    api
      .getPage(documentId, 1)
      .then((page) => setText(page.text))
      .catch((e: Error) => setError(e.message));
  }, [documentId]);

  useEffect(() => {
    if (!focus?.overlayId || text === null) return;
    const mark = scrollRef.current?.querySelector<HTMLElement>(`[data-overlay="${CSS.escape(focus.overlayId)}"]`);
    mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focus, text]);

  if (error) return <div className="viewer-message">Não foi possível abrir o texto: {error}</div>;
  if (text === null) return <div className="viewer-message">Carregando…</div>;

  const byId = new Map(overlays.map((o) => [o.id, o]));
  const segments = segmentText(
    text,
    overlays.map((o) => ({ start: o.docCharStart, end: o.docCharEnd, className: o.id, id: o.id })),
  );

  return (
    <div className="text-viewer" ref={scrollRef}>
      <pre>
        {segments.map((segment) => {
          if (segment.marks.length === 0) return <span key={segment.start}>{segment.text}</span>;
          // A citação aberta tem prioridade de cor sobre os grifos.
          const top = segment.marks.map((m) => byId.get(m.id!)!).sort((a, b) => Number(!!b.focused) - Number(!!a.focused))[0]!;
          return (
            <mark
              key={segment.start}
              data-overlay={top.id}
              title={segment.marks.map((m) => byId.get(m.id!)!.title).join(' · ')}
              className={top.focused ? 'focused' : undefined}
              style={{ background: `rgba(${top.color}, ${top.focused ? 0.45 : 0.3})`, outlineColor: `rgb(${top.color})` }}
            >
              {segment.text}
            </mark>
          );
        })}
      </pre>
    </div>
  );
}
