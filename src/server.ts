import "./lib/error-capture";

import { ensureSupabaseSsrEnv } from "./lib/supabase-ssr-env.server";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { servePublicStatic } from "./lib/public-static.server";
import { buildSanitizedLoginUrl, loginUrlHasForbiddenParams } from "./lib/gafcore-login.shared";
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

function supabaseStorageKey(url: string): string {
  try {
    const ref = new URL(url).hostname.split(".")[0];
    return `sb-${ref}-auth-token`;
  } catch {
    return "sb-auth-token";
  }
}

async function gafcoreAuthLogin(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!email || !password || !email.includes("@")) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_body" }), {
      status: 400,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const { resolveServerSupabasePublicEnv } = await import("./lib/gafcore-supabase-env.server");
  const pub = resolveServerSupabasePublicEnv();
  if (!pub) {
    return new Response(JSON.stringify({ ok: false, error: "server_misconfigured" }), {
      status: 503,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${pub.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: pub.publishableKey,
        Authorization: `Bearer ${pub.publishableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            payload.error_description ||
            payload.msg ||
            payload.message ||
            payload.error ||
            "No se pudo iniciar sesion.",
        }),
        {
          status: res.status,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        },
      );
    }

    if (typeof payload.access_token !== "string" || typeof payload.refresh_token !== "string") {
      return new Response(JSON.stringify({ ok: false, error: "missing_session_tokens" }), {
        status: 502,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_in: payload.expires_in,
        token_type: payload.token_type,
        storage_key: supabaseStorageKey(pub.url),
        user: payload.user,
      }),
      { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } },
    );
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return new Response(JSON.stringify({ ok: false, error: aborted ? "auth_timeout" : "auth_failed" }), {
      status: 504,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } finally {
    clearTimeout(timeout);
  }
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
        VITE_SUPABASE_ANON_KEY: flag("VITE_SUPABASE_ANON_KEY"),
        SUPABASE_URL: flag("SUPABASE_URL"),
        SUPABASE_PUBLISHABLE_KEY: flag("SUPABASE_PUBLISHABLE_KEY"),
        SUPABASE_ANON_KEY: flag("SUPABASE_ANON_KEY"),
        SUPABASE_SERVICE_ROLE_KEY: flag("SUPABASE_SERVICE_ROLE_KEY"),
        ANTHROPIC_API_KEY: flag("ANTHROPIC_API_KEY"),
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
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.includes("/gafcore/login")) {
      if (request.method === "POST") {
        return Response.redirect(buildSanitizedLoginUrl(url), 303);
      }
      if (loginUrlHasForbiddenParams(url)) {
        return Response.redirect(buildSanitizedLoginUrl(url), 302);
      }
    }

    if (request.method === "GET" && path === "/") {
      return Response.redirect(`${url.origin}/gafcore`, 307);
    }
    const publicAsset = servePublicStatic(path);
    if (publicAsset) return publicAsset;
    if (path === "/api/__runtime-diag") {
      return runtimeEnvDiag();
    }
    if (path === "/api/gafcore/auth-login") {
      return gafcoreAuthLogin(request);
    }
    if (request.method === "GET" && path === "/api/gafcore/client-env") {
      const { resolveServerSupabasePublicEnv } = await import("./lib/gafcore-supabase-env.server");
      const pub = resolveServerSupabasePublicEnv();
      if (!pub) {
        return new Response(JSON.stringify({ ok: false }), {
          status: 503,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      }
      return new Response(JSON.stringify({ ok: true, url: pub.url, publishableKey: pub.publishableKey }), {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
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
    if (request.method === "POST" && path === "/api/gafcore/projects-list") {
      const { handleGafcoreProjectsListPost } = await import("./lib/gafcore-projects-http.server");
      return handleGafcoreProjectsListPost(request);
    }
    if (request.method === "GET" && path === "/api/gafcore/projects-list") {
      const { handleGafcoreProjectsListGet } = await import("./lib/gafcore-projects-http.server");
      return handleGafcoreProjectsListGet(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/projects-files-save") {
      const { handleGafcoreProjectsFilesSavePost } = await import("./lib/gafcore-projects-http.server");
      return handleGafcoreProjectsFilesSavePost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/projects-create") {
      const { handleGafcoreProjectsCreatePost } = await import("./lib/gafcore-projects-http.server");
      return handleGafcoreProjectsCreatePost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/projects-delete") {
      const { handleGafcoreProjectsDeletePost } = await import("./lib/gafcore-projects-http.server");
      return handleGafcoreProjectsDeletePost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/project-templates") {
      const { handleGafcoreProjectTemplatesPost } = await import("./lib/gafcore-projects-http.server");
      return handleGafcoreProjectTemplatesPost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/checkout-confirm") {
      const { handleGafcoreCheckoutConfirmPost } = await import("./lib/gafcore-checkout-http.server");
      return handleGafcoreCheckoutConfirmPost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/brand/get") {
      const { handleGafcoreBrandGetPost } = await import("./lib/gafcore-brand-http.server");
      return handleGafcoreBrandGetPost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/brand/set") {
      const { handleGafcoreBrandSetPost } = await import("./lib/gafcore-brand-http.server");
      return handleGafcoreBrandSetPost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/design-critique") {
      const { handleGafcoreDesignCritiquePost } = await import(
        "./lib/gafcore-design-critique-http.server"
      );
      return handleGafcoreDesignCritiquePost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/factory/run") {
      const { handleGafcoreFactoryRunPost } = await import("./lib/gafcore-factory-http.server");
      return handleGafcoreFactoryRunPost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/factory/status") {
      const { handleGafcoreFactoryStatusPost } = await import("./lib/gafcore-factory-http.server");
      return handleGafcoreFactoryStatusPost(request);
    }
    if (request.method === "POST" && path === "/api/extensions/v1/catalog") {
      const { handleExtensionsCatalogPost } = await import("./lib/gafcore-extensions-http.server");
      return handleExtensionsCatalogPost(request);
    }
    if (request.method === "POST" && path === "/api/extensions/v1/install") {
      const { handleExtensionsInstallPost } = await import("./lib/gafcore-extensions-http.server");
      return handleExtensionsInstallPost(request);
    }
    if (request.method === "POST" && path === "/api/extensions/v1/uninstall") {
      const { handleExtensionsUninstallPost } = await import("./lib/gafcore-extensions-http.server");
      return handleExtensionsUninstallPost(request);
    }
    if (request.method === "POST" && path === "/api/extensions/v1/installs") {
      const { handleExtensionsInstallsPost } = await import("./lib/gafcore-extensions-http.server");
      return handleExtensionsInstallsPost(request);
    }
    if (request.method === "POST" && path === "/api/extensions/v1/checkout-session") {
      const { handleExtensionsCheckoutSessionPost } = await import("./lib/gafcore-extensions-http.server");
      return handleExtensionsCheckoutSessionPost(request);
    }
    if (request.method === "POST" && path === "/api/extensions/v1/agent-test") {
      const { handleExtensionsAgentTestPost } = await import("./lib/gafcore-extensions-http.server");
      return handleExtensionsAgentTestPost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/marketplace/admin/listings") {
      const { handleMarketplaceAdminListingsPost } = await import("./lib/gafcore-extensions-http.server");
      return handleMarketplaceAdminListingsPost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/marketplace/admin/publish") {
      const { handleMarketplaceAdminPublishPost } = await import("./lib/gafcore-extensions-http.server");
      return handleMarketplaceAdminPublishPost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/marketplace/admin/state") {
      const { handleMarketplaceAdminStatePost } = await import("./lib/gafcore-extensions-http.server");
      return handleMarketplaceAdminStatePost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/marketplace/admin/sync-builtin-templates") {
      const { handleMarketplaceAdminSyncBuiltinPost } = await import("./lib/gafcore-extensions-http.server");
      return handleMarketplaceAdminSyncBuiltinPost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/marketplace/publisher/me") {
      const { handleMarketplacePublisherMePost } = await import("./lib/gafcore-extensions-http.server");
      return handleMarketplacePublisherMePost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/marketplace/publisher/listings") {
      const { handleMarketplacePublisherListingsPost } = await import("./lib/gafcore-extensions-http.server");
      return handleMarketplacePublisherListingsPost(request);
    }
    if (request.method === "POST" && path === "/api/gafcore/marketplace/publisher/submit") {
      const { handleMarketplacePublisherSubmitPost } = await import("./lib/gafcore-extensions-http.server");
      return handleMarketplacePublisherSubmitPost(request);
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
