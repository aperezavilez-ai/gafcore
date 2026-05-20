import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGafcoreDevPortWarning } from "@/lib/gafcore-dev-port.shared";

const DISMISS_KEY = "gafcore_dev_port_warn_dismiss";

type DevPortBannerProps = {
  targetPath?: string;
};

export function DevPortBanner({ targetPath = "/gafcore/app" }: DevPortBannerProps) {
  const warning = getGafcoreDevPortWarning(targetPath);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (!warning || dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      className="relative border-b border-border bg-muted/80 px-4 py-3 text-foreground"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-start gap-3 pr-8 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p>{warning.reason}</p>
          <Button asChild size="sm" variant="secondary">
            <a href={warning.suggestedUrl}>Abrir GafCore: {warning.suggestedUrl}</a>
          </Button>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-8 w-8"
        aria-label="Cerrar aviso"
        onClick={dismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
