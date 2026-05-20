# GafCore — Ejecución distribuida (B0–B3)

> Compatible con chat directo, Orchestrator y Agent Task System (A0–A2).

## Objetivo

Escalar ejecución sin romper el monolito: **cola Postgres + funciones cortas** (Vercel), no daemons 24/7.

## Componentes

| Pieza | Rol |
|-------|-----|
| `gafcore_agent_tasks` | Cola + estados + lease |
| `claim_gafcore_agent_tasks()` | RPC SKIP LOCKED (multi-worker) |
| `runWorkflowParallelWave` | Paralelo por ola del DAG (B1) |
| `POST /api/gafcore/workflow/drain` | Worker/cron (B2) |
| `GAFCORE_WORKFLOW_MAX_PARALLEL` | Concurrencia por ola (default 3) |

## Reglas de concurrencia

1. Hasta **N** tareas `ready` reclamadas por ola (`maxParallel`, env).
2. **Un solo agente escritor** por ola (frontend/backend/refactor/…) — el resto vuelve a `ready`.
3. Validación / deployment pueden ir en paralelo con el escritor.
4. Lease 5 min; leases vencidos → `ready` (reclaim).

## Flujos

### IDE (síncrono, mejorado)

`planAndStart` (guarda snapshot en `payload_json`) → `runGafcoreWorkflowWave` por ola → UI `WorkflowTaskStrip` con `getGafcoreWorkflowStatus` entre olas.

### Background (B2 + B3)

Cron → `workflow/drain` → carga `filesSnapshot` del run → una ola por invocación → merge de parches persiste en DB.

## Variables

```bash
GAFCORE_WORKFLOW_MAX_PARALLEL=3
GAFCORE_WORKFLOW_MAX_ACTIVE_PER_USER=2
GAFCORE_WORKFLOW_MAX_AI_CONCURRENT=2   # llamadas IA simultáneas por instancia (B5)
GAFCORE_WORKFLOW_AI_RETRY_MAX=3        # reintentos si el proveedor devuelve 429
GAFCORE_CRON_SECRET=...          # header x-cron-secret en drain
```

## IDE segundo plano

Menú **Multiagente en 2º plano**: `planAndStart` → poll cada ~2,8s (`getGafcoreWorkflowStatus` + `runGafcoreWorkflowWave`) → toast y parches al completar. El `workflowRunId` se guarda en `localStorage` por proyecto para reanudar tras recargar.

## Roadmap

| Fase | Estado |
|------|--------|
| B0 | RPC claim + este doc |
| B1 | Paralelo por ola |
| B2 | Drain API + cron Vercel |
| B3 | Snapshot `files` en `gafcore_workflow_runs.payload_json` + merge incremental | **Hecho** |
| B4 | `GAFCORE_WORKFLOW_MAX_ACTIVE_PER_USER` + IDE segundo plano | **Hecho** |
| B5 | Cola IA in-process + reintentos 429 (`workflow-ai-queue`) | **Hecho** |
| B6 | Cola IA distribuida (Redis) / rate limits global |

## Aplicar SQL

`supabase/migrations/20260529120000_gafcore_task_claim_rpc.sql` en Supabase SQL Editor.
