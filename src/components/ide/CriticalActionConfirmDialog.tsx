import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldAlert } from "lucide-react";
import type { GafcoreRiskAssessment } from "@/lib/gafcore-governance.shared";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  summary: string;
  risk: GafcoreRiskAssessment | null;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
};

function riskVariant(level: string): "default" | "secondary" | "destructive" | "outline" {
  if (level === "critical" || level === "high") return "destructive";
  if (level === "medium") return "secondary";
  return "outline";
}

/** Confirmación humana antes de acciones críticas (delete, publish). */
export function CriticalActionConfirmDialog({
  open,
  onOpenChange,
  title,
  summary,
  risk,
  confirmLabel = "Confirmar",
  busy = false,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-left pt-1">{summary}</DialogDescription>
        </DialogHeader>
        {risk ? (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Nivel de riesgo: </span>
            <Badge variant={riskVariant(risk.level)} className="ml-1">
              {risk.level} ({risk.score}/100)
            </Badge>
            {risk.signals.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Señales: {risk.signals.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void onConfirm()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
