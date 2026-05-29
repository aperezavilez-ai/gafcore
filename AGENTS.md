# AGENTS.md

Instrucciones para agentes IA (Claude Code, Codex CLI, Aider, Continue, Windsurf, etc.) trabajando en **GafCore**.

> Para reglas específicas de Cursor ver `.cursorrules`. Para humanos ver `README.md`.

## Identidad del proyecto

**GafCore** — plataforma para que los usuarios creen y lleven sus **sitios web y apps**. Dominio único: **gafcore.com**. Proyecto **independiente**; no mezclar con GafSuite, GafMusic, GafAds u otros. En texto y UI: solo la marca **GafCore**.

## Stack en una línea

TanStack Start v1 (React 19 + SSR) · Vite 7 · Tailwind v4 · shadcn/ui · TanStack Router (file-based) · TanStack Query · Supabase (Postgres/Auth/Storage/Edge Functions) · IA OpenAI-compatible (OpenRouter/OpenAI) · Stripe + Paddle · Nitro/SSR (p. ej. Vercel) · TypeScript estricto · Bun.

## Comandos

```bash
bun install
bun run dev            # Vite dev server con HMR
bun run build          # build de producción
bun run build:dev      # build dev (sourcemaps)
bun run lint           # ESLint
bun run format         # Prettier
npm run gafcore:doctor # comprueba variables .env (Supabase + IA), sin volcar secretos
```

No correr `tsc --noEmit` manualmente — el build ya lo hace.

## Estructura

```
src/routes/              file-based routing (flat: dashboard.releases.tsx → /dashboard/releases)
  __root.tsx             layout raíz
  api/                   server routes HTTP
    public/              endpoints públicos (webhooks, OAuth, cron)
src/components/          UI
  ui/                    shadcn primitives
  ide/                   editor IDE de GafCore
src/lib/
  server-fns/            createServerFn (RPC tipado)
  *.functions.ts         server functions
  *.server.ts            helpers solo servidor
src/integrations/supabase/  cliente (client.ts y types.ts AUTO-GENERADOS)
src/hooks/               React hooks
src/styles.css           Tailwind v4 + design tokens (oklch)
supabase/config.toml     config Supabase (no editar project_id)
```

## Reglas críticas

### Archivos prohibidos de editar
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`
- `src/routeTree.gen.ts`
- `.env`, `.env.development`, `.env.production`

### Routing
- Importar SIEMPRE de `@tanstack/react-router` (nunca `react-router-dom`).
- Crear el archivo de ruta antes de enlazar con `<Link to>` (tipado estricto).
- Layout raíz único: `src/routes/__root.tsx`. Ruta `/` única: `src/routes/index.tsx`.

### Server functions
- Vivir en `src/lib/**/*.functions.ts` (NO en `src/server/`).
- Cadena `createServerFn().middleware().inputValidator().handler()` debe ser continua.
- `process.env.X` solo dentro de `.handler()`.
- Functions con `requireSupabaseAuth` NO pueden llamarse desde `loader` de ruta pública.

### Cloudflare Workers (solo si el target de deploy es Workers)
- Prohibido: `child_process`, `sharp`, `canvas`, `puppeteer`, `fs.watch`, paquetes con node-gyp.
- Prohibido en `vite.config.ts`: `ssr.external`, `resolve.external`.

### Estilos
- NUNCA hard-code de color (`text-white`, `bg-blue-500`). Usar tokens semánticos: `bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border`, etc.
- Nuevos colores → añadir en `src/styles.css` con `oklch(...)`.

### Seguridad / DB
- Roles SIEMPRE en tabla `user_roles` separada con función `has_role()` `SECURITY DEFINER`. NUNCA en `profiles`.
- RLS activado en todo dato de usuario. No FK a `auth.users` — usar `profiles`.
- No tocar schemas: `auth`, `storage`, `realtime`, `supabase_functions`, `vault`.
- Validar firma de webhooks antes de procesar. Validar input con Zod.

### IA
- `src/lib/ai-chat-completions.server.ts`: endpoint compatible OpenAI (`AI_CHAT_COMPLETIONS_URL` + `AI_API_KEY`, o `OPENROUTER_API_KEY`, o `OPENAI_API_KEY`). Modelos por defecto en `gafcore-chat.shared.ts`; env `AI_MODEL_FAST` / `AI_MODEL_DEEP` / `AI_SUPPORT_MODEL` en servidor.
- Manejar 429 y 402 con mensajes claros.

## Workflow esperado

1. Lee los archivos antes de modificarlos. No asumas contenido.
2. Cambios pequeños y enfocados. Prefiere search-replace sobre rewrites.
3. Verifica tras editar: build output, runtime, console logs.
4. Para tareas grandes: plan corto primero.
5. Comunica en español, conciso. Refiérete al backend como "backend" / "GafCore backend".
6. **Al cerrar una tarea sustantiva:** añadir **«Qué sigue (propuesta)»** (1–3 pasos). Priorizar ejecución con herramientas en el repo; ver límites en `.cursorrules` (cuentas externas, `.env` con secretos).
7. **Deploy:** build OK → commit → push a `main` sin preguntar (salvo que el usuario pida no subir).

Persistencia: reglas de workspace en **`.cursorrules`**; este archivo para cualquier agente. Instrucciones globales del usuario: **Cursor → Settings → Rules for AI**.

## Variables de entorno

Cliente (Vite): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (definir en el host o `.env.local`).

Servidor (secretos del host, p. ej. Vercel): al menos una vía de IA (`OPENROUTER_API_KEY` o `OPENAI_API_KEY` o `AI_CHAT_COMPLETIONS_URL` + `AI_API_KEY`); `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (o variantes sandbox/live según `stripe.server.ts`); `PADDLE_API_KEY`; `ELEVENLABS_API_KEY` si aplica. Ver `.env.example`.

## Despliegue

- Repo en GitHub; build y deploy con el proveedor elegido (p. ej. Vercel conectado al repo).
- **Regla del productor:** tras cada cambio sustantivo, el agente hace build + commit + push a `main` **sin preguntar** (Vercel → gafcore.com).
- Migraciones y Edge Functions de Supabase se aplican desde el panel Supabase / CLI, no desde un editor externo.
- Producción: **gafcore.com**.
