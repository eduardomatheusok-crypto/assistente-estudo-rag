import { motion } from 'motion/react';
import { useState } from 'react';
import { api } from '../../api/client.ts';
import type { PracticeItem, PracticeSession } from '../../api/types.ts';
import { FlashcardDeck } from './FlashcardDeck.tsx';
import { Interview } from './Interview.tsx';
import { McqSimulation } from './McqSimulation.tsx';

type Props = {
  session: PracticeSession;
  onUpdate: (session: PracticeSession) => void;
  onClose: () => void;
  onOpenSource: (item: PracticeItem) => void;
  chatOpen: boolean;
  onToggleChat: () => void;
};

/**
 * Treino em modo foco: abre por cima do documento. O chat da direita fica
 * recolhido; o botão "Chat" o traz de volta.
 */
export function PracticeView({ session, onUpdate, onClose, onOpenSource, chatOpen, onToggleChat }: Props) {
  const firstOpen = session.items.findIndex((i) => !i.attempt);
  const [index, setIndex] = useState(firstOpen === -1 ? session.items.length : firstOpen);
  const [shuffleSignal, setShuffleSignal] = useState(0);

  const kind = session.mode === 'flashcards' ? 'flashcards' : session.goalType === 'entrevista' ? 'interview' : 'mcq';
  const title = { flashcards: 'Flashcards', interview: 'Simulação de entrevista', mcq: 'Simulação de prova' }[kind];
  const topic = session.items[0]?.topic;
  const subtitle =
    kind === 'flashcards'
      ? session.goalType === 'entrevista'
        ? 'perguntas para pensar'
        : 'termos para explicar'
      : `${kind === 'interview' ? 'Entrevistador' : 'Examinador'} · ${index < session.items.length ? `${kind === 'interview' ? 'pergunta' : 'questão'} ${index + 1} de ${session.items.length}` : 'resultado'}`;

  function close() {
    // Flashcards e entrevista só terminam ao fechar (permitem "gerar mais" e "tentar de novo").
    if (session.status === 'active' && kind !== 'mcq') void api.finishPractice(session.id).catch(() => {});
    onClose();
  }

  return (
    <motion.section
      className="practice"
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="toolbar">
        <h2>
          <span className="crumb">{title} ·</span> {topic ?? ''} <span className="muted" style={{ fontWeight: 500 }}>· {subtitle}</span>
        </h2>
        {kind !== 'flashcards' && (
          <div className="steps" aria-hidden="true">
            {session.items.map((it, i) => (
              <i key={it.id} className={i === index ? 'now' : it.attempt ? (it.attempt.correct ? 'done' : 'bad') : ''} />
            ))}
          </div>
        )}
        {kind === 'flashcards' && <button onClick={() => setShuffleSignal((n) => n + 1)} title="Embaralhar">⤨ Embaralhar</button>}
        <button className={chatOpen ? 'chat-toggle on' : 'chat-toggle'} onClick={onToggleChat} aria-pressed={chatOpen}>
          Chat
        </button>
        <button onClick={close}>Fechar</button>
      </div>

      {kind === 'flashcards' && <FlashcardDeck session={session} onUpdate={onUpdate} onOpenSource={onOpenSource} shuffleSignal={shuffleSignal} />}
      {kind === 'mcq' && <McqSimulation session={session} index={index} onIndex={setIndex} onUpdate={onUpdate} onOpenSource={onOpenSource} />}
      {kind === 'interview' && <Interview session={session} index={index} onIndex={setIndex} onUpdate={onUpdate} onOpenSource={onOpenSource} />}
    </motion.section>
  );
}
