import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.ts';
import type { GoalType, Priority } from '../../api/types.ts';

type StartBody = { mode: 'simulation' | 'flashcards'; focus: 'general' | 'errors' };

type Props = {
  notebookId: string;
  goalType: GoalType | null;
  onGoalChange: (goal: GoalType) => void;
  onStart: (body: StartBody) => void;
  /** Abre no documento o trecho de um erro recente do assunto. */
  onOpenSource: (itemId: string) => void;
  busy: boolean;
};

/** Topo do chat: objetivo do caderno + "Treinar meus erros" (com as prioridades) + simulado geral. */
export function PracticeMenu({ notebookId, goalType, onGoalChange, onStart, onOpenSource, busy }: Props) {
  const [open, setOpen] = useState(false);
  const [priorities, setPriorities] = useState<Priority[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setPriorities(null);
    api.priorities(notebookId).then(setPriorities).catch(() => setPriorities([]));
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, notebookId]);

  const start = (body: StartBody) => {
    setOpen(false);
    onStart(body);
  };

  return (
    <div className="practice-menu" ref={ref}>
      <label className="goal">
        Objetivo
        <select
          value={goalType ?? ''}
          onChange={(e) => onGoalChange(e.target.value as GoalType)}
          className={goalType ? '' : 'attention'}
        >
          <option value="" disabled>escolha…</option>
          <option value="prova">Prova</option>
          <option value="entrevista">Entrevista</option>
        </select>
      </label>
      <button onClick={() => setOpen((o) => !o)} disabled={busy}>
        Treinar meus erros ▾
      </button>

      {open && (
        <div className="dropdown">
          <div className="dropdown-actions">
            <button onClick={() => start({ mode: 'flashcards', focus: 'errors' })}>Treinar com Flashcards</button>
            <button onClick={() => start({ mode: 'simulation', focus: 'errors' })}>Treinar com Simulações</button>
          </div>
          <h3>Prioridades</h3>
          {priorities === null ? (
            <p className="muted">Carregando…</p>
          ) : priorities.length === 0 ? (
            <p className="muted">Sem erros registrados ainda. Faça uma simulação para descobrir o que priorizar.</p>
          ) : (
            <ol className="priorities">
              {priorities.map((p) => (
                <li key={p.topic}>
                  <strong>{p.topic}</strong>
                  <small>{p.justification}</small>
                  {p.source && (
                    <button className="source-link" onClick={() => onOpenSource(p.source!.itemId)}>
                      ver no material, p. {p.source.pageNumber}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
          <hr />
          <button className="link" onClick={() => start({ mode: 'simulation', focus: 'general' })}>
            Simulado geral (material todo)
          </button>
        </div>
      )}
    </div>
  );
}
