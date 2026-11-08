/**
 * Envio de pedidos que gastam cota da IA: se um pedido idêntico já está em andamento
 * (clique duplo), reaproveita a mesma promessa e sai UMA requisição só.
 */
export function createDedupedSender(send: <T>(path: string, init: RequestInit) => Promise<T>) {
  const inFlight = new Map<string, Promise<unknown>>();

  return function sendDeduped<T>(path: string, init: RequestInit): Promise<T> {
    const signature = `${init.method ?? 'GET'} ${path} ${typeof init.body === 'string' ? init.body : ''}`;
    const running = inFlight.get(signature);
    if (running) return running as Promise<T>;

    const promise = send<T>(path, init).finally(() => inFlight.delete(signature));
    inFlight.set(signature, promise);
    return promise;
  };
}
