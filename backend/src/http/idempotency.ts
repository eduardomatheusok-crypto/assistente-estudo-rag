/**
 * Idempotência: o mesmo pedido enviado duas vezes (clique duplo, reenvio
 * depois de a internet cair) produz UM efeito só. O cliente manda o
 * cabeçalho `Idempotency-Key`; a primeira resposta é guardada e devolvida
 * de novo, sem chamar o Gemini outra vez.
 *
 * Em memória, pelos mesmos motivos do limitador de requisições.
 */
export type StoredResponse = { statusCode: number; payload: string; contentType: string | undefined };

type Entry =
  | { state: 'pending'; fingerprint: string; expiresAt: number }
  | { state: 'done'; fingerprint: string; expiresAt: number; response: StoredResponse };

export type IdempotencyDecision =
  /** Chave nova: processar normalmente e depois chamar `complete` ou `release`. */
  | { kind: 'proceed' }
  /** Mesmo pedido já respondido: devolver a resposta guardada. */
  | { kind: 'replay'; response: StoredResponse }
  /** O mesmo pedido ainda está sendo processado. */
  | { kind: 'in_progress' }
  /** A chave já foi usada para um pedido diferente. */
  | { kind: 'mismatch' };

export class IdempotencyStore {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, Entry>();

  constructor(ttlMs: number, now: () => number = Date.now) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  /** `fingerprint` identifica o pedido (método + rota + corpo). */
  begin(key: string, fingerprint: string): IdempotencyDecision {
    const now = this.now();
    this.prune(now);
    const entry = this.entries.get(key);
    if (!entry) {
      this.entries.set(key, { state: 'pending', fingerprint, expiresAt: now + this.ttlMs });
      return { kind: 'proceed' };
    }
    if (entry.fingerprint !== fingerprint) return { kind: 'mismatch' };
    if (entry.state === 'pending') return { kind: 'in_progress' };
    return { kind: 'replay', response: entry.response };
  }

  /** Guarda a resposta final do pedido. */
  complete(key: string, response: StoredResponse): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.set(key, { state: 'done', fingerprint: entry.fingerprint, expiresAt: this.now() + this.ttlMs, response });
  }

  /** O pedido falhou por erro do servidor: libera a chave para uma nova tentativa. */
  release(key: string): void {
    this.entries.delete(key);
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
