import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { api } from '../../api/client.ts';
import type { PracticeItem, PracticeSession } from '../../api/types.ts';
import { confettiFrom } from '../../lib/confetti.ts';
import { useToast } from '../Toasts.tsx';

type Props = {
  session: PracticeSession;
  index: number;
  onIndex: (index: number) => void;
  onUpdate: (session: PracticeSession) => void;
  onOpenSource: (item: PracticeItem) => void;
};

const LETTERS = ['A', 'B', 'C', 'D'];
const ease = [0.22, 1, 0.36, 1] as const;

/** Simulação de prova (Examinador): a certa brilha em verde, a errada treme, a explicação se abre. */
export function McqSimulation({ session, index, onIndex, onUpdate, onOpenSource }: Props) {
  const item = session.items[index];
  return (
    <div className="scroll">
      <div className="sim">
        <div className="bar" aria-label={`Questão ${Math.min(index + 1, session.items.length)} de ${session.items.length}`}>
          <motion.i animate={{ width: `${(Math.min(index, session.items.length) / session.items.length) * 100}%` }} transition={{ duration: 0.6, ease }} />
        </div>
        <AnimatePresence mode="wait">
          {item ? (
            <Question
              key={item.id}
              session={session}
              item={item}
              isLast={index === session.items.length - 1}
              onNext={() => onIndex(index + 1)}
              onUpdate={onUpdate}
              onOpenSource={() => onOpenSource(item)}
            />
          ) : (
            <Summary key="summary" session={session} onOpenSource={onOpenSource} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Question(props: {
  session: PracticeSession;
  item: PracticeItem;
  isLast: boolean;
  onNext: () => void;
  onUpdate: (session: PracticeSession) => void;
  onOpenSource: () => void;
}) {
  const { item, session } = props;
  const notify = useToast();
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const rightRef = useRef<HTMLButtonElement>(null);
  const attempt = item.attempt;

  async function answer() {
    if (choice === null) return notify('Escolha uma alternativa.');
    setBusy(true);
    try {
      const updated = await api.answer(session.id, { itemId: item.id, option: choice });
      props.onUpdate(updated);
      const result = updated.items.find((i) => i.id === item.id)?.attempt;
      if (result?.correct) setTimeout(() => confettiFrom(rightRef.current), 80);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.article
      className="qcard"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35, ease }}
    >
      <span className="topic">{item.topic}</span>
      <p className="prompt">{item.prompt}</p>
      {item.options!.map((option, i) => {
        const state = !attempt
          ? choice === i
            ? 'sel'
            : ''
          : i === item.correctOption
            ? 'right'
            : i === attempt.chosenOption
              ? 'wrong'
              : '';
        return (
          <motion.button
            key={i}
            ref={i === item.correctOption ? rightRef : undefined}
            className={`opt ${state}`}
            disabled={!!attempt || busy}
            onClick={() => setChoice(i)}
            whileHover={attempt ? undefined : { x: 3 }}
            animate={
              state === 'wrong'
                ? { x: [0, -10, 10, -10, 10, 0] }
                : state === 'right'
                  ? { boxShadow: ['0 0 0 0 rgba(31,138,76,.4)', '0 0 0 12px rgba(31,138,76,0)'] }
                  : { x: 0 }
            }
            transition={{ duration: state === 'right' ? 0.8 : 0.45 }}
          >
            <b>{LETTERS[i]}</b>
            {option}
          </motion.button>
        );
      })}

      {!attempt ? (
        <motion.button className="primary" disabled={busy || choice === null} onClick={answer} whileTap={{ scale: 0.96 }} style={{ alignSelf: 'flex-start' }}>
          {busy ? 'Corrigindo…' : 'Responder'}
        </motion.button>
      ) : (
        <motion.div
          className={attempt.correct ? 'fb ok' : 'fb'}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.45, ease }}
        >
          <b>{attempt.correct ? 'Acertou!' : 'Não foi dessa vez'}</b>
          {attempt.feedback && <p>{attempt.feedback}</p>}
          <button className="link" onClick={props.onOpenSource}>
            Ver no material: {item.source.documentTitle}, p. {item.source.pageNumber}
          </button>
          <motion.button className="primary" onClick={props.onNext} whileTap={{ scale: 0.96 }}>
            {props.isLast ? 'Ver resultado' : 'Próxima'}
          </motion.button>
        </motion.div>
      )}
    </motion.article>
  );
}

function Summary({ session, onOpenSource }: { session: PracticeSession; onOpenSource: (item: PracticeItem) => void }) {
  const { summary } = session;
  return (
    <motion.article
      className="qcard"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <h3>
        Resultado: {summary.correct} de {summary.total} certas
      </h3>
      <ul className="summary-list">
        {session.items.map((item, i) => (
          <motion.li key={item.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <span className={item.attempt?.correct ? 'ok' : 'bad'}>{item.attempt ? (item.attempt.correct ? '✓' : '✗') : '–'}</span>
            <span>
              <strong>{item.topic}:</strong> {item.prompt}
            </span>
            <button className="link" onClick={() => onOpenSource(item)}>p. {item.source.pageNumber}</button>
          </motion.li>
        ))}
      </ul>
      <p className="muted">Os erros alimentam o seu desempenho por assunto na tela inicial do caderno.</p>
    </motion.article>
  );
}
