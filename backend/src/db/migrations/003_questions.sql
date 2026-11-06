-- Etapa 3: perguntas, trechos recuperados e citações validadas.

CREATE TABLE questions (
  id                 uuid PRIMARY KEY,
  notebook_id        uuid NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  question           text NOT NULL,
  strategy           text NOT NULL,
  status             text NOT NULL CHECK (status IN ('answered', 'not_found')),
  -- Por que recusou: no_results | model_not_found | invalid_output | no_valid_citations
  refusal_reason     text,
  answer             text NOT NULL,
  model              text,
  -- Saída bruta do LLM, para auditoria e avaliação (etapa 4).
  raw_output         text,
  -- Citações descartadas na validação: [{source, quote, reason}]
  dropped_citations  jsonb NOT NULL DEFAULT '[]',
  trace_id           uuid NOT NULL,
  latency_ms         double precision NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX questions_notebook_idx ON questions (notebook_id, created_at DESC);

-- Os trechos entregues ao LLM, na ordem da busca.
CREATE TABLE question_sources (
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label       text NOT NULL,              -- S1, S2...
  chunk_id    uuid NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  rank        integer NOT NULL,
  score       double precision NOT NULL,
  PRIMARY KEY (question_id, label)
);

CREATE TABLE citations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id    uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position       integer NOT NULL,
  label          text NOT NULL,
  chunk_id       uuid NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  document_id    uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  -- Trecho exato como está no documento.
  quote          text NOT NULL,
  -- Intervalo no texto canônico do documento (base para destacar no visualizador).
  doc_char_start integer NOT NULL,
  doc_char_end   integer NOT NULL,
  page_number    integer NOT NULL,
  UNIQUE (question_id, position)
);
CREATE INDEX citations_question_idx ON citations (question_id);
