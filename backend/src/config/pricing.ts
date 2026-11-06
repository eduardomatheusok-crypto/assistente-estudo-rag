/**
 * Preços em USD por 1 milhão de tokens, do plano pago (Standard).
 * Fonte: https://aistudio.google.com/docs/pricing (consultado em 2026-11-06).
 * Mesmo na cota gratuita, o custo é estimado por estes valores para que a
 * métrica de custo continue significativa. Atualizar manualmente.
 */
export type ModelPrice = { inputPerMillion: number; outputPerMillion: number };

export const PRICING: Record<string, ModelPrice> = {
  'gemini-embedding-2': { inputPerMillion: 0.2, outputPerMillion: 0 },
  'gemini-embedding-001': { inputPerMillion: 0.15, outputPerMillion: 0 },
  // Saída inclui os tokens de "raciocínio" (thinking).
  'gemini-3.5-flash-lite': { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  // Preço promocional até 2026-12-31; a partir de 2027-01-01: 1.50 / 7.50.
  'gemini-3.8-flash': { inputPerMillion: 0.75, outputPerMillion: 3.75 },
  fake: { inputPerMillion: 0, outputPerMillion: 0 },
};

/** Custo estimado; modelo sem preço cadastrado lança erro para não registrar custo zero por engano. */
export function estimateCostUsd(
  model: string,
  tokens: { input: number; output: number },
  pricing: Record<string, ModelPrice> = PRICING,
): number {
  const price = pricing[model];
  if (!price) throw new Error(`Modelo sem preço cadastrado em config/pricing.ts: ${model}`);
  return (tokens.input * price.inputPerMillion + tokens.output * price.outputPerMillion) / 1_000_000;
}
