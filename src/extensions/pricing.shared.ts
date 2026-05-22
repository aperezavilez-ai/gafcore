/** Etiqueta de precio para catálogo marketplace (E2). */
export function formatExtensionPrice(cents: number, currency = "eur"): string {
  if (!Number.isFinite(cents) || cents <= 0) return "Gratis";
  const code = currency.trim().toUpperCase() || "EUR";
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: code,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}
