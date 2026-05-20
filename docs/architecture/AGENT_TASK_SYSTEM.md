# GafCore — Agent Task System + Multiagent Coordination

> **Estado:** A0–A2 **hecho en código**. Migración `20260528120000` en Supabase. IDE: menú **Multiagente (beta)** en Construir. Ver `ORCHESTRATOR.md` O8.

## Aplicar en Supabase

Ejecutar `supabase/migrations/20260528120000_gafcore_agent_tasks.sql` en el SQL Editor (mismo flujo que memoria M1).

## Principios

1. Solo el **Scheduler** cambia estados y asigna trabajo.
2. Solo el **Planner** crea tareas (DAG).
3. Agentes hablan por **artefactos** (`TaskPlan`, `FilePatch[]`, `ValidationReport`), no chat libre.
4. **Un escritor activo por path** (`file_locks` + 1 worker/proyecto en v1).
5. **Validation** entre tareas que escriben código.

## Capas

```
Workflow Run (macro) → Task Scheduler (DAG) → Agent Workers
                      ↓
              Artifact Store + Memory Pack
```

## Estados

**Workflow:** `pending` | `planning` | `executing` | `validating` | `merging` | `completed` | `failed` | `cancelled`

**Task:** `pending` | `blocked` | `ready` | `running` | `validating` | `succeeded` | `failed` | `cancelled`

## Agentes (v1 registry)

| Tipo | Scope típico |
|------|----------------|
| `planner` | Solo `TaskPlan` |
| `frontend` | `src/components`, `src/routes`, CSS |
| `backend` | `src/lib`, `src/routes/api` |
| `database` | `supabase/migrations` (gate humano) |
| `validation` | Sin escritura |
| `deployment` | Meta deploy |
| `documentation` | `docs/` |
| `refactor` | Paths del plan |
| `debug` | Parches mínimos |

## Tablas (migración A1)

- `gafcore_workflow_runs` — run padre (extiende concepto pipeline)
- `gafcore_agent_tasks` — cola + DAG
- `gafcore_task_dependencies` — aristas depends_on
- `gafcore_workflow_artifacts` — blobs inmutables
- `gafcore_agent_task_logs` — append-only

## Código (A1)

```
src/tasks/
  types.ts              # contratos
  artifacts.shared.ts   # TaskPlan, FilePatchSet schemas
  scheduler.server.ts   # claim, complete, unblock deps
  workflow.server.ts    # create run, attach pipeline_run opcional
src/agents/
  registry.shared.ts    # capacidades por agente
```

## Roadmap

| Fase | Entregable |
|------|------------|
| A0 | Este doc + types |
| A1 | SQL + scheduler shell + `startWorkflow` server fn |
| A2 | Planner + executor + `planAndStart` / `runGafcoreWorkflowBatch` | **Hecho** |
| B0–B2 | Ejecución distribuida (RPC claim, paralelo, drain) | **Hecho** — `DISTRIBUTED_EXECUTION.md` |
| A3 | Merge parches en snapshot + UI árbol tareas (`WorkflowTaskStrip`) | **Hecho** |
| A4 | Métricas en status + enlace pipeline ↔ workflow | **Parcial** |
| B4 | Límite workflows activos + segundo plano IDE | **Hecho** |

## Integración

- **Orchestrator:** `gafcore_pipeline_runs` puede referenciar `workflow_run_id`.
- **Memory:** `retrieveProjectMemoryContext` por tarea.
- **Validation:** tarea `validation` tras escritura.
- **IDE:** menú Multiagente → `planAndStart` + olas + strip de tareas en chat.
