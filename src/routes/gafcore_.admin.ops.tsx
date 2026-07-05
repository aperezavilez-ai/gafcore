import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { AiMonitorPanel } from "@/components/admin/AiMonitorPanel";
import { AdminApisPanel } from "@/components/admin/AdminApisPanel";
import { DiagnosticsOpsPanel } from "@/components/admin/DiagnosticsOpsPanel";
import { FactoryMetricsPanel } from "@/components/admin/FactoryMetricsPanel";
import { GovernanceOpsPanel } from "@/components/admin/GovernanceOpsPanel";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/gafcore_/admin/ops")({
  component: AdminOpsPage,
  head: () => ({ meta: [{ title: "Ops — Administración — GafCore" }] }),
});

function AdminOpsPage() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: subLoading } = useSubscription(user?.id);
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading || subLoading) return;
    if (!user) {
      void navigate({ to: "/gafcore/login", search: { redirect: "/gafcore/admin/ops" } });
      return;
    }
    if (!isAdmin) {
      void navigate({ to: "/gafcore/app" });
    }
  }, [authLoading, subLoading, user, isAdmin, navigate]);

  if (authLoading || subLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="text-muted-foreground">Acceso restringido a administradores.</p>
        <Button asChild>
          <Link to="/gafcore/app">Ir al IDE</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Administración GafCore
            </p>
            <h1 className="text-lg font-semibold text-foreground">Panel Ops</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/gafcore/app">Volver al IDE</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/gafcore">Inicio</Link>
            </Button>
          </div>
        </div>
      </header>
      <AiMonitorPanel />
      <AdminApisPanel />
      <GovernanceOpsPanel />
      <div className="border-t border-border">
        <FactoryMetricsPanel />
      </div>
      <div className="border-t border-border">
        <DiagnosticsOpsPanel />
      </div>
    </div>
  );
}
