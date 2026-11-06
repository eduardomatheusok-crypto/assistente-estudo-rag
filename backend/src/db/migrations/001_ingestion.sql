-- Etapa 1: cadernos, documentos, páginas, chunks e registro de latência.

CREATE TABLE notebooks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (length(trim(name)) > 0),
  discipline text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id       uuid NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  title             text NOT NULL,
  original_filename text NOT NULL,
  mime_type         text NOT NULL
                    CHECK (mime_type IN ('application/pdf', 'text/markdown', 'text/plain')),
  -- Caminho relativo a STORAGE_DIR. O nome é o sha256, então o mesmo arquivo
  -- em cadernos diferentes aponta para o mesmo arquivo em disco.
  storage_path      text NOT NULL,
  sha256            char(64) NOT NULL,
  size_bytes        integer NOT NULL,
  status            text NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing', 'ready', 'failed')),
  error             text,
  page_count        integer,
  chunk_count       integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notebook_id, sha256)
);
CREATE INDEX documents_notebook_idx ON documents (notebook_id);
CREATE INDEX documents_sha256_idx ON documents (sha256);

CREATE TABLE document_pages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number >= 1),
  -- Dimensões em pontos do PDF; NULL para Markdown/TXT.
  width       real,
  height      real,
  -- Intervalo [char_start, char_end) no texto canônico do documento.
  char_start  integer NOT NULL,
  char_end    integer NOT NULL,
  text        text NOT NULL,
  -- [{charStart, charEnd, x, y, width, height}] — base para localizar grifos.
  text_items  jsonb NOT NULL DEFAULT '[]',
  UNIQUE (document_id, page_number)
);

CREATE TABLE chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index   integer NOT NULL,
  text          text NOT NULL,
  char_start    integer NOT NULL,
  char_end      integer NOT NULL,
  page_start    integer NOT NULL,
  page_end      integer NOT NULL,
  -- Parâmetros usados ao gerar este chunk (rastreabilidade).
  chunk_size    integer NOT NULL,
  chunk_overlap integer NOT NULL,
  UNIQUE (document_id, chunk_index)
);

CREATE TABLE step_timings (
  id         bigserial PRIMARY KEY,
  trace_id   uuid NOT NULL,
  operation  text NOT NULL,
  step       text NOT NULL,
  latency_ms double precision NOT NULL,
  ok         boolean NOT NULL,
  meta       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX step_timings_trace_idx ON step_timings (trace_id);
CREATE INDEX step_timings_operation_idx ON step_timings (operation, step, created_at);
