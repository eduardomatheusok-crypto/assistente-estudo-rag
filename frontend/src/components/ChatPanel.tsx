import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api/client.ts';
import type { Citation, Question } from '../api/types.ts';
import { splitAnswer } from '../lib/answer.ts';
import { useToast } from './Toasts.tsx';

type Props = {
  notebookId: string;
  header: ReactNode;
  onOpenCitation: (citation: Citation) => void;
  /** "Treinar este assunto" a partir de uma resposta. */
  onTrainQuestion: (questionId: string, mode: 'flashcards' | 'simulation') => void;
  practiceBusy: boolean;
  onAsked: () => void;
};

const rise = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
};

/** Resposta: as palavras chegam em sequência (só na resposta recém-recebida). */
function Answer({ question, fresh, onOpenCitation }: { question: Question; fresh: boolean; onOpenCitation: (c: Citation) => void }) {
  const parts = splitAnswer(question.answer);
  let wordIndex = 0;
  const delayOf = () => (fresh ? wordIndex++ * 0.035 : 0);
  return (
    <p>
      {parts.map((part, i) => {
        if (part.kind === 'text') {
          return part.text.split(/(\s+)/).map((token, j) =>
            /^\s+$/.test(token) || !token ? (
              token
            ) : (
              <motion.span
                key={`${i}-${j}`}
                initial={fresh ? { opacity: 0, filter: 'blur(3px)' } : false}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                transition={{ duration: 0.25, delay: delayOf() }}
              >
                {token}
              </motion.span>
            ),
          );
        }
        const citation = question.citations.find((c) => c.label === part.label);
        if (!citation) return null;
        return (
          <motion.button
            key={i}
            className="src"
            onClick={() => onOpenCitation(citation)}
            title={citation.quote}
            initial={fresh ? { scale: 0 } : false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18, delay: delayOf() + 0.1 }}
          >
            {part.label}
          </motion.button>
        );
      })}
    </p>
  );
}

export function ChatPanel({ notebookId, header, onOpenCitation, onTrainQuestion, practiceBusy, onAsked }: Props) {
  const notify = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuestions([]);
    setFreshId(null);
    api.listQuestions(notebookId).then(setQuestions).catch((e: Error) => notify(e.message, 'error'));
  }, [notebookId, notify]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [questions, pending]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || pending) return;
    setDraft('');
    setPending(question);
    try {
      const answer = await api.ask(notebookId, question);
      setFreshId(answer.id);
      setQuestions((list) => [...list, answer]);
      onAsked();
    } catch (e) {
      notify((e as Error).message, 'error');
      setDraft(question);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="chat">
      {header}
      <div className="chat-log">
        {questions.length === 0 && !pending && (
          <p className="muted">Pergunte algo sobre os documentos deste caderno. As respostas usam só o material e citam a página.</p>
        )}
        {questions.map((q) => {
          const fresh = q.id === freshId;
          const after = fresh ? q.answer.split(/\s+/).length * 0.035 + 0.2 : 0;
          return (
            <motion.article key={q.id} className="exchange" style={{ display: 'flex', flexDirection: 'column', gap: 8 }} {...(fresh ? rise : {})}>
              <div className="q">{q.question}</div>
              <div className={q.status === 'answered' ? 'a' : 'a refused'}>
                <Answer question={q} fresh={fresh} onOpenCitation={onOpenCitation} />
                {q.citations.length > 0 && (
                  <motion.div
                    className="cites"
                    initial={fresh ? { opacity: 0, y: 6 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: after }}
                  >
                    {q.citations.map((c) => (
                      <button key={c.id} onClick={() => onOpenCitation(c)}>
                        <span className="src">{c.label}</span> {c.documentTitle}, p. {c.pageNumber}
                        <q>{c.quote}</q>
                      </button>
                    ))}
                  </motion.div>
                )}
                {q.status === 'answered' && q.citations.length > 0 && (
                  <motion.div
                    className="train"
                    initial={fresh ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{ delay: after + 0.15 }}
                  >
                    Treinar este assunto:
                    <button disabled={practiceBusy} onClick={() => onTrainQuestion(q.id, 'flashcards')}>Flashcards</button>
                    <button disabled={practiceBusy} onClick={() => onTrainQuestion(q.id, 'simulation')}>Simulação</button>
                  </motion.div>
                )}
              </div>
            </motion.article>
          );
        })}
        <AnimatePresence>
          {pending && (
            <motion.div key="pending" style={{ display: 'flex', flexDirection: 'column', gap: 8 }} {...rise} exit={{ opacity: 0 }}>
              <div className="q">{pending}</div>
              <div className="skel" aria-label="Buscando no material">
                <i style={{ width: '92%' }} />
                <i style={{ width: '78%' }} />
                <i style={{ width: '55%' }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
      <form className="ask" onSubmit={ask}>
        <label className="visually-hidden" htmlFor="question">Pergunta ao material</label>
        <textarea
          id="question"
          rows={1}
          placeholder="Ex.: O que a derivada mede?"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) ask(e);
          }}
        />
        <motion.button className="primary" type="submit" disabled={!draft.trim() || !!pending} whileTap={{ scale: 0.95 }}>
          Perguntar
        </motion.button>
      </form>
    </div>
  );
}
