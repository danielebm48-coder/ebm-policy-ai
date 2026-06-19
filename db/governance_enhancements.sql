--- Governance and UI Enhancements Setup

-- 1. Add processing fields to ai_queries
ALTER TABLE ai_queries ADD COLUMN IF NOT EXISTS is_processed BOOLEAN DEFAULT FALSE;
ALTER TABLE ai_queries ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE ai_queries ADD COLUMN IF NOT EXISTS processed_by TEXT REFERENCES users(id);

-- 2. Create a table for system settings (like reset dates)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize stats reset date
INSERT INTO system_settings (key, value) 
VALUES ('stats_config', '{"last_reset_at": "2020-01-01T00:00:00Z", "unanswered_reset_at": "2020-01-01T00:00:00Z"}') 
ON CONFLICT (key) DO NOTHING;

-- 3. Function to get most consulted documents with names
-- This simplifies the join and aggregation logic in the app
CREATE OR REPLACE VIEW document_consultation_stats AS
SELECT 
    d.id, 
    d.name, 
    COUNT(al.id) as consultation_count
FROM documents d
LEFT JOIN document_audit_logs al ON d.id = al.document_id
WHERE al.action = 'query' OR al.action = 'view'
GROUP BY d.id, d.name;
