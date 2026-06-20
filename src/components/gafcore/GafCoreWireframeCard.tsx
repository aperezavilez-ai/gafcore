import { Check, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SitePlanSection } from "@/services/siteBuilderV2.server";

type Props = {
  sections: SitePlanSection[];
  onApprove: () => void;
  onRequestChanges: () => void;
  isBuilding: boolean;
};

/**
 * Tarjeta de wireframe mostrada dentro del chat: cajas apiladas
 * verticalmente representando cada seccion propuesta para el sitio,
 * con acciones para aprobar y construir, o pedir ajustes al plan.
 */
export function GafCoreWireframeCard({
  sections,
  onApprove,
  onRequestChanges,
  isBuilding,
}: Props) {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
      <p className="mb-2 text-xs font-medium text-violet-700">
        Asi quedaria la estructura de tu sitio:
      </p>

      <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {sections.map((section) => (
          <div
            key={section.id}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2"
          >
            <p className="text-xs font-semibold text-neutral-900">{section.label}</p>
            <p className="text-[11px] text-neutral-500">{section.description}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onApprove}
          disabled={isBuilding}
          className="flex-1 bg-violet-500 hover:bg-violet-600"
        >
          {isBuilding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Construir este sitio
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRequestChanges}
          disabled={isBuilding}
          className="border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100"
        >
          <Pencil className="h-3.5 w-3.5" />
          Ajustar plan
        </Button>
      </div>
    </div>
  );
}
