-- Ejecutar en Supabase SQL Editor si Render sigue mostrando
-- ai_queries_user_id_fkey despues de desplegar.

create extension if not exists vector;

insert into roles (id, name, description)
values
  ('admin', 'Administrador', 'Acceso total al sistema'),
  ('directivo', 'Directivo/Rectoria', 'Gestion de politicas y documentos'),
  ('profesor', 'Profesor', 'Acceso a politicas academicas y educativas'),
  ('alumno', 'Estudiante', 'Acceso a politicas estudiantiles'),
  ('padre', 'Padre/Apoderado', 'Acceso a politicas para familias')
on conflict (id) do update
set name = excluded.name,
    description = excluded.description;

insert into users (id, name, email, role, active, password, created_at)
values
  ('u_system', 'Sistema', 'system@colegio.edu', 'admin', true, 'system2026', now()),
  ('u_dguzman_admin', 'D. Guzman', 'dguzman@ebm.edu.sv', 'admin', true, 'admin2026', now()),
  ('u_enadeh_admin', 'E. Nadeh', 'enadeh@ebm.edu.sv', 'admin', true, 'admin2026', now()),
  ('u_directivo', 'Directora Ana', 'ana@colegio.edu', 'directivo', true, 'directivo2026', now()),
  ('u_profesor', 'Profesor Luis', 'luis@colegio.edu', 'profesor', true, 'profesor2026', now()),
  ('u_demo_profesor', 'Profesor Demo', 'demo@colegio.edu', 'profesor', true, 'demo2026', now()),
  ('u_profesor_demo', 'Profesor Demo Web', 'profesor.demo@colegio.edu', 'profesor', true, 'profesor2026', now()),
  ('u_alumno', 'Alumno Mario', 'mario@colegio.edu', 'alumno', true, 'alumno2026', now()),
  ('u_padre', 'Padre Carmen', 'carmen@colegio.edu', 'padre', true, 'padre2026', now()),
  ('u_test_user', 'Usuario de prueba', 'test@colegio.edu', 'profesor', true, 'test2026', now())
on conflict (id) do update
set name = excluded.name,
    email = excluded.email,
    role = excluded.role,
    active = excluded.active,
    password = excluded.password;

insert into role_permissions (role_id, can_view, can_search, can_ask_questions, can_upload, can_manage, rate_limit_per_hour)
values
  ('admin', true, true, true, true, true, 1000),
  ('directivo', true, true, true, true, true, 500),
  ('profesor', true, true, true, false, false, 200),
  ('alumno', true, true, true, false, false, 100),
  ('padre', true, true, true, false, false, 100)
on conflict (role_id) do update
set can_view = excluded.can_view,
    can_search = excluded.can_search,
    can_ask_questions = excluded.can_ask_questions,
    can_upload = excluded.can_upload,
    can_manage = excluded.can_manage,
    rate_limit_per_hour = excluded.rate_limit_per_hour;

-- Semilla minima de documentos para que el chat tenga contexto aun si la ingesta
-- masiva no se ha ejecutado todavia.
insert into documents (id, name, type, category, description, storage_path, uploaded_by, status, version)
values
  ('doc_manual_convivencia_2026', 'Manual de Convivencia Escolar 2026', 'manual', 'Convivencia', 'Normas de asistencia, uniforme, dispositivos y convivencia escolar.', 'seed/manual-convivencia.md', 'u_system', 'active', 1),
  ('doc_politica_evaluacion', 'Politica de Evaluacion y Calificacion', 'policy', 'Academico', 'Criterios de evaluacion, ausencias y honestidad academica.', 'seed/politica-evaluacion.md', 'u_system', 'active', 1),
  ('doc_protocolo_seguridad', 'Protocolo de Seguridad y Emergencias', 'procedure', 'Seguridad', 'Evacuacion, primeros auxilios e ingreso de personas externas.', 'seed/protocolo-seguridad.md', 'u_system', 'active', 1)
on conflict (id) do update
set name = excluded.name,
    type = excluded.type,
    category = excluded.category,
    description = excluded.description,
    status = excluded.status,
    version = excluded.version,
    last_updated = now();

