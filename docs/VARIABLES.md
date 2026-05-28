# Guía rápida de variables de entorno

## .env (desarrollo)

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/school_policy_ai
PORT=4000
NODE_ENV=development
```

## Acceso a PostgreSQL

### pgAdmin Web
- URL: http://localhost:5050
- Email: pgadmin4@pgadmin.org
- Password: admin

### Línea de comandos
```bash
psql -U postgres -d school_policy_ai -h localhost
```

## Variables críticas

| Variable | Valor por defecto | Producción |
|----------|-----------------|-----------|
| DATABASE_URL | postgresql://postgres:postgres@localhost:5432/school_policy_ai | Cambiar contraseña y host |
| PORT | 4000 | 3000 o 8000 |
| NODE_ENV | development | production |

Consulta [postgresql-setup.md](./postgresql-setup.md) para detalles completos.
