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

I) **Imágenes — REGLAS ESTRICTAS (nada de fotos genéricas de paisaje)**
   - **El hero NUNCA debe usar una foto random de Unsplash que no tenga relación con el producto.**
     Una foto de río, montaña o atardecer en una landing de SaaS de notas es INACEPTABLE.
   - **Regla 1 (preferida): genera un MOCKUP del producto en JSX + Tailwind**, no una foto.
     Ej: para una app de notas → mockup de UI con sidebar, lista de notas, vista de editor, mini chat IA,
     todo construido con \`<div>\` + clases Tailwind, dentro de un "browser frame" con barra de título y dots
     (rojo/amarillo/verde) o un "phone frame" si es app móvil. Esto es lo que hacen Linear, Vercel, Stripe,
     Notion, Cal.com, Resend, Framer en sus landings — NO usan fotos de stock.
   - **Regla 2 (cuando sí se necesita foto)**: usa Unsplash con query ESPECÍFICA al vertical:
     * App de notas/productividad: \`?notes,desk,workspace,laptop\` (no \`?nature\`).
     * E-commerce moda: \`?fashion,product,studio\` (no \`?landscape\`).
     * Restaurante: \`?food,plate,restaurant\` (no \`?river\`).
     * SaaS B2B: usa MOCKUP, no foto.
     * Wellness/fitness: \`?yoga,wellness,fitness\` (no \`?mountain\`).
   - **Regla 3 (decorativo de fondo)**: prefiere SVG/CSS — mesh gradients, orbs blur, grid pattern, dots.
     NO uses fotos como fondo del hero salvo verticales muy específicos (viajes, real estate, restaurantes).
   - Proporciones cuando sí usas fotos: producto 1:1, equipo/testimonios 1:1, blog 16:9, hero feature 4:3.
   - Cada \`<img>\` con \`alt\` descriptivo real ("Captura de la app mostrando lista de notas"), nunca "imagen 1".
   - \`loading="lazy"\` en imágenes below-the-fold; el hero siempre con \`loading="eager"\`.

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
     * Solo iconos REALES de lucide-react. Si dudas, usa nombres seguros: \`Sparkles\`, \`Zap\`, \`Star\`,
       \`Heart\`, \`Settings\`, \`Mail\`, \`Phone\`, \`Calendar\`, \`Check\`, \`X\`, \`ArrowRight\`, \`StickyNote\`,
       \`NotebookText\`, \`BookOpen\`, \`User\`, \`Users\`, \`Home\`, \`Search\`, \`Menu\`, \`ChevronDown\`.
       NUNCA inventes nombres como \`Note\`, \`Notes\`, \`Notepad\`, \`Notion\` — no existen.
   - **NO renderices objetos directamente en JSX** (causa React error #31 "Objects are not valid as a React child").
     * MAL: \`const f = { title: "X", desc: "Y" }; return <div>{f}</div>;\`
     * BIEN: \`return <div><h3>{f.title}</h3><p>{f.desc}</p></div>;\`
     * Si mapeas una lista de objetos, devuelve JSX, NO el objeto: \`items.map(it => <li key={it.id}>{it.label}</li>)\`.
   - No importes módulos de Node (\`fs\`, \`path\`, \`crypto\`) en código de cliente.
   - Todo \`<a>\` debe tener \`href\` real (no \`href=""\` ni \`href="#"\` solo). Si es navegación interna, usa \`href="#sectionId"\`.
   - Todo \`<button onClick>\` debe tener lógica real, no \`() => {}\` vacío.
   - JSX cerrado correctamente: no atributos fuera de etiqueta, no URL sueltas entre comillas.
   - Usa siempre \`key\` único en listas mapeadas: \`items.map(it => <Card key={it.id} ... />)\`.

L) **Auto-checklist antes de cerrar respuesta (UI)**
   - ¿La página se ve bien a 375px (iPhone SE) y a 1440px?
   - ¿Hay jerarquía clara (h1 único, h2 por sección, h3 dentro)?
   - ¿Hay al menos 1 CTA primario visible above-the-fold?
   - ¿Los CTAs tienen handler real (no \`onClick={() => {}}\`)?
   - ¿Paleta limitada (max 4-5 colores incluyendo neutros)?
   - ¿Espaciado en escala 4px sin valores arbitrarios?
   - ¿Imágenes con \`alt\` y \`aspect-*\` para evitar layout shift?
   - ¿Estados hover/focus visibles en todo interactivo?
   - ¿Hay un mockup del producto en el hero (no foto random de paisaje)?
   - ¿Hay social proof (stats, logos, testimonios) above-the-fold o cerca?
   - ¿Hay densidad visual (gradientes, glow, shadows, borders sutiles), no un diseño plano blanco?

M) **DENSIDAD VISUAL PREMIUM (obligatorio para landings y home pages)**
   Una landing profesional NUNCA se ve plana. Aplica TODAS estas capas:

   1) **Background con profundidad** (3 capas mínimo):
      - Capa base: \`bg-background\` o gradiente sutil \`bg-gradient-to-b from-background via-background to-muted/30\`.
      - Capa media: **orbs blur** absolutos en el hero — 2 o 3 elementos así:
        \`<div className="absolute top-20 -left-20 size-[500px] rounded-full bg-primary/20 blur-3xl" />\`
        \`<div className="absolute bottom-0 right-0 size-[400px] rounded-full bg-violet-500/15 blur-3xl" />\`
        El contenedor del hero debe ser \`relative overflow-hidden\` para contenerlos.
      - Capa decorativa: grid pattern o dots pattern sutiles (\`bg-[radial-gradient(circle,#0001_1px,transparent_1px)] bg-[size:24px_24px]\`).

   2) **Tarjetas con material rico** (no rectángulos planos):
      - \`bg-card/60 backdrop-blur-xl border border-border/50 rounded-2xl shadow-[0_8px_30px_-8px_rgba(0,0,0,0.12)]\`
      - Hover: \`hover:border-primary/30 hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.18)] hover:-translate-y-1 transition-all duration-300\`

   3) **Tipografía expresiva en títulos**:
      - Hero h1: \`text-5xl md:text-7xl font-bold tracking-tight\` con palabra clave en gradiente:
        \`<span className="bg-gradient-to-r from-primary via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">palabra</span>\`
      - Eyebrow con icon + texto en pill: \`<span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/80 px-4 py-1.5 text-sm backdrop-blur"><Sparkles className="size-3.5 text-primary" /> Nuevo</span>\`.

   4) **Iconos en contenedores con accent** (no iconos sueltos sin marco):
      - \`<div className="inline-flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20"><Icon className="size-6 text-primary" /></div>\`

   5) **Social proof obligatorio** above-the-fold o justo debajo del hero:
      - Stats row: 3-4 números grandes (\`text-4xl font-bold\`) + label pequeño (\`text-sm text-muted-foreground uppercase tracking-wider\`). Ej: "10k+ usuarios · 99.9% uptime · 4.9/5 rating · 24/7 soporte".
      - O logos row: 5-6 nombres de empresas grises (\`text-muted-foreground/60 font-semibold\`) con label "Confían en nosotros".
      - O ambos.

   6) **Bento grid para features** (no 3 cards iguales repetidas):
      - Grid asimétrico: una card grande 2x1 + dos cards 1x1 + una card ancha 2x1 abajo, etc.
      - Estructura sugerida: \`grid-cols-1 md:grid-cols-3 md:grid-rows-2 gap-4 md:gap-6\` con \`md:col-span-2\` en la primera.

   7) **CTA final premium**:
      - Sección con background especial: \`relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-violet-600 p-12 md:p-20\` + orbs internos.
      - Título grande blanco, texto white/80, 2 botones (sólido blanco + outline white/30).

N) **ANATOMÍA DE UN HERO PREMIUM (cópialo como template mental)**
   Estructura recomendada (split o centered), siempre con mockup en lugar de foto random:

   - Section relative overflow-hidden con orbs blur de fondo (2 orbs con colores del brand).
   - Grid 2 cols en lg: lado izquierdo texto, lado derecho **mockup del producto**.
   - Texto: eyebrow pill → h1 grande con palabra clave en gradiente → lead 1-2 líneas → 2 CTAs (primario + ghost) → mini social proof (avatares + "10k+ usuarios").
   - Mockup del producto: una "card" con frame de browser o phone (3 dots de colores como tráfico) y DENTRO el UI real del producto construido con \`<div>\` + Tailwind. NO uses \`<img>\` con foto.
     * Para apps de notas: sidebar con items + main con cards/lines como notas.
     * Para e-commerce: grid de productos con thumbnails de gradiente.
     * Para dashboards: chart fake con barras de \`<div>\`, KPIs.
     * Para messaging: bubbles de chat.
   - El mockup debe estar envuelto en un wrapper con halo: \`<div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-primary/30 via-violet-500/20 to-fuchsia-500/20 blur-2xl" />\` detrás del frame.

O) **ANTI-PATRONES (no hagas esto NUNCA en una landing profesional)**
   - Foto de paisaje / río / montaña / atardecer en el hero de un producto digital. PROHIBIDO.
   - Hero con foto de stock genérica de gente sonriendo en oficina si no es una agencia/consultoría.
   - 3 cards de features idénticas en grid simétrico sin densidad (icono + título + 2 líneas y ya).
   - CTA final como rectángulo plano sin gradient, sin orbs, sin profundidad.
   - Tipografía monótona: todos los títulos del mismo tamaño y color sólido sin acento gradient.
   - Footer minimal de 1 fila. Footer pro: 4 columnas + newsletter + redes + badges + copyright.
   - Sin scroll: si la landing tiene <3 secciones visibles, falta contenido. Mínimo: hero + social proof + features + cómo funciona + testimonios/precios + FAQ + CTA final + footer.
`;
