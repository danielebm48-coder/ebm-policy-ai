# 🚀 Integración con Supabase

Este proyecto está configurado para conectarse a Supabase, una alternativa open-source a Firebase basada en PostgreSQL.

## 📋 Requisitos previos

1. Crear una cuenta en [Supabase](https://supabase.com)
2. Crear un nuevo proyecto en Supabase
3. Obtener las siguientes credenciales:
   - `SUPABASE_URL`: URL de tu proyecto
   - `SUPABASE_ANON_KEY`: Clave pública anon (para el cliente)
   - `SUPABASE_SERVICE_ROLE_KEY`: Clave de administrador (para el servidor)

## ⚙️ Configuración

### 1. Variables de entorno

Actualiza tu archivo `.env.development`:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 2. Instalar dependencias

```bash
npm install
```

Esto instalará `@supabase/supabase-js` junto con las otras dependencias.

## 🔧 Uso

### Importar clientes de Supabase

```typescript
import { supabaseClient, supabaseAdmin } from './src/supabase';
```

### Cliente público (`supabaseClient`)
Úsalo para operaciones del lado del cliente:
- Consultas de lectura
- Autenticación de usuarios
- Operaciones limitadas por RLS (Row Level Security)

```typescript
const { data, error } = await supabaseClient
  .from('policies')
  .select('*')
  .eq('status', 'published');
```

### Cliente admin (`supabaseAdmin`)
Úsalo solo en el servidor para operaciones privilegiadas:
- Crear/modificar usuarios
- Operaciones que requieren permisos de admin
- Operaciones que bypasean RLS

```typescript
const { data, error } = await supabaseAdmin
  .from('users')
  .insert([{ id: '123', name: 'John', email: 'john@example.com', role: 'admin' }])
  .select();
```

## 📚 Ejemplos comunes

Consulta el archivo `src/supabase-examples.ts` para ejemplos de:
- ✅ Obtener usuarios
- ✅ Crear usuarios
- ✅ Obtener políticas con filtros
- ✅ Actualizar políticas
- ✅ Registrar audit logs
- ✅ Autenticación de usuarios

## 🗄️ Migrando datos existentes

Si tienes datos en PostgreSQL local y quieres migrarlos a Supabase:

1. Ve al editor SQL en la consola de Supabase
2. Copia tu `db/init.sql` y pega el contenido
3. O usa herramientas como `pg_dump` y `psql` para migrar

## 🔒 Seguridad

- Nunca commits tus variables de entorno (están en `.gitignore`)
- Usa `SUPABASE_ANON_KEY` en el cliente
- Usa `SUPABASE_SERVICE_ROLE_KEY` SOLO en el servidor
- Configura Row Level Security (RLS) en Supabase para proteger datos

## 🧪 Probar la conexión

```typescript
import { testSupabaseConnection } from './src/supabase';

await testSupabaseConnection();
```

## 📖 Recursos

- [Documentación Supabase](https://supabase.com/docs)
- [Cliente JavaScript](https://supabase.com/docs/reference/javascript/introduction)
- [Autenticación](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

## ❓ Problemas comunes

### Error: "Missing Supabase environment variables"
- Verifica que las variables estén en tu `.env.development` o `.env.production`
- Asegúrate de que `dotenv.config()` se ejecute antes de importar supabase.ts

### Error de autenticación
- Verifica que tu `SUPABASE_ANON_KEY` sea correcta
- Para operaciones admin, necesitas `SUPABASE_SERVICE_ROLE_KEY`

### Datos no se actualizan
- Revisa la configuración de RLS en Supabase
- Verifica que el cliente tenga permisos para la tabla
