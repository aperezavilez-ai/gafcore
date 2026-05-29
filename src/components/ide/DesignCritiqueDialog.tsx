/**
 * Auditor de diseño GafCore — Fase 4.
 *
 * Botón que pide al cerebro Claude Sonnet 4.5 una crítica visual del proyecto actual
 * y aplica las mejoras automáticamente en el chat.
 */
import { useState, useCallback } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getAuthAccessToken } from "@/hooks/useAuth";
import type { DesignCritiqueResponse } from "@/lib/gafcore-design-critique.shared";
import type { FileItem } from "@/components/ide/CodeEditor";

type Props = {
  files: FileItem[];
  projectId: string | null;
};

export function DesignCritiqueDialog({ files, projectId }: Props) {
  const [loading, setLoading] = useState(false);

  const auditAndAutoApply = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthAccessToken();
      if (!token) {
        toast.error("Inicia sesión para auditar el diseño.");
        return;
      }
      const res = await fetch("/api/gafcore/design-critique", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          projectId: projectId ?? undefined,
          files: files.map((f) => ({ name: f.name, content: f.content })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (json?.error === "insufficient_credits") {
          toast.error("Sin créditos suficientes para auditar.");
        } else if (json?.error === "rate_limited") {
          toast.error("Demasiadas peticiones, intenta en un momento.");
        } else {
          toast.error("No se pudo completar la auditoría.");
        }
        return;
      }
      const critique = json.critique as DesignCritiqueResponse;
      if (critique.issues.length === 0) {
        toast.success("Sin issues — diseño OK.");
        return;
      }
      window.dispatchEvent(
        new CustomEvent("gafcore:apply-instruction", {
          detail: { instruction: critique.followupInstruction, autoSend: true },
        }),
      );
      toast.success(`Auditoría OK (${critique.issues.length} mejoras) — aplicando…`);
    } catch (e) {
      console.error("[critique-auto]", e);
      toast.error("Error al auditar.");
    } finally {
      setLoading(false);
    }
  }, [files, projectId]);

  return (
    <Button
      variant="default"
      size="sm"
      className="gap-1.5"
      onClick={auditAndAutoApply}
      disabled={loading}
      title="Audita el diseño y aplica las mejoras automáticamente en el chat"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
      Auditar y mejorar
    </Button>
  );
}
