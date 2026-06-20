import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth, initAuthOnce } from "@/hooks/useAuth";
import { buildGafcoreSeoMeta } from "@/lib/gafcore-seo.shared";
import { GafCoreBuilderV2 } from "@/components/gafcore/GafCoreBuilderV2";

/**
 * Ruta de prueba para el builder V2 (simple, solo Claude). Vive separada
 * de /gafcore/app a propósito: así no se toca nada de la ruta legada
 * mientras se valida que esta versión nueva funciona de forma confiable.
 */
export const Route = createFileRoute("/gafcore_/app-v2")({
  component: GafCoreAppV2Page,
  head: () => ({
    meta: buildGafcoreSeoMeta({
      title: "Builder (beta) — GafCore",
      description: "Generador de sitios con IA — versión simplificada.",
      noindex: true,
    }),
  }),
});

function GafCoreAppV2Page() {
  const { user, loading } = useAuth();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    void initAuthOnce().finally(() => setChecked(true));
  }, []);

  if (loading || !checked) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">
          Necesitas iniciar sesión para usar el builder.
        </p>
        <Link
          to="/gafcore_/login"
          className="text-sm font-medium text-primary underline"
        >
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen w-full">
      <GafCoreBuilderV2 />
    </div>
  );
}
