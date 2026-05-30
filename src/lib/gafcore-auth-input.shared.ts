import type { FocusEvent } from "react";

/** Evita autofill al cargar; el usuario escribe al hacer foco. */
export function unlockAuthInputOnFocus(e: FocusEvent<HTMLInputElement>) {
  e.currentTarget.readOnly = false;
}

export const authInputAntiAutofill = {
  readOnly: true,
  onFocus: unlockAuthInputOnFocus,
  spellCheck: false,
} as const;
