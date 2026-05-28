# Estrategia de bases de datos: Local + Cloud

## Tu flujo de desarrollo y producción

```
DESARROLLO (tu computadora)
├─ DB Local (PostgreSQL en tu PC) ← Pruebas rápidas
├─ App Node.js local
└─ Solo acceso desde tu máquina

        ↓↓↓ DEPLOY A PRODUCCIÓN ↓↓↓

PRODUCCIÓN (disponible 24/7)
├─ DB Cloud (Supabase/AWS/Railway)
├─ App en la nube (Railway/Vercel/Render)
└─ Acceso global desde cualquier dispositivo
```

## Ventajas de este enfoque

| Aspecto | Local | Cloud |
|--------|-------|-------|
| **Velocidad desarrollo** | ⚡ Muy rápido | - |
| **Disponibilidad** | - | 🌍 24/7 |
| **Costo** | 💰 Gratis | 💵 Bajo (~$5-10/mes) |
| **Acceso** | Solo tu PC | Desde cualquier lugar |
| **Datos** | Tu computadora | Servidores seguros |

## Pasos para configurar ambos entornos

### 1️⃣ Desarrollo local (ya lo tienes casi listo)

```bash
# .env.development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/school_policy_ai
NODE_ENV=development
PORT=4000
```

Comando:
```bash
npm run dev
```

---

### 2️⃣ Producción en la nube (nuevo)

**Opción A: Supabase (más fácil)**

```bash
# .env.production
DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres
NODE_ENV=production
PORT=4000
```

**Opción B: Railway (deploy + DB juntos)**

```bash
# Solo configura estas variables en Railway:
DATABASE_URL=postgresql://...
NODE_ENV=production
```

---

## Migración de datos entre Local y Cloud

Si quieres pasar datos de tu BD local a la nube:

```bash
# 1. Exporta tu BD local
pg_dump -U postgres school_policy_ai > backup.sql

# 2. Importa a Supabase
psql "postgresql://postgres:PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres" < backup.sql
```

---

## Resumen: ¿Qué necesitas hacer?

✅ **Para Desarrollo (local)**:
1. Instala PostgreSQL en tu PC
2. Crea BD: `school_policy_ai`
3. Ejecuta `db/init.sql`
4. Usa `.env.development`

✅ **Para Producción (cloud)**:
1. Elige Supabase o Railway
2. Crea un proyecto
3. Ejecuta `db/init.sql` en su editor SQL
4. Usa `.env.production` con la URL de la nube
5. Deploy tu app a Railway/Vercel

---

## URLs de referencia rápida

| Acción | URL |
|--------|-----|
| Crear Supabase | https://app.supabase.com |
| Crear Railway | https://railway.app |
| Documentación Supabase | https://supabase.com/docs |
| Documentación Railway | https://docs.railway.app |

Recomiendo: **Comienza con Supabase** (más simple) y luego puedes escalar.
