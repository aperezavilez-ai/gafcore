import Editor from "@monaco-editor/react";

export type FileItem = { name: string; language: string; content: string };

const initialFiles: FileItem[] = [
  {
    name: "index.html",
    language: "html",
    content: `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>GafCore App</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>`,
  },
  {
    name: "main.tsx",
    language: "typescript",
    content: `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
`,
  },
  {
    name: "lib/store.ts",
    language: "typescript",
    content: `/** Persistencia local (FUNCTIONAL-FIRST) — usa esto en features con datos. */
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}
`,
  },
  {
    name: "App.tsx",
    language: "typescript",
    content: `import React, { useEffect, useState } from "react";
import { loadJson, saveJson } from "./lib/store";

const STORAGE_KEY = "gafcore-demo-visits";

export default function App() {
  const [visits, setVisits] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setVisits(loadJson<number>(STORAGE_KEY, 0));
  }, []);

  const registerVisit = () => {
    const next = visits + 1;
    setVisits(next);
    saveJson(STORAGE_KEY, next);
    setStatus(\`Visita #\${next} guardada en este navegador.\`);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <section className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
          GafCore
        </p>
        <h1 className="text-4xl font-black tracking-tight md:text-5xl">Proyecto listo</h1>
        <p className="mt-4 text-lg text-slate-300">
          Plantilla functional-first: botón con handler, estado y persistencia en localStorage.
        </p>
        <p className="mt-2 text-sm text-slate-400">Visitas registradas: {visits}</p>
        {status ? <p className="mt-2 text-sm text-emerald-400">{status}</p> : null}
        <button
          type="button"
          onClick={registerVisit}
          className="mt-8 w-fit rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
        >
          Registrar visita
        </button>
      </section>
    </main>
  );
}
`,
  },
  {
    name: "styles.css",
    language: "css",
    content: `:root { color-scheme: light; --accent: #2563eb; }
html, body, #root { height: 100%; margin: 0; }
body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #ffffff; color: #0f172a; }
`,
  },
];

export function CodeEditor({
  files,
  setFiles,
  activeIndex,
}: {
  files: FileItem[];
  setFiles: (f: FileItem[]) => void;
  activeIndex: number;
}) {
  const active = Math.min(activeIndex, files.length - 1);
  const file = files[active];

  const updateContent = (val: string | undefined) => {
    const next = [...files];
    next[active] = { ...next[active], content: val ?? "" };
    setFiles(next);
  };

  return (
    <div className="h-full bg-background">
      <Editor
        height="100%"
        theme="light"
        path={file?.name}
        language={file?.language}
        value={file?.content}
        onChange={updateContent}
        options={{
          fontSize: 13,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          padding: { top: 12 },
          lineNumbers: "on",
          renderLineHighlight: "all",
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          tabSize: 2,
        }}
      />
    </div>
  );
}

export { initialFiles };
