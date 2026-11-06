import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.ts';
import type { PracticeItem, PracticeSession } from '../../api/types.ts';
import { confettiFrom } from '../../lib/confetti.ts';
import { shuffled } from '../../lib/shuffle.ts';
import { useToast } from '../Toasts.tsx';

type Props = {
  session: PracticeSession;
  onUpdate: (session: PracticeSession) => void;
  onOpenSource: (item: PracticeItem) => void;
  /** O botão "Embaralhar" fica na barra do topo; este número muda a cada clique. */
  shuffleSignal: number;
};

const MORE_OPTIONS = [5, 10, 15] as const;

/**
 * Flashcards: frente com o tema, clique para virar. Depois de virar, Errei/Acertei
 * (repetição espaçada no backend). Acertei solta confete; Errei faz o cartão tremer.
 */
export function FlashcardDeck({ session, onUpdate, onOpenSource, shuffleSignal }: Props) {
  const notify = useToast();
  const [order, setOrder] = useState<string[]>(() => session.items.map((i) => i.id));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const yesRef = useRef<HTMLButtonElement>(null);

  // Cartões novos ("gerar mais") entram no fim da ordem atual.
  useEffect(() => {
    setOrder((current) => [...current, ...session.items.map((i) => i.id).filter((id) => !current.includes(id))]);
  }, [session.items]);

  useEffect(() => {
    if (shuffleSignal === 0) return;
    setOrder((o) => shuffled(o));
    setIndex(0);
    setFlipped(false);
    notify('Cartões embaralhados');
  }, [shuffleSignal, notify]);

  const byId = new Map(session.items.map((i) => [i.id, i]));
  const item = index < order.length ? byId.get(order[index]!) : undefined;
  const isQuestion = session.goalType === 'entrevista';

  const go = (next: number) => {
    setIndex(Math.max(0, Math.min(order.length, next)));
    setFlipped(false);
  };

  async function review(correct: boolean) {
    if (!item || busy) return;
    if (item.attempt) return go(index + 1); // já marcado nesta rodada: só avança
    setBusy(true);
    try {
      if (correct) confettiFrom(yesRef.current);
      else {
        setShaking(true);
        await new Promise((r) => setTimeout(r, 420));
        setShaking(false);
      }
      onUpdate(await api.review(session.id, item.id, correct));
      go(index + 1);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function more(count: (typeof MORE_OPTIONS)[number]) {
    setBusy(true);
    try {
      const start = order.length;
      onUpdate(await api.moreCards(session.id, count));
      setIndex(start);
      setFlipped(false);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const reviewed = session.items.filter((i) => i.attempt);
  const remembered = reviewed.filter((i) => i.attempt!.correct).length;

  return (
    <div className="deck">
      <div className="dots" aria-hidden="true">
        {order.map((id, i) => {
          const a = byId.get(id)?.attempt;
          return <i key={id} className={i === index ? 'now' : a ? (a.correct ? 'ok' : 'bad') : ''} />;
        })}
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {item ? (
          <motion.button
            key={item.id}
            className="flip"
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? 'Mostrar a frente' : 'Mostrar a resposta'}
            initial={{ x: 120, rotate: 6, opacity: 0 }}
            animate={shaking ? { x: [0, -10, 10, -10, 10, 0], rotate: 0, opacity: 1 } : { x: 0, rotate: 0, opacity: 1 }}
            exit={{ x: -120, rotate: -8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <motion.div className="flip-in" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: 'spring', stiffness: 160, damping: 18 }}>
              <div className="face front">
                <span className="tag">{isQuestion ? 'Pergunta' : 'Termo'}</span>
                <span className={isQuestion ? 'term question' : 'term'}>{item.prompt}</span>
                <span className="hint">clique para ver a resposta</span>
              </div>
              <div className="face back">
                <span className="tag">Resposta</span>
                <span>{item.referenceAnswer}</span>
              </div>
            </motion.div>
          </motion.button>
        ) : (
          <motion.div
            key="end"
            className="end-card"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            <h3>
              Você lembrou de {remembered} de {reviewed.length}
            </h3>
            <p className="muted">Os que você errou voltam antes na repetição espaçada.</p>
            <div className="more">
              <span>Gerar mais cartões:</span>
              {MORE_OPTIONS.map((n) => (
                <motion.button key={n} disabled={busy} onClick={() => more(n)} whileTap={{ scale: 0.93 }}>
                  {busy ? '…' : `+${n}`}
                </motion.button>
              ))}
            </div>
            <button className="link" onClick={() => go(0)}>Rever do início</button>
          </motion.div>
        )}
      </AnimatePresence>

      {item && (
        <>
          <div className="deck-controls">
            <button onClick={() => go(index - 1)} disabled={index === 0} aria-label="Cartão anterior">‹</button>
            <span>
              {index + 1} / {order.length}
            </span>
            <button onClick={() => go(index + 1)} aria-label="Próximo cartão">›</button>
          </div>
          <div className="rate">
            <motion.button className="no" disabled={!flipped || busy} onClick={() => review(false)} whileTap={{ scale: 0.95 }}>
              Errei
            </motion.button>
            <motion.button ref={yesRef} className="yes" disabled={!flipped || busy} onClick={() => review(true)} whileTap={{ scale: 0.95 }}>
              Acertei
            </motion.button>
          </div>
          {item.attempt && <small className="muted">Marcado como {item.attempt.correct ? 'acertei' : 'errei'} nesta rodada.</small>}
          <button className="link" onClick={() => onOpenSource(item)}>
            Ver no material: {item.source.documentTitle}, p. {item.source.pageNumber}
          </button>
        </>
      )}
    </div>
  );
}
