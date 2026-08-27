-- Cache persistente de preguntas recurrentes para reducir llamadas a Gemini.
-- Ejecutar una vez en el SQL Editor de Supabase.

ALTER TABLE ai_queries
  ADD COLUMN IF NOT EXISTS normalized_question TEXT;

UPDATE ai_queries
SET normalized_question = lower(trim(regexp_replace(regexp_replace(
  translate(question, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
  '[^a-zA-Z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')))
WHERE normalized_question IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_queries_cache_lookup
  ON ai_queries (user_role, normalized_question, requested_at DESC)
  WHERE status = 'completed' AND answer IS NOT NULL;