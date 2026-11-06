import { z } from 'zod';

/**
 * Formato de um dataset de avaliação (JSON).
 *
 * A evidência é dada como TEXTO literal do documento, e não como id de chunk:
 * assim o mesmo dataset serve para qualquer tamanho de chunk.
 */
const evidenceSchema = z.object({
  /** id do documento em `documents`. */
  document: z.string().min(1),
  /** Trecho literal do documento que responde à pergunta. */
  text: z.string().trim().min(1),
});

const answerableSchema = z.object({
  id: z.string().min(1),
  question: z.string().trim().min(1),
  answerable: z.literal(true),
  /** Resposta de referência, usada pelo juiz para avaliar a correção. */
  referenceAnswer: z.string().trim().min(1),
  evidence: z.array(evidenceSchema).min(1),
});

const unanswerableSchema = z.object({
  id: z.string().min(1),
  question: z.string().trim().min(1),
  /** false = o material não responde; o esperado é "não encontrei no material". */
  answerable: z.literal(false),
  note: z.string().optional(),
});

export const datasetSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    documents: z
      .array(
        z.object({
          id: z.string().min(1),
          /** Caminho relativo ao arquivo do dataset. */
          file: z.string().min(1),
          title: z.string().optional(),
        }),
      )
      .min(1),
    questions: z.array(z.discriminatedUnion('answerable', [answerableSchema, unanswerableSchema])).min(1),
  })
  .superRefine((dataset, ctx) => {
    const documentIds = new Set(dataset.documents.map((d) => d.id));
    if (documentIds.size !== dataset.documents.length) {
      ctx.addIssue({ code: 'custom', message: 'ids de documentos repetidos' });
    }
    const questionIds = new Set(dataset.questions.map((q) => q.id));
    if (questionIds.size !== dataset.questions.length) {
      ctx.addIssue({ code: 'custom', message: 'ids de perguntas repetidos' });
    }
    for (const question of dataset.questions) {
      if (!question.answerable) continue;
      for (const evidence of question.evidence) {
        if (!documentIds.has(evidence.document)) {
          ctx.addIssue({
            code: 'custom',
            message: `pergunta ${question.id}: documento "${evidence.document}" não existe em documents`,
          });
        }
      }
    }
  });

export type Dataset = z.infer<typeof datasetSchema>;
export type DatasetQuestion = Dataset['questions'][number];

export function parseDataset(json: unknown): Dataset {
  const result = datasetSchema.safeParse(json);
  if (!result.success) throw new Error(`Dataset inválido:\n${z.prettifyError(result.error)}`);
  return result.data;
}
