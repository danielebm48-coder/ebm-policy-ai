-- Función para buscar chunks similares usando pgvector
-- Ejecutar en el SQL Editor de Supabase

CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(3072),
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.7
)
RETURNS TABLE (
  id text,
  document_id text,
  chunk_number int,
  text text,
  similarity float
) LANGUAGE sql STABLE
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_number,
    dc.text,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM document_chunks dc
  WHERE dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Crear un índice HNSW para mejor rendimiento en búsquedas
-- Descomenta si tu version de Supabase soporta HNSW
-- CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 4, ef_construction = 64);

-- Crear índice IVFFlat como alternativa (más compatible)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_ivf ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
