/**
 * Verificación E2E ligera tras deploy en Modo Fábrica (HTTP desde servidor).
 */
import { verifyDeploySiteHost } from "@/lib/gafcore-site-verify.server";

export type FactoryDeployCheck = {
  path: string;
  ok: boolean;
  httpStatus?: number;
  ms?: number;
  error?: string;
};

export type FactoryDeployVerifyResult = {
  ok: boolean;
  host: string;
  checks: FactoryDeployCheck[];
  message: string;
};

const DEFAULT_PATHS = ["/", "/index.html"];

export async function verifyFactoryDeploySite(hostInput: string): Promise<FactoryDeployVerifyResult> {
  const root = await verifyDeploySiteHost(hostInput);
  const host = hostInput.replace(/^https?:\/\//i, "").replace(/\/+$/, "");

  if (!root.ok && root.httpStatus !== 404) {
    return {
      ok: false,
      host,
      checks: [
        {
          path: "/",
          ok: false,
          httpStatus: root.httpStatus,
          ms: root.ms,
          error: root.error,
        },
      ],
      message: root.error ?? "El sitio no respondió en la raíz.",
    };
  }

  const checks: FactoryDeployCheck[] = [];
  for (const path of DEFAULT_PATHS) {
    const url = `https://${host}${path}`;
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "GafCore-Factory-E2E/1", Accept: "text/html,*/*" },
        signal: AbortSignal.timeout(15_000),
      });
      const ok = res.status >= 200 && res.status < 400;
      checks.push({
        path,
        ok,
        httpStatus: res.status,
        ms: Date.now() - started,
        error: ok ? undefined : `HTTP ${res.status}`,
      });
      if (path === "/" && ok) break;
    } catch (e: unknown) {
      checks.push({
        path,
        ok: false,
        ms: Date.now() - started,
        error: e instanceof Error ? e.message : "network",
      });
    }
  }

  const anyOk = checks.some((c) => c.ok);
  return {
    ok: anyOk,
    host,
    checks,
    message: anyOk
      ? `E2E OK (${checks.filter((c) => c.ok).map((c) => `${c.path} ${c.httpStatus}`).join(", ")})`
      : "E2E falló: ninguna ruta respondió 2xx.",
  };
}
