# Cómo encontrar DATABASE_URL en Supabase

## 🎯 Pasos para obtener la cadena de conexión

### Paso 1: Entra a tu proyecto en Supabase
1. Ve a https://app.supabase.com
2. Selecciona tu proyecto `colegio-políticas`
3. Verás el dashboard del proyecto

### Paso 2: Ve a Settings (Configuración)
```
Dashboard → Settings (en el menú izquierdo, abajo)
```

O directamente:
```
https://app.supabase.com/project/[PROJECT_ID]/settings/database
```

### Paso 3: Busca "Database" en Settings
Dentro de Settings, ve a la sección: **Database** (lado izquierdo)

### Paso 4: Copia la Connection String
En la sección "Connection string", verás:

**URI**
```
postgresql://postgres.[PROJECT_ID]:[YOUR_PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

O si quieres usar **psql** o Node:

**Connection parameters** (mira la opción que dice "Nodejs" o "PostgreSQL")

---

## 📍 Ubicación exacta (imágenes descritas)

```
Dashboard de Supabase
    ↓
[Settings] ← Click aquí (abajo a la izquierda)
    ↓
[Database] ← Selecciona esta sección
    ↓
[Connection string] ← Aquí está!
    ↓
Verás varias opciones:
  • URI (para pgAdmin/psql)
  • JDBC URL
  • Connection parameters (para apps)
```

---

## 🔍 Alternativa: Via Settings → API

Si no encuentras Database:

1. Ve a **Settings**
2. Click en **API** (en el panel izquierdo)
3. Verás tu `Project URL` y `Anon Key`
4. Para la BD, vuelve y busca **Database** en Settings

---

## ✅ Qué deberías ver

La cadena completa se vería así:

```
postgresql://postgres.[PROJECT_ID]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

Donde:
- `[PROJECT_ID]` = Tu ID del proyecto (ej: `ptvifyvuygdbivfztvek`)
- `[PASSWORD]` = La contraseña que copiaste/generaste en Supabase
- `aws-0-us-east-1.pooler.supabase.com` = Servidor de Supabase

---

## 🔐 Si no recuerdas la contraseña

1. Ve a **Settings → Database → Reset database password**
2. Genera una nueva contraseña
3. Cópiala INMEDIATAMENTE (solo aparece una vez)
4. Pégala en tu `.env.production` en lugar de `[PASSWORD]`

---

## 📝 Actualiza tu .env.production

Una vez tengas la cadena completa, reemplaza en tu archivo:

De esto:
```env
DATABASE_URL=postgresql://postgres:@db.[PROJECT_ID].supabase.co:5432/postgres
```

A esto:
```env
DATABASE_URL=postgresql://postgres.[PROJECT_ID]:[TU_PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

---

## 🧪 Prueba la conexión

Una vez actualizado `.env.production`, prueba con:

```bash
# Si tienes psql instalado:
psql "postgresql://postgres.[PROJECT_ID]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres" -c "SELECT COUNT(*) FROM users;"
```

Deberías ver: `count: 5` (si la BD tiene los 5 usuarios de prueba)

---

## 🆘 Si aún no encuentras

Cuéntame:
1. ¿Ves el proyecto `colegio-políticas` en tu dashboard?
2. ¿Encontraste la sección Settings?
3. ¿Ves una opción "Database" o "Database Connections"?

Comparte una captura o describe qué ves y te guío exactamente.
