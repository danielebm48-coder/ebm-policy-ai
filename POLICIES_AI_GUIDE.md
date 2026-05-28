# 📚 Sistema de Repositorio de Políticas Escolares con IA

## 🎯 Descripción General

Este sistema permite que diferentes miembros de la comunidad escolar (estudiantes, padres, maestros, administrativos) hagan preguntas sobre las políticas, manuales y documentos de la institución. Las respuestas son generadas por IA (Google Gemini) basándose en el repositorio centralizado de documentos.

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                      USUARIO                                    │
│         (Estudiante, Padre, Maestro, Administrativo)            │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │   API REST (Express)        │
         │  /api/policies/ask          │
         │  /api/policies/documents    │
         └──────────┬──────────────────┘
                    │
        ┌───────────┴────────────┐
        │                        │
        ▼                        ▼
  ┌──────────────────┐   ┌──────────────────┐
  │  Supabase DB     │   │ Google Gemini    │
  │  (PostgreSQL +   │   │ (Embeddings +    │
  │   pgvector)      │   │  Generation)     │
  └──────────────────┘   └──────────────────┘
        │
        ├─ Documentos
        ├─ Chunks + Embeddings
        ├─ Permisos por rol
        └─ Historial de consultas
```

## 🗂️ Estructura de Datos

### Tablas Principales

#### `documents`
Almacena metadatos de documentos cargados.
- `id`: Identificador único
- `name`: Nombre del documento
- `type`: Tipo (policy, manual, procedure, handbook, other)
- `category`: Categoría (ej: "Académico", "IB", "Evaluación")
- `storage_path`: Ruta en Supabase Storage
- `status`: Estado (active, archived, draft)
- `uploaded_by`: Usuario que cargó
- `version`: Número de versión

#### `document_chunks`
Fragmentos de documentos con embeddings para búsqueda.
- `id`: ID único del chunk
- `document_id`: Referencia al documento
- `chunk_number`: Número secuencial
- `text`: Contenido del fragmento
- `embedding`: Vector de embeddings (1536 dimensiones)
- `position_in_doc`: Metadatos de posición

#### `roles`
Roles de usuario en el sistema.
- `id`: admin, directivo, profesor, alumno, padre
- `name`: Nombre legible
- `description`: Descripción

#### `role_permissions`
Permisos base por rol.
- `role_id`: Referencia a rol
- `can_view`: Ver documentos
- `can_search`: Buscar
- `can_ask_questions`: Hacer consultas IA
- `can_upload`: Subir documentos
- `can_manage`: Gestionar sistema
- `rate_limit_per_hour`: Límite de consultas

#### `document_access_policies`
Control granular de acceso a documentos específicos.
- `document_id`: Documento
- `role_id`: Rol
- `access_level`: view, search, ask, none

#### `ai_queries`
Historial de consultas y respuestas.
- `question`: Pregunta del usuario
- `answer`: Respuesta generada
- `source_documents`: Documentos utilizados
- `source_chunks`: Chunks específicos
- `tokens_used`: Conteo de tokens
- `helpful_rating`: Calificación (1-5)
- `status`: pending, processing, completed, error

#### `document_audit_logs`
Auditoría de acceso a documentos.
- `action`: upload, update, delete, archive, view, query
- `user_id`: Usuario que realizó la acción
- `ip_address`: IP de origen
- `timestamp`: Cuándo ocurrió

## 🚀 Instalación

### 1. Requisitos previos

```bash
# Node.js 18+
# Supabase project
# Google Gemini API key
```

### 2. Variables de entorno

Actualiza `.env.development`:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google Gemini
GEMINI_API_KEY=your_gemini_api_key

# Base de datos local (opcional)
DATABASE_URL=postgresql://...

PORT=4000
NODE_ENV=development
```

### 3. Crear tablas en Supabase

Ejecuta en el SQL Editor de Supabase:

```bash
# 1. Primero ejecuta db/init.sql (tablas base)
# 2. Luego ejecuta db/pgvector-functions.sql (funciones y índices)
```

### 4. Habilitar extensión vector en Supabase

En Supabase Dashboard → SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS "vector";
```

### 5. Instalar dependencias

```bash
npm install
```

## 📖 Uso de la API

### Hacer una pregunta

```bash
curl -X POST http://localhost:4000/api/policies/ask \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -H "x-user-role: alumno" \
  -H "x-user-email: alumno@colegio.edu" \
  -d '{"question": "¿Cuál es la política de honestidad académica?"}'
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "queryId": "query_1234567890",
    "question": "¿Cuál es la política de honestidad académica?",
    "answer": "La política de honestidad académica...",
    "sourceDocuments": ["doc_001", "doc_002"],
    "tokensUsed": { "input": 150, "output": 250 }
  }
}
```

### Obtener documentos accesibles

```bash
curl http://localhost:4000/api/policies/documents \
  -H "x-user-id: user123" \
  -H "x-user-role: alumno" \
  -H "x-user-email: alumno@colegio.edu"
```

### Calificar una respuesta

```bash
curl -X POST http://localhost:4000/api/policies/ask/query_123/rate \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -H "x-user-role: alumno" \
  -d '{
    "rating": 5,
    "feedback": "Respuesta muy útil y clara"
  }'
