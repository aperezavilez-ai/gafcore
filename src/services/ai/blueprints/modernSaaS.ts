/**
 * Golden Example — Dashboard SaaS moderno (referencia modular para el Motor de Diseño).
 * La IA debe imitar estructura, densidad y patrones; adaptar marca y copy al usuario.
 */

export const MODERN_SAAS_BLUEPRINT_ID = "modern-saas-dashboard-v1";

export const MODERN_SAAS_BLUEPRINT_TITLE =
  "Dashboard SaaS — Sidebar + Navbar glass + Stat cards";

/**
 * Ejemplo de oro (fragmento copiable). Incluye AppShell, glass navbar y métricas.
 * En producción el modelo puede dividir en archivos bajo \`components/\`.
 */
export const MODERN_SAAS_GOLDEN_EXAMPLE = `
// --- Golden Example: modernSaaS (GafCore Motor de Diseño) ---
// Copiar/adaptar módulos: AppShell, Sidebar, TopNav, StatCard, DashboardPage

import { useState } from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  Settings,
  Bell,
  Search,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// --- Stat card (métrica premium) ---
export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-md backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{value}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-primary">
            <TrendingUp className="size-4" />
            {delta}
          </p>
        </div>
        <div className="inline-flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <Icon className="size-6 text-primary" />
        </div>
      </div>
    </motion.article>
  );
}

// --- Sidebar ---
export function Sidebar({
  active,
  onNavigate,
}: {
  active: string;
  onNavigate: (id: string) => void;
}) {
  const navLabels = ["Panel", "Analítica", "Equipo", "Ajustes"];
  const navIds = ["dashboard", "analytics", "team", "settings"];
  const navIcons = [LayoutDashboard, BarChart3, Users, Settings];
  const navIdleClass =
    "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground";
  const navActiveClass =
    "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium bg-primary text-primary-foreground shadow-md transition-all";
  const navRows = navLabels.map((label, idx) => {
    const id = navIds[idx];
    const isActive = active === id;
    const buttonClass = isActive ? navActiveClass : navIdleClass;
    const Icon = navIcons[idx];
    return { label, id, buttonClass, Icon };
  });
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border/50 bg-card/40 p-6 backdrop-blur-xl lg:flex lg:flex-col">
      <div className="mb-10 flex items-center gap-3">
        <div className="size-10 rounded-2xl bg-gradient-to-br from-primary to-violet-600 shadow-lg" />
        <div>
          <p className="text-sm font-semibold text-foreground">Acme Analytics</p>
          <p className="text-xs text-muted-foreground">Workspace Pro</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-2">
        {navRows.map((row, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onNavigate(row.id)}
            className={row.buttonClass}
          >
            <row.Icon className="size-5" />
            {row.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

// --- Navbar vidrio esmerilado ---
export function GlassTopNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/50 bg-background/70 px-6 py-4 backdrop-blur-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Buscar proyectos, informes…"
            className="h-10 w-full rounded-xl border border-input bg-background/80 pl-10 pr-4 text-sm focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-xl border border-border/60 bg-card/80 shadow-sm transition hover:shadow-md"
            aria-label="Notificaciones"
          >
            <Bell className="size-5 text-muted-foreground" />
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
          >
            Nuevo informe
            <ArrowUpRight className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

// --- Página dashboard ---
export function DashboardPage() {
  const [active, setActive] = useState("dashboard");
  return (
    <div className="flex min-h-screen bg-gradient-to-b from-background via-background to-muted/30 text-foreground">
      <Sidebar active={active} onNavigate={setActive} />
      <div className="flex min-w-0 flex-1 flex-col">
        <GlassTopNav />
        <main className="flex-1 p-6 md:p-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Buenos días, Alex</h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Resumen de rendimiento de los últimos 30 días.
            </p>
          </motion.div>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Ingresos" value="$128.4k" delta="+12.4% vs mes anterior" icon={BarChart3} />
            <StatCard label="Usuarios activos" value="8,241" delta="+5.1%" icon={Users} />
            <StatCard label="Conversión" value="4.8%" delta="+0.6 pp" icon={TrendingUp} />
            <StatCard label="Tickets" value="42" delta="-18% resueltos" icon={LayoutDashboard} />
          </div>
          <section className="mt-8 grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-3xl border border-border/50 bg-card/60 p-8 shadow-xl backdrop-blur-sm">
              <h2 className="text-lg font-semibold">Actividad</h2>
              <p className="mt-2 text-sm text-muted-foreground">Gráfico o tabla — sustituir por datos reales.</p>
            </div>
            <div className="rounded-3xl border border-border/50 bg-card/60 p-8 shadow-lg backdrop-blur-sm">
              <h2 className="text-lg font-semibold">Tareas</h2>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li className="flex justify-between rounded-xl border border-border/40 px-4 py-3">
                  <span>Revisar informe Q2</span>
                  <span className="text-primary">Hoy</span>
                </li>
              </ul>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return <DashboardPage />;
}
`;

/** Instrucción corta para el system prompt (no enviar todo el ejemplo si el contexto es pequeño). */
export const MODERN_SAAS_BLUEPRINT_PROMPT_HINT = `
Referencia Golden Example (\`${MODERN_SAAS_BLUEPRINT_ID}\`): dashboard SaaS con
**Sidebar** fija, **TopNav** glass (\`backdrop-blur-xl\`, \`bg-background/70\`),
**StatCard** con icono en contenedor gradiente, grid \`gap-8\`, cards \`rounded-2xl/3xl\`,
Framer Motion en entradas. Replica densidad y modularidad; adapta marca y datos al usuario.
`;
