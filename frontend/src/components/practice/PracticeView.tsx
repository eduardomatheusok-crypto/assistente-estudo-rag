import { useState } from 'react';
import { api } from '../../api/client.ts';
import type { PracticeItem, PracticeSession } from '../../api/types.ts';
import { FlashcardDeck } from './FlashcardDeck.tsx';

type Props = {
  session: PracticeSession;
  onUpdate: (session: PracticeSession) => void;
  onClose: () => void;
  onOpenSource: (item: PracticeItem) => void;
};

const LETTERS = ['A', 'B', 'C', 'D'];

export function PracticeView({ session, onUpdate, onClose, onOpenSource }: Props) {
  const firstOpen = session.items.findIndex((i) => !i.attempt);
  const [index, setIndex] = useState(firstOpen === -1 ? session.items.length : firstOpen);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title =
    session.mode === 'flashcards'
      ? 'Flashcards'
      : session.persona === 'entrevistador'
        ? 'Simulação de entrevista'
        : 'Simulação de prova';
  const focus = { general: 'material todo', errors: 'seus erros', question: 'assunto da pergunta' }[session.focus];
  const item = session.items[index];

  async function run(action: () => Promise<PracticeSession>) {
    setBusy(true);
    setError(null);
    try {
      onUpdate(await action());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="practice">
      <header className="practice-header">
        <div>
          <h2>{title}</h2>
          <small className="muted">
            {session.mode === 'flashcards'
              ? `${session.goalType === 'entrevista' ? 'Perguntas para pensar' : 'Termos para explicar'} · foco: ${focus}`
              : `${session.persona === 'entrevistador' ? 'Entrevistador' : 'Examinador'} · foco: ${focus} · ${Math.min(index + 1, session.items.length)} de ${session.items.length}`}
          </small>
        </div>
        <button
          onClick={() => {
            // A rodada de flashcards só termina ao fechar (permite "gerar mais" até lá).
            if (session.mode === 'flashcards' && session.status === 'active') void api.finishPractice(session.id).catch(() => {});
            onClose();
          }}
        >
          Fechar
        </button>
      </header>

      {error && <p className="error">{error}</p>}

      {session.mode === 'flashcards' ? (
        <FlashcardDeck session={session} onUpdate={onUpdate} onOpenSource={onOpenSource} />
      ) : item ? (
        <Question
            key={item.id}
            item={item}
            busy={busy}
            onAnswer={(body) => run(() => api.answer(session.id, { itemId: item.id, ...body }))}
            onNext={() => setIndex((i) => i + 1)}
            onOpenSource={() => onOpenSource(item)}
            isLast={index === session.items.length - 1}
          />
      ) : (
        <Summary session={session} onOpenSource={onOpenSource} />
      )}
    </div>
  );
}

function Question(props: {
  item: PracticeItem;
  busy: boolean;
  isLast: boolean;
  onAnswer: (body: { option?: number; text?: string }) => void;
  onNext: () => void;
  onOpenSource: () => void;
}) {
  const { item, busy } = props;
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState('');
  const attempt = item.attempt;

  return (
    <article className="practice-card">
      <small className="topic">{item.topic}</small>
      <p className="prompt">{item.prompt}</p>

      {item.kind === 'mcq' ? (
        <ol className="options">
          {item.options!.map((option, i) => {
            const state = !attempt
              ? choice === i
                ? 'selected'
                : ''
              : i === item.correctOption
                ? 'right'
                : i === attempt.chosenOption
                  ? 'wrong'
                  : '';
            return (
              <li key={i}>
                <button className={`option ${state}`} disabled={!!attempt || busy} onClick={() => setChoice(i)}>
                  <strong>{LETTERS[i]}</strong> {option}
                </button>
              </li>
            );
          })}
        </ol>
      ) : attempt ? (
        <blockquote className="my-answer">{attempt.answerText}</blockquote>
      ) : (
        <textarea
          rows={6}
          placeholder="Responda como se estivesse na entrevista…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
      )}

      {!attempt ? (
        <button
          type="submit"
          disabled={busy || (item.kind === 'mcq' ? choice === null : !text.trim())}
          onClick={() => props.onAnswer(item.kind === 'mcq' ? { option: choice! } : { text: text.trim() })}
        >
          {busy ? (item.kind === 'open' ? 'Avaliando…' : 'Corrigindo…') : 'Responder'}
        </button>
      ) : (
        <div className={attempt.correct ? 'feedback right' : 'feedback wrong'}>
          <strong>
            {attempt.correct ? 'Acertou' : 'Não foi dessa vez'}
            {item.kind === 'open' && ` · nota ${Math.round(attempt.score * 10)}/10`}
          </strong>
          {attempt.feedback && <p>{attempt.feedback}</p>}
          {item.kind === 'open' && item.referenceAnswer && (
            <p className="muted">Pontos esperados: {item.referenceAnswer}</p>
          )}
          <SourceLink item={item} onOpen={props.onOpenSource} />
          <button type="submit" onClick={props.onNext}>{props.isLast ? 'Ver resultado' : 'Próxima'}</button>
        </div>
      )}
    </article>
  );
}

function SourceLink({ item, onOpen }: { item: PracticeItem; onOpen: () => void }) {
  return (
    <button className="source-link" onClick={onOpen}>
      Ver no material: {item.source.documentTitle}, p. {item.source.pageNumber}
    </button>
  );
}

function Summary({ session, onOpenSource }: { session: PracticeSession; onOpenSource: (item: PracticeItem) => void }) {
  const { summary } = session;
  return (
    <article className="practice-card">
      <h3>
        {session.mode === 'flashcards'
          ? `Rodada concluída: você lembrou de ${summary.correct} de ${summary.total}`
          : `Resultado: ${summary.correct} de ${summary.total} certas`}
        {session.persona === 'entrevistador' && summary.averageScore !== null &&
          ` · nota média ${(summary.averageScore * 10).toFixed(1)}/10`}
      </h3>
      <ul className="summary-list">
        {session.items.map((item) => (
          <li key={item.id} className={item.attempt?.correct ? 'right' : 'wrong'}>
            <span>{item.attempt ? (item.attempt.correct ? '✓' : '✗') : '–'}</span>
            <span>
              <strong>{item.topic}:</strong> {item.prompt}
            </span>
            <button className="source-link" onClick={() => onOpenSource(item)}>p. {item.source.pageNumber}</button>
          </li>
        ))}
      </ul>
      <p className="muted">Os erros entram em “Treinar meus erros” e nas prioridades do caderno.</p>
    </article>
  );
}
