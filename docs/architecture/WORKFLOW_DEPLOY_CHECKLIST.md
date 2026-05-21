# Workflow multiagente — checklist deploy

## Supabase (una vez)

1. SQL Editor → ejecutar `supabase/scripts/apply-workflow-migrations.sql`
2. Verificar al final: 3 filas con `ok = 1`

O: `npm run gafcore:migrate-workflow` (requiere `supabase link`).

## Vercel

| Variable | Obligatorio |
|----------|-------------|
| `CRON_SECRET` o `GAFCORE_CRON_SECRET` | Sí (cron drain cada 2 min) |
| `GAFCORE_WORKFLOW_MAX_PARALLEL` | No (default 3) |
| `GAFCORE_WORKFLOW_MAX_ACTIVE_PER_USER` | No (default 2) |
| `GAFCORE_WORKFLOW_MAX_AI_CONCURRENT` | No (default 2) |
| IA (`OPENROUTER_API_KEY` / `OPENAI_API_KEY`) | Sí |

**Deploy:** rama `main` commit reciente (`68c6270+`). No redeploy de `7a69d15`.

## Probar

1. IDE → Multiagente ON → build de prueba
2. Ajustes proyecto → **Multiagente** → historial de runs
3. 2º plano: cerrar IDE 3 min → workflow debe avanzar si cron OK
