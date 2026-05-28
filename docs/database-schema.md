# Esquema de base de datos

Este documento describe la estructura relacional usada para el prototipo de School Policy AI.

## Tablas principales

### `users`
- `id` TEXT PRIMARY KEY
- `name` TEXT NOT NULL
- `email` TEXT NOT NULL UNIQUE
- `role` TEXT NOT NULL
- `active` INTEGER NOT NULL
- `password` TEXT NOT NULL
- `created_at` TEXT NOT NULL

### `policies`
- `id` TEXT PRIMARY KEY
- `title` TEXT NOT NULL
- `summary` TEXT NOT NULL
- `category` TEXT NOT NULL
- `status` TEXT NOT NULL
- `effective_date` TEXT NOT NULL
- `version` INTEGER NOT NULL
- `tags` TEXT NOT NULL -- JSON string
- `content` TEXT NOT NULL
- `created_by` TEXT NOT NULL
- `updated_by` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### `policy_versions`
- `version_id` TEXT PRIMARY KEY
- `policy_id` TEXT NOT NULL
- `title` TEXT NOT NULL
- `summary` TEXT NOT NULL
- `status` TEXT NOT NULL
- `effective_date` TEXT NOT NULL
- `version` INTEGER NOT NULL
- `tags` TEXT NOT NULL -- JSON string
- `content` TEXT NOT NULL
- `created_by` TEXT NOT NULL
- `created_at` TEXT NOT NULL

### `queries`
- `id` TEXT PRIMARY KEY
- `user_id` TEXT NOT NULL
- `role` TEXT NOT NULL
- `question` TEXT NOT NULL
- `requested_at` TEXT NOT NULL

### `audit_logs`
- `id` TEXT PRIMARY KEY
- `action` TEXT NOT NULL
- `actor_id` TEXT NOT NULL
- `details` TEXT NOT NULL
- `created_at` TEXT NOT NULL

## Índices
- `idx_policies_status` en `policies(status)`
- `idx_policies_category` en `policies(category)`
- `idx_queries_user` en `queries(user_id)`

## Notas de implementación

- Se usa SQLite para el prototipo y se inicializa en `src/db.ts`.
- Los registros de `policies` almacenan etiquetas en JSON para facilitar búsquedas flexibles.
- `policy_versions` mantiene el historial de cambios y añade trazabilidad.
- Las consultas y audit logs se almacenan para análisis y futuras métricas.

## Próximos pasos

- Añadir búsquedas semánticas con un índice FTS o con un motor externo.
- Migrar a un RDBMS como PostgreSQL cuando el sistema escale.
- Crear scripts de migración reales si el proyecto evolucione a producción.

## PostgreSQL

El backend ahora usa PostgreSQL. Configura tu conexión en la variable de entorno `DATABASE_URL`.

Ejemplo: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/school_policy_ai`
