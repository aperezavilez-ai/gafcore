import React, { useState } from "react";

type TaskRow = {
  id: string;
  texto: string | number | Record<string, unknown> | null;
};

const tasks: TaskRow[] = [
  { id: "1", texto: "Inicio" },
  { id: "2", texto: "Cotización rápida" },
  { id: "3", texto: 42 },
  { id: "4", texto: { title: "Historial de siniestros" } },
  { id: "5", texto: null },
];

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Completa email y contraseña.");
      return;
    }
    setLoggedIn(true);
  };

  const keys = ["title", "label", "name", "heading", "value", "text", "desc"];

  const listaProcesada = tasks.map((task) => {
    const texto = task.texto;

    if (texto === null || texto === undefined) {
      return null;
    }

    if (typeof texto === "string") {
      return texto;
    }

    if (typeof texto === "number") {
      return String(texto);
    }

    if (typeof texto !== "object") {
      return null;
    }

    const record = texto as Record<string, unknown>;

    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      const val = record[key];
      if (val === null || val === undefined) {
        continue;
      }
      if (typeof val === "string") {
        return val;
      }
      if (typeof val === "number") {
        return String(val);
      }
    }

    return null;
  });

  if (!loggedIn) {
    let errorBlock = null;
    if (error) {
      errorBlock = <p className="text-sm text-red-400">{error}</p>;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-white">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-zinc-900/80 p-8 shadow-xl"
        >
          <h1 className="text-2xl font-bold tracking-tight">Acceso</h1>
          <p className="text-sm text-zinc-400">Ingresa para continuar con tu panel.</p>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-zinc-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2 text-white"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-zinc-400">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2 text-white"
              autoComplete="current-password"
              required
            />
          </div>
          {errorBlock}
          <button
            type="submit"
            className="w-full rounded-lg bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-500"
          >
            Entrar
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white">
      <header className="border-b border-white/10 px-6 py-5">
        <h1 className="text-xl font-bold">Panel de tareas</h1>
        <p className="mt-1 text-sm text-zinc-400">Listado normalizado sin objetos en JSX</p>
      </header>
      <section className="mx-auto max-w-2xl p-6">
        <ul className="space-y-2">
          {tasks.map((task, idx) => {
            const texto = listaProcesada[idx];
            if (texto === null) {
              return null;
            }

            return (
              <li
                key={task.id}
                className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm font-medium"
              >
                {texto}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
