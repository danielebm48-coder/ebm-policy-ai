-- Script para habilitar Row Level Security (RLS) en todas las tablas
-- Esto garantiza que no se pueda acceder directamente a los datos desde el cliente público de Supabase
-- El backend de Express (que usa service_role / admin client) saltará estas reglas automáticamente

-- 1. Habilitar RLS en cada tabla existente y futura
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS document_access_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS document_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS document_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS document_qa_scenarios ENABLE ROW LEVEL SECURITY;

-- Nota: No se definen políticas permisivas ("CREATE POLICY ... FOR SELECT") para los roles 'anon' o 'authenticated'.
-- Al activar RLS sin políticas activas, PostgreSQL deniega por defecto todo acceso de lectura/escritura externo.
-- La clave 'service_role' utilizada por el backend en Express tiene privilegios de superusuario y omitirá el RLS,
-- permitiendo que tu backend siga operando normalmente con la base de datos de manera 100% segura.
