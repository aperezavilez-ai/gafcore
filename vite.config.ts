import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { assertSafeClientEnvKey } from "./src/lib/gafcore-env-guard.shared";
import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

/** El navegador pide /favicon.ico antes del HTML; en dev redirigimos al PNG. */
function gafcoreFaviconDev(): Plugin {
  return {
    name: "gafcore-favicon-dev",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = req.url?.split("?")[0];
        if (path === "/favicon.ico") req.url = "/favicon.png";
        next();
      });
    },
  };
}

// Producción en Vercel: Nitro + TanStack Start (sin @cloudflare/vite-plugin).
// Wrangler sigue en el repo por si desarrollas Workers aparte; el build web usa Nitro.
export default defineConfig(({ mode }) => {
  const root = process.cwd();
  // Vite no vuelca por defecto OPENROUTER_API_KEY / OPENAI_API_KEY / AI_* a process.env;
  // solo VITE_* va a import.meta.env. Las server functions leen process.env → sin esto,
  // en local aparece «IA no configurada» aunque las claves estén en .env o .env.local.
  const fromEnvFiles = loadEnv(mode, root, "");
  for (const [key, value] of Object.entries(fromEnvFiles)) {
    if (process.env[key] === undefined && value !== undefined) {
      process.env[key] = value;
    }
  }

  const loaded = loadEnv(mode, root, "VITE_");
  /** En Vercel el build debe leer VITE_* de process.env (panel), no solo de .env del repo. */
  const viteEnv: Record<string, string> = { ...loaded };
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("VITE_") && typeof value === "string" && value.trim()) {
      viteEnv[key] = value.trim();
    }
  }
  // Build Vercel: si solo hay SUPABASE_* en el panel, inyectar también VITE_* en el bundle SSR.
  for (const [viteKey, serverKey] of [["VITE_SUPABASE_URL", "SUPABASE_URL"]] as const) {
    const fromServer = process.env[serverKey]?.trim();
    const fromVite = viteEnv[viteKey]?.trim();
    if (fromServer && !fromVite) viteEnv[viteKey] = fromServer;
    if (fromVite && !process.env[serverKey]?.trim()) process.env[serverKey] = fromVite;
  }
  const publishableFromPanel =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    "";
  if (publishableFromPanel) {
    if (!viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY) {
      viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY = publishableFromPanel;
    }
    if (!viteEnv.VITE_SUPABASE_ANON_KEY) {
      viteEnv.VITE_SUPABASE_ANON_KEY = publishableFromPanel;
    }
    if (!process.env.SUPABASE_PUBLISHABLE_KEY?.trim()) {
      process.env.SUPABASE_PUBLISHABLE_KEY = publishableFromPanel;
    }
  }
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(viteEnv)) {
    assertSafeClientEnvKey(key);
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  const isProd = mode === "production";

  return {
    define: envDefine,
    esbuild: {
      drop: isProd ? ["console", "debugger"] : [],
    },
    build: {
      cssCodeSplit: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (
              id.includes("react-dom") ||
              id.includes("/react/") ||
              id.includes("@tanstack/react-router") ||
              id.includes("@tanstack/react-query")
            ) {
              return "vendor-core";
            }
            // No separar @supabase: en Vercel rompe createClient («reading create» undefined).
            if (id.includes("framer-motion") || id.includes("motion-dom")) return "vendor-motion";
            if (
              id.includes("recharts") ||
              id.includes("monaco") ||
              id.includes("@monaco-editor")
            ) {
              return "vendor-heavy";
            }
            return "vendor";
          },
          // Mismo nombre en client y SSR (evita HTTPError 500 en Vercel por hash distinto).
          assetFileNames: (assetInfo) => {
            const names = assetInfo.names ?? (assetInfo.name ? [assetInfo.name] : []);
            if (names.some((n) => n.endsWith(".css"))) {
              return "assets/gafcore-app[extname]";
            }
            return "assets/[name]-[hash][extname]";
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": `${process.cwd()}/src`,
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    // 127.0.0.1: el Simple Browser / preview de Cursor y muchos navegadores en Windows
    // fallan o muestran pantalla en blanco con host "::" (solo IPv6).
    // Puerto dedicado: GafSuite u otros proyectos suelen usar 8080 en 0.0.0.0;
    // localhost:8080 puede abrir la app equivocada. Usar siempre 127.0.0.1:5174.
    server: {
      host: "127.0.0.1",
      port: 5174,
      // Abre el login en el navegador al arrancar `npm run dev`.
      open: "/gafcore/login",
      // Si queda un Vite zombie en 5174, usar 5175… sin fallar el arranque.
      strictPort: false,
      hmr: {
        host: "127.0.0.1",
      },
    },
    plugins: [
      gafcoreFaviconDev(),
      tailwindcss(),
      tsconfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        server: {
          entry: "server",
          // CSS en el manifest (sin fetch a /assets/* en SSR) — evita HTTPError 500 en Vercel.
          build: { inlineCss: true },
        },
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/server/**"],
            specifiers: ["server-only"],
          },
        },
      }),
      nitro({
        // En los builds de Vercel, `VERCEL=1`: salida compatible con Fluid Compute / Functions.
        preset: process.env.VERCEL ? "vercel" : "node-server",
        // typescript (~10MB) solo en servidor; no empaquetar → menos RAM en build Vercel.
        rollupConfig: {
          external: (id) => id === "typescript" || id.startsWith("typescript/"),
        },
      }),
      viteReact(),
    ],
  };
});
