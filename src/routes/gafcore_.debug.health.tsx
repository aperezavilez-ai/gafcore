import { createFileRoute, Link } from "@tanstack/react-router";
import { DebugHealth } from "@/components/debug/DebugHealth";
import { buildGafcoreSeoMeta } from "@/lib/gafcore-seo.shared";

/** QA interno: /gafcore/debug/health */
export const Route = createFileRoute("/gafcore_/debug/health")({
  component: GafcoreDebugHealthPage,
  head: () => ({
    meta: buildGafcoreSeoMeta({
      title: "Debug — GafCore",
      description: "Panel QA interno.",
      noindex: true,
    }),
  }),
});

function GafcoreDebugHealthPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mb-8 text-center">
        <Link
          to="/gafcore/app"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Volver al IDE
        </Link>
      </div>
      <DebugHealth />
    </div>
  );
}
