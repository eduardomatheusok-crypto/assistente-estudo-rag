-- Etapa 5: grifos por critério.

CREATE TABLE highlight_criteria (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = critério predefinido, disponível em todos os cadernos.
  notebook_id uuid REFERENCES notebooks(id) ON DELETE CASCADE,
  key         text NOT NULL,
  label       text NOT NULL CHECK (length(trim(label)) > 0),
  -- O que o LLM deve procurar; nos personalizados, escrito pelo estudante.
  instruction text NOT NULL CHECK (length(trim(instruction)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX highlight_criteria_builtin_key ON highlight_criteria (key) WHERE notebook_id IS NULL;
CREATE UNIQUE INDEX highlight_criteria_notebook_key ON highlight_criteria (notebook_id, key) WHERE notebook_id IS NOT NULL;

INSERT INTO highlight_criteria (notebook_id, key, label, instruction) VALUES
  (NULL, 'definicoes', 'Definições',
   'Frases que definem um termo ou conceito, dizendo o que ele é (ex.: "X é...", "chama-se X...", "X consiste em...").'),
  (NULL, 'formulas', 'Fórmulas',
   'Fórmulas, equações, expressões matemáticas ou regras escritas em forma simbólica, junto com a frase que as apresenta.'),
  (NULL, 'datas', 'Datas',
   'Frases que contêm datas, anos, séculos ou períodos históricos associados a um fato.'),
  (NULL, 'exemplos', 'Exemplos',
   'Exemplos concretos que ilustram um conceito (ex.: frases com "por exemplo", "como em", casos ou aplicações específicas).'),
  (NULL, 'conceitos-fundamentais', 'Conceitos fundamentais',
   'Ideias centrais do assunto: princípios, teoremas, propriedades ou relações que sustentam o restante do conteúdo.');

CREATE TABLE highlight_runs (
  id              uuid PRIMARY KEY,
  document_id     uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  criterion_id    uuid NOT NULL REFERENCES highlight_criteria(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'ready', 'failed')),
  batches_total   integer NOT NULL DEFAULT 0,
  batches_done    integer NOT NULL DEFAULT 0,
  highlight_count integer NOT NULL DEFAULT 0,
  rejected_count  integer NOT NULL DEFAULT 0,
  error           text,
  model           text NOT NULL,
  trace_id        uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);
CREATE INDEX highlight_runs_document_idx ON highlight_runs (document_id, criterion_id, created_at DESC);

CREATE TABLE highlights (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         uuid NOT NULL REFERENCES highlight_runs(id) ON DELETE CASCADE,
  document_id    uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  criterion_id   uuid NOT NULL REFERENCES highlight_criteria(id) ON DELETE CASCADE,
  -- NULL nos rejeitados que não apontaram para um trecho válido.
  chunk_id       uuid REFERENCES chunks(id) ON DELETE CASCADE,
  -- valid = existe literalmente no documento; rejected = descartado na validação.
  status         text NOT NULL CHECK (status IN ('valid', 'rejected')),
  reject_reason  text,
  -- Nos válidos, o texto exato do documento; nos rejeitados, o que o LLM propôs.
  text           text NOT NULL,
  justification  text NOT NULL,
  doc_char_start integer,
  doc_char_end   integer,
  page_number    integer,
  -- [{page, rects: [[x1, y1, x2, y2], ...]}] no espaço do PDF (pontos, origem embaixo à esquerda).
  locations      jsonb NOT NULL DEFAULT '[]',
  CHECK (status = 'rejected' OR (doc_char_start IS NOT NULL AND doc_char_end IS NOT NULL AND page_number IS NOT NULL))
);
CREATE INDEX highlights_document_idx ON highlights (document_id, criterion_id) WHERE status = 'valid';
CREATE INDEX highlights_run_idx ON highlights (run_id);
