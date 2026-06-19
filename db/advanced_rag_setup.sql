--- Advanced RAG Architecture Setup for School Policy AI

-- 1. Create document_parents table (Parent-Child Architecture)
CREATE TABLE IF NOT EXISTS document_parents (
  id TEXT PRIMARY KEY DEFAULT 'parent_' || gen_random_uuid()::TEXT,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_number INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, chunk_number)
);

-- 2. Update document_chunks to reference parents
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES document_parents(id) ON DELETE CASCADE;

-- 3. Enable Full-Text Search
-- Create a column for search vectors on chunks
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS fts_vector tsvector GENERATED ALWAYS AS (to_tsvector('spanish', text)) STORED;

-- Create an index for FTS
CREATE INDEX IF NOT EXISTS idx_document_chunks_fts ON document_chunks USING GIN(fts_vector);

-- 4. Hybrid Search Function
CREATE OR REPLACE FUNCTION match_documents_hybrid (
  query_embedding vector(3072),
  query_text text,
  match_count int DEFAULT 20,
  match_threshold float DEFAULT 0.2,
  full_text_weight float DEFAULT 0.5,
  vector_weight float DEFAULT 0.5
)
RETURNS TABLE (
  id text,
  document_id text,
  parent_id text,
  text text,
  similarity float,
  fts_rank float,
  combined_score float
) LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH vector_matches AS (
    SELECT
      dc.id,
      1 - (dc.embedding <=> query_embedding) as similarity
    FROM document_chunks dc
    WHERE dc.embedding IS NOT NULL
      AND 1 - (dc.embedding <=> query_embedding) > match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  fts_matches AS (
    SELECT
      dc.id,
      ts_rank_cd(dc.fts_vector, plainto_tsquery('spanish', query_text)) as fts_rank
    FROM document_chunks dc
    WHERE dc.fts_vector @@ plainto_tsquery('spanish', query_text)
    LIMIT match_count * 2
  )
  SELECT
    dc.id,
    dc.document_id,
    dc.parent_id,
    dc.text,
    COALESCE(vm.similarity, 0)::float as similarity,
    COALESCE(fm.fts_rank, 0)::float as fts_rank,
    (COALESCE(vm.similarity, 0) * vector_weight + COALESCE(fm.fts_rank, 0) * full_text_weight)::float as combined_score
  FROM document_chunks dc
  LEFT JOIN vector_matches vm ON dc.id = vm.id
  LEFT JOIN fts_matches fm ON dc.id = fm.id
  WHERE vm.id IS NOT NULL OR fm.id IS NOT NULL
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;

-- 5. Comments for documentation
COMMENT ON FUNCTION match_documents_hybrid IS 'Performs a hybrid search combining pgvector cosine similarity and PostgreSQL full-text search.';
