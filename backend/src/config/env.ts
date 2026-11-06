import { z } from 'zod';
import { THINKING_LEVELS } from '../providers/llm/gemini-llm-provider.ts';

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3333),
    STORAGE_DIR: z.string().default('./storage'),
    MAX_UPLOAD_MB: z.coerce.number().positive().default(50),
    CHUNK_SIZE: z.coerce.number().int().default(1000),
    CHUNK_OVERLAP: z.coerce.number().int().default(150),
    // "fake" gera vetores locais determinísticos: útil sem chave de API, nunca para avaliação real.
    EMBEDDING_PROVIDER: z.enum(['gemini', 'fake']).default('gemini'),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-2'),
    GEMINI_LLM_MODEL: z.string().default('gemini-3.5-flash-lite'),
    GEMINI_THINKING_LEVEL: z.enum(THINKING_LEVELS).default('LOW'),
    // Caracteres de trechos enviados por chamada ao grifar (menos chamadas = menos cota).
    HIGHLIGHT_BATCH_CHARS: z.coerce.number().int().min(500).default(6000),
  })
  // O LLM das respostas é sempre o Gemini; a chave é necessária para o servidor.
  .refine((env) => !!env.GEMINI_API_KEY, {
    message: 'GEMINI_API_KEY é obrigatória (crie em https://aistudio.google.com/apikey).',
    path: ['GEMINI_API_KEY'],
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Configuração inválida:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
