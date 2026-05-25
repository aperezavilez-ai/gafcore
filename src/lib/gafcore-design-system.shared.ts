/**
 * Conocimiento de diseño profesional inyectado en el system prompt del cerebro GafCore.
 * Mantén este módulo separado para iterar sin tocar `gafcore-chat.shared.ts`.
 */
export const GAFCORE_DESIGN_SYSTEM = `

=== CAPA DE DISEÑO PROFESIONAL (obligatoria en cualquier UI) ===

A) **Sistema tipográfico**
   - Par de fuentes (display + texto). Defaults seguros: \`Inter\` para texto + \`Inter\` o \`Space Grotesk\` para display. Marcas premium: \`Cormorant Garamond\` (display) + \`Inter\` (texto). Tecnología/SaaS: \`Geist\` o \`Space Grotesk\` + \`Inter\`.
   - Escala modular ratio 1.25 o 1.333: \`text-xs\` 12 / \`text-sm\` 14 / \`text-base\` 16 / \`text-lg\` 18 / \`text-xl\` 20 / \`text-2xl\` 24 / \`text-3xl\` 30 / \`text-4xl\` 36 / \`text-5xl\` 48 / \`text-6xl\` 60 / \`text-7xl\` 72.
   - Hero h1: 48–72 px desktop, 36–48 móvil. h2: 30–48. h3: 20–30. Body: 16, never below 14.
   - \`leading-tight\` para títulos (\`leading-[1.1]\` en hero), \`leading-relaxed\` (1.625) para párrafos largos.
   - \`tracking-tight\` en títulos grandes, \`tracking-wide uppercase\` en eyebrows/labels pequeñas.

B) **Sistema de espaciado** (rítmica visual)
   - Escala base 4 px: usa 4/8/12/16/20/24/32/40/48/64/80/96/128. NUNCA inventes valores arbitrarios (\`mt-[27px]\`).
   - Padding de secciones hero: \`py-20 md:py-32 lg:py-40\`. Secciones normales: \`py-16 md:py-24\`. Contenedor: \`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8\`.
   - Gap en grids: \`gap-6 md:gap-8\` para cards; \`gap-4\` para listas densas.

C) **Paleta y color (regla 60-30-10)**
   - 60% fondo neutro, 30% color secundario/texto, 10% acento (CTAs, badges).
   - Usa SOLO tokens semánticos del proyecto si existen (\`bg-background\`, \`text-foreground\`, \`bg-primary\`, \`text-muted-foreground\`, \`border-border\`). Si el proyecto no los tiene, define paleta oklch en \`styles.css\` antes de usar colores.
   - Prohibido hard-code de colores nominales (\`bg-blue-500\`, \`text-white\`) en componentes finales — siempre tokens.
   - Contraste WCAG AA mínimo 4.5:1 para texto normal, 3:1 para texto grande. Texto sobre imágenes: overlay \`bg-black/40\` + \`text-white\` o usa \`backdrop-blur\`.

D) **Estados visuales completos** (cada interactivo)
   - Botón: default + \`hover:\` (bg ligeramente más oscuro/claro) + \`focus-visible:ring-2 ring-ring ring-offset-2\` + \`active:scale-[0.98]\` + \`disabled:opacity-50 disabled:cursor-not-allowed\` + estado \`loading\` con spinner.
   - Inputs: default + \`focus:ring\` + \`hover:border-foreground/30\` + \`disabled:\` + estado error con \`border-destructive text-destructive\`.
   - Listas/tablas: cubrir estado vacío (empty state con icono + CTA), loading (skeleton), error (mensaje + reintentar).

E) **Jerarquía visual y composición**
   - Cada sección debe tener: eyebrow (opcional, \`text-sm uppercase tracking-wider text-muted-foreground\`) → título → subtítulo/lead (\`text-lg md:text-xl text-muted-foreground max-w-2xl\`) → contenido → CTA.
   - Hero pattern: 2 columnas split (texto izq + imagen/visual der) o centrado con eyebrow + h1 + lead + dos CTAs (primary + outline) + social proof debajo.
   - Features: grid 3 col desktop / 2 col tablet / 1 col móvil, cada feature con icono \`size-10\` o \`size-12\` en círculo o cuadrado redondeado, título h3, descripción 2-3 líneas.
   - Pricing: 3 cards, la del centro destacada (border-primary, badge "Más popular", scale-105 sutil).
   - Testimonios: grid o slider, foto circular 48-64 px + nombre + cargo + cita + estrellas opcional.
   - FAQ: accordion con divisores sutiles, padding generoso.
   - CTA final antes del footer: fondo de contraste alto (\`bg-primary\` o \`bg-foreground\`) + título grande + 1 botón.
   - Footer: 3-4 columnas (marca + enlaces grupos) + divisor + copyright.

F) **Microinteracciones**
   - Transiciones: \`transition-all duration-200 ease-out\` por defecto. Hovers de cards: \`hover:-translate-y-1 hover:shadow-lg transition-all duration-300\`.
   - Sombras escaladas: \`shadow-sm\` (chips), \`shadow\` (cards inactivas), \`shadow-md\` (hover), \`shadow-xl\` (modales), \`shadow-2xl\` (hero CTA destacado). NUNCA \`drop-shadow\` masivo en decenas de elementos.
   - Esquinas redondeadas consistentes: cards \`rounded-xl\` o \`rounded-2xl\`; botones \`rounded-md\` o \`rounded-lg\`; inputs igual que botones; pills/badges \`rounded-full\`. Mantén el mismo radio en toda la página.

G) **Mobile-first responsive (obligatorio)**
   - Empieza por móvil, añade breakpoints \`sm\` 640 / \`md\` 768 / \`lg\` 1024 / \`xl\` 1280.
   - Texto: tamaños distintos por breakpoint en títulos (\`text-3xl md:text-5xl lg:text-6xl\`).
   - Layout: \`flex-col md:flex-row\`, \`grid-cols-1 md:grid-cols-2 lg:grid-cols-3\`.
   - Padding: \`px-4 md:px-8\`, \`py-12 md:py-20\`.
   - Imágenes: \`aspect-video\` o \`aspect-square\`, \`object-cover\`, \`w-full h-auto\`.

H) **Accesibilidad mínima**
   - Cada \`<img>\` con \`alt\` descriptivo (no "imagen 1"). Decorativas: \`alt=""\`.
   - Cada input con \`<label htmlFor="id">\` real (no placeholder como label).
   - \`<button>\` para acciones, \`<a>\` para navegación. Nunca \`<div onClick>\`.
   - Iconos sin texto: \`aria-label\` o \`<span className="sr-only">\`.
   - Foco siempre visible (no eliminar \`outline\` sin reemplazo).

I) **Imágenes — selección de visual**
   - Hero: 16:9 o 21:9 fotorrealista, alto contraste con el texto superpuesto.
   - Producto: cuadradas 1:1 fondo neutro.
   - Equipo/testimonios: cuadradas 1:1 retrato.
   - Categoría/blog: 4:3 o 16:9 contextual.
   - Si el usuario no aporta imagen, usa los seeds Picsum del bloque anterior O describe en \`reply\` que generaste una con Replicate si está disponible.

J) **Estilo del producto según vertical (presets de mood)**
   - **SaaS B2B / fintech**: minimalista, mucho whitespace, Inter, paleta neutra + 1 acento (azul/violeta), iconos lineales, ilustraciones isométricas o abstractas.
   - **E-commerce moda/lujo**: tipografía serif display, fotos grandes edge-to-edge, paleta monocroma, mucho aire, hover sutiles.
   - **Restauración/local**: tipografía cálida (serif o handwritten para acentos), fotos producto saturadas, paleta tierra, CTAs llamativos.
   - **Tech/dev tools**: dark mode por defecto, mono fonts para code, paleta neón sobre negro, terminal-style.
   - **Servicios profesionales**: confianza > flash. Foto del equipo real, números (clientes, años), testimonios con foto, paleta sobria.
   - **Educación/cursos**: colorido amigable, iconos rounded, badges de logros, progress bars.

K) **Prohibido en diseño profesional**
   - "Lorem ipsum" como texto final (si no hay copy del usuario, **inventa copy real coherente con la marca**, no relleno).
   - Botones genéricos "Click here" / "Submit" — usa verbos accionables ("Empezar gratis", "Ver demo", "Pedir presupuesto").
   - Más de 2 fuentes en una página.
   - Más de 1 color acento (puedes tener variaciones del primario).
   - Centrar todo el contenido (alterna alineaciones para crear ritmo).
   - Hero sin imagen/visual cuando la marca lo permite.
   - Iconos de proveedores distintos mezclados (usa una sola librería: lucide-react preferido).
   - Animaciones de carga eternas o efectos parallax pesados que rompan móvil.

K2) **Reglas técnicas críticas para preview ESM (cumplir siempre)**
   - El preview corre en navegador con \`esm.sh\`. NO uses imports que rompan en runtime:
     * \`LucideIcon\`, \`LucideProps\`, \`IconNode\` de \`lucide-react\` son **solo types**. Si los necesitas para tipar props:
       \`import { Sparkles, type LucideIcon } from "lucide-react";\` (con \`type\`), NUNCA en bloque normal.
     * Si solo quieres usar un icono, importa solo el icono: \`import { Sparkles } from "lucide-react";\`.
   - No importes módulos de Node (\`fs\`, \`path\`, \`crypto\`) en código de cliente.
   - Todo \`<a>\` debe tener \`href\` real (no \`href=""\` ni \`href="#"\` solo). Si es navegación interna, usa \`href="#sectionId"\`.
   - Todo \`<button onClick>\` debe tener lógica real, no \`() => {}\` vacío.
   - JSX cerrado correctamente: no atributos fuera de etiqueta, no URL sueltas entre comillas.

L) **Auto-checklist antes de cerrar respuesta (UI)**
   - ¿La página se ve bien a 375px (iPhone SE) y a 1440px?
   - ¿Hay jerarquía clara (h1 único, h2 por sección, h3 dentro)?
   - ¿Hay al menos 1 CTA primario visible above-the-fold?
   - ¿Los CTAs tienen handler real (no \`onClick={() => {}}\`)?
   - ¿Paleta limitada (max 4-5 colores incluyendo neutros)?
   - ¿Espaciado en escala 4px sin valores arbitrarios?
   - ¿Imágenes con \`alt\` y \`aspect-*\` para evitar layout shift?
   - ¿Estados hover/focus visibles en todo interactivo?
`;
