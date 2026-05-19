import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
function RootGate() {
  useEffect(() => {
    const pendingRedirect = sessionStorage.getItem("gafcore_post_login_redirect");
    if (pendingRedirect?.startsWith("/") && !pendingRedirect.startsWith("//")) {
      sessionStorage.removeItem("gafcore_post_login_redirect");
      window.location.replace(pendingRedirect);
      return;
    }
    window.location.replace("/gafcore");
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <div
          role="status"
          aria-label="Cargando"
          className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
        />
        <p className="text-sm text-muted-foreground">Cargando GafCore…</p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: RootGate,
  head: () => ({
    meta: [
      { title: "GafCore — Crea con IA" },
      {
        name: "description",
        content:
          "Plataforma GafCore: chat, preview en vivo y editor para construir con IA.",
      },
    ],
  }),
});
