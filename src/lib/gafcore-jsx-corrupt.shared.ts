/**
 * Patrones de salida IA claramente inválidos (antes de transpile).
 */
const CORRUPT_PATTERNS: Array<{ re: RegExp; message: string }> = [
  { re: /<\/string>/i, message: "tag JSX inválido </string>" },
  { re: /<\/number>/i, message: "tag JSX inválido </number>" },
  { re: /<\/boolean>/i, message: "tag JSX inválido </boolean>" },
  { re: /<\/object>/i, message: "tag JSX inválido </object>" },
  { re: /<\/array>/i, message: "tag JSX inválido </array>" },
  { re: /<\/Cart>\s*;/, message: "cierre JSX suelto </Cart>;" },
  { re: /<\/[A-Za-z]+>\s*<\/[A-Za-z]+>\s*;\s*$/, message: "cierres JSX adyacentes inválidos al final" },
];

export function detectCorruptJsxContent(content: string, fileName: string): string | null {
  if (!/\.(tsx|jsx)$/i.test(fileName)) return null;
  for (const { re, message } of CORRUPT_PATTERNS) {
    if (re.test(content)) return message;
  }
  return null;
}

export function detectCorruptJsxInFiles(
  files: Array<{ name: string; content: string }>,
): Array<{ file: string; message: string }> {
  const hits: Array<{ file: string; message: string }> = [];
  for (const f of files) {
    const msg = detectCorruptJsxContent(f.content, f.name);
    if (msg) hits.push({ file: f.name, message: msg });
  }
  return hits;
}
