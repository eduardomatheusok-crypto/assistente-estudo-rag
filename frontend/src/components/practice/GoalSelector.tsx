import type { GoalType } from '../../api/types.ts';

type Props = { goalType: GoalType | null; onChange: (goal: GoalType) => void };

/** Topo do chat: objetivo do caderno. Define o formato do treino (prova ou entrevista). */
export function GoalSelector({ goalType, onChange }: Props) {
  return (
    <div className="goal-bar">
      <label className="goal">
        Objetivo
        <select
          value={goalType ?? ''}
          onChange={(e) => onChange(e.target.value as GoalType)}
          className={goalType ? '' : 'attention'}
        >
          <option value="" disabled>escolha…</option>
          <option value="prova">Prova</option>
          <option value="entrevista">Entrevista</option>
        </select>
      </label>
    </div>
  );
}
