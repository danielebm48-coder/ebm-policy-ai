--- Script de inicialización de base de datos School Policy AI
-- Ejecuta este archivo en PostgreSQL para crear toda la estructura

-- Crear extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Crear tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Crear tabla de políticas
CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  effective_date TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  content TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Crear tabla de versiones de políticas
CREATE TABLE IF NOT EXISTS policy_versions (
  version_id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  content TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Crear tabla de consultas IA
CREATE TABLE IF NOT EXISTS queries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  question TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL
);

-- Crear tabla de auditoría
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Crear índices para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_category ON policies(category);
CREATE INDEX IF NOT EXISTS idx_policies_created_by ON policies(created_by);
CREATE INDEX IF NOT EXISTS idx_policy_versions_policy_id ON policy_versions(policy_id);
CREATE INDEX IF NOT EXISTS idx_queries_user ON queries(user_id);
CREATE INDEX IF NOT EXISTS idx_queries_requested_at ON queries(requested_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Crear índices de búsqueda de texto completo
CREATE INDEX IF NOT EXISTS idx_policies_title_search ON policies USING GIN(to_tsvector('spanish', title));
CREATE INDEX IF NOT EXISTS idx_policies_content_search ON policies USING GIN(to_tsvector('spanish', content));

-- Insertar usuarios de prueba
INSERT INTO users (id, name, email, role, password, active) 
VALUES 
  ('u_system', 'Sistema', 'system@colegio.edu', 'admin', 'system2026', TRUE),
  ('u_directivo', 'Directora Ana', 'ana@colegio.edu', 'directivo', 'directivo2026', TRUE),
  ('u_profesor', 'Profesor Luis', 'luis@colegio.edu', 'profesor', 'profesor2026', TRUE),
  ('u_alumno', 'Alumno Mario', 'mario@colegio.edu', 'alumno', 'alumno2026', TRUE),
  ('u_padre', 'Padre Carmen', 'carmen@colegio.edu', 'padre', 'padre2026', TRUE)
ON CONFLICT (email) DO NOTHING;

-- Insertar políticas de prueba
INSERT INTO policies (id, title, summary, category, status, effective_date, tags, content, created_by, updated_by, version)
VALUES
  (
    'policy_001',
    'Código de Convivencia Escolar',
    'Normas de respeto, puntualidad y uso de instalaciones para toda la comunidad escolar.',
    'convivencia',
    'published',
    NOW() + INTERVAL '1 day',
    '["respeto", "puntualidad", "conducta"]'::jsonb,
    'Los estudiantes deben llegar puntuales, respetar a sus compañeros y cuidar las instalaciones escolares. La conducta apropiada es fundamental para mantener un ambiente de aprendizaje positivo.',
    'u_system',
    'u_system',
    1
  ),
  (
    'policy_002',
    'Procedimiento de Atención a Padres',
    'Guía para atender solicitudes de padres y coordinar entrevistas con el personal directivo.',
    'procedimientos',
    'published',
    NOW() + INTERVAL '2 days',
    '["padres", "entrevistas", "comunicacion"]'::jsonb,
    'Las citas con el director deben solicitarse con al menos 48 horas de anticipación y registrarse en el sistema. Los padres pueden comunicarse vía correo electrónico o teléfono para agendar reuniones.',
    'u_system',
    'u_system',
    1
  )
ON CONFLICT (id) DO NOTHING;

-- Confirmación de éxito
SELECT 'Base de datos School Policy AI inicializada correctamente' AS status;

-- ===================================================================
-- TABLAS PARA REPOSITORIO DE POLÍTICAS CON IA
-- ===================================================================

-- Tabla de roles del sistema
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insertar roles predefinidos
INSERT INTO roles (id, name, description) VALUES
  ('admin', 'Administrador', 'Acceso total al sistema'),
  ('directivo', 'Directivo/Rectoria', 'Gestión de políticas y documentos'),
  ('profesor', 'Profesor', 'Acceso a políticas académicas y educativas'),
  ('alumno', 'Estudiante', 'Acceso a políticas estudiantiles'),
  ('padre', 'Padre/Apoderado', 'Acceso a políticas para familias')
ON CONFLICT (id) DO NOTHING;

-- Tabla de documentos del repositorio
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY DEFAULT 'doc_' || gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('policy', 'manual', 'procedure', 'handbook', 'other')),
  category TEXT NOT NULL,
  description TEXT,
  storage_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  upload_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla de chunks (fragmentos) de documentos con embeddings
CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY DEFAULT 'chunk_' || gen_random_uuid()::TEXT,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_number INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding vector(1536),
  position_in_doc JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, chunk_number)
);

-- Tabla de permisos por rol
CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY DEFAULT 'perm_' || gen_random_uuid()::TEXT,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  can_view BOOLEAN DEFAULT TRUE,
  can_search BOOLEAN DEFAULT TRUE,
  can_ask_questions BOOLEAN DEFAULT TRUE,
  can_upload BOOLEAN DEFAULT FALSE,
  can_manage BOOLEAN DEFAULT FALSE,
  rate_limit_per_hour INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role_id)
);

-- Tabla de políticas de acceso específico a documentos
CREATE TABLE IF NOT EXISTS document_access_policies (
  id TEXT PRIMARY KEY DEFAULT 'daccess_' || gen_random_uuid()::TEXT,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('view', 'search', 'ask', 'none')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, role_id)
);

-- Tabla de consultas IA con contexto
CREATE TABLE IF NOT EXISTS ai_queries (
  id TEXT PRIMARY KEY DEFAULT 'query_' || gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES users(id),
  user_role TEXT NOT NULL REFERENCES roles(id),
  question TEXT NOT NULL,
  normalized_question TEXT,
  answer TEXT,
  source_documents TEXT[],
  source_chunks TEXT[],
  model_used TEXT,
  tokens_used JSONB,
  helpful_rating INTEGER CHECK (helpful_rating IN (1, 2, 3, 4, 5)) DEFAULT NULL,
  feedback TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  error_message TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Tabla de auditoría para documentos
CREATE TABLE IF NOT EXISTS document_audit_logs (
  id TEXT PRIMARY KEY DEFAULT 'dlog_' || gen_random_uuid()::TEXT,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('upload', 'update', 'delete', 'archive', 'view', 'query')),
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===================================================================
-- ÍNDICES PARA RENDIMIENTO
-- ===================================================================

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);

CREATE INDEX IF NOT EXISTS idx_document_access_document_id ON document_access_policies(document_id);
CREATE INDEX IF NOT EXISTS idx_document_access_role_id ON document_access_policies(role_id);

CREATE INDEX IF NOT EXISTS idx_ai_queries_user_id ON ai_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_queries_user_role ON ai_queries(user_role);
CREATE INDEX IF NOT EXISTS idx_ai_queries_requested_at ON ai_queries(requested_at);
CREATE INDEX IF NOT EXISTS idx_ai_queries_status ON ai_queries(status);
CREATE INDEX IF NOT EXISTS idx_ai_queries_cache_lookup
  ON ai_queries (user_role, normalized_question, requested_at DESC)
  WHERE status = 'completed' AND answer IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_audit_document_id ON document_audit_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_document_audit_user_id ON document_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_document_audit_created_at ON document_audit_logs(created_at);

-- ===================================================================
-- INSERTAR PERMISOS PREDEFINIDOS
-- ===================================================================

INSERT INTO role_permissions (role_id, can_view, can_search, can_ask_questions, can_upload, can_manage, rate_limit_per_hour) VALUES
  ('admin', TRUE, TRUE, TRUE, TRUE, TRUE, 1000),
  ('directivo', TRUE, TRUE, TRUE, TRUE, TRUE, 500),
  ('profesor', TRUE, TRUE, TRUE, FALSE, FALSE, 200),
  ('alumno', TRUE, TRUE, TRUE, FALSE, FALSE, 100),
  ('padre', TRUE, TRUE, TRUE, FALSE, FALSE, 100)
ON CONFLICT (role_id) DO NOTHING;

-- Confirmación de tablas creadas
SELECT 'Tablas del repositorio de políticas IA creadas exitosamente' AS status;



