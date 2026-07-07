import { createRouter, Link, useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isStaleChunkError, reloadAfterStaleChunkError } from "@/lib/stale-chunk-recovery";

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const staleChunkError = isStaleChunkError(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {staleChunkError
            ? "Hay una version nueva de GafCore. Recarga para entrar con los archivos actualizados."
            : "An unexpected error occurred. Please try again."}
        </p>
        {error.message ? (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
            {error.message}
          </pre>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              if (reloadAfterStaleChunkError(error, staleChunkError)) return;
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {staleChunkError ? "Recargar GafCore" : "Try again"}
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function DefaultPendingComponent() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
      <div className="space-y-2 w-full max-w-md">
        <div className="h-4 w-3/4 mx-auto animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 mx-auto animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    // Precarga al pasar el mouse / foco. Delay 0 = arranca inmediato.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 5 * 60_000, // 5 min de caché
    defaultPreloadDelay: 0,
    defaultPendingMs: 0, // muestra skeleton al instante
    defaultPendingMinMs: 200,
    defaultErrorComponent: DefaultErrorComponent,
    defaultPendingComponent: DefaultPendingComponent,
  });

  return router;
};
