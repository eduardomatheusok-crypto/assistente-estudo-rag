export type AnswerFormat = 'free' | 'guided' | 'star';

export type FormatSpec = { label: string; hint: string; fields: Array<{ label: string; placeholder: string }> };

/** Modos de resposta da entrevista: ajudam o estudante a estruturar o que vai dizer. */
export const FORMATS: Record<AnswerFormat, FormatSpec> = {
  free: {
    label: 'Livre',
    hint: 'Escreva como falaria na entrevista',
    fields: [{ label: 'Sua resposta', placeholder: 'Fale com naturalidade, como numa conversa.' }],
  },
  guided: {
    label: 'Guiada',
    hint: 'Definição → Exemplo → Por que importa',
    fields: [
      { label: 'Definição', placeholder: 'O que é, em uma frase.' },
      { label: 'Exemplo', placeholder: 'Um caso concreto.' },
      { label: 'Por que importa', placeholder: 'Onde isso é usado.' },
    ],
  },
  star: {
    label: 'STAR',
    hint: 'Situação → Tarefa → Ação → Resultado',
    fields: [
      { label: 'Situação', placeholder: 'O contexto.' },
      { label: 'Tarefa', placeholder: 'O seu objetivo.' },
      { label: 'Ação', placeholder: 'O que você fez.' },
      { label: 'Resultado', placeholder: 'O que mudou.' },
    ],
  },
};

/**
 * Junta os campos numa resposta só. Nos modos com partes, cada parte vira uma
 * linha com o rótulo ("Definição: ..."); partes vazias são ignoradas.
 */
export function composeAnswer(format: AnswerFormat, values: string[]): string {
  const spec = FORMATS[format];
  return spec.fields
    .map((field, i) => {
      const value = (values[i] ?? '').trim();
      if (!value) return '';
      return spec.fields.length > 1 ? `${field.label}: ${value}` : value;
    })
    .filter(Boolean)
    .join('\n');
}

/** Palavras por minuto de uma fala tranquila em português. */
export const WORDS_PER_MINUTE = 130;
export const IDEAL_SECONDS = { min: 45, max: 120 } as const;

export type SpeechEstimate = { words: number; seconds: number; status: 'short' | 'ideal' | 'long' };

/** Estima quanto tempo a resposta levaria falada (ajuda a não ficar curta nem prolixa). */
export function speechEstimate(text: string): SpeechEstimate {
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const seconds = Math.round((words / WORDS_PER_MINUTE) * 60);
  const status = seconds < IDEAL_SECONDS.min ? 'short' : seconds > IDEAL_SECONDS.max ? 'long' : 'ideal';
  return { words, seconds, status };
}
