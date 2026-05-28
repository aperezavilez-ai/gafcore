import logo from "@/assets/gafcore-logo.png";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** Logo oficial GafCore (icono + wordmark + tagline). */
export const GAFCORE_LOGO_PUBLIC_URL = "/gafcore-logo.png";

type GafcoreLogoProps = {
  className?: string;
  imgClassName?: string;
  /** En header compacto solo se muestra la marca sin recortar el tagline si cabe. */
  variant?: "full" | "header" | "hero";
  linkTo?: "/" | "/gafcore";
};

export function GafcoreLogo({
  className,
  imgClassName,
  variant = "full",
  linkTo = "/gafcore",
}: GafcoreLogoProps) {
  const height =
    variant === "header" ? "h-14 sm:h-16" : variant === "hero" ? "h-40 sm:h-52 md:h-56" : "h-24 sm:h-28";

  const img = (
    <img
      src={logo}
      alt="GafCore — Tu idea + IA = Realidad"
      className={cn("w-auto max-w-full object-contain", height, imgClassName)}
      width={320}
      height={variant === "hero" ? 224 : 64}
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
