# Configuración PostgreSQL

## Instalación y configuración local

### Opción 1: PostgreSQL local en Windows

1. Descarga PostgreSQL desde [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)
2. Ejecuta el instalador y sigue las instrucciones
3. Durante la instalación, anota la contraseña del usuario `postgres`
4. El servidor PostgreSQL estará en `localhost:5432`

### Opción 2: PostgreSQL con Docker

```bash
docker run --name postgres-school-policy \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=school_policy_ai \
  -p 5432:5432 \
  -d postgres:15
```

## Conexión y configuración

### 1. Crear la base de datos

Usa **pgAdmin** (herramienta gráfica incluida con PostgreSQL) o la línea de comandos:

```bash
# Abre la consola psql
psql -U postgres

# Crea la base de datos
CREATE DATABASE school_policy_ai;

# Conectate a ella
\c school_policy_ai
```

### 2. Variables de entorno (.env)

Copia `.env.example` a `.env` y actualiza:

```env
# PostgreSQL connection string
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/school_policy_ai

# API server port
PORT=4000

# Entorno (desarrollo o producción)
NODE_ENV=development
```

### 3. Variables explicadas

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | Cadena de conexión PostgreSQL | `postgresql://usuario:contraseña@host:puerto/base_datos` |
| `PORT` | Puerto donde escucha el servidor API | `4000` |
| `NODE_ENV` | Entorno de ejecución | `development` o `production` |

### Estructura de DATABASE_URL

```
postgresql://[usuario]:[contraseña]@[host]:[puerto]/[base_datos]
```

- **usuario**: Por defecto es `postgres`
- **contraseña**: La que configuraste en la instalación
- **host**: `localhost` para máquina local
- **puerto**: `5432` es el puerto por defecto
- **base_datos**: `school_policy_ai` (la que creaste)

## Acceso a pgAdmin

Si PostgreSQL fue instalado en Windows, pgAdmin estará disponible en:

```
http://localhost:5050
```

### Credenciales por defecto

- Email: `pgadmin4@pgadmin.org`
- Contraseña: `admin`

### Agregar servidor en pgAdmin

1. Click derecho en "Servers" → "Register" → "Server"
2. Pestaña "General":
   - Name: `school-policy-ai`
3. Pestaña "Connection":
   - Host name: `localhost`
   - Port: `5432`
   - Username: `postgres`
   - Password: (la que configuraste)
4. Click "Save"

## Verificar conexión desde Node.js

Crea un archivo temporal `test-db.ts`:

```typescript
import { pool } from './src/db';

async function test() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✓ Conexión exitosa:', result.rows[0]);
  } catch (error) {
    console.error('✗ Error de conexión:', error);
  } finally {
    await pool.end();
  }
}

test();
```

Ejecuta:
```bash
npx ts-node test-db.ts
```

## Tabla de referencia rápida

| Componente | URL / Host | Puerto | Usuario | Contraseña |
|-----------|-----------|--------|---------|-----------|
| PostgreSQL | localhost | 5432 | postgres | postgres |
| pgAdmin | http://localhost:5050 | - | pgadmin4@pgadmin.org | admin |
| API Backend | http://localhost | 4000 | - | - |

## Troubleshooting

### Error: "ECONNREFUSED 127.0.0.1:5432"

**Causa**: PostgreSQL no está corriendo.

**Solución**:
- Windows: Abre "Services" y busca "PostgreSQL" → Click derecho → "Start"
- Docker: `docker start postgres-school-policy`
- Linux: `sudo systemctl start postgresql`

### Error: "password authentication failed"

**Causa**: Contraseña incorrecta en `DATABASE_URL`.

**Solución**: Verifica que la contraseña en `.env` coincida con la que configuraste.

### Error: "database school_policy_ai does not exist"

**Causa**: No creaste la base de datos.

**Solución**:
```bash
psql -U postgres -c "CREATE DATABASE school_policy_ai;"
```
