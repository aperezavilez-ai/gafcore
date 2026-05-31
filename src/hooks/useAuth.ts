import { useState, useEffect, useCallback } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { getGafcoreSupabaseBrowser, isSupabaseReadyOnClient } from "@/lib/gafcore-supabase-browser";

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const AUTH_INIT_TIMEOUT_MS = 8_000;

let authState: AuthState = { user: null, session: null, loading: true };
let authInitPromise: Promise<void> | null = null;
let lastProfileUserId: string | null = null;
const authListeners = new Set<(state: AuthState) => void>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([
    promise,
    new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), ms);
    }),
  ]);
}

function emitAuthState(next: AuthState) {
  authState = next;
  authListeners.forEach((listener) => listener(next));
}

async function ensureProfile(user: User) {
  if (lastProfileUserId === user.id) return;
  lastProfileUserId = user.id;
  const supabase = await getGafcoreSupabaseBrowser();
  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      first_name: user.user_metadata?.first_name ?? user.user_metadata?.given_name ?? null,
      last_name: user.user_metadata?.last_name ?? user.user_metadata?.family_name ?? null,
      artist_name: user.user_metadata?.artist_name ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
    },
    { onConflict: "user_id", ignoreDuplicates: true }
  );
  if (error) lastProfileUserId = null;
}

function applySession(session: Session | null, loading = false) {
  emitAuthState({ user: session?.user ?? null, session, loading });
  if (session?.user) void ensureProfile(session.user);
}

export function initAuthOnce() {
  if (typeof window === "undefined") return Promise.resolve();
  if (authInitPromise) return authInitPromise;

  authInitPromise = (async () => {
    try {
      if (!(await isSupabaseReadyOnClient())) {
        console.error(
          "[Auth] Supabase no disponible en el cliente (build sin VITE_* y /api/gafcore/client-env falló).",
        );
        applySession(null, false);
        return;
      }
      const supabase = await getGafcoreSupabaseBrowser();
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
          lastProfileUserId = null;
          if (typeof window !== "undefined") {
            void import("sonner").then(({ toast }) => toast.dismiss());
          }
          applySession(null, false);
          return;
        }
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
          applySession(session ?? null, false);
          return;
        }
        if (session?.user) {
          emitAuthState({ user: session.user, session, loading: false });
          return;
        }
        applySession(session ?? null, false);
      });

      const result = await withTimeout(supabase.auth.getSession(), AUTH_INIT_TIMEOUT_MS);
      if (result === "timeout") {
        const retry = await supabase.auth.getSession();
        applySession(retry.data.session ?? null, false);
        return;
      }
      applySession(result.data.session ?? null);
    } catch (e) {
      console.error("[Auth] No se pudo inicializar Supabase en el cliente", e);
      applySession(null, false);
    }
  })();

  return authInitPromise;
}

export async function getAuthAccessToken() {
  await initAuthOnce();
  return authState.session?.access_token ?? null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(authState);

  useEffect(() => {
    authListeners.add(setState);
    void initAuthOnce();

    return () => {
      authListeners.delete(setState);
    };
  }, []);

  const signOut = useCallback(async () => {
    if (!(await isSupabaseReadyOnClient())) return;
    try {
      const { setProjectSaveSuppressed } = await import("@/lib/userSupabase");
      setProjectSaveSuppressed(true);
      if (typeof window !== "undefined") {
        void import("sonner").then(({ toast }) => toast.dismiss());
      }
      const supabase = await getGafcoreSupabaseBrowser();
      await supabase.auth.signOut();
    } catch {
      applySession(null, false);
    }
  }, []);

  return { ...state, signOut };
}

/** Si la verificación de sesión tarda demasiado, deja de bloquear la UI. */
export function forceAuthLoadingComplete() {
  if (!authState.loading) return;
  emitAuthState({ ...authState, loading: false });
}

/** Tras login en /gafcore/login: sincroniza estado global antes del redirect. */
export async function hydrateAuthFromStorage(maxMs = 5_000): Promise<boolean> {
  if (!(await isSupabaseReadyOnClient())) return false;
  const supabase = await getGafcoreSupabaseBrowser();
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      applySession(data.session, false);
      return true;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}
