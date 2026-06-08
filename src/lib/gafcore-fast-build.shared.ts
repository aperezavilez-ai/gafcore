/**
 * Build rápido al reemplazar la plantilla de bienvenida (primer proyecto).
 * Una sola llamada IA, modelo fast, App.tsx único, sin cadenas de reintento.
 */

export const FAST_WELCOME_BUILD_TAG = "[FAST-WELCOME-BUILD]";

export function isFastWelcomeBuildInstruction(instruction: string): boolean {
  return instruction.includes(FAST_WELCOME_BUILD_TAG);
}

export function buildFastWelcomeBuildPrefix(userText: string): string {
  const topic = userText.trim().slice(0, 220);
  return (
    `${FAST_WELCOME_BUILD_TAG} Reemplaza la pantalla de bienvenida de GafCore. ` +
    `Genera SOLO App.tsx (un archivo, código completo). ` +
    `Proyecto: «${topic}». Catálogo en grid, botón añadir al carrito, contador/total en header. ` +
    `useState + localStorage. PROHIBIDO crear lib/store.tsx u otros archivos en este paso. ` +
    `Sintaxis JSX válida: cierra todas las llaves, paréntesis y tags. ` +
    `Responde JSON { reply, files } con App.tsx listo para preview. `
  );
}
