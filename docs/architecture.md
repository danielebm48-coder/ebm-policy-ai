# Arquitectura del proyecto School Policy AI

## Enfoque general
Una aplicación web moderna con backend y portal administrativo. El mismo sistema servirá la experiencia de consulta para los distintos roles y el área de gobernanza.

## Capas

### 1. Frontend
- App web React/Next.js con soporte para roles.
- Rutas principales por perfil:
  - `/profesores`
  - `/alumnos`
  - `/padres`
  - `/directivos`
  - `/admin` (portal de gobernanza)
- Panel administrativo con edición de políticas, control de versiones y registro de cambios.

### 2. Backend
- API REST/GraphQL para:
  - Autenticación y autorización.
  - Gestión de políticas y documentos.
  - Solicitudes de consulta hacia el módulo IA.
  - Auditoría y métricas.
- Almacenamiento de normativas con campos:
  - título, tipo, descripción, fecha de vigencia, versión, estado, etiquetas.

### 3. IA
- Módulo que indexa documentos normativos.
- Usar embeddings para búsqueda semántica.
- Construir respuestas con referencia a las normas.
- Soporte para actualizar la base de conocimiento cuando cambian las políticas.

## Roles y permisos
- `Profesores`: consultar, ver procedimientos y doctrina pedagógica.
- `Alumnos`: consultar normas de convivencia, sanciones y derechos.
- `Padres`: consultar canales de comunicación, procedimientos y sanciones aplicables.
- `Personal Directivo`: gobernanza total, edición, aprobación, auditoría, gestión de usuarios.

## Funcionalidades clave
- Carga y clasificación de políticas.
- Versionado y vigencia normativa.
- Preguntas y respuestas basadas en el corpus escolar.
- Explicación de la fuente normativa en cada respuesta.
- Auditoría de cambios y consultas.
- Notificaciones de actualización normativa.

## Primera iteración
1. Prototipo de UI con rutas de cada rol.
2. Backend mínimo con autenticación y almacenamiento de políticas.
3. Conector IA simple para búsquedas en el texto.
4. Portal de administración de normas.
