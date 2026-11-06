import { withTransaction, type Db } from '../db/pool.ts';

export type SearchHit = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  text: string;
  charStart: number;
  charEnd: number;
  pageStart: number;
  pageEnd: number;
  score: number;
};

const HIT_COLUMNS = `
  c.id AS "chunkId", c.document_id AS "documentId", d.title AS "documentTitle", c.text,
  c.char_start AS "charStart", c.char_end AS "charEnd",
  c.page_start AS "pageStart", c.page_end AS "pageEnd"`;

/** Só entram chunks de documentos prontos do caderno pedido. */
const SCOPE = `d.notebook_id = $1 AND d.status = 'ready'`;

export class SearchRepository {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  /**
   * Vizinhos mais próximos por distância de cosseno (índice HNSW).
   * Score = similaridade de cosseno (1 = idêntico).
   * Filtra pelo modelo: vetores de modelos diferentes não são comparáveis.
   */
  async vector(
    notebookId: string,
    embedding: number[],
    embeddingModel: string,
    limit: number,
  ): Promise<SearchHit[]> {
    return withTransaction(this.db, async (client) => {
      // Com filtro (caderno), o HNSW pode devolver menos de `limit` linhas;
      // a varredura iterativa (pgvector >= 0.8) continua buscando até completar.
      await client.query(`SET LOCAL hnsw.iterative_scan = strict_order`);
      const { rows } = await client.query<SearchHit>(
        `SELECT ${HIT_COLUMNS}, 1 - (c.embedding <=> $2::vector) AS score
           FROM chunks c JOIN documents d ON d.id = c.document_id
          WHERE ${SCOPE} AND c.embedding IS NOT NULL AND c.embedding_model = $3
          ORDER BY c.embedding <=> $2::vector
          LIMIT $4`,
        [notebookId, JSON.stringify(embedding), embeddingModel, limit],
      );
      return rows;
    });
  }

  /**
   * Busca full-text em português, sem acentos, com stemming ("derivadas" acha "derivada").
   * Os termos da pergunta são combinados com OU: perguntas em linguagem natural
   * raramente têm todos os termos num mesmo trecho. ts_rank_cd favorece chunks
   * com mais termos e termos mais próximos entre si.
   */
  async lexical(notebookId: string, query: string, limit: number): Promise<SearchHit[]> {
    const { rows } = await this.db.query<SearchHit>(
      `WITH q AS (
         SELECT to_tsquery('simple', coalesce(string_agg(quote_literal(lexeme), ' | '), '')) AS query
           FROM unnest(tsvector_to_array(to_tsvector('pt_unaccent', $2))) AS lexeme
       )
       SELECT ${HIT_COLUMNS}, ts_rank_cd(c.tsv, q.query) AS score
         FROM chunks c JOIN documents d ON d.id = c.document_id, q
        WHERE ${SCOPE} AND c.tsv @@ q.query
        ORDER BY score DESC, c.id
        LIMIT $3`,
      [notebookId, query, limit],
    );
    return rows;
  }
}
