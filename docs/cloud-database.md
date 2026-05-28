# Bases de datos en la nube para disponibilidad 24/7

## Opciones recomendadas

### 1. **Supabase** ⭐ (Recomendado para este proyecto)
- **Qué es**: PostgreSQL en la nube con autenticación y real-time incluidos
- **Precio**: Plan gratuito hasta 500 MB, luego desde $5/mes
- **Ventajas**: 
  - PostgreSQL nativo
  - API REST automática
  - Autenticación JWT integrada
  - 24/7 disponibilidad
- **URL**: https://supabase.com

#### Configuración rápida en Supabase:
1. Regístrate en https://app.supabase.com
2. Crea un nuevo proyecto
3. Copia la URL de conexión PostgreSQL
4. En `.env` reemplaza:
```env
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres
```

---

### 2. **AWS RDS for PostgreSQL**
- **Qué es**: PostgreSQL administrado por Amazon
- **Precio**: Desde $0.15/hora (~$11/mes)
- **Ventajas**: 
  - Altamente escalable
  - Backups automáticos
  - Multi-región disponible
  - SLA 99.95%
- **URL**: https://aws.amazon.com/rds/postgresql/

---

### 3. **Railway.app** 💚
- **Qué es**: Plataforma moderna para aplicaciones full-stack
- **Precio**: Plan gratuito $5/mes, después $0.09/hora
- **Ventajas**:
  - Muy fácil de usar
  - Integración automática con GitHub
  - Base de datos + API en un solo lugar
- **URL**: https://railway.app

---

### 4. **Heroku Postgres**
- **Qué es**: PostgreSQL en Heroku (ahora parte de Salesforce)
- **Precio**: Desde $50/mes (cambió recientemente, era más barato)
- **Ventajas**: Integración fácil con deploy de Heroku
- **URL**: https://www.heroku.com/postgres

---

### 5. **Azure Database for PostgreSQL**
- **Qué es**: PostgreSQL en Microsoft Azure
- **Precio**: Desde $0.10/hora
- **Ventajas**: Integración con ecosistema Microsoft
- **URL**: https://azure.microsoft.com/en-us/products/postgresql/

---

## Comparativa rápida

| Proveedor | Precio | Facilidad | Recomendación |
|-----------|--------|-----------|---------------|
| **Supabase** | 💰 Gratis (500 MB) | ⭐⭐⭐⭐⭐ Muy fácil | ✅ RECOMENDADO |
| **Railway** | 💰 $5/mes | ⭐⭐⭐⭐⭐ Muy fácil | ✅ EXCELENTE |
| **AWS RDS** | 💰 ~$11/mes | ⭐⭐⭐ Moderado | Para grandes proyectos |
| **Heroku** | 💰 $50/mes | ⭐⭐⭐⭐ Fácil | Caro actualmente |
| **Azure** | 💰 ~$7/mes | ⭐⭐⭐ Moderado | Buena opción |

---

## Mi recomendación: Supabase

### Por qué Supabase es ideal para tu proyecto:

1. ✅ **PostgreSQL puro** - Compatible 100% con tu código actual
2. ✅ **Gratis inicialmente** - 500 MB de almacenamiento gratis
3. ✅ **Fácil de usar** - Dashboard visual para ver tablas
4. ✅ **24/7** - Disponible siempre en la nube
5. ✅ **Escalable** - Crece con tu proyecto
6. ✅ **Seguro** - SSL por defecto, backups automáticos

### Pasos para usar Supabase:

```bash
# 1. Regístrate en https://app.supabase.com
# 2. Crea proyecto
# 3. Ve a SQL Editor
# 4. Copia todo el contenido de db/init.sql
# 5. Pégalo y ejecuta
# 6. Copia la URL de conexión
# 7. Actualiza .env
```

---

## Arquitectura: Local vs Cloud

### Desarrollo local (actual)
```
Tu computadora
    ↓
PostgreSQL local (localhost:5432)
    ↓
Tu app Node.js
```

### Producción 24/7 (recomendado)
```
Tu app Node.js (Railway/Vercel)
    ↓
Supabase PostgreSQL (en la nube) ← 24/7 disponible
    ↓
Acceso global desde cualquier dispositivo
```

---

## Variables de entorno para ambos entornos

### `.env.development` (Local)
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/school_policy_ai
NODE_ENV=development
PORT=4000
```

### `.env.production` (Cloud - Supabase)
```env
DATABASE_URL=postgresql://postgres:[TU_PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres
NODE_ENV=production
PORT=4000
```

---

## Próximos pasos

1. **Elige una opción** (recomiendo Supabase)
2. **Crea una cuenta** y un nuevo proyecto
3. **Ejecuta `db/init.sql`** en su editor SQL
4. **Copia la URL de conexión**
5. **Actualiza `.env.production`**
6. **Deploy tu API** a Railway, Vercel o Heroku

¿Quieres que te guíe paso a paso para configurar Supabase?
