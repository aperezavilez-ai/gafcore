import { useEffect, useState } from "react";
import { getAuthEmailRedirectOrigin } from "@/lib/auth-email-redirect";
import { supabase } from "@/lib/gafcore-supabase-client-proxy";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Crown, Zap, Infinity as InfinityIcon, Check, ArrowRight } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "login" | "register";
}

type GafPlan = { id: string; name: string; price: number; icon: any; desc: string; features: string[]; highlight?: boolean };
const GAFCORE_PLANS: GafPlan[] = [
  {
    id: "plan_pro_monthly",
    name: "Creator",
    price: 49,
    icon: Crown,
    desc: "Ideal para empezar a crear",
    features: ["150 créditos / mes", "IDE y preview en vivo", "Soporte prioritario"],
    highlight: true,
  },
  {
    id: "plan_premium_monthly",
    name: "Pro",
    price: 99,
    icon: Zap,
    desc: "Para creadores activos",
    features: ["350 créditos / mes", "Flujo de publicación frecuente", "Prioridad en colas"],
  },
  {
    id: "plan_creador_monthly",
    name: "Label",
    price: 299,
    icon: InfinityIcon,
    desc: "Para sellos y agencias",
    features: ["Cuota ampliada para equipos", "Varios proyectos y miembros", "Soporte VIP 1:1"],
  },
];

export function GafCoreAuthDialog({ open, onOpenChange, initialMode = "login" }: Props) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [step, setStep] = useState<"auth" | "plans">("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) setMode(initialMode);
  }, [initialMode, open]);

  const reset = () => {
    setStep("auth");
    setEmail("");
    setPassword("");
  };

  const handleOpen = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const normalizedEmail = String(formData.get("email") ?? email).trim().toLowerCase();
    const currentPassword = String(formData.get("password") ?? password);
    if (!normalizedEmail || !currentPassword) {
      toast.error("Escribe tu correo y contraseña.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "register") {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: currentPassword,
          options: { emailRedirectTo: getAuthEmailRedirectOrigin() },
        });
        if (error && error.message !== "User already registered") throw error;
        if (error?.message === "User already registered") {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password: currentPassword,
          });
          if (signInError) throw new Error("Esta cuenta ya existe. Usa iniciar sesión o recupera tu contraseña.");
          toast.success("Sesión iniciada en GafCore.");
          onOpenChange(false);
          reset();
          return;
        }
        toast.success("Cuenta creada. Elige tu plan para empezar.");
        setStep("plans");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: currentPassword });
        if (error) throw error;
        toast.success("Sesión iniciada en GafCore.");
        onOpenChange(false);
        reset();
      }
    } catch (err: any) {
      toast.error(err?.message || "Error de autenticación");
    } finally {
      setLoading(false);
    }
  };

  const choosePlan = (planId: string) => {
    onOpenChange(false);
    reset();
    // Tras pagar, regresa automáticamente a GafCore (/)
    navigate({
      to: "/gafcore",
      search: { plan: planId },
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className={step === "plans" ? "sm:max-w-[760px]" : "sm:max-w-[400px]"}>
        {step === "auth" ? (
          <>
            <DialogHeader>
              <DialogTitle>{mode === "register" ? "Crear cuenta GafCore" : "Iniciar sesión en GafCore"}</DialogTitle>
              <DialogDescription>
                {mode === "register"
                  ? "Regístrate y elige un plan para empezar a crear."
                  : "Accede a tu cuenta de GafCore."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="gc-email">Email</Label>
                <Input id="gc-email" name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gc-pass">Contraseña</Label>
                <Input id="gc-pass" name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "register" ? "Crear cuenta" : "Iniciar sesión"}
              </Button>
              <button
                type="button"
                onClick={() => setMode(mode === "register" ? "login" : "register")}
                className="w-full text-center text-[12px] text-muted-foreground hover:text-foreground"
              >
                {mode === "register" ? "¿Ya tienes cuenta? Inicia sesión" : "¿Sin cuenta? Crear una"}
              </button>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Elige tu plan GafCore</DialogTitle>
              <DialogDescription>
                Selecciona un plan para empezar. Tras el pago volverás automáticamente a GafCore para crear lo que necesites.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-2">
              {GAFCORE_PLANS.map((p) => {
                const Icon = p.icon;
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border p-4 flex flex-col ${
                      p.highlight ? "border-primary/60 bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon size={18} className="text-primary" />
                      <h3 className="font-bold">{p.name}</h3>
                    </div>
                    <div className="mb-2">
                      <span className="text-3xl font-black">${p.price}</span>
                      <span className="text-xs text-muted-foreground">/mes</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{p.desc}</p>
                    <ul className="space-y-1.5 mb-4 flex-1">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-1.5 text-xs">
                          <Check size={12} className="text-success mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={() => choosePlan(p.id)}
                      variant={p.highlight ? "default" : "outline"}
                      size="sm"
                      className="w-full"
                    >
                      Elegir {p.name} <ArrowRight size={14} />
                    </Button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
              className="w-full text-center text-[12px] text-muted-foreground hover:text-foreground"
            >
              Continuar sin plan (acceso limitado)
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
