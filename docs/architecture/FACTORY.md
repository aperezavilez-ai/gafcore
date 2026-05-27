# Modo Fábrica GafCore (v1 + Fase B/C)

Flujo automatizado: **idea → plan → código → validación → build smoke → diseño → (opcional) deploy**.

## Activación

1. IDE → menú **+** → **Modo Fábrica** → ON.
2. (Opcional) **Plantilla fábrica** → Auto, Landing, Dashboard, Tienda, Starter o SaaS.
3. (Opcional) **Fábrica → Publicar al terminar** → ON (requiere GitHub conectado en servidor).
4. Escribe tu idea y pulsa **Construir**.

## Fases

| Fase | Qué hace |
|------|----------|
| Plan | Planner multiagente + pipeline `interpret` |
| Generar | Workflow en olas (máx. 12) |
| Validar | `finalizePipelineValidation` + autofix |
| Build smoke | Transpile TS/JS + exige `App.tsx` |
| Diseño | Crítica automática si score &lt; 80 |
| Deploy | Solo si **Publicar al terminar** ON y gate OK |

## API

| Método | Ruta |
|--------|------|
| POST | `/api/gafcore/factory/run` |
| POST | `/api/gafcore/factory/status` |

Body `run`:

```json
{
  "projectId": "uuid",
  "instruction": "Landing SaaS con hero y pricing",
  "files": [{ "name": "App.tsx", "content": "..." }],
  "runDesignCritique": true,
  "autoDeploy": false,
  "factoryProfileId": "landing"
}
```

`factoryProfileId` opcional: `auto` (omitir), `landing`, `dashboard`, `ecommerce`, `starter`, `saas`.

Server fn: `runGafcoreFactory` · `getGafcoreFactoryStatus`.

## Métricas (Fase C)

Cada run guarda `factoryMetrics` en `gafcore_pipeline_runs.payload_json`:

- `phases[]`: planificación, generating, validating, build_smoke, design_critique, deploy
- `validationScore`, `buildSmokeOk`, `deployOk`, `deployHost`

Consulta en Supabase o vía `getGafcoreFactoryStatus` + `pipeline.payload_json`.

## Deploy automático

- Usa `publishProjectOnServer` (mismo gate que **Publicar** manual: `GAFCORE_DEPLOY_VALIDATION_GATE`).
- Requiere token GitHub guardado en servidor (Publicar → Conectar).
- Si falla el gate o GitHub, el run devuelve `deploy_failed` con mensaje.

## Requisitos

- Migraciones workflow: `npm run gafcore:migrate-workflow`
- IA configurada (`OPENROUTER_API_KEY` / `OPENAI_API_KEY`)
- Vercel Pro recomendado (runs largos)

## Smoke

```bash
npm run gafcore:smoke-factory
```

## Plantillas acotadas (perfiles)

En el IDE puedes fijar la plantilla o dejar **Auto** (detección por texto + `classifyUserIntent`). El servidor recibe `factoryProfileId` y aplica `promptAddon` + secciones obligatorias.

| Selector IDE | `factoryProfileId` |
|--------------|-------------------|
| Auto (detectar) | omitir o `auto` |
| Landing SaaS | `landing` |
| Dashboard | `dashboard` |
| Tienda básica | `ecommerce` |
| Starter funcional | `starter` |
| SaaS genérico | `saas` |

Detección automática (sin selector manual):

| Perfil | Cuándo | Secciones obligatorias |
|--------|--------|------------------------|
| Landing SaaS | hero, landing, pricing | hero, features, pricing/CTA, footer |
| Dashboard | dashboard, KPI, sidebar | nav, tarjetas KPI, tabla |
| Tienda | ecommerce, carrito | header, grid, CTA |
| SaaS genérico | resto | hero, valor, CTA |

## E2E post-deploy

Si **Publicar al terminar** está ON y el deploy a GitHub/Vercel OK, el servidor hace GET a `/` y `/index.html` (HTTP 2xx).

## Panel admin

`/gafcore/admin/ops` — bloque **Métricas Modo Fábrica** (% éxito por fase, últimos runs, filtro por plantilla, tendencia por perfil con rango 7d/14d/30d).

**Alertas de calidad:** si una fase tiene ≥3 muestras y tasa de éxito &lt;70%, aparece alerta por fase. Tasa global &lt;55% con ≥3 runs → alerta global.

## Ejecución async (Vercel)

En producción (`VERCEL=1`) el run responde de inmediato con `async: true` y continúa en segundo plano vía `waitUntil`. El IDE hace polling con `getGafcoreFactoryStatus` hasta `factoryResult` en `payload_json`.

- Local/dev: síncrono (sin timeout de función).
- Forzar async en local: `GAFCORE_FACTORY_ASYNC=1`.
- `maxDuration` SSR: ver `GAFCORE_SSR_MAX_DURATION_S` en build (`scripts/vercel-sync-ssr-assets.mjs`).

## Admin: export CSV

`/gafcore/admin/ops` → **CSV (vista)** o **CSV (200)** con métricas por run.

## Límites

- Rate limit: `gafcore_factory_run` (8/min)
- E2E = HTTP básico, no Playwright en navegador
- Proyectos muy grandes: dividir en varios prompts
