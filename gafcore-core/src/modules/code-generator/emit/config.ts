import type { EmitContext, GeneratedFile } from "../types";

export function emitConfig(ctx: EmitContext): GeneratedFile[] {
  const { blueprint } = ctx;
  const title = blueprint.parsed.title.replace(/"/g, '\\"');

  return [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: blueprint.slug,
          private: true,
          type: "module",
          scripts: {
            dev: 'concurrently -n server,client -c blue,green "npm run dev:server" "npm run dev:client"',
            "dev:server": "tsx watch server/index.ts",
            "dev:client": "vite --config client/vite.config.ts",
            "db:push": "drizzle-kit push",
            seed: "tsx server/seed/run.ts",
            build: "vite build --config client/vite.config.ts",
          },
          dependencies: {
            bcryptjs: "^2.4.3",
            "better-sqlite3": "^11.8.1",
            "cookie-parser": "^1.4.7",
            cors: "^2.8.5",
            "drizzle-orm": "^0.38.3",
            express: "^4.21.2",
            react: "^19.0.0",
            "react-dom": "^19.0.0",
          },
          devDependencies: {
            "@types/bcryptjs": "^2.4.6",
            "@types/better-sqlite3": "^7.6.12",
            "@types/cookie-parser": "^1.4.8",
            "@types/cors": "^2.8.17",
            "@types/express": "^4.17.21",
            "@types/react": "^19.0.2",
            "@types/react-dom": "^19.0.2",
            "@vitejs/plugin-react": "^4.3.4",
            concurrently: "^9.1.2",
            "drizzle-kit": "^0.30.1",
            tsx: "^4.19.2",
            typescript: "^5.7.2",
            vite: "^6.0.6",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.json",
      content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "types": ["node"]
  },
  "include": ["server/**/*.ts", "client/src/**/*.ts", "client/src/**/*.tsx"]
}
`,
    },
    {
      path: "drizzle.config.ts",
      content: `import { defineConfig } from "drizzle-kit";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const url = process.env.DATABASE_URL ?? "./data/app.db";
mkdirSync(dirname(url), { recursive: true });

export default defineConfig({
  schema: "./server/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url },
});
`,
    },
    {
      path: ".env.example",
      content: `DATABASE_URL=./data/app.db
SESSION_SECRET=change-me-in-production
PORT=3001
`,
    },
    {
      path: "client/index.html",
      content: `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: "client/vite.config.ts",
      content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: ".",
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3001" },
  },
  build: { outDir: "dist" },
});
`,
    },
  ];
}
