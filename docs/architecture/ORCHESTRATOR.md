# GafCore — Project Orchestrator

Cerebro central de coordinación para generación, validación, memoria y deploy. Evolución incremental; no reemplaza el monolito TanStack de golpe.

## Estado

| Fase | Entregable | Estado |
|------|------------|--------|
| O0 | Este documento + tipos | Hecho |
| O1 | Tabla `gafcore_pipeline_runs`, server fns shell | Hecho |
| O2 | Validación + memoria vía `finalizeGafcorePipelineRun` | Hecho |
| O3 | Intent + template selector | Hecho (reglas) |
| O4 | ChatPanel reporta pasos al run | Hecho (build + projectId) |
| O5 | SSE `/api/gafcore/orchestrator/events?runId=` | Hecho |
| O6 | Docs agent | Pendiente |
| O7 | Deploy gate | Pendiente |
| O8 | Multiagente (`src/agents/`, `src/tasks/`) | **A2** — planner + batch executor, IDE beta |

## Arquitectura

```
ChatPanel (vista)
    → startGafcorePipelineRun / advanceGafcorePipelineStep / finalizeGafcorePipelineRun
    → gafcore-orchestrator.server (persistencia)
    → gafcore-orchestrator-pipeline.server (validate + memory)
    → módulos existentes: gateway, templates, validate, deploy
```

## Tabla `gafcore_pipeline_runs`

- `state`: pending | interpreting | generating | validating | retrying | persisting_memory | completed | failed | cancelled
- `current_step`: interpret | generate | validate | retry | memory | document | deploy
- `intent_json`, `payload_json`, `events_json` (últimos 50 hitos)

## Contrato UI → servidor

1. **start** — clasifica intención, crea run, devuelve `runId` + `intent` + `suggestedTemplateSlug`
2. **advance** — cliente marca `generating` / `retrying` (IA sigue en stream existente)
3. **finalize** — servidor valida archivos mergeados, persiste memoria, cierra run
4. **events SSE** — polling ligero de `events_json` para barra de progreso

## Límites actuales

- La **generación IA** sigue en `POST /api/gafcore/chat/stream` (cliente); el Orchestrator no duplica el stream aún.
- **Reintento** automático sigue en ChatPanel; el run registra paso `retrying`.
- **Deploy** no está acoplado al pipeline.

## Riesgos

- Créditos por retry: presupuesto por run (futuro).
- RLS memoria: reforzar con `projects.user_id` (migración futura).
- Runs huérfanos: cron de limpieza `state IN (pending, generating)` > 1h (futuro).

Ver también `ROADMAP.md` Etapa 7.
