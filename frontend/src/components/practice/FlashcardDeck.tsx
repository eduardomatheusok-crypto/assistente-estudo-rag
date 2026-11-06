import { useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import type { PracticeItem, PracticeSession } from '../../api/types.ts';
import { shuffled } from '../../lib/shuffle.ts';

type Props = {
  session: PracticeSession;
  onUpdate: (session: PracticeSession) => void;
  onOpenSource: (item: PracticeItem) => void;
};

const MORE_OPTIONS = [5, 10, 15] as const;

/**
 * Flashcards no estilo Gemini: frente com o tema, clique para virar e ver a
 * resposta. Depois de virar, o estudante marca Errei/Acertei (repetição
 * espaçada no backend). Embaralhar e navegar não chamam a API.
 */
export function FlashcardDeck({ session, onUpdate, onOpenSource }: Props) {
  const [order, setOrder] = useState<string[]>(() => session.items.map((i) => i.id));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cartões novos ("gerar mais") entram no fim da ordem atual.
  useEffect(() => {
    setOrder((current) => [...current, ...session.items.map((i) => i.id).filter((id) => !current.includes(id))]);
  }, [session.items]);

  const byId = new Map(session.items.map((i) => [i.id, i]));
  const item = index < order.length ? byId.get(order[index]!) : undefined;

  const go = (next: number) => {
    setIndex(Math.max(0, Math.min(order.length, next)));
    setFlipped(false);
  };

  async function review(correct: boolean) {
    if (!item) return;
    if (item.attempt) return go(index + 1); // já marcado nesta rodada: só avança
    setBusy(true);
    setError(null);
    try {
      onUpdate(await api.review(session.id, item.id, correct));
      go(index + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function more(count: (typeof MORE_OPTIONS)[number]) {
    setBusy(true);
    setError(null);
    try {
      const start = order.length;
      onUpdate(await api.moreCards(session.id, count));
      setIndex(start);
      setFlipped(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="deck">
      {error && <p className="error">{error}</p>}

      {item ? (
        <>
          <button
            className={flipped ? 'flashcard-3d flipped' : 'flashcard-3d'}
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? 'Mostrar a frente' : 'Mostrar a resposta'}
          >
            <span className="face front">
              <span className="face-text">{item.prompt}</span>
              <span className="face-hint">clique para ver a resposta</span>
            </span>
            <span className="face back">
              <span className="badge">Resposta</span>
              <span className="face-text">{item.referenceAnswer}</span>
            </span>
          </button>

          <div className="deck-controls">
            <button onClick={() => go(index - 1)} disabled={index === 0} aria-label="Cartão anterior">‹</button>
            <span>
              {index + 1} / {order.length}
            </span>
            <button onClick={() => go(index + 1)} aria-label="Próximo cartão">›</button>
            <button
              onClick={() => {
                setOrder((o) => shuffled(o));
                go(0);
              }}
              title="Embaralhar"
              aria-label="Embaralhar"
            >
              ⤨
            </button>
          </div>

          <div className="review-buttons">
            <button className="wrong-btn" disabled={!flipped || busy} onClick={() => review(false)}>Errei</button>
            <button className="right-btn" disabled={!flipped || busy} onClick={() => review(true)}>Acertei</button>
          </div>
          {item.attempt && (
            <small className="muted">Marcado como {item.attempt.correct ? 'acertei' : 'errei'} nesta rodada.</small>
          )}
          <button className="source-link" onClick={() => onOpenSource(item)}>
            Ver no material: {item.source.documentTitle}, p. {item.source.pageNumber}
          </button>
        </>
      ) : (
        <div className="practice-card">
          <h3>
            Fim dos cartões: você lembrou de {session.summary.correct} de {session.summary.answered}
          </h3>
          <p className="muted">Os que você errou voltam antes na repetição espaçada.</p>
          <div className="more">
            <span>Gerar mais cartões:</span>
            {MORE_OPTIONS.map((n) => (
              <button key={n} disabled={busy} onClick={() => more(n)}>
                {busy ? '…' : `+${n}`}
              </button>
            ))}
          </div>
          <button className="link" onClick={() => go(0)}>Rever do início</button>
        </div>
      )}
    </div>
  );
}
