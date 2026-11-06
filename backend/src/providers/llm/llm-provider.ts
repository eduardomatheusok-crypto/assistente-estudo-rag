import type { CallContext } from '../metering.ts';

export type JsonGenerationRequest = {
  /** Instruções fixas (regras do sistema). */
  system: string;
  /** Conteúdo da vez (fontes + pergunta). */
  user: string;
  /** JSON Schema que o provedor deve respeitar na saída. */
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
};

export type JsonGenerationResult = {
  /** Texto bruto devolvido; quem chama faz o parse e a validação com Zod. */
  text: string;
  /** STOP = terminou normalmente; MAX_TOKENS = cortado; outros = bloqueio etc. */
  finishReason: string;
  inputTokens: number;
  /** Inclui tokens de "raciocínio", que são cobrados como saída. */
  outputTokens: number;
};

/** Provedor de LLM trocável. A camada de serviço nunca conhece a API específica. */
export interface LlmProvider {
  readonly provider: string;
  readonly model: string;
  generateJson(request: JsonGenerationRequest, ctx: CallContext): Promise<JsonGenerationResult>;
}

export class LlmProviderError extends Error {
  override name = 'LlmProviderError';
}
