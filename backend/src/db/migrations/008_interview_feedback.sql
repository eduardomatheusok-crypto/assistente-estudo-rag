-- Entrevista: avaliação por critérios, resposta-modelo, modo de resposta e "Tentar de novo".

-- "Tentar de novo" grava uma nova tentativa da mesma pergunta na mesma sessão;
-- a mais recente é a que vale para o resumo e para "meus erros".
ALTER TABLE attempts DROP CONSTRAINT attempts_session_id_item_id_key;
CREATE INDEX attempts_session_item_idx ON attempts (session_id, item_id, created_at DESC);

ALTER TABLE attempts
  -- Notas de 0 a 10 por critério: {"precisao":9,"estrutura":8,"clareza":7,"exemplo":5}
  ADD COLUMN rubric jsonb,
  -- Resposta-modelo escrita a partir do material (só entrevista).
  ADD COLUMN model_answer text,
  -- Itens que faltaram na resposta (só entrevista).
  ADD COLUMN missing_points jsonb,
  -- Como o estudante estruturou a resposta.
  ADD COLUMN answer_format text CHECK (answer_format IN ('free', 'guided', 'star'));
