// Client-side: injects Supabase Authorization header into all /_serverFn/* fetches.
import { getAuthAccessToken, initAuthOnce } from "@/hooks/useAuth";

let installed = false;

export function installServerFnAuth() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  void initAuthOnce();

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url && (url.includes("/_serverFn/") || url.includes("/api/gafcore/"))) {
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has("authorization") && !headers.has("Authorization")) {
          const token = await getAuthAccessToken();
          if (token) {
            headers.set("Authorization", `Bearer ${token}`);
            init = { ...(init || {}), headers };
          }
        }
      }
    } catch (e) {
      console.warn("server-fn-auth interceptor failed", e);
    }
    return originalFetch(input as RequestInfo, init);
  };
}
