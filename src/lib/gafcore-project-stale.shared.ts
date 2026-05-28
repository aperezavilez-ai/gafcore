/** Detecta si los archivos del proyecto son solo la plantilla vacía de GafCore (no un proyecto real). */

export function isGafcoreDefaultTemplateApp(content: string): boolean {
  const c = content.trim();
  if (!c) return true;
  if (/Bienvenidos a GafCore/i.test(c) && /Empieza escribiendo en el chat/i.test(c)) {
    return true;
  }
  if (/gafcore-logo\.png/i.test(c) && /Empieza escribiendo en el chat/i.test(c)) {
    return true;
  }
  const legacyMarkers = [
    "Bienvenidos a GafCore",
    "Empieza escribiendo en el chat lo que quieres construir",
    "Diseña, construye y publica tu sitio web o app",
  ] as const;
  return legacyMarkers.every((m) => c.includes(m));
}

export function isRemoteProjectStale(
  remote: Array<{ name: string; content: string }> | null | undefined,
): boolean {
  if (!remote?.length) return true;

  const totalChars = remote.reduce((n, f) => n + (f.content?.length ?? 0), 0);
  const appFile = remote.find((f) => /^app\.(jsx?|tsx?)$/i.test(f.name));

  const nonAppChars = remote
    .filter((f) => !/^app\.(jsx?|tsx?)$/i.test(f.name))
    .reduce((n, f) => n + (f.content?.length ?? 0), 0);

  /** Varios archivos con código real → no resetear aunque App.tsx siga siendo la plantilla. */
  if (nonAppChars > 800) return false;

  if (remote.length >= 2 && totalChars > 600 && appFile && /export\s+default/.test(appFile.content)) {
    return false;
  }

  if (!appFile || !/export\s+default/.test(appFile.content)) return true;

  if (isGafcoreDefaultTemplateApp(appFile.content) && remote.length <= 4 && totalChars < 2500) {
    return true;
  }

  const legacyStale =
    /Hello\s*\(/.test(appFile.content) ||
    /GafCore listo|Pídele algo a GafCore|Editor · App\.tsx|const \[code, setCode\]/.test(
      appFile.content,
    ) ||
    /Hola desde GafCore/i.test(appFile.content) ||
    (/Proyecto listo/i.test(appFile.content) && !/useState/i.test(appFile.content));

  return legacyStale;
}
