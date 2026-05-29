import logo from "@/assets/gafcore-logo.png";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** Logo oficial GafCore (icono + wordmark + tagline). */
export const GAFCORE_LOGO_PUBLIC_URL = "/gafcore-logo.png";

type GafcoreLogoProps = {
  className?: string;
  imgClassName?: string;
  /** full: marca completa · header: barra landing · hero: inicio · toolbar: IDE compacto */
  variant?: "full" | "header" | "hero" | "toolbar";
  linkTo?: "/" | "/gafcore" | false;
};

export function GafcoreLogo({
  className,
  imgClassName,
  variant = "full",
  linkTo = "/gafcore",
}: GafcoreLogoProps) {
  const height =
    variant === "toolbar"
      ? "h-8 max-h-8"
      : variant === "header"
        ? "h-14 sm:h-16"
        : variant === "hero"
          ? "h-40 sm:h-52 md:h-56"
          : "h-24 sm:h-28";

  const img = (
    <img
      src={logo}
      alt="GafCore — Tu idea + IA = Realidad"
      className={cn(
        "w-auto max-w-full object-contain object-left",
        height,
        imgClassName,
      )}
      width={variant === "toolbar" ? 120 : 320}
      height={variant === "hero" ? 224 : variant === "toolbar" ? 32 : 64}
      decoding="async"
    />
  );

  if (!linkTo) {
    return <div className={cn("inline-flex", className)}>{img}</div>;
  }

  return (
    <Link to={linkTo} className={cn("inline-flex shrink-0", className)}>
      {img}
    </Link>
  );
}
