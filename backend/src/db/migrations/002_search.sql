-- Etapa 2: busca vetorial (pgvector), lexical (full-text em português) e registro de chamadas a provedores.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Configuração de busca em português que também ignora acentos
-- ("função" e "funcao" viram o mesmo termo). Usar uma configuração própria,
-- em vez de chamar unaccent() direto, mantém to_tsvector imutável e permite
-- a coluna gerada abaixo.
CREATE TEXT SEARCH CONFIGURATION pt_unaccent (COPY = portuguese);
ALTER TEXT SEARCH CONFIGURATION pt_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;

-- 768 dimensões: tamanho recomendado pelo Gemini, e o índice HNSW do pgvector
-- aceita no máximo 2000 dimensões no tipo vector (o padrão de 3072 não caberia).
-- Trocar a dimensão exige uma nova migração e reindexar os documentos.
ALTER TABLE chunks
  ADD COLUMN embedding vector(768),
  ADD COLUMN embedding_model text,
  ADD COLUMN tsv tsvector GENERATED ALWAYS AS (to_tsvector('pt_unaccent', text)) STORED;

CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_tsv_idx ON chunks USING gin (tsv);

-- Toda chamada a provedor de IA (embeddings agora; LLM nas próximas etapas).
CREATE TABLE llm_calls (
  id               bigserial PRIMARY KEY,
  operation        text NOT NULL,          -- ex.: embed_document, embed_query
  ref_type         text,                   -- ex.: document, notebook
  ref_id           uuid,
  provider         text NOT NULL,
  model            text NOT NULL,
  input_tokens     integer NOT NULL,
  output_tokens    integer NOT NULL DEFAULT 0,
  -- true quando o provedor não informou os tokens e eles foram estimados.
  tokens_estimated boolean NOT NULL DEFAULT false,
  -- Custo estimado pelo preço do plano pago, mesmo usando a cota gratuita.
  cost_usd         numeric(12, 8) NOT NULL,
  latency_ms       double precision NOT NULL,
  ok               boolean NOT NULL,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX llm_calls_ref_idx ON llm_calls (ref_type, ref_id);
CREATE INDEX llm_calls_operation_idx ON llm_calls (operation, created_at);
