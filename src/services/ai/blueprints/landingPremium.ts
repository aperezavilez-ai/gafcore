/**
 * Blueprint — Landing Page Premium (restaurantes, negocios locales, servicios).
 * Hero con imagen de fondo, gradientes, testimonios, CTA flotante.
 */

export const LANDING_PREMIUM_ID = "landing-premium-v1";

export const LANDING_PREMIUM_EXAMPLE = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>La Trattoria — Auténtica Cocina Italiana</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; }
    .font-display { font-family: 'Playfair Display', serif; }
    .hero-bg {
      background: linear-gradient(135deg, rgba(15,23,42,0.85), rgba(30,10,60,0.75)),
                  url('https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1920&q=80') center/cover;
    }
    .glass { background: rgba(255,255,255,0.08); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.12); }
    .gradient-text { background: linear-gradient(135deg, #f59e0b, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .cta-glow { box-shadow: 0 0 40px rgba(245,158,11,0.3), 0 8px 32px rgba(0,0,0,0.3); }
    @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    .float { animation: float 3s ease-in-out infinite; }
  </style>
</head>
<body class="bg-slate-950 text-white">
  <!-- NAV GLASS -->
  <nav class="fixed top-0 w-full z-50 glass">
    <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center text-xl">🍕</div>
        <span class="font-display text-xl font-bold">La Trattoria</span>
      </div>
      <div class="hidden md:flex items-center gap-8 text-sm text-slate-300">
        <a href="#menu" class="hover:text-amber-400 transition">Menú</a>
        <a href="#historia" class="hover:text-amber-400 transition">Historia</a>
        <a href="#testimonios" class="hover:text-amber-400 transition">Reseñas</a>
        <a href="#reservar" class="px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-semibold hover:shadow-lg hover:shadow-amber-500/25 transition-all">Reservar Mesa</a>
      </div>
    </div>
  </nav>

  <!-- HERO -->
  <section class="hero-bg min-h-screen flex items-center relative overflow-hidden">
    <div class="absolute top-20 right-10 w-72 h-72 bg-amber-500/20 rounded-full blur-3xl"></div>
    <div class="absolute bottom-20 left-10 w-96 h-96 bg-red-500/10 rounded-full blur-3xl"></div>
    <div class="max-w-7xl mx-auto px-6 py-32 relative z-10">
      <div class="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-sm text-amber-400 mb-8">
        <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
        Desde 1985 — Tradición y Sabor
      </div>
      <h1 class="font-display text-6xl md:text-8xl font-extrabold leading-tight mb-6">
        Auténtica<br/>
        <span class="gradient-text">Cocina Italiana</span>
      </h1>
      <p class="text-xl text-slate-300 max-w-xl mb-10 leading-relaxed">
        Ingredientes frescos recién traídos de Italia. Pasta hecha a mano cada mañana. Reserva tu experiencia gastronómica inolvidable.
      </p>
      <div class="flex flex-wrap gap-4">
        <a href="#reservar" class="cta-glow inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-bold text-lg hover:scale-105 transition-transform">
          Reservar Ahora
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
        </a>
        <a href="#menu" class="inline-flex items-center gap-2 px-8 py-4 rounded-2xl glass text-white font-semibold text-lg hover:bg-white/10 transition">
          Ver Menú
        </a>
      </div>
      <!-- Social proof -->
      <div class="flex items-center gap-6 mt-12">
        <div class="flex -space-x-3">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 border-2 border-slate-950"></div>
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 border-2 border-slate-950"></div>
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 border-2 border-slate-950"></div>
        </div>
        <div>
          <div class="flex text-amber-400 text-sm">★★★★★</div>
          <p class="text-sm text-slate-400">4.9/5 — 2,400+ reseñas en Google</p>
        </div>
      </div>
    </div>
  </section>

  <!-- FEATURES / PLATOS DESTACADOS -->
  <section id="menu" class="py-24 px-6 relative">
    <div class="max-w-7xl mx-auto">
      <div class="text-center mb-16">
        <span class="text-amber-400 font-semibold text-sm tracking-widest uppercase">Nuestro Menú</span>
        <h2 class="font-display text-4xl md:text-5xl font-bold mt-4">Platos que Cuentan Historias</h2>
      </div>
      <div class="grid md:grid-cols-3 gap-8">
        <!-- Card 1 -->
        <div class="group rounded-3xl overflow-hidden bg-slate-900/50 border border-slate-800 hover:border-amber-500/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-amber-500/10">
          <div class="h-56 overflow-hidden">
            <img src="https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600&q=80" alt="Carbonara" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
          </div>
          <div class="p-6">
            <div class="flex justify-between items-start mb-3">
              <h3 class="font-display text-xl font-bold">Carbonara</h3>
              <span class="text-amber-400 font-bold text-lg">€14</span>
            </div>
            <p class="text-slate-400 text-sm leading-relaxed">Pasta fresca con huevo, pecorino romano, pancetta croccante y pimienta negra recién molida.</p>
          </div>
        </div>
        <!-- Card 2 -->
        <div class="group rounded-3xl overflow-hidden bg-slate-900/50 border border-slate-800 hover:border-amber-500/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-amber-500/10">
          <div class="h-56 overflow-hidden">
            <img src="https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&q=80" alt="Margherita" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
          </div>
          <div class="p-6">
            <div class="flex justify-between items-start mb-3">
              <h3 class="font-display text-xl font-bold">Margherita DOP</h3>
              <span class="text-amber-400 font-bold text-lg">€12</span>
            </div>
            <p class="text-slate-400 text-sm leading-relaxed">Mozzarella di bufala, tomates San Marzano, albahaca fresca y aceite de oliva virgen extra.</p>
          </div>
        </div>
        <!-- Card 3 -->
        <div class="group rounded-3xl overflow-hidden bg-slate-900/50 border border-slate-800 hover:border-amber-500/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-amber-500/10">
          <div class="h-56 overflow-hidden">
            <img src="https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600&q=80" alt="Tiramisú" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
          </div>
          <div class="p-6">
            <div class="flex justify-between items-start mb-3">
              <h3 class="font-display text-xl font-bold">Tiramisú Classico</h3>
              <span class="text-amber-400 font-bold text-lg">€9</span>
            </div>
            <p class="text-slate-400 text-sm leading-relaxed">Capas de bizcochos de café, crema de mascarpone y cacao amargo italiano.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- TESTIMONIOS -->
  <section id="testimonios" class="py-24 px-6 bg-slate-900/30">
    <div class="max-w-5xl mx-auto text-center">
      <span class="text-amber-400 font-semibold text-sm tracking-widest uppercase">Lo que dicen nuestros clientes</span>
      <h2 class="font-display text-4xl font-bold mt-4 mb-16">Experiencias Inolvidables</h2>
      <div class="grid md:grid-cols-3 gap-8">
        <div class="glass rounded-2xl p-8 text-left">
          <div class="text-amber-400 text-lg mb-4">★★★★★</div>
          <p class="text-slate-300 text-sm leading-relaxed mb-6">"La mejor carbonara que he probado fuera de Roma. El ambiente es mágico, perfecto para una cena especial."</p>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500"></div>
            <div>
              <p class="text-sm font-semibold">María García</p>
              <p class="text-xs text-slate-500">Reseñante frecuente</p>
            </div>
          </div>
        </div>
        <div class="glass rounded-2xl p-8 text-left">
          <div class="text-amber-400 text-lg mb-4">★★★★★</div>
          <p class="text-slate-300 text-sm leading-relaxed mb-6">"Vinimos de cumpleaños y nos sorprendieron con un postre personalizado. La atención es excepcional, 10/10."</p>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 to-pink-500"></div>
            <div>
              <p class="text-sm font-semibold">Carlos Ruiz</p>
              <p class="text-xs text-slate-500">Google Reviews</p>
            </div>
          </div>
        </div>
        <div class="glass rounded-2xl p-8 text-left">
          <div class="text-amber-400 text-lg mb-4">★★★★★</div>
          <p class="text-slate-300 text-sm leading-relaxed mb-6">"El tiramisú es divino. Volvemos cada mes sin falta. El vino que nos recomendaron acompañó perfecto la cena."</p>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500"></div>
            <div>
              <p class="text-sm font-semibold">Ana López</p>
              <p class="text-xs text-slate-500">TripAdvisor</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- CTA FINAL -->
  <section id="reservar" class="py-24 px-6">
    <div class="max-w-4xl mx-auto text-center glass rounded-3xl p-16 relative overflow-hidden">
      <div class="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-amber-500/10 to-red-500/10"></div>
      <div class="relative z-10">
        <h2 class="font-display text-4xl md:text-5xl font-bold mb-6">Reserva tu Experiencia</h2>
        <p class="text-slate-300 text-lg mb-10 max-w-xl mx-auto">Mesas disponibles de martes a domingo. Reserva anticipada recomendada para fines de semana.</p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="tel:+34912345678" class="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-bold text-lg hover:scale-105 transition-transform cta-glow">
            📞 Llamar Ahora
          </a>
          <button class="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl glass text-white font-semibold text-lg hover:bg-white/10 transition">
            📋 Reservar Online
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="border-t border-slate-800 py-12 px-6">
    <div class="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center text-sm">🍕</div>
        <span class="font-display text-lg font-bold">La Trattoria</span>
      </div>
      <p class="text-slate-500 text-sm">© 2025 La Trattoria. Todos los derechos reservados.</p>
      <div class="flex gap-4 text-slate-400">
        <a href="#" class="hover:text-amber-400 transition">Instagram</a>
        <a href="#" class="hover:text-amber-400 transition">Facebook</a>
        <a href="#" class="hover:text-amber-400 transition">TripAdvisor</a>
      </div>
    </div>
  </footer>
</body>
</html>
`;

export const LANDING_PREMIUM_PROMPT_HINT = `
Blueprint Landing Premium: Hero full-screen con imagen de fondo + gradiente oscuro,
navbar glass (backdrop-blur), cards con hover lift + sombra, testimonios en glass,
CTA final con glow effect, footer mínimo. Usa fuentes Google (Playfair Display + Inter),
imágenes de Unsplash reales, gradientes amber/red, animaciones float y scale.
NO uses divs planos. SIEMPRE incluye: hero con imagen real, al menos 3 cards,
testimonios con estrellas, CTA con efecto glow.
`;
