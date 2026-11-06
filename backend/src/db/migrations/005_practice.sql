-- Etapa 7: perfil de estudo, prática (simulações e flashcards) e desempenho.
-- As tentativas (attempts) são a base das MÉTRICAS DE APRENDIZAGEM, separadas
-- das métricas técnicas da IA (llm_calls, step_timings).

CREATE TABLE study_profiles (
  notebook_id uuid PRIMARY KEY REFERENCES notebooks(id) ON DELETE CASCADE,
  -- prova → múltipla escolha corrigida pelo código; entrevista → perguntas abertas avaliadas pelo LLM.
  goal_type   text NOT NULL CHECK (goal_type IN ('prova', 'entrevista')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Questões geradas do material; reaproveitadas em novas simulações e como flashcards.
CREATE TABLE practice_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id      uuid NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('mcq', 'open')),
  topic            text NOT NULL,
  prompt           text NOT NULL,
  -- mcq: 4 alternativas e o índice da correta.
  options          jsonb,
  correct_option   integer,
  -- open: pontos esperados numa boa resposta. mcq: por que a alternativa é a correta.
  reference_answer text NOT NULL,
  -- Fonte literal no material (validada como os grifos).
  chunk_id         uuid NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  document_id      uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  source_quote     text NOT NULL,
  doc_char_start   integer NOT NULL,
  doc_char_end     integer NOT NULL,
  page_number      integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'open' OR (jsonb_array_length(options) = 4 AND correct_option BETWEEN 0 AND 3))
);
CREATE INDEX practice_items_notebook_idx ON practice_items (notebook_id, kind);
CREATE INDEX practice_items_chunk_idx ON practice_items (chunk_id);

CREATE TABLE practice_sessions (
  id          uuid PRIMARY KEY,
  notebook_id uuid NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  goal_type   text NOT NULL CHECK (goal_type IN ('prova', 'entrevista')),
  mode        text NOT NULL CHECK (mode IN ('simulation', 'flashcards')),
  -- general = material todo; errors = o que o estudante errou; question = assunto de uma pergunta do chat.
  focus       text NOT NULL CHECK (focus IN ('general', 'errors', 'question')),
  question_id uuid REFERENCES questions(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX practice_sessions_notebook_idx ON practice_sessions (notebook_id, created_at DESC);

CREATE TABLE session_items (
  session_id uuid NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES practice_items(id) ON DELETE CASCADE,
  position   integer NOT NULL,
  PRIMARY KEY (session_id, item_id)
);

CREATE TABLE attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES practice_items(id) ON DELETE CASCADE,
  answer_text   text,
  chosen_option integer,
  correct       boolean NOT NULL,
  -- 0 a 1 (mcq: 0 ou 1; entrevista: nota do avaliador / 10; flashcard: autoavaliação 0 ou 1).
  score         real NOT NULL CHECK (score BETWEEN 0 AND 1),
  feedback      text,
  -- code = múltipla escolha; llm = resposta aberta; self = flashcard (o estudante diz se acertou).
  evaluated_by  text NOT NULL CHECK (evaluated_by IN ('code', 'llm', 'self')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, item_id)
);
CREATE INDEX attempts_item_idx ON attempts (item_id, created_at DESC);

-- Repetição espaçada (Leitner): em que caixa o cartão está e quando volta.
CREATE TABLE flashcard_state (
  item_id    uuid PRIMARY KEY REFERENCES practice_items(id) ON DELETE CASCADE,
  box        integer NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
  due_at     timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
