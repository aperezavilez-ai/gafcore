/**
 * Blueprint — E-commerce Premium (tiendas online, productos, checkout).
 */

export const ECOMMERCE_PREMIUM_ID = "ecommerce-premium-v1";

export const ECOMMERCE_PREMIUM_EXAMPLE = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nike Store — Just Do It</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; }
    .glass { background: rgba(255,255,255,0.06); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.08); }
    .product-card:hover .product-img { transform: scale(1.05); }
    .product-card:hover .quick-add { opacity: 1; transform: translateY(0); }
    .quick-add { opacity: 0; transform: translateY(8px); transition: all 0.25s; }
    .hero-split { background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); }
    .glow-border { box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 8px 40px rgba(0,0,0,0.4); }
    .marquee { animation: marquee 30s linear infinite; }
    @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
    .size-btn:hover { border-color: white; color: white; }
    .size-btn.active { background: white; color: black; border-color: white; }
  </style>
</head>
<body class="bg-black text-white">
  <!-- NAV -->
  <nav class="fixed top-0 w-full z-50 glass">
    <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="text-2xl font-black tracking-tighter">STORE<span class="text-white/40">.</span></div>
      <div class="hidden md:flex items-center gap-8 text-sm font-medium">
        <a href="#nuevos" class="hover:text-white/60 transition">Nuevos</a>
        <a href="#hombres" class="hover:text-white/60 transition">Hombres</a>
        <a href="#mujeres" class="hover:text-white/60 transition">Mujeres</a>
        <a href="#ofertas" class="text-red-400 hover:text-red-300 transition">Ofertas</a>
      </div>
      <div class="flex items-center gap-4">
        <button class="relative p-2 hover:bg-white/10 rounded-xl transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
          <span class="absolute -top-1 -right-1 w-5 h-5 bg-white text-black text-xs font-bold rounded-full flex items-center justify-center">3</span>
        </button>
        <button class="p-2 hover:bg-white/10 rounded-xl transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </button>
      </div>
    </div>
  </nav>

  <!-- HERO SPLIT -->
  <section class="hero-split min-h-screen flex items-center pt-20">
    <div class="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center w-full">
      <div>
        <span class="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-xs font-semibold text-white/70 mb-6">
          <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
          Nueva Colección 2025
        </span>
        <h1 class="text-6xl md:text-8xl font-black leading-none tracking-tighter mb-6">
          MOVE<br/>
          <span class="text-white/30">FORWARD</span>
        </h1>
        <p class="text-lg text-white/50 max-w-md mb-8 leading-relaxed">Zapatillas diseñadas para rendir. Tecnología que se adapta a tu movimiento. Diseño que rompe esquemas.</p>
        <div class="flex gap-4">
          <a href="#productos" class="px-8 py-4 bg-white text-black font-bold rounded-full hover:bg-white/90 transition-all hover:scale-105">Comprar Ahora</a>
          <a href="#coleccion" class="px-8 py-4 glass rounded-full font-medium hover:bg-white/10 transition">Ver Colección</a>
        </div>
      </div>
      <div class="relative">
        <img src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80" alt="Zapatilla destacada" class="w-full rounded-3xl glow-border" />
        <div class="absolute -bottom-4 -left-4 glass rounded-2xl p-4 float">
          <p class="text-xs text-white/50">Precio</p>
          <p class="text-2xl font-black">€189</p>
        </div>
      </div>
    </div>
  </section>

  <!-- MARCAS -->
  <section class="py-12 border-y border-white/5 overflow-hidden">
    <div class="flex gap-16 text-white/20 font-black text-2xl tracking-widest whitespace-nowrap marquee">
      <span>NIKE</span><span>ADIDAS</span><span>PUMA</span><span>NEW BALANCE</span><span>CONVERSE</span><span>VANS</span>
      <span>NIKE</span><span>ADIDAS</span><span>PUMA</span><span>NEW BALANCE</span><span>CONVERSE</span><span>VANS</span>
    </div>
  </section>

  <!-- PRODUCTOS DESTACADOS -->
  <section id="productos" class="py-24 px-6">
    <div class="max-w-7xl mx-auto">
      <div class="flex items-end justify-between mb-12">
        <div>
          <span class="text-white/40 text-sm font-semibold tracking-widest uppercase">Destacados</span>
          <h2 class="text-4xl font-black mt-2 tracking-tight">Lo Más Vendido</h2>
        </div>
        <a href="#" class="text-sm text-white/50 hover:text-white transition">Ver todo →</a>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="product-card group rounded-3xl bg-white/[0.03] border border-white/[0.06] overflow-hidden hover:border-white/20 transition-all duration-300">
          <div class="relative overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 p-8">
            <img src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&q=80" alt="Air Max" class="product-img w-full h-48 object-cover rounded-2xl transition-transform duration-500" />
            <span class="absolute top-4 left-4 bg-red-500 text-xs font-bold px-3 py-1 rounded-full">-20%</span>
            <button class="quick-add absolute bottom-4 right-4 bg-white text-black text-xs font-bold px-4 py-2 rounded-full">Añadir</button>
          </div>
          <div class="p-5">
            <p class="text-xs text-white/40 mb-1">Running</p>
            <h3 class="font-bold mb-2">Air Max 270</h3>
            <div class="flex items-center gap-3">
              <span class="font-bold text-lg">€149</span>
              <span class="text-sm text-white/30 line-through">€189</span>
            </div>
          </div>
        </div>
        <div class="product-card group rounded-3xl bg-white/[0.03] border border-white/[0.06] overflow-hidden hover:border-white/20 transition-all duration-300">
          <div class="relative overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 p-8">
            <img src="https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=500&q=80" alt="Running" class="product-img w-full h-48 object-cover rounded-2xl transition-transform duration-500" />
            <button class="quick-add absolute bottom-4 right-4 bg-white text-black text-xs font-bold px-4 py-2 rounded-full">Añadir</button>
          </div>
          <div class="p-5">
            <p class="text-xs text-white/40 mb-1">Running</p>
            <h3 class="font-bold mb-2">Ultraboost Light</h3>
            <span class="font-bold text-lg">€199</span>
          </div>
        </div>
        <div class="product-card group rounded-3xl bg-white/[0.03] border border-white/[0.06] overflow-hidden hover:border-white/20 transition-all duration-300">
          <div class="relative overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 p-8">
            <img src="https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=500&q=80" alt="Casual" class="product-img w-full h-48 object-cover rounded-2xl transition-transform duration-500" />
            <span class="absolute top-4 left-4 bg-white text-black text-xs font-bold px-3 py-1 rounded-full">Nuevo</span>
            <button class="quick-add absolute bottom-4 right-4 bg-white text-black text-xs font-bold px-4 py-2 rounded-full">Añadir</button>
          </div>
          <div class="p-5">
            <p class="text-xs text-white/40 mb-1">Casual</p>
            <h3 class="font-bold mb-2">Retro Classic</h3>
            <span class="font-bold text-lg">€129</span>
          </div>
        </div>
        <div class="product-card group rounded-3xl bg-white/[0.03] border border-white/[0.06] overflow-hidden hover:border-white/20 transition-all duration-300">
          <div class="relative overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 p-8">
            <img src="https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=500&q=80" alt="Sport" class="product-img w-full h-48 object-cover rounded-2xl transition-transform duration-500" />
            <button class="quick-add absolute bottom-4 right-4 bg-white text-black text-xs font-bold px-4 py-2 rounded-full">Añadir</button>
          </div>
          <div class="p-5">
            <p class="text-xs text-white/40 mb-1">Training</p>
            <h3 class="font-bold mb-2">PowerLift Pro</h3>
            <span class="font-bold text-lg">€169</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- BANNER CTA -->
  <section class="py-24 px-6">
    <div class="max-w-7xl mx-auto rounded-3xl overflow-hidden relative">
      <img src="https://images.unsplash.com/photo-1556906781-9a412961c28c?w=1400&q=80" alt="Colección" class="w-full h-80 md:h-[500px] object-cover" />
      <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent flex items-center">
        <div class="p-12 md:p-16">
          <span class="text-white/60 text-sm font-semibold tracking-widest uppercase">Edición Limitada</span>
          <h2 class="text-4xl md:text-6xl font-black mt-4 mb-6 tracking-tight">Summer<br/>Collection</h2>
          <p class="text-white/60 max-w-md mb-8">Descubre las exclusivas de temporada. Disponible hasta agotar existencias.</p>
          <a href="#" class="inline-flex px-8 py-4 bg-white text-black font-bold rounded-full hover:scale-105 transition-transform">Explorar Colección</a>
        </div>
      </div>
    </div>
  </section>

  <!-- NEWSLETTER -->
  <section class="py-24 px-6 border-t border-white/5">
    <div class="max-w-xl mx-auto text-center">
      <h2 class="text-3xl font-black tracking-tight mb-4">Únete al Club</h2>
      <p class="text-white/40 mb-8">Acceso anticipado a lanzamientos, ofertas exclusivas y envío gratis.</p>
      <div class="flex gap-3">
        <input type="email" placeholder="tu@email.com" class="flex-1 px-6 py-4 rounded-full bg-white/[0.06] border border-white/10 text-white placeholder-white/30 outline-none focus:border-white/30 transition" />
        <button class="px-8 py-4 bg-white text-black font-bold rounded-full hover:bg-white/90 transition">Unirme</button>
      </div>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="border-t border-white/5 py-12 px-6">
    <div class="max-w-7xl mx-auto grid md:grid-cols-4 gap-12">
      <div>
        <p class="text-2xl font-black tracking-tighter mb-4">STORE.</p>
        <p class="text-sm text-white/30 leading-relaxed">Zapatillas y ropa deportiva para quienes no paran.</p>
      </div>
      <div>
        <p class="font-semibold text-sm mb-4">Tienda</p>
        <div class="space-y-2 text-sm text-white/40">
          <a href="#" class="block hover:text-white transition">Nuevos</a>
          <a href="#" class="block hover:text-white transition">Hombres</a>
          <a href="#" class="block hover:text-white transition">Mujeres</a>
          <a href="#" class="block hover:text-white transition">Ofertas</a>
        </div>
      </div>
      <div>
        <p class="font-semibold text-sm mb-4">Ayuda</p>
        <div class="space-y-2 text-sm text-white/40">
          <a href="#" class="block hover:text-white transition">Envíos</a>
          <a href="#" class="block hover:text-white transition">Devoluciones</a>
          <a href="#" class="block hover:text-white transition">Guía de tallas</a>
          <a href="#" class="block hover:text-white transition">Contacto</a>
        </div>
      </div>
      <div>
        <p class="font-semibold text-sm mb-4">Síguenos</p>
        <div class="flex gap-3">
          <a href="#" class="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/10 transition text-sm">IG</a>
          <a href="#" class="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/10 transition text-sm">TW</a>
          <a href="#" class="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/10 transition text-sm">TK</a>
        </div>
      </div>
    </div>
    <div class="max-w-7xl mx-auto mt-12 pt-8 border-t border-white/5 text-center text-xs text-white/20">
      © 2025 STORE. Todos los derechos reservados.
    </div>
  </footer>
</body>
</html>
`;

export const ECOMMERCE_PREMIUM_PROMPT_HINT = `
Blueprint E-commerce Premium: Hero split (texto + imagen grande), marquee de marcas,
product cards con hover quick-add + badges, banner CTA con imagen full-width,
newsletter con input glass, footer 4 columnas. Fondo oscuro (black),
tipografía Inter bold/black, cards con bg-white/[0.03], borders sutiles.
SIEMPRE incluye: hero, al menos 4 products cards, banner promocional, newsletter, footer.
`;
