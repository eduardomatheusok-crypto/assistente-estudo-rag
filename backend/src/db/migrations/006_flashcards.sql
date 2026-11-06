-- Flashcards no estilo Gemini: um tipo próprio de item ('card').
-- prompt = frente (termo ou pergunta curta); reference_answer = verso (a resposta).

ALTER TABLE practice_items DROP CONSTRAINT practice_items_kind_check;
ALTER TABLE practice_items ADD CONSTRAINT practice_items_kind_check
  CHECK (kind IN ('mcq', 'open', 'card'));

ALTER TABLE practice_items DROP CONSTRAINT practice_items_check;
ALTER TABLE practice_items ADD CONSTRAINT practice_items_check
  CHECK (kind IN ('open', 'card') OR (jsonb_array_length(options) = 4 AND correct_option BETWEEN 0 AND 3));

-- Objetivo para o qual o cartão foi criado: na prova a frente é um termo; na
-- entrevista, uma pergunta. Só se reaproveita cartão do mesmo objetivo.
-- (mcq e open já indicam o objetivo pelo próprio tipo; ali fica NULL.)
ALTER TABLE practice_items ADD COLUMN goal_type text CHECK (goal_type IN ('prova', 'entrevista'));
ALTER TABLE practice_items ADD CONSTRAINT practice_items_card_goal_check
  CHECK (kind <> 'card' OR goal_type IS NOT NULL);
