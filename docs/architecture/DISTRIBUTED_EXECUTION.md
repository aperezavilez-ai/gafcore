# GafCore — Ejecución distribuida (B0–B2)

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

`planAndStart` → `runGafcoreWorkflowBatch` → olas paralelas hasta fin o límite.

### Background (B2)

Cron → `workflow/drain` → reclama workflows en `executing` → una ola por invocación.

## Variables

```bash
GAFCORE_WORKFLOW_MAX_PARALLEL=3
GAFCORE_CRON_SECRET=...          # header x-cron-secret en drain
```

## Roadmap

| Fase | Estado |
|------|--------|
| B0 | RPC claim + este doc |
| B1 | Paralelo por ola |
| B2 | Drain API + cron Vercel |
| B3 | Métricas + límites por usuario |
| B4 | Cola IA dedicada / rate limits |

## Aplicar SQL

`supabase/migrations/20260529120000_gafcore_task_claim_rpc.sql` en Supabase SQL Editor.
