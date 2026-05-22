import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { CreatorMarketplacePublisherPanel } from "@/components/gafcore/CreatorMarketplacePublisherPanel";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/gafcore_/publisher")({
  component: GafcorePublisherPage,
  head: () => ({ meta: [{ title: "Publicar extensión — GafCore" }] }),
});

function GafcorePublisherPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      void navigate({ to: "/gafcore/login", search: { redirect: "/gafcore/publisher" } });
    }
  }, [authLoading, user, navigate]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="text-muted-foreground">Inicia sesión para publicar extensiones.</p>
        <Button asChild>
          <Link to="/gafcore/login" search={{ redirect: "/gafcore/publisher" }}>
            Entrar
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <CreatorMarketplacePublisherPanel />
    </div>
  );
}
