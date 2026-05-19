# GafCore — Roadmap técnico

Evolución **incremental**. No refactor masivo. Auth, Stripe, webhooks y RLS se mantienen estables.

## Estado de etapas

| Etapa | Nombre | Estado |
|-------|--------|--------|
| 0 | Observabilidad + docs | En curso (`docs/architecture/`) |
| 1 | Capa `core/project` | Hecho |
| 2 | Publish en servidor (GitHub OAuth/token cifrado) | **Hecho (código)** — aplicar migración SQL |
| 3 | Vercel automático (`VERCEL_TOKEN`) | **Hecho (código)** — token en Vercel + GitHub conectado en vercel.com |
| 4 | IA unificada (gateway) | **Hecho (código)** — `gafcore-ai-gateway.server.ts` |
| 5 | Memoria por proyecto (sin vectores) | **Hecho (código)** — `project_ai_memory` |
| 6 | Templates en BD | **Hecho (código)** — migración + seed servidor |
| 7 | Project Orchestrator | En curso — `docs/architecture/ORCHESTRATOR.md` |
| 7b | AI Validation Layer | Planificado — `docs/architecture/VALIDATION_LAYER.md` |
| 8 | Aislamiento infra por proyecto | Pendiente |
| 9 | Embeddings / vector DB | Pendiente |

---

## Etapa 1 — Project Service (P0)

**Objetivo:** Una API de dominio para proyecto activo, lista, deploy meta y nombre en UI.

**Archivos:** `src/core/project/*`, consumo desde `GafCoreIDE.tsx`.

**Pruebas:** Crear/cambiar proyecto, nombre en barra, deploy meta.

**Riesgo:** Bajo (wrapper sobre `userSupabase`).

---

## Etapa 2 — Publish servidor (P1)

**Objetivo:** `POST /api/gafcore/publish` — sin PAT en localStorage.

**Dependencias:** Etapa 1, migración `project_credentials` (propuesta).

**Pruebas:** Publish E2E, repo nuevo/existente.

---

## Etapa 3 — Vercel automático (P1)

**Objetivo:** Crear proyecto Vercel + URL en `deploy_site_url`.

**Env:** `VERCEL_TOKEN` en Vercel.

---

## Etapas 4–9

Ver análisis completo en historial de planificación (chat arquitectura). Priorizar 1→2→3 antes de multiagente.

---

## Estructura objetivo (lógica)

```
src/core/project/     ← Etapa 1
src/orchestrator/     ← Etapa 2–3, 7
src/agents/           ← Etapa 4, 7
src/services/github/  ← Etapa 2
src/services/vercel/  ← Etapa 3
src/memory/           ← Etapa 5, 9
src/templates/        ← Etapa 6
```

El monolito TanStack **no se mueve** de golpe; se extrae dominio por módulos.
