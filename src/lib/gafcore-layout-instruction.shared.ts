/**
 * Detecta peticiones de maquetación (horizontal/vertical) en español e inglés
 * y genera un prefijo explícito para el modelo.
 */
export function buildLayoutInstructionPrefix(userText: string): string {
  const t = userText.trim();
  if (!t) return "";

  const wantsHorizontal =
    /\b(horizontal(?:es|mente)?|en\s+fila|en\s+linea|en\s+línea|uno\s+al\s+lado|lado\s+a\s+lado|misma\s+fila|flex[-\s]?row|row\b|inline)\b/i.test(
      t,
    ) ||
    /\b(alinea|alinead[oa]s?|pon(?:er)?|coloca|ponlos|colócalos).{0,40}(horizontal|en\s+fila|uno\s+al\s+lado)/i.test(
      t,
    ) ||
    /\b(iconos?|enlaces?|botones?|categor[ií]as?).{0,30}(horizontal|en\s+fila|debajo\s+del\s+nombre)/i.test(
      t,
    );

  const wantsVertical =
    /\b(vertical(?:es|mente)?|en\s+columna|uno\s+debajo|apilad[oa]s?|flex[-\s]?col|columna)\b/i.test(
      t,
    ) &&
    !wantsHorizontal;

  if (wantsHorizontal) {
    return (
      "[LAYOUT OBLIGATORIO] El usuario pide disposición HORIZONTAL (una fila): " +
      "usa `flex flex-row flex-wrap items-center justify-center gap-3` o `grid grid-cols-3 gap-3` " +
      "para iconos/enlaces/categorías bajo el nombre del sitio. " +
      "PROHIBIDO `flex-col` o apilar uno debajo de otro en ese grupo. " +
      "Cambio principalmente de CSS/estructura del contenedor; conserva la lógica existente. "
    );
  }

  if (wantsVertical) {
    return (
      "[LAYOUT OBLIGATORIO] El usuario pide disposición VERTICAL (columna): " +
      "usa `flex flex-col gap-2` para ese grupo. "
    );
  }

  return "";
}

/** Para forzar modelo con mejor seguimiento de instrucciones visuales de layout. */
export function instructionNeedsLayoutModel(instruction: string): boolean {
  return buildLayoutInstructionPrefix(instruction).length > 0;
}
