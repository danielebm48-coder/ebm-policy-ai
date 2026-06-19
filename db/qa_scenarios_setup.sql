-- Script para crear la Capa de Escenarios (Q&A Layer)
-- Ejecutar en el SQL Editor de Supabase

-- 1. Crear la tabla de escenarios Q&A
CREATE TABLE IF NOT EXISTS document_qa_scenarios (
  id TEXT PRIMARY KEY DEFAULT 'qa_' || gen_random_uuid()::TEXT,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_id TEXT REFERENCES document_chunks(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  embedding vector(1536), -- Ajustado a 1536 dimensiones de Gemini-embedding-001
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Crear índices para optimizar la búsqueda por rol y la búsqueda vectorial
CREATE INDEX IF NOT EXISTS idx_qa_scenarios_document_id ON document_qa_scenarios(document_id);
CREATE INDEX IF NOT EXISTS idx_qa_scenarios_role_id ON document_qa_scenarios(role_id);
CREATE INDEX IF NOT EXISTS idx_qa_scenarios_embedding ON document_qa_scenarios USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 3. Función para búsqueda de escenarios por coincidencia vectorial y rol
CREATE OR REPLACE FUNCTION match_qa_scenarios (
  query_embedding vector(1536),
  match_role_id TEXT,
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  id TEXT,
  document_id TEXT,
  question TEXT,
  answer TEXT,
  similarity float
) LANGUAGE sql STABLE
AS $$
  SELECT
    q.id,
    q.document_id,
    q.question,
    q.answer,
    1 - (q.embedding <=> query_embedding) as similarity
  FROM document_qa_scenarios q
  WHERE q.role_id = match_role_id
    AND 1 - (q.embedding <=> query_embedding) > match_threshold
  ORDER BY q.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Confirmación
SELECT 'Capa de Escenarios Q&A creada exitosamente' AS status;
