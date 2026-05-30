# GafCore — Arquitectura de lanzamiento (resumen ejecutivo)

**Stack:** TanStack Start · Vite · Supabase · Vercel · IA multi-proveedor (OpenRouter/OpenAI/Anthropic/Gemini).

## Capas del producto

```
Usuario (IDE / Landing)
    ↓ Auth Supabase (JWT)
API /api/gafcore/*  ← requireGafcoreApiUser
    ↓
Cerebro unificado
├── chat-brain.server      → modelo deep/fast + diseño
├── safe-build.server      → validación + diagnoseAndRepair
├── aiOrchestrator         → rutas por tarea (code/design/voice)
└── design-engine          → BASE_DESIGN_SYSTEM + blueprints

IA Gateway → postChatCompletions (router multi-proveedor)
    ↓
Supabase (proyectos, créditos, caché, health_logs, gobernanza)
```

## Módulos clave (escalado)

| Módulo | Ruta | Escala cómo |
|--------|------|-------------|
| **Chat IDE** | `gafcore-chat-api.server.ts` | Stateless en Vercel; caché Supabase 24h; rate limit por usuario |
| **Cerebro IA** | `src/services/ai/` | Añadir proveedor = nuevo `*.provider.server.ts` + env |
| **Salud / SRE** | `src/services/health/` | Logs en `gafcore_health_logs`; diagnóstico Gemini Flash |
| **Safe-Build** | `safe-build.server.ts` | 1 reparación por request; no loop infinito |
| **Gobernanza** | `gafcore-governance.*` | Kill switches en `system_controls` |
| **Pagos** | Stripe/Paddle webhooks | Separado de generación IA |

## Optimización de costos (tokens)

1. **Prompts condensados** (`gafcore-system-prompt-condensed.shared.ts`) en producción.
2. **Motor de Diseño** solo en tareas UI (no duplicar `GAFCORE_DESIGN_SYSTEM` completo).
3. **Caché** memoria 55s + Supabase 24h para instrucciones repetidas (no builds).
4. **Contexto** recortado por relevancia (`selectContextFiles`, presupuesto ~42k chars).

## Seguridad (marca blanca)

- Errores al usuario: `sanitizeUserFacingAiText` (sin proveedores, sin `sk-`, sin env vars).
- Diagnóstico interno: `sanitizeDiagnosisForUser` en mensajes visibles.
- APIs IA: solo tras `requireGafcoreApiUser` en rutas GafCore.
- RLS en tablas de usuario; caché/logs solo `service_role`.

## Despliegue

1. `bun run build` → Vercel.
2. Migraciones Supabase: `gafcore_chat_response_cache`, `gafcore_health_logs`, gobernanza.
3. Env en Vercel: `OPENROUTER_API_KEY` o trio OpenAI/Anthropic; `AI_MODEL_*`; Supabase keys.

## Próximos pasos de escala

- **Workers/colas** para factory y workflows largos (ya hay `workflow.drain`).
- **CDN** para assets estáticos del preview generado.
- **Réplica read** Supabase si crece lectura de proyectos.
- **Panel admin** para `gafcore_health_logs` y métricas de caché hit rate.
