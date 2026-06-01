-- Tabla para códigos de alumnos autorizados
CREATE TABLE IF NOT EXISTS authorized_student_codes (
  code TEXT PRIMARY KEY,
  student_name TEXT,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  used_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_authorized_student_codes_code ON authorized_student_codes(code);
CREATE INDEX IF NOT EXISTS idx_authorized_student_codes_used ON authorized_student_codes(used);

-- Insertar algunos códigos de prueba
INSERT INTO authorized_student_codes (code, student_name) VALUES
  ('EBM-2026-001', 'Juan Pérez'),
  ('EBM-2026-002', 'María García'),
  ('EBM-2026-003', 'Carlos Rodríguez')
ON CONFLICT (code) DO NOTHING;
