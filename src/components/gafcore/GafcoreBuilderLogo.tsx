import logo from "@/assets/gafcore-logo.png";
import { cn } from "@/lib/utils";

type GafcoreLogoProps = {
  className?: string;
  imgClassName?: string;
  /** toolbar: barra superior compacta · hero: pantalla de bienvenida grande */
  variant?: "toolbar" | "hero";
};

/** Logo oficial GafCore (icono + wordmark + tagline) para el Builder V2. */
export function GafcoreLogo({ className, imgClassName, variant = "hero" }: GafcoreLogoProps) {
  const height = variant === "toolbar" ? "h-7" : "h-32 sm:h-40";

  return (
    <div className={cn("inline-flex shrink-0 items-center", className)}>
      <img
        src={logo}
        alt="GafCore — Tu idea + IA = Realidad"
        className={cn("w-auto max-w-full object-contain", height, imgClassName)}
        decoding="async"
      />
    </div>
  );
}
