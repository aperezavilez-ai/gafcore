# Vercel — build atascado en «Building»

## Por qué no ves la preview

En Vercel la **miniatura / preview** solo aparece cuando el deploy pasa a **Ready**. Si lleva mucho rato en **Building**, el build no ha terminado (o falló sin refrescar la UI).

Build local de referencia: **~40–60 s** con `npm run build` y `VERCEL=1`.

## Qué hacer ahora (en orden)

1. **Build Logs** (panel del deploy) → baja hasta el final.
   - Si ves `Killed`, `ENOMEM`, `JavaScript heap out of memory` → era falta de RAM (el repo ya externaliza `typescript` para aligerar).
   - Si ves error de `npm` / `module not found` → copia las últimas 30 líneas.

2. **Cancel deployment** → **Redeploy** (mismo commit).

3. **Project Settings → General**
   - Node.js **20.x** o **22.x**

4. **Project Settings → Build and Deployment**
   - Build Command: `npm run build`
   - Install Command: `npm ci`
   - Framework Preset: **Other** (Nitro genera `.vercel/output` solo)

5. **Environment Variables** (Production) — mínimo para que la app arranque:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
   - `OPENROUTER_API_KEY` o `OPENAI_API_KEY`

6. Tras **Ready**, abre la URL `*.vercel.app` o `gafcore.com` — no confundir con el preview del **IDE** (iframe local), que es otra cosa.

## Si sigue colgado >15 min

- Quita `bun.lock` del repo **o** en Vercel desactiva Bun y fuerza **npm** (`npm ci`).
- Sube plan o activa **Enhanced Builds** si el log muestra OOM.

## Comprobar en local como Vercel

```bash
set VERCEL=1
npm ci
npm run build
```

Debe crear `.vercel/output/` sin error.
