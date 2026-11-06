import { z } from 'zod';

/** Formato que o LLM deve devolver. É validado com Zod mesmo com o schema enviado ao provedor. */
export const llmAnswerSchema = z.object({
  status: z
    .enum(['answered', 'not_found'])
    .describe('"not_found" quando as fontes não contêm a resposta.'),
  answer: z
    .string()
    .describe('Resposta em português com marcadores [S1], [S2]... após cada afirmação. Vazia se not_found.'),
  citations: z
    .array(
      z.object({
        source: z.string().describe('Identificador da fonte, ex.: "S1".'),
        quote: z.string().describe('Trecho copiado LITERALMENTE da fonte, sem nenhuma alteração.'),
      }),
    )
    .describe('Uma entrada para cada trecho que comprova a resposta. Vazia se not_found.'),
});

export type LlmAnswer = z.infer<typeof llmAnswerSchema>;

/** JSON Schema enviado ao provedor (sem a chave $schema, que não faz parte do subconjunto aceito). */
export function llmAnswerJsonSchema(): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(llmAnswerSchema) as Record<string, unknown>;
  return schema;
}
