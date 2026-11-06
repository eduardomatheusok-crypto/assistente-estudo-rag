import { GeminiError, GeminiHttp, type GeminiHttpOptions } from '../gemini/gemini-http.ts';
import type { CallContext } from '../metering.ts';
import {
  LlmProviderError,
  type JsonGenerationRequest,
  type JsonGenerationResult,
  type LlmProvider,
} from './llm-provider.ts';

export const THINKING_LEVELS = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export type GeminiLlmOptions = GeminiHttpOptions & {
  model: string;
  thinkingLevel: ThinkingLevel;
};

type GenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
};

/**
 * Geração com saída JSON estruturada via generateContent (REST, sem SDK).
 * O schema vai em generationConfig.responseJsonSchema; mesmo assim o
 * resultado é validado com Zod no domínio — o provedor não é a garantia.
 */
export class GeminiLlmProvider implements LlmProvider {
  readonly provider = 'gemini';
  readonly model: string;
  private readonly thinkingLevel: ThinkingLevel;
  private readonly http: GeminiHttp;

  constructor(options: GeminiLlmOptions) {
    this.model = options.model;
    this.thinkingLevel = options.thinkingLevel;
    this.http = new GeminiHttp(options);
  }

  async generateJson(request: JsonGenerationRequest, _ctx?: CallContext): Promise<JsonGenerationResult> {
    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: 'user', parts: [{ text: request.user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: request.jsonSchema,
        ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
        thinkingConfig: { thinkingLevel: this.thinkingLevel },
      },
    };

    let data: GenerateResponse;
    try {
      data = await this.http.post<GenerateResponse>(`models/${this.model}:generateContent`, body);
    } catch (error) {
      if (error instanceof GeminiError) throw new LlmProviderError(error.message);
      throw error;
    }

    if (data.promptFeedback?.blockReason) {
      throw new LlmProviderError(`Pedido bloqueado pelo Gemini: ${data.promptFeedback.blockReason}`);
    }
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('');
    const usage = data.usageMetadata ?? {};

    return {
      text,
      finishReason: candidate?.finishReason ?? 'UNKNOWN',
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    };
  }
}
