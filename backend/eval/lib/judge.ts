import { z } from 'zod';

/**
 * Juiz LLM: compara a resposta do assistente com a referência (correção) e
 * com as fontes que ele recebeu (fidelidade). É uma estimativa automática,
 * não a verdade: vale revisar uma amostra à mão.
 */
export const judgeSchema = z.object({
  correct: z
    .boolean()
    .describe('true se a resposta transmite as informações essenciais da referência.'),
  faithful: z
    .boolean()
    .describe('true se TODA afirmação da resposta está sustentada pelas fontes.'),
  unsupportedClaims: z.array(z.string()).describe('Afirmações da resposta sem sustentação nas fontes.'),
  justification: z.string().describe('Uma ou duas frases explicando o veredito.'),
});

export type JudgeVerdict = z.infer<typeof judgeSchema>;

export const JUDGE_SYSTEM_PROMPT = `Você avalia respostas de um assistente de estudos que deve responder SOMENTE com base em fontes fornecidas.

Você recebe: a pergunta, uma resposta de referência, a resposta do assistente e as fontes que o assistente recebeu.

Avalie dois critérios, de forma independente:

1. correct: a resposta do assistente transmite as informações essenciais da resposta de referência?
   - Outras palavras são aceitas.
   - Informação extra correta não penaliza.
   - Omitir parte essencial ou contradizer a referência torna a resposta incorreta.

2. faithful: toda afirmação da resposta do assistente está sustentada pelas fontes?
   - Ignore os marcadores [S1], [S2].
   - Uma afirmação verdadeira no mundo, mas ausente das fontes, NÃO é sustentada.
   - Liste em unsupportedClaims cada afirmação sem sustentação.

Seja rigoroso e objetivo. Responda em português.`;

export function buildJudgePrompt(input: {
  question: string;
  referenceAnswer: string;
  answer: string;
  sources: Array<{ label: string; text: string }>;
}): string {
  const sources = input.sources.map((s) => `<fonte id="${s.label}">\n${s.text}\n</fonte>`).join('\n\n');
  return [
    `Pergunta: ${input.question}`,
    `Resposta de referência: ${input.referenceAnswer}`,
    `Resposta do assistente: ${input.answer}`,
    `Fontes que o assistente recebeu:\n\n${sources}`,
  ].join('\n\n');
}

export function judgeJsonSchema(): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(judgeSchema) as Record<string, unknown>;
  return schema;
}

/** Valida a saída do juiz; null se for inválida (a pergunta fica sem veredito). */
export function parseVerdict(text: string, finishReason: string): JudgeVerdict | null {
  if (finishReason !== 'STOP') return null;
  try {
    const result = judgeSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
