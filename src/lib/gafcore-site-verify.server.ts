import { isBlockedDeployHost, normalizeDeployHost } from "@/lib/gafcore-deploy.shared";

export type SiteVerifyResult = {
  ok: boolean;
  httpStatus?: number;
  ms?: number;
  error?: string;
  finalUrl?: string;
};

/** Verificación HTTP desde el servidor (evita CORS del navegador). */
export async function verifyDeploySiteHost(hostInput: string): Promise<SiteVerifyResult> {
  const host = normalizeDeployHost(hostInput);
  if (!host) {
    return {
      ok: false,
      error: isBlockedDeployHost(hostInput)
        ? "gafcore.com es la plataforma, no tu sitio. Usa tu URL de Vercel (xxx.vercel.app)."
        : "URL del sitio no válida",
    };
  }

  const started = Date.now();
  const url = `https://${host}/`;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "GafCore-SiteVerify/1", Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(20_000),
    });
    const ms = Date.now() - started;
    return {
      ok: res.ok,
      httpStatus: res.status,
      ms,
      finalUrl: res.url,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "network";
    return {
      ok: false,
      ms: Date.now() - started,
      error: message === "fetch failed" ? "No respondió (sitio caído o URL incorrecta)" : message,
    };
  }
}
