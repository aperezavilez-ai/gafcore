import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GeneratedApp } from "../code-generator/types";
import { runCommand, sleep, spawnDetached } from "./exec";
import { waitForApiHealth } from "./health-check";
import type { RunGeneratedAppOptions, RunResult, RunStep } from "./types";

function step(name: string, ok: boolean, detail?: string, ms?: number): RunStep {
  return { step: name, ok, detail, ms };
}

/**
 * Módulo 4 — Runner
 * Instala dependencias, aplica schema DB, arranca la app y verifica /api/health.
 */
export async function runGeneratedApp(
  app: GeneratedApp,
  options: RunGeneratedAppOptions = {},
): Promise<RunResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const root = join(baseDir, app.rootDir);
  const apiPort = options.apiPort ?? 3001;
  const clientPort = options.clientPort ?? 5173;
  const install = options.install !== false;
  const pushDb = options.pushDb !== false;
  const keepDev = options.keepDevRunning === true;
  const healthTimeoutMs = options.healthTimeoutMs ?? 45_000;

  const apiUrl = `http://localhost:${apiPort}`;
  const clientUrl = `http://localhost:${clientPort}`;
  const steps: RunStep[] = [];

  if (!existsSync(join(root, "package.json"))) {
    return {
      ok: false,
      root,
      slug: app.slug,
      apiUrl,
      clientUrl,
      steps,
      error: `missing package.json at ${root}`,
    };
  }

  try {
    if (install) {
      const t0 = Date.now();
      const hasModules = existsSync(join(root, "node_modules"));
      if (!hasModules) {
        const r = await runCommand(root, "npm", ["install"]);
        const ok = r.code === 0;
        steps.push(
          step("npm install", ok, ok ? undefined : r.stderr.slice(-400) || r.stdout.slice(-400), Date.now() - t0),
        );
        if (!ok) {
          return fail(root, app.slug, apiUrl, clientUrl, steps, "npm_install_failed");
        }
      } else {
        steps.push(step("npm install", true, "skipped (node_modules exists)", 0));
      }
    }

    if (pushDb) {
      const t0 = Date.now();
      const r = await runCommand(root, "npm", ["run", "db:push"]);
      const ok = r.code === 0;
      steps.push(
        step("db:push", ok, ok ? undefined : r.stderr.slice(-400) || r.stdout.slice(-400), Date.now() - t0),
      );
      if (!ok) {
        return fail(root, app.slug, apiUrl, clientUrl, steps, "db_push_failed");
      }
    }

    const env = { PORT: String(apiPort) };

    if (keepDev) {
      const child = spawnDetached(root, "npm", ["run", "dev"], env);
      child.unref();
      const t0 = Date.now();
      const health = await waitForApiHealth(`${apiUrl}/api/health`, healthTimeoutMs);
      steps.push(
        step(
          "health",
          health.ok,
          health.ok ? `API OK` : health.error,
          Date.now() - t0,
        ),
      );
      if (!health.ok) {
        return fail(root, app.slug, apiUrl, clientUrl, steps, health.error ?? "health_failed");
      }
      return {
        ok: true,
        root,
        slug: app.slug,
        apiUrl,
        clientUrl,
        steps,
        devPid: child.pid,
      };
    }

    // Smoke: solo API, luego parar
    const server = spawnDetached(root, "npm", ["run", "dev:server"], env);
    server.unref();
    await sleep(1_500);

    const t0 = Date.now();
    const health = await waitForApiHealth(`${apiUrl}/api/health`, healthTimeoutMs);
    steps.push(
      step("health", health.ok, health.ok ? "GET /api/health → ok" : health.error, Date.now() - t0),
    );

    try {
      if (server.pid) process.kill(server.pid);
    } catch {
      /* proceso ya terminó */
    }

    if (!health.ok) {
      return fail(root, app.slug, apiUrl, clientUrl, steps, health.error ?? "health_failed");
    }

    return { ok: true, root, slug: app.slug, apiUrl, clientUrl, steps };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    steps.push(step("runner", false, msg));
    return fail(root, app.slug, apiUrl, clientUrl, steps, msg);
  }
}

function fail(
  root: string,
  slug: string,
  apiUrl: string,
  clientUrl: string,
  steps: RunStep[],
  error: string,
): RunResult {
  return { ok: false, root, slug, apiUrl, clientUrl, steps, error };
}
