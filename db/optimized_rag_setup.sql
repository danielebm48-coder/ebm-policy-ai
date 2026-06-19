--- AI Optimization & Management Enhancements

-- 1. Add optimized content field to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_optimized TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_optimized BOOLEAN DEFAULT FALSE;

-- 2. Ensure total cascaded deletion (already largely handled by FKs, but good to reinforce)
-- The existing CASCADE on document_parents and document_chunks should suffice.

-- 3. Add a marker for optimized documents to distinguish them in the UI if needed
ALTER TABLE documents ADD COLUMN IF NOT EXISTS optimization_metadata JSONB;
