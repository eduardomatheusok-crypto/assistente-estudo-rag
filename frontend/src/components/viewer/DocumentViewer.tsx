import { api } from '../../api/client.ts';
import type { StudyDocument } from '../../api/types.ts';
import { PdfViewer } from './PdfViewer.tsx';
import { TextViewer } from './TextViewer.tsx';
import type { FocusTarget, Overlay } from './types.ts';

type Props = { document: StudyDocument | null; overlays: Overlay[]; focus: FocusTarget | null };

export function DocumentViewer({ document, overlays, focus }: Props) {
  if (!document) return <div className="center-message">Selecione um documento à esquerda.</div>;
  if (document.status === 'processing') return <div className="center-message">Processando “{document.title}”…</div>;
  if (document.status === 'failed') {
    return <div className="center-message error">Falha ao processar “{document.title}”: {document.error}</div>;
  }
  return document.mimeType === 'application/pdf' ? (
    <PdfViewer url={api.documentFileUrl(document.id)} overlays={overlays} focus={focus} />
  ) : (
    <TextViewer documentId={document.id} overlays={overlays} focus={focus} />
  );
}