insert into document_chunks (id, document_id, chunk_number, text, embedding, metadata)
values
  (
    'chunk_manual_convivencia_001',
    'doc_manual_convivencia_2026',
    1,
    'Manual de Convivencia Escolar 2026. Asistencia y puntualidad: Los estudiantes deben ingresar al establecimiento antes de las 08:00 AM. Toda inasistencia debe ser justificada por el apoderado en un plazo de 48 horas. Tres atrasos injustificados en un mes resultaran en una citacion al apoderado. Uniforme y presentacion personal: El uniforme oficial consiste en polera institucional, pantalon azul marino y zapatos negros. En Educacion Fisica se debe usar el buzo del colegio. Dispositivos tecnologicos: El uso de telefonos celulares esta prohibido durante las horas de clase, salvo autorizacion del profesor con fines pedagogicos. El colegio no se hace responsable por perdida o dano de dispositivos personales. El ciberacoso sera sancionado segun la gravedad de la falta.',
    null,
    '{"seed": true}'::jsonb
  ),
  (
    'chunk_politica_evaluacion_001',
    'doc_politica_evaluacion',
    1,
    'Politica de Evaluacion y Calificacion. Las evaluaciones se basan en objetivos de aprendizaje ministeriales y del Bachillerato Internacional IB. La escala de calificacion es de 1.0 a 7.0, siendo 4.0 la nota minima de aprobacion. Deben realizarse al menos 4 calificaciones por semestre en asignaturas principales. Ausencia a evaluaciones: si un estudiante falta a una evaluacion programada, debe presentar certificado medico. La nueva fecha sera coordinada por el profesor jefe y no puede exceder los 5 dias habiles desde el retorno. En caso de inasistencia injustificada, el estudiante sera evaluado con exigencia del 70%. Honestidad academica: el plagio o copia en pruebas resulta en calificacion minima 1.0. El uso de inteligencia artificial para tareas sin citar es falta a la honestidad academica.',
    null,
    '{"seed": true}'::jsonb
  ),
  (
    'chunk_protocolo_seguridad_001',
    'doc_protocolo_seguridad',
    1,
    'Protocolo de Seguridad y Emergencias. Ante emergencia como sismo o incendio, se activa la alarma sonora. Todos deben dirigirse con calma a la Zona de Seguridad asignada en el patio central. Los profesores deben portar el libro de clases para pasar lista. Primeros auxilios: enfermeria escolar atiende incidentes menores. En accidente grave se activa el seguro escolar y se traslada al centro asistencial mas cercano. La administracion debe contactar inmediatamente a los padres. Ingreso de personas externas: todo visitante debe registrarse en porteria y portar credencial de visita. No se permite ingreso de repartidores de comida durante la jornada escolar. El retiro anticipado de alumnos solo puede hacerlo el apoderado legal o persona autorizada por escrito.',
    null,
    '{"seed": true}'::jsonb
  )
on conflict (id) do update
set text = excluded.text,
    embedding = excluded.embedding,
    metadata = excluded.metadata;

insert into document_access_policies (document_id, role_id, access_level)
select d.id, r.id, 'ask'
from documents d
cross join roles r
where d.id in ('doc_manual_convivencia_2026', 'doc_politica_evaluacion', 'doc_protocolo_seguridad')
on conflict (document_id, role_id) do update
set access_level = excluded.access_level,
    updated_at = now();

-- Funcion vectorial compatible con embeddings de 1536 dimensiones.
-- Si tu columna document_chunks.embedding sigue como vector(3072), primero ejecuta:
-- alter table document_chunks drop column embedding;
-- alter table document_chunks add column embedding vector(1536);
create or replace function match_documents (
  query_embedding vector(1536),
  match_count int default 5,
  match_threshold float default 0.2
)
returns table (
  id text,
  document_id text,
  chunk_number int,
  text text,
  similarity float
) language sql stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.chunk_number,
    dc.text,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where dc.embedding is not null
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
