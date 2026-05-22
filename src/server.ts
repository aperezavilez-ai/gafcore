import "./lib/error-capture";

import { ensureSupabaseSsrEnv } from "./lib/supabase-ssr-env.server";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { servePublicStatic } from "./lib/public-static.server";
import { spaFallbackResponse, wantsHtmlDocument } from "./lib/spa-fallback.server";

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
function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname.includes("/_serverFn/");
}

async function normalizeCatastrophicSsrResponse(
  response: Response,
  request: Request,
): Promise<Response> {
  if (isApiPath(new URL(request.url).pathname)) return response;
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  if (wantsHtmlDocument(request)) {
    const fallback = spaFallbackResponse(request);
    if (fallback) return fallback;
  }
  return brandedErrorResponse();
}

function probeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function ssrProbe(request: Request): Promise<Response> {
  const steps: Record<string, unknown> = {};
  const failedFetches: string[] = [];
  const origFetch = globalThis.fetch?.bind(globalThis);
  if (origFetch) {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const res = await origFetch(input, init);
      if (!res.ok && url.includes("/assets/")) failedFetches.push(`${res.status} ${url}`);
      return res;
    };
  }
  try {
    const handler = await getServerEntry();
    steps.serverEntry = "ok";
    const homeUrl = new URL("/", request.url).toString();
    const response = await handler.fetch(new Request(homeUrl, { method: "GET" }), {}, {});
    steps.homeStatus = response.status;
    if (failedFetches.length) steps.failedAssetFetches = failedFetches;
    if (response.status >= 500) {
      const captured = consumeLastCapturedError();
      if (captured) {
        steps.capturedError = probeErrorMessage(captured);
        if (captured instanceof Error && captured.stack) {
          steps.capturedStack = captured.stack.split("\n").slice(0, 6).join("\n");
        }
      }
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
  } finally {
    if (origFetch) globalThis.fetch = origFetch;
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
        OPENAI_API_KEY: flag("OPENAI_API_KEY"),
        OPENROUTER_API_KEY: flag("OPENROUTER_API_KEY"),
        AI_API_KEY: flag("AI_API_KEY"),
        AI_CHAT_COMPLETIONS_URL: flag("AI_CHAT_COMPLETIONS_URL"),
      },
    }),
    { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    ensureSupabaseSsrEnv();
    const path = new URL(request.url).pathname;
    const publicAsset = servePublicStatic(path);
    if (publicAsset) return publicAsset;
    if (path === "/api/__runtime-diag") {
      return runtimeEnvDiag();
    }
    if (path === "/api/__extensions-diag") {
      const { extensionsCatalogDiag } = await import("./extensions/marketplace.server");
      const diag = await extensionsCatalogDiag();
      return new Response(
        JSON.stringify({ ok: true, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null, ...diag }),
        { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } },
      );
    }
    if (request.method === "GET" && path === "/api/extensions/v1/catalog") {
      const { listPublishedCatalog } = await import("./extensions/marketplace.server");
      const { extensionsEnabled } = await import("./extensions/extension-host.server");
      if (!extensionsEnabled()) {
        return new Response(JSON.stringify({ ok: false, error: "extensions_disabled" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      const url = new URL(request.url);
      const kind = url.searchParams.get("kind") ?? undefined;
      const listings = await listPublishedCatalog(kind || undefined);
      return new Response(JSON.stringify({ ok: true, listings }), {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
    if (path === "/api/__ssr-probe") {
      return ssrProbe(request);
    }
    if (path === "/api/__spa-fallback-preview") {
      const fallback = spaFallbackResponse(request);
      return (
        fallback ??
        new Response(JSON.stringify({ ok: false, error: "gafcore-spa-shell.json missing" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        })
      );
    }
    if (request.method === "POST" && path === "/api/gafcore/chat/stream") {
      const { handleGafcoreChatStreamPost } = await import("./lib/gafcore-chat-api.server");
      return handleGafcoreChatStreamPost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/chat/complete") {
      const { handleGafcoreChatCompletePost } = await import("./lib/gafcore-chat-api.server");
      return handleGafcoreChatCompletePost(request);
    }
    if (
      (request.method === "POST" || request.method === "GET") &&
      path === "/api/gafcore/workflow/drain"
    ) {
      const { drainWorkflowQueue } = await import("./tasks/workflow-drain.server");
      const result = await drainWorkflowQueue(request);
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 401,
        headers: { "content-type": "application/json" },
      });
    }
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response, request);
    } catch (error) {
      console.error(error);
      if (isApiPath(path)) {
        return new Response(JSON.stringify({ error: "server_error" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      if (wantsHtmlDocument(request)) {
        const fallback = spaFallbackResponse(request);
        if (fallback) return fallback;
      }
      return brandedErrorResponse();
    }
  },
};
