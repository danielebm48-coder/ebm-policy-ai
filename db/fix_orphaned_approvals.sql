-- Este script busca usuarios con rol admin que no estan activos y les crea su solicitud de aprobacion si no la tienen.
-- Ejecuta esto en el SQL Editor de Supabase.

INSERT INTO pending_approvals (user_id, requested_role, status, requested_at)
SELECT id, role, 'pending', created_at
FROM users
WHERE role = 'admin' 
  AND active = FALSE
  AND id NOT IN (SELECT user_id FROM pending_approvals)
ON CONFLICT DO NOTHING;

-- Opcionalmente, si quieres activarla directamente por base de datos, descomenta la linea de abajo:
-- UPDATE users SET active = TRUE WHERE email = 'correo_de_la_admin@ebm.edu.sv';
