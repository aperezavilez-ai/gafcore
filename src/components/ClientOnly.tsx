import { useEffect, useState, type ReactNode } from "react";

/** Renderiza hijos solo en el cliente (evita SSR de widgets con fetch/DOM). */
export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return fallback;
  return children;
}
