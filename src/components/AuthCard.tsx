import { ReactNode } from "react";
import { GafcoreLogo } from "@/components/GafcoreLogo";
import { Music2, ShieldCheck, Sparkles } from "lucide-react";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  showLogo?: boolean;
  compact?: boolean;
}

/**
 * Premium auth card shell - glassmorphism with gradient glow.
 * Used by /login, /register, and inline auth surfaces.
 */
export function AuthCard({ title, subtitle, children, footer, showLogo = true, compact = false }: AuthCardProps) {
  return (
    <div className="relative w-full">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10 opacity-80 blur-3xl [background:var(--gradient-auth-glow)]"
      />

      <div className="auth-card-shell relative overflow-hidden rounded-3xl border border-border/60 bg-[image:var(--gradient-auth-panel)] shadow-[var(--shadow-auth)] backdrop-blur-xl">
        <div aria-hidden className="absolute inset-0 bg-[image:var(--gradient-auth-mesh)] bg-[length:34px_34px] opacity-[0.05]" />
        <div aria-hidden className="absolute left-6 right-6 top-0 h-px bg-[image:var(--gradient-auth-accent)] opacity-80" />

        <div className={compact ? "relative p-5 sm:p-6" : "relative p-6 sm:p-8"}>
          {showLogo && (
            <div className="mb-5 flex justify-center">
              <GafcoreLogo variant={compact ? "header" : "full"} linkTo="/gafcore" />
            </div>
          )}

          <div className="mb-6 text-center">
            <div className="mb-3 flex items-center justify-center gap-2 text-muted-foreground">
              <Music2 size={16} />
              <Sparkles size={15} />
              <ShieldCheck size={16} />
            </div>
            <h1 className={`font-bold tracking-normal text-foreground ${compact ? "text-xl" : "text-2xl sm:text-3xl"}`}>
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>

          {children}

          {footer && <div className="mt-5">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
