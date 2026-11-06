import { reciprocalRankFusion } from '../domain/search/rrf.ts';
import type { EmbeddingProvider } from '../providers/embeddings/embedding-provider.ts';
import type { NotebookRepository } from '../repositories/notebook-repository.ts';
import type { SearchHit, SearchRepository } from '../repositories/search-repository.ts';
import { Trace, type TimingSink } from '../telemetry/trace.ts';
import { notFound } from './errors.ts';

export const SEARCH_STRATEGIES = ['vector', 'lexical', 'hybrid'] as const;
export type SearchStrategy = (typeof SEARCH_STRATEGIES)[number];

export const DEFAULT_TOP_K = 5;
/** Na híbrida, cada busca traz mais candidatos que o top-k para a fusão ter material. */
const HYBRID_CANDIDATES_FACTOR = 4;
const HYBRID_MIN_CANDIDATES = 20;

export type SearchResult = Omit<SearchHit, 'score'> & {
  rank: number;
  /** Score da estratégia escolhida (cosseno, ts_rank_cd ou RRF). */
  score: number;
  /** Na híbrida: score e posição de cada busca (null se o chunk não apareceu nela). */
  vector?: { score: number; rank: number } | null;
  lexical?: { score: number; rank: number } | null;
};

export type SearchResponse = {
  traceId: string;
  strategy: SearchStrategy;
  results: SearchResult[];
};

export type SearchServiceDeps = {
  notebooks: NotebookRepository;
  search: SearchRepository;
  embeddings: EmbeddingProvider;
  timings: TimingSink;
  onSinkError: (error: unknown) => void;
};

export class SearchService {
  private readonly deps: SearchServiceDeps;

  constructor(deps: SearchServiceDeps) {
    this.deps = deps;
  }

  async search(input: {
    notebookId: string;
    query: string;
    strategy: SearchStrategy;
    k?: number;
  }): Promise<SearchResponse> {
    const { notebookId, query, strategy } = input;
    const k = input.k ?? DEFAULT_TOP_K;
    if (!(await this.deps.notebooks.findById(notebookId))) throw notFound('Caderno');

    const trace = new Trace('search', this.deps.timings, { notebookId, strategy, k }, this.deps.onSinkError);
    const results = await trace.step('total', () => this.retrieve(trace, notebookId, query, strategy, k));
    return { traceId: trace.id, strategy, results };
  }

  /** Recupera os trechos registrando as etapas no trace de quem chama (busca ou pergunta). */
  async retrieve(
    trace: Trace,
    notebookId: string,
    query: string,
    strategy: SearchStrategy,
    k: number,
    /** A quem atribuir o custo do embedding da consulta (padrão: o caderno). */
    costRef: { refType: string; refId: string } = { refType: 'notebook', refId: notebookId },
  ): Promise<SearchResult[]> {
    if (strategy === 'vector') {
      return rankHits(await this.vector(trace, notebookId, query, k, costRef));
    }
    if (strategy === 'lexical') {
      return rankHits(await this.lexical(trace, notebookId, query, k));
    }

    const candidates = Math.max(k * HYBRID_CANDIDATES_FACTOR, HYBRID_MIN_CANDIDATES);
    const [vectorHits, lexicalHits] = await Promise.all([
      this.vector(trace, notebookId, query, candidates, costRef),
      this.lexical(trace, notebookId, query, candidates),
    ]);

    return trace.step('fuse', () => {
      const byId = new Map<string, SearchHit>();
      for (const hit of [...vectorHits, ...lexicalHits]) byId.set(hit.chunkId, hit);
      const fused = reciprocalRankFusion(
        [vectorHits.map((h) => h.chunkId), lexicalHits.map((h) => h.chunkId)],
        k,
      );
      return fused.map((item, index) => {
        const { score: _score, ...hit } = byId.get(item.id)!;
        const [vectorRank, lexicalRank] = item.ranks;
        return {
          ...hit,
          rank: index + 1,
          score: item.score,
          vector: vectorRank ? { rank: vectorRank, score: vectorHits[vectorRank - 1]!.score } : null,
          lexical: lexicalRank ? { rank: lexicalRank, score: lexicalHits[lexicalRank - 1]!.score } : null,
        };
      });
    });
  }

  private async vector(
    trace: Trace,
    notebookId: string,
    query: string,
    limit: number,
    costRef: { refType: string; refId: string },
  ) {
    const { embeddings, search } = this.deps;
    const result = await trace.step('embed_query', () =>
      embeddings.embedQuery(query, { operation: 'embed_query', ...costRef }),
    );
    return trace.step('vector_search', () => search.vector(notebookId, result.vectors[0]!, embeddings.model, limit), {
      limit,
    });
  }

  private lexical(trace: Trace, notebookId: string, query: string, limit: number) {
    return trace.step('lexical_search', () => this.deps.search.lexical(notebookId, query, limit), { limit });
  }
}

function rankHits(hits: SearchHit[]): SearchResult[] {
  return hits.map((hit, index) => ({ ...hit, rank: index + 1 }));
}
