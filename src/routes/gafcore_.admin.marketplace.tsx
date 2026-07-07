import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { AdminMarketplacePublisherPanel } from "@/components/admin/AdminMarketplacePublisherPanel";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/gafcore_/admin/marketplace")({
  component: AdminMarketplacePage,
  head: () => ({ meta: [{ title: "Publisher Marketplace — Admin — GafCore" }] }),
});

function AdminMarketplacePage() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: subLoading } = useSubscription(user?.id, user?.email);
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading || subLoading) return;
    if (!user) {
      void navigate({ to: "/gafcore/login", search: { redirect: "/gafcore/admin/marketplace" } });
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
      <AdminMarketplacePublisherPanel />
    </div>
  );
}
