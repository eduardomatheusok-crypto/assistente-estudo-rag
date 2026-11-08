/** Erro que traz o status HTTP (o ApiError do cliente segue este formato). */
type WithStatus = { status?: number };

/** Abaixo do tempo que o servidor guarda as respostas (10 min), para nunca reusar uma chave já esquecida. */
const KEY_TTL_MS = 9 * 60 * 1000;

/**
 * Envio de pedidos que gastam cota da IA, com duas proteções:
 * - pedido idêntico em andamento (clique duplo) reaproveita a mesma promessa: sai UMA requisição;
 * - se o pedido falhar por rede, erro do servidor ou limite (429), a nova tentativa
 *   do mesmo pedido reusa a mesma `Idempotency-Key`: se o servidor já tinha
 *   processado, devolve a resposta guardada em vez de chamar o Gemini de novo.
 */
export function createIdempotentSender(
  send: <T>(path: string, init: RequestInit) => Promise<T>,
  newKey: () => string = () => crypto.randomUUID(),
  now: () => number = Date.now,
) {
  const inFlight = new Map<string, Promise<unknown>>();
  const retryKeys = new Map<string, { key: string; at: number }>();

  return function sendIdempotent<T>(path: string, init: RequestInit): Promise<T> {
    const signature = `${init.method ?? 'GET'} ${path} ${typeof init.body === 'string' ? init.body : ''}`;
    const running = inFlight.get(signature);
    if (running) return running as Promise<T>;

    const saved = retryKeys.get(signature);
    const key = saved && now() - saved.at < KEY_TTL_MS ? saved.key : newKey();
    const headers = new Headers(init.headers);
    headers.set('idempotency-key', key);

    const promise = send<T>(path, { ...init, headers })
      .then((result) => {
        retryKeys.delete(signature);
        return result;
      })
      .catch((error: unknown) => {
        const status = (error as WithStatus).status;
        const retryable = status === undefined || status >= 500 || status === 429;
        if (retryable) retryKeys.set(signature, { key, at: now() });
        else retryKeys.delete(signature);
        throw error;
      })
      .finally(() => inFlight.delete(signature));

    inFlight.set(signature, promise);
    return promise;
  };
}
