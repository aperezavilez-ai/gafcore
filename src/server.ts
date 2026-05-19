import "./lib/error-capture";

import { ensureSupabaseSsrEnv } from "./lib/supabase-ssr-env.server";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

function probeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function ssrProbe(request: Request): Promise<Response> {
  const steps: Record<string, unknown> = {};
  try {
    const handler = await getServerEntry();
    steps.serverEntry = "ok";
    const homeUrl = new URL("/", request.url).toString();
    const response = await handler.fetch(new Request(homeUrl, { method: "GET" }), {}, {});
    steps.homeStatus = response.status;
    if (response.status >= 500) {
      const captured = consumeLastCapturedError();
      if (captured) steps.capturedError = probeErrorMessage(captured);
      const body = await response.clone().text();
      if (body.includes("This page didn't load")) steps.homeBody = "branded-500";
      else steps.homeBodyPreview = body.slice(0, 180);
    }
    return new Response(JSON.stringify({ ok: response.status < 500, steps }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (error) {
    steps.error = probeErrorMessage(error);
    const captured = consumeLastCapturedError();
    if (captured) steps.capturedError = probeErrorMessage(captured);
    return new Response(JSON.stringify({ ok: false, steps }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}

function runtimeEnvDiag(): Response {
  const flag = (key: string) =>
    typeof process.env[key] === "string" && process.env[key]!.trim().length > 0;
  return new Response(
    JSON.stringify({
      ok: true,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      env: {
        VITE_SUPABASE_URL: flag("VITE_SUPABASE_URL"),
        VITE_SUPABASE_PUBLISHABLE_KEY: flag("VITE_SUPABASE_PUBLISHABLE_KEY"),
        SUPABASE_URL: flag("SUPABASE_URL"),
        SUPABASE_PUBLISHABLE_KEY: flag("SUPABASE_PUBLISHABLE_KEY"),
        SUPABASE_SERVICE_ROLE_KEY: flag("SUPABASE_SERVICE_ROLE_KEY"),
      },
    }),
    { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    ensureSupabaseSsrEnv();
    const path = new URL(request.url).pathname;
    if (path === "/api/__runtime-diag") {
      return runtimeEnvDiag();
    }
    if (path === "/api/__ssr-probe") {
      return ssrProbe(request);
    }
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
