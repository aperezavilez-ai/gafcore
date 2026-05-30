import { createFileRoute, Link } from "@tanstack/react-router";
import { GextMain } from "@/templates/mobility";

/** Vista previa plantilla Movilidad — /gafcore/templates/mobility */
export const Route = createFileRoute("/gafcore_/templates/mobility")({
  component: MobilityTemplatePreviewPage,
});

function MobilityTemplatePreviewPage() {
  return (
    <>
      <div className="fixed left-4 top-4 z-50">
        <Link
          to="/gafcore/app"
          className="rounded-full border border-border/60 bg-background/80 px-4 py-2 text-xs text-muted-foreground backdrop-blur-md hover:text-foreground"
        >
          ← IDE GafCore
        </Link>
      </div>
      <GextMain />
    </>
  );
}
