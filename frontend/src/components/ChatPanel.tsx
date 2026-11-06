import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api/client.ts';
import type { Citation, Question } from '../api/types.ts';
import { splitAnswer } from '../lib/answer.ts';

type Props = {
  notebookId: string;
  onOpenCitation: (citation: Citation) => void;
  /** Topo do chat (objetivo + treinar meus erros). */
  header: ReactNode;
  /** "Treinar este assunto" a partir de uma resposta. */
  onTrainQuestion: (questionId: string, mode: 'flashcards' | 'simulation') => void;
  practiceBusy: boolean;
};

/** Perguntas ao material. Cada [S1] da resposta e cada citação abaixo dela abrem o trecho original. */
export function ChatPanel({ notebookId, onOpenCitation, header, onTrainQuestion, practiceBusy }: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuestions([]);
    api.listQuestions(notebookId).then(setQuestions).catch((e: Error) => setError(e.message));
  }, [notebookId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [questions, pending]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || pending) return;
    setDraft('');
    setPending(question);
    setError(null);
    try {
      const answer = await api.ask(notebookId, question);
      setQuestions((list) => [...list, answer]);
    } catch (e) {
      setError((e as Error).message);
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
          <p className="muted">Pergunte algo sobre os documentos deste caderno. As respostas usam só o material.</p>
        )}
        {questions.map((q) => (
          <article key={q.id} className="exchange">
            <p className="question">{q.question}</p>
            <div className={q.status === 'answered' ? 'answer' : 'answer refused'}>
              <p>
                {splitAnswer(q.answer).map((part, i) => {
                  if (part.kind === 'text') return <span key={i}>{part.text}</span>;
                  const citation = q.citations.find((c) => c.label === part.label);
                  return citation ? (
                    <button key={i} className="source-chip" onClick={() => onOpenCitation(citation)} title={citation.quote}>
                      {part.label}
                    </button>
                  ) : null;
                })}
              </p>
              {q.citations.length > 0 && (
                <ul className="citations">
                  {q.citations.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => onOpenCitation(c)}>
                        <span className="source-chip">{c.label}</span> {c.documentTitle}, p. {c.pageNumber}
                        <q>{c.quote}</q>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {q.status === 'answered' && q.citations.length > 0 && (
                <div className="train-shortcuts">
                  <span>Treinar este assunto:</span>
                  <button disabled={practiceBusy} onClick={() => onTrainQuestion(q.id, 'flashcards')}>Flashcards</button>
                  <button disabled={practiceBusy} onClick={() => onTrainQuestion(q.id, 'simulation')}>Simulação</button>
                </div>
              )}
            </div>
          </article>
        ))}
        {pending && (
          <article className="exchange">
            <p className="question">{pending}</p>
            <div className="answer muted">Buscando no material…</div>
          </article>
        )}
        <div ref={endRef} />
      </div>
      {error && <p className="error">{error}</p>}
      <form className="chat-form" onSubmit={ask}>
        <textarea
          placeholder="Ex.: O que a derivada mede?"
          value={draft}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) ask(e);
          }}
        />
        <button type="submit" disabled={!draft.trim() || !!pending}>Perguntar</button>
      </form>
    </div>
  );
}