```

### Obtener historial de consultas

```bash
curl http://localhost:4000/api/policies/history?limit=20 \
  -H "x-user-id: user123" \
  -H "x-user-role: alumno"
```

### Subir un documento (admin/directivo)

```bash
curl -X POST http://localhost:4000/api/policies/documents \
  -H "Content-Type: application/json" \
  -H "x-user-id: directivo123" \
  -H "x-user-role: directivo" \
  -H "x-user-email: directivo@colegio.edu" \
  -d '{
    "name": "Manual de Estudiante 2024",
    "type": "manual",
    "category": "Académico",
    "description": "Manual completo para estudiantes",
    "text": "Contenido del documento aquí..."
  }'
```

### Estadísticas de consultas (admin)

```bash
curl 'http://localhost:4000/api/policies/admin/statistics?startDate=2024-01-01' \
  -H "x-user-id: admin123" \
  -H "x-user-role: directivo"
```

## 🔐 Control de Acceso

El sistema implementa control de acceso multinivel:

1. **Por rol**: Cada rol tiene permisos base
2. **Por documento**: Acceso granular a documentos específicos
3. **Por acción**: Ver, buscar, preguntar

### Flujo de validación

```
1. ¿Usuario autenticado?
   └─ NO → 401 Unauthorized
   └─ SÍ ↓

2. ¿Rol tiene permiso para esta acción?
   └─ NO → 403 Forbidden
   └─ SÍ ↓

3. ¿Acceso a documentos específicos?
   └─ Filtrar resultados por permisos
```

## 🤖 Flujo de Procesamiento de Consultas (RAG)

```
1. Usuario hace pregunta
   ↓
2. Sistema genera embedding de la pregunta
   ↓
3. Búsqueda de chunks similares (pgvector)
   ↓
4. Filtrar por permisos del usuario
   ↓
5. Enviar chunks + pregunta a Google Gemini
   ↓
6. Gemini genera respuesta contextualizada
   ↓
7. Guardar en BD: pregunta, respuesta, fuentes
   ↓
8. Registrar auditoría
   ↓
9. Retornar respuesta al usuario
```

## 📊 Ejemplos de Documentos

El sistema está diseñado para estos tipos de documentos:

- **Protocolos de honestidad académica**: Estándares académicos, plagiarismo, conducta
- **Políticas de evaluación**: Criterios, calificación, apelaciones
- **Políticas lingüísticas**: Multilingüismo, aprendizaje de idiomas
- **Políticas de atención a barreras**: Inclusión, NEE, accesibilidad
- **Normas IB**: Bachillerato Internacional, programas, requisitos

## 🔧 Desarrollo y Testing

### Crear documento de prueba

```typescript
import { createDocument } from './src/document-service';

await createDocument(
  'Política de Honestidad Académica',
  'policy',
  'Académico',
  'Contenido de la política...',
  'admin123',
  'Política de honestidad para toda la comunidad'
);
```

### Procesar una consulta

```typescript
import { processUserQuery } from './src/query-service';

const result = await processUserQuery(
  'user123',
  'alumno',
  '¿Qué pasa si cometo plagio?'
);

console.log(result.answer);
console.log(result.sourceDocuments);
```

## 📈 Monitoreo y Estadísticas

El sistema registra:
- ✅ Todas las consultas (pregunta, respuesta, timestamp)
- ✅ Calificaciones de utilidad (1-5 estrellas)
- ✅ Acceso a documentos (auditoría completa)
- ✅ Errores y excepciones
- ✅ Uso de tokens API

## 🛡️ Seguridad

### Consideraciones

- ✅ **RLS (Row Level Security)**: Configurable en Supabase
- ✅ **Auditoría**: Todos los accesos se registran
- ✅ **Rate limiting**: Por usuario y rol
- ✅ **Validación**: Permisos en cada operación
- ✅ **Encriptación**: En tránsito (HTTPS) y en reposo (Supabase)

### Best Practices

```typescript
// Siempre validar permisos
const hasAccess = await checkDocumentAccess(docId, userRole, 'ask');
if (!hasAccess) return 403;

// Registrar todo
await logDocumentAccess(docId, userId, 'query', details, ip);

// Limitar tasa de consultas
if (queriesThisHour >= rateLimit) return 429;
```

## 🚨 Troubleshooting

### Error: "GEMINI_API_KEY not configured"
- Verifica que `GEMINI_API_KEY` esté en `.env.development`
- Obtén tu clave en: https://ai.google.dev

### Error: "embedding not found"
- pgvector puede no estar habilitado en Supabase
- Verifica SQL Editor → "CREATE EXTENSION vector"

### Respuestas lentas
- Aumenta el tamaño de chunk `chunkSize` en `document-service.ts`
- Revisa índices de pgvector en BD

## 📚 Recursos

- [Google Gemini API](https://ai.google.dev/docs)
- [Supabase pgvector](https://supabase.com/docs/guides/database/extensions/pgvector)
- [RAG Pattern](https://docs.anthropic.com/en/docs/build-a-chatbot)
- [Express.js](https://expressjs.com/)

## 📝 Próximas mejoras

- [ ] Integración completa de autenticación JWT
- [ ] Panel de administración web
- [ ] OCR para PDFs escaneados
- [ ] Búsqueda facetada avanzada
- [ ] Análisis de sentimiento en feedback
- [ ] Exportación de reportes
- [ ] Integración con WhatsApp/Telegram
