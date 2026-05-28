# Modelo de datos inicial

## Entidades principales

### Usuarios
- `UserProfile`
  - `id`
  - `name`
  - `email`
  - `role`
  - `active`
  - `createdAt`

### Políticas y normativas
- `PolicyDocument`
  - `id`
  - `title`
  - `summary`
  - `category`
  - `status`
  - `effectiveDate`
  - `version`
  - `tags`
  - `content`
  - `createdBy`
  - `updatedBy`
  - `createdAt`
  - `updatedAt`

- `PolicyVersion`
  - `versionId`
  - `policyId`
  - `title`
  - `content`
  - `summary`
  - `status`
  - `effectiveDate`
  - `tags`
  - `createdBy`
  - `createdAt`

### Consultas y respuestas IA
- `PolicyQuery`
  - `userId`
  - `role`
  - `question`
  - `requestedAt`

- `PolicyAnswer`
  - `answer`
  - `references`
  - `policyIds`
  - `createdAt`

### Auditoría
- `AuditEntry`
  - `id`
  - `action`
  - `actorId`
  - `details`
  - `createdAt`

## Relación entre entidades

1. Un `PolicyDocument` puede tener múltiples `PolicyVersion`.
2. Las consultas IA (`PolicyQuery`) se apoyan en referencias extraídas de `PolicyDocument`.
3. La auditoría registra cambios de políticas, consultas y accesos.

## Siguientes pasos para la base de datos

- Crear tablas o colecciones para:
  - `users`
  - `policies`
  - `policy_versions`
  - `policy_queries`
  - `audit_logs`
- Definir índices en campos de búsqueda: `title`, `summary`, `tags`, `content`.
- Agregar control de versiones y vigencia normativa.
