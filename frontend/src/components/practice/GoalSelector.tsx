import { motion } from 'motion/react';
import type { GoalType } from '../../api/types.ts';

type Props = { goalType: GoalType | null; onChange: (goal: GoalType) => void };

const OPTIONS: Array<[GoalType, string]> = [
  ['prova', 'Prova'],
  ['entrevista', 'Entrevista'],
];

/** Topo do chat: objetivo do caderno. A pílula branca desliza com mola até a opção escolhida. */
export function GoalSelector({ goalType, onChange }: Props) {
  return (
    <div className="goal-bar">
      Objetivo
      <div className={goalType ? 'seg' : 'seg attention'} role="radiogroup" aria-label="Objetivo do caderno">
        {OPTIONS.map(([value, label]) => (
          <button
            key={value}
            role="radio"
            aria-checked={goalType === value}
            className={goalType === value ? 'active' : ''}
            onClick={() => onChange(value)}
          >
            {goalType === value && (
              <motion.span layoutId="goal-knob" className="seg-knob" transition={{ type: 'spring', stiffness: 520, damping: 30 }} />
            )}
            <span>{label}</span>
          </button>
        ))}
      </div>
      {!goalType && <small>escolha para treinar</small>}
    </div>
  );
}
