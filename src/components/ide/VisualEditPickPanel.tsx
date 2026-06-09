/**
 * VisualEditPickPanel — panel flotante que aparece al hacer click en el preview
 * con el editor visual activo. Muestra las propiedades del elemento seleccionado
 * y permite describir un cambio para enviarlo directo al chat.
 */
import { useEffect, useRef, useState } from "react";
import { MousePointer2, X, Wand2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type VePickInfo = {
  tag: string;
  selector: string;
  text: string;
  /** Estilos computados capturados en el iframe */
  styles?: {
    color?: string;
    background?: string;
    fontSize?: string;
    fontWeight?: string;
    padding?: string;
    borderRadius?: string;
    width?: string;
    height?: string;
  };
};

type Props = {
  pick: VePickInfo | null;
  onApply: (instruction: string) => void;
  onDismiss: () => void;
};

const STYLE_LABELS: Record<string, string> = {
  color: "Color texto",
  background: "Fondo",
  fontSize: "Tamaño fuente",
  fontWeight: "Peso",
  padding: "Padding",
  borderRadius: "Radio borde",
  width: "Ancho",
  height: "Alto",
};

const QUICK_ACTIONS = [
  { label: "Cambiar color", template: (s: VePickInfo) => `Cambia el color de texto del elemento <${s.tag}> "${s.text || s.selector}" a ` },
  { label: "Cambiar fondo", template: (s: VePickInfo) => `Cambia el color de fondo del elemento <${s.tag}> "${s.text || s.selector}" a ` },
  { label: "Cambiar texto", template: (s: VePickInfo) => `Cambia el texto del elemento <${s.tag}> "${s.text || s.selector}" por: ` },
  { label: "Cambiar tamaño", template: (s: VePickInfo) => `Cambia el tamaño de fuente del elemento <${s.tag}> "${s.text || s.selector}" a ` },
  { label: "Añadir animación", template: (s: VePickInfo) => `Añade una animación sutil al elemento <${s.tag}> "${s.text || s.selector}". ` },
  { label: "Eliminar elemento", template: (s: VePickInfo) => `Elimina el elemento <${s.tag}> "${s.text || s.selector}" del proyecto. ` },
];

export function VisualEditPickPanel({ pick, onApply, onDismiss }: Props) {
  const [instruction, setInstruction] = useState("");
  const [showStyles, setShowStyles] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reset cuando cambia el pick
  useEffect(() => {
    if (pick) {
      setInstruction("");
      setShowStyles(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [pick]);

  if (!pick) return null;

  const hasStyles = pick.styles && Object.values(pick.styles).some(Boolean);

  const handleApply = () => {
    const base = `Elemento seleccionado: <${pick.tag}> "${pick.text || ""}" (${pick.selector}). `;
    const stylesHint =
      hasStyles && pick.styles
        ? `Estilos actuales: ${Object.entries(pick.styles)
            .filter(([, v]) => v)
            .map(([k, v]) => `${STYLE_LABELS[k] ?? k}: ${v}`)
            .join(", ")}. `
        : "";
    const full = base + stylesHint + (instruction.trim() || "Modifica este elemento.");
    onApply(full);
    onDismiss();
  };

  const handleQuickAction = (template: (s: VePickInfo) => string) => {
    setInstruction(template(pick));
    setTimeout(() => {
      inputRef.current?.focus();
      const len = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(len, len);
    }, 30);
  };

  return (
    <div
      className={cn(
        "absolute bottom-2 left-2 right-2 z-50 rounded-xl border border-primary/30 bg-background shadow-xl",
        "animate-in slide-in-from-bottom-2 duration-200",
      )}
      role="dialog"
      aria-label="Editor visual — elemento seleccionado"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <MousePointer2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-xs font-semibold text-foreground">
            &lt;{pick.tag}&gt;{pick.text ? ` "${pick.text.slice(0, 30)}${pick.text.length > 30 ? "…" : ""}"` : ""}
          </span>
          <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
            {pick.selector}
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Estilos actuales (colapsable) */}
      {hasStyles && (
        <div className="border-b border-border">
          <button
            type="button"
            onClick={() => setShowStyles((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-muted/40"
          >
            <span>Estilos actuales</span>
            {showStyles ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showStyles && pick.styles && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 px-3 pb-2 pt-1">
              {Object.entries(pick.styles)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    {k === "color" || k === "background" ? (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border"
                        style={{ background: v }}
                      />
                    ) : null}
                    <span className="text-[10px] text-muted-foreground">{STYLE_LABELS[k] ?? k}:</span>
                    <span className="truncate text-[10px] font-medium text-foreground">{v}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Acciones rápidas */}
      <div className="flex flex-wrap gap-1 px-3 py-2">
        {QUICK_ACTIONS.map(({ label, template }) => (
          <button
            key={label}
            type="button"
            onClick={() => handleQuickAction(template)}
            className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:bg-primary/8 hover:text-foreground transition-colors"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Input + enviar */}
      <div className="flex gap-2 px-3 pb-3 pt-1">
        <textarea
          ref={inputRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Describe el cambio que quieres hacer…"
          rows={2}
          className="flex-1 resize-none rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleApply();
          }}
        />
        <Button
          type="button"
          size="sm"
          className="h-auto self-end px-3 py-1.5 text-xs"
          onClick={handleApply}
          disabled={!instruction.trim()}
          title="Aplicar cambio (⌘Enter)"
        >
          <Wand2 className="mr-1.5 h-3.5 w-3.5" />
          Aplicar
        </Button>
      </div>
    </div>
  );
}
