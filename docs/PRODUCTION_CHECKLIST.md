# GafCore — Checklist de producción

## Supabase (SQL Editor)

Ejecutar migraciones en orden (o usar `20260524120000_migrations_repair_idempotent.sql` si hubo error 42710 en políticas):

1. `20260520120000_user_github_credentials.sql` (si falta)
2. `20260521120000_project_ai_memory.sql`
3. `20260522120000_gafcore_project_templates.sql`
4. `20260523120000_project_deploy_status.sql`

Verificación:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'projects' AND column_name LIKE 'deploy%';

SELECT slug, name FROM public.gafcore_project_templates ORDER BY sort_order;
```

Plantillas vacías: tras deploy, crear un proyecto en el IDE o `POST /api/gafcore/admin/seed-templates` (admin).

## Vercel (proyecto gafcore.com)

| Variable | Obligatorio | Uso |
|----------|-------------|-----|
| `VERCEL_TOKEN` | Para auto-deploy | Crear proyecto + deploy tras push GitHub |
| `VERCEL_TEAM_ID` | No | Solo si el token es de un team |
| `VERCEL_WEBHOOK_SECRET` | Recomendado | Webhook → `/api/gafcore/vercel-webhook` |
| `OPENROUTER_API_KEY` o `OPENAI_API_KEY` | Sí | Chat IDE |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Servidor |
| `GAFCORE_DEPLOY_GITHUB_TOKEN` | Opcional | PAT plataforma para publish |

Webhook Vercel: **Settings → Webhooks → Deployment** → URL:

`https://gafcore.com/api/gafcore/vercel-webhook`

## GitHub

- Usuario conecta token en **Publicar → Conectar** (o PAT en servidor).
- Cuenta Vercel debe tener **GitHub conectado** para deploy automático.

## Tras deploy

1. IDE → **+ Nuevo** → elegir plantilla.
2. **Publicar** → estado «Compilando en Vercel…» → «Sitio en vivo».
3. Configuración → `tu-app.vercel.app` como sitio publicado.
