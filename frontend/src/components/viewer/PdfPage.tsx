import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { pdfRectToCss } from '../../lib/geometry.ts';
import type { PDFPageProxy } from '../../lib/pdf.ts';
import type { Overlay } from './types.ts';

type Props = {
  page: PDFPageProxy;
  scale: number;
  overlays: Overlay[];
};

/**
 * Uma página: o canvas do PDF.js e, por cima, um div por retângulo de grifo.
 * Só renderiza o canvas quando a página entra na tela (apostilas longas).
 */
export function PdfPage({ page, scale, overlays }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const viewport = page.getViewport({ scale });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && setVisible(true), {
      rootMargin: '600px 0px',
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    const task = page.render({
      canvas,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    task.promise.catch(() => {
      // cancelado por troca de zoom ou desmontagem: nada a fazer
    });
    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, page, scale]);

  const toViewport = (x: number, y: number) => viewport.convertToViewportPoint(x, y) as number[];

  return (
    <div
      ref={containerRef}
      className="pdf-page"
      data-page={page.pageNumber}
      style={{ width: viewport.width, height: viewport.height }}
    >
      <canvas ref={canvasRef} style={{ width: viewport.width, height: viewport.height }} />
      {overlays.flatMap((overlay, overlayIndex) =>
        overlay.locations
          .filter((location) => location.page === page.pageNumber)
          .flatMap((location) =>
            location.rects.map((rect, i) => {
              const css = pdfRectToCss(rect, toViewport);
              return (
                // O grifo "passa" da esquerda para a direita, linha a linha, como um marca-texto.
                <motion.div
                  key={`${overlay.id}-${i}`}
                  className={overlay.focused ? 'mark focused' : 'mark'}
                  data-overlay={overlay.id}
                  title={overlay.title}
                  initial={{ scaleX: 0 }}
                  animate={
                    overlay.focused
                      ? { scaleX: 1, boxShadow: ['0 0 0 0px rgba(0,0,0,0)', `0 0 0 6px rgba(${overlay.color}, 0.2)`, '0 0 0 0px rgba(0,0,0,0)'] }
                      : { scaleX: 1 }
                  }
                  transition={{
                    scaleX: { duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: Math.min(overlayIndex, 12) * 0.08 + i * 0.12 },
                    boxShadow: { duration: 1.2, repeat: 1, delay: 0.5 },
                  }}
                  style={{
                    left: css.left,
                    top: css.top,
                    width: css.width,
                    height: css.height,
                    background: `rgba(${overlay.color}, ${overlay.focused ? 0.45 : 0.3})`,
                    outlineColor: `rgb(${overlay.color})`,
                  }}
                />
              );
            }),
          ),
      )}
    </div>
  );
}
