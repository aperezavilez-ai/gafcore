# GafCore — Arquitectura actual (referencia)

> Actualizado con Etapa 1 del roadmap. No reemplaza `AGENTS.md` (reglas de agentes).

## Stack

TanStack Start v1 · React 19 · Vite 7 · Supabase · OpenRouter/OpenAI · Stripe/Paddle · Nitro/Vercel.

## Capas

| Capa | Ruta | Responsabilidad |
|------|------|-----------------|
| Rutas | `src/routes/` | UI pública, IDE (`gafcore_.app`), APIs (`api/gafcore/*`) |
| Componentes | `src/components/` | IDE, admin, UI shadcn |
| Dominio proyecto | `src/core/project/` | Proyecto activo, lista, deploy meta, caché nombre |
| Datos | `src/lib/userSupabase.ts` | Repositorio Supabase (archivos, secrets, publishes) |
| Plantillas | `gafcore_project_templates`, `gafcore-templates.*` | Starter / landing / tienda |
| Orchestrator | `src/orchestrator/*`, `gafcore-orchestrator.*` | Pipeline runs, intent, validate+memoria servidor |
| Validación IA | `gafcore-ai-validation.*`, `gafcore-validate.*` | MVP: syntax/imports/build/functional; ver `VALIDATION_LAYER.md` |
| IA | `gafcore-ai-gateway.server.ts`, `gafcore-chat.*`, `chat.stream.ts` | Gateway + chat IDE + créditos |
| Deploy | `github-publish.server.ts`, `vercel-deploy.server.ts` | GitHub + Vercel (servidor) |
| Billing | `src/lib/stripe*`, `paddle*`, webhooks | Suscripciones y créditos |
| Admin | `src/lib/server-fns/diagnostics.*` | Escaneo y fixes aprobados |

## Datos principales (Supabase)

- `projects` — metadatos + `github_repo`, `deploy_site_url`, …
- `project_files` — contenido del IDE
- `chat_messages` — historial por proyecto
- `user_credits`, `subscriptions` — monetización

## Flujo IDE simplificado

```
GafCoreIDE → ProjectService (core/project) → userSupabase → Supabase
          → ChatPanel → /api/gafcore/chat/stream → IA
          → Publicar → autoPublishProject → GitHub API
```

## Límites conocidos

- Un Supabase para todos los usuarios (RLS por `user_id`).
- Token GitHub en `localStorage` (migración a servidor pendiente — Etapa 2).
- Orchestrator MVP (validación+memoria en servidor); generación IA aún en stream cliente.
- Sin multiagente completo ni vector DB aún.
