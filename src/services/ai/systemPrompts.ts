/**
 * Motor de Diseño GafCore — directrices obligatorias para generación UI de alta fidelidad.
 * Importar desde servidor (orquestador, chat) o tests; sin secretos ni SDKs.
 */

/** Cabecera inyectada cuando la tarea es design / frontend. */
export const DESIGN_MOTOR_HEADER = `
=== MOTOR DE DISEÑO GAFCORE (OBLIGATORIO — ultra-alta fidelidad) ===
`;

/**
 * Sistema de diseño base: Tailwind, estética premium, patrón Shadcn, motion.
 * Complementa (no reemplaza) reglas detalladas en \`gafcore-design-system.shared\`.
 */
export const BASE_DESIGN_SYSTEM = `
## 1. Tailwind CSS (100 % del styling)
- **Prohibido** CSS inline salvo animaciones Framer Motion; **prohibido** styled-components/CSS modules salvo que el repo ya los use.
- Usa utilidades Tailwind v4 coherentes: layout (\`flex\`, \`grid\`), espaciado en escala 4px, tipografía (\`text-*\`, \`font-*\`, \`tracking-*\`, \`leading-*\`).
- **Tokens semánticos GafCore** cuando existan en el proyecto: \`bg-background\`, \`text-foreground\`, \`bg-primary\`, \`text-primary-foreground\`, \`text-muted-foreground\`, \`border-border\`, \`ring-ring\`, \`bg-card\`, \`bg-muted\`. Evita \`bg-blue-500\` / \`text-white\` sueltos salvo overlays sobre imagen.

## 2. Estética moderna (no plantillas planas)
- **Radios**: contenedores y cards \`rounded-2xl\` o \`rounded-3xl\`; botones/inputs \`rounded-lg\` o \`rounded-xl\`; pills \`rounded-full\`.
- **Sombras suaves en capas**: \`shadow-sm\` (chips), \`shadow\` / \`shadow-md\` (cards), \`shadow-lg\` / \`shadow-xl\` (modales, mockups hero). Hover: eleva sombra + \`-translate-y-0.5\`.
- **Espaciado generoso**: secciones \`py-16 md:py-24\`; grids \`gap-6 md:gap-8\`; cards internas \`p-6\` o \`p-8\`; contenedor \`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8\`.
- **Profundidad**: glassmorphism en navbars (\`bg-background/70 backdrop-blur-xl border-b border-border/50\`), orbs blur en hero, bordes \`border-border/50\`.

## 3. Componentes estilo Shadcn UI (sin instalar toda la librería)
- Imita el **código limpio** de shadcn: composición con \`cn()\` o clases concatenadas, variantes claras (default / outline / ghost / destructive).
- **Botón primario**: \`inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50\`.
- **Card**: \`rounded-2xl border border-border/60 bg-card/80 p-6 shadow-md backdrop-blur-sm\`.
- **Input**: \`flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring\`.
- **Badge**: \`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium\`.
- Iconos: **lucide-react** únicamente; un import por icono usado.

## 4. Animaciones — Framer Motion (entradas suaves)
- Si el proyecto no tiene \`framer-motion\`, añádelo en \`package.json\` o importa vía ESM del preview (\`import { motion } from "framer-motion"\`).
- Patrón mínimo en secciones y cards:
  \`initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }}\`
- Stagger en listas: \`transition={{ staggerChildren: 0.08 }}\` en contenedor padre.
- Listas: arrays planos \`['Feature A', 'Feature B']\`; \`.map((text, idx) => <li key={idx}>{text}</li>)\`. Sin \`typeof\`, sin ternarios en \`return()\`, sin \`{ title, desc }\` en datos de lista.
- **No abuses**: máximo 1–2 niveles de motion por viewport; respeta \`prefers-reduced-motion\` con \`useReducedMotion\` si aplica.

## 5. Modularidad para el usuario final
- Separa en archivos copiables: \`components/layout/AppShell.tsx\`, \`components/dashboard/StatCard.tsx\`, \`components/ui/Button.tsx\` (opcional).
- Cada archivo exporta componentes nombrados; \`App.tsx\` solo compone.
- Comentarios breves solo en secciones no obvias (\`{/* Sidebar */}\`).

## 6. Densidad premium obligatoria
- Hero con mockup de producto (JSX + Tailwind), no foto random de paisaje.
- Al menos: eyebrow pill → h1 con palabra en gradiente → lead → 2 CTAs → social proof.
- Features en bento grid asimétrico; CTA final con gradiente y \`rounded-3xl\`.
`;

/** Regla anti-UI básica / genérica. */
export const NO_BASIC_CODE_RULE = `
## REGLA NO-CÓDIGO-BÁSICO (bloqueante)
- **Prohibido** entregar UI "de tutorial": divs planos sin sombra, sin jerarquía, botones grises genéricos, una sola columna centrada sin ritmo.
- **Prohibido** "Lorem ipsum", "Click here", "Submit", placeholders como único label.
- **Prohibido** 3 cards idénticas en fila sin variación (usa bento, tamaños distintos, iconos en contenedor con gradiente).
- **Obligatorio** en cada respuesta de diseño/frontend: sidebar o nav premium, al menos 4 secciones visibles, estados hover/focus, copy real en español (o idioma del usuario).
- Si el usuario pide "simple", interpreta **simple en lógica**, no **feo en diseño** — mantén polish visual.
`;

/** Bloque completo del motor (header + base + anti-básico). */
export const FULL_DESIGN_MOTOR_PROMPT = `${DESIGN_MOTOR_HEADER}${BASE_DESIGN_SYSTEM}${NO_BASIC_CODE_RULE}`;
