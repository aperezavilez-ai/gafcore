# Modo Fábrica GafCore (v1)

Flujo automatizado: **idea → plan multiagente → código → validación → (opcional) mejora de diseño**.

## Activación

1. IDE → panel de chat → menú **+** → **Modo Fábrica** → ON.
2. Escribe tu idea y pulsa **Construir** (modo build).

Al activar Fábrica se enciende multiagente y se desactiva ejecución en 2º plano (todo en una sola petición).

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/gafcore/factory/run` | Ejecuta el flujo completo |
| POST | `/api/gafcore/factory/status` | Estado de `pipelineRunId` / `workflowRunId` |

Body `run`:

```json
{
  "projectId": "uuid",
  "instruction": "Crea una landing para…",
  "files": [{ "name": "App.tsx", "content": "…" }],
  "runDesignCritique": true
}
```

Server function equivalente: `runGafcoreFactory` en `src/lib/gafcore-factory.functions.ts`.

## Fases internas

1. **Pipeline** — `interpret` (intención + plantilla sugerida).
2. **Workflow** — planner + olas paralelas (máx. 12).
3. **Validación** — `finalizePipelineValidation` + autofix.
4. **Crítica de diseño** — si score &lt; 80 y validación OK (1 crédito extra).
5. **Cliente** — si hay `followupInstruction`, un pase extra de generación en el IDE.

## Requisitos

- Supabase: migraciones workflow (`npm run gafcore:migrate-workflow`).
- IA: `OPENROUTER_API_KEY` o `OPENAI_API_KEY`.
- Vercel: timeout suficiente (Pro recomendado; runs largos).

## Límites v1

- Sin deploy automático (Fase B).
- Sin E2E Playwright del proyecto generado.
- Rate limit: bucket `gafcore_factory_run` (8 req/min por usuario).
- Proyectos muy grandes o prompts enormes pueden agotar tiempo → dividir en fases.

## Variables

| Variable | Efecto |
|----------|--------|
| `GAFCORE_DEPLOY_VALIDATION_GATE` | Solo afecta **Publicar**, no la fábrica |

## Smoke manual

1. Proyecto nuevo → Modo Fábrica ON → prompt corto: «Landing SaaS con hero y pricing».
2. Esperar barra de estado «Fábrica: listo…».
3. Preview sin error React #31.
4. Revisar historial workflow en ajustes del proyecto.
