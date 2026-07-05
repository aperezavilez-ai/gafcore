import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/lib/gafcore-supabase-client-proxy";
import { Loader2, FolderGit2, FileCode2, MessageSquare, Rocket, Camera, KeyRound, Clock } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId?: string;
}

interface Stats {
  projects: number;
  files: number;
  messages: number;
  publishes: number;
  snapshots: number;
  secrets: number;
  lastActivity: string | null;
  perProject: { name: string; files: number; messages: number }[];
  activity: { day: string; messages: number }[];
}

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function GafCoreAnalyticsDialog({ open, onOpenChange, userId }: Props) {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    (async () => {
      try {
        const since = new Date();
        since.setDate(since.getDate() - 6);
        since.setHours(0, 0, 0, 0);

        const [projectsRes, messagesRes, publishesRes, snapshotsRes, secretsRes] = await Promise.all([
          supabase.from("projects").select("id, name, updated_at").eq("user_id", userId),
          supabase
            .from("chat_messages")
            .select("id, project_id, created_at")
            .eq("user_id", userId),
          supabase.from("project_publishes").select("id, status").eq("user_id", userId),
          supabase.from("project_snapshots").select("id").eq("user_id", userId),
          supabase.from("project_secrets").select("id").eq("user_id", userId),
        ]);

        const projects = projectsRes.data ?? [];
        const projectIds = projects.map((p: any) => p.id);

        const filesRes = projectIds.length
          ? await supabase
              .from("project_files")
              .select("id, project_id")
              .in("project_id", projectIds)
          : { data: [] as any[] };

        const files = filesRes.data ?? [];
        const messages = messagesRes.data ?? [];

        // per-project counts
        const fileCount = new Map<string, number>();
        files.forEach((f: any) => fileCount.set(f.project_id, (fileCount.get(f.project_id) || 0) + 1));
        const msgCount = new Map<string, number>();
        messages.forEach((m: any) => msgCount.set(m.project_id, (msgCount.get(m.project_id) || 0) + 1));

        const perProject = projects
          .map((p: any) => ({
            name: p.name,
            files: fileCount.get(p.id) || 0,
            messages: msgCount.get(p.id) || 0,
          }))
          .sort((a, b) => b.messages + b.files - (a.messages + a.files))
          .slice(0, 8);

        // 7-day activity
        const activity: { day: string; messages: number }[] = [];
        const dayMs = 24 * 60 * 60 * 1000;
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          d.setDate(d.getDate() - i);
          activity.push({ day: DAY_LABELS[d.getDay()], messages: 0 });
        }
        const startMs = since.getTime();
        for (const m of messages as any[]) {
          const t = new Date(m.created_at).getTime();
          if (t < startMs) continue;
          const idx = Math.floor((t - startMs) / dayMs);
          if (activity[idx]) activity[idx].messages += 1;
        }

        const lastActivity = projects
          .map((p: any) => p.updated_at)
          .sort()
          .reverse()[0] ?? null;

        setStats({
          projects: projects.length,
          files: files.length,
          messages: messages.length,
          publishes: (publishesRes.data ?? []).length,
          snapshots: (snapshotsRes.data ?? []).length,
          secrets: (secretsRes.data ?? []).length,
          lastActivity,
          perProject,
          activity,
        });
      } catch (e) {
        console.error("[GafCore Analytics]", e);
        setStats(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, userId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Analítica de GafCore</DialogTitle>
          <DialogDescription>
            Métricas de tus proyectos, archivos, chats y publicaciones dentro de GafCore.
          </DialogDescription>
        </DialogHeader>

        {loading || !stats ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KPI icon={<FolderGit2 className="h-4 w-4" />} label="Proyectos" value={stats.projects} />
              <KPI icon={<FileCode2 className="h-4 w-4" />} label="Archivos" value={stats.files} />
              <KPI icon={<MessageSquare className="h-4 w-4" />} label="Mensajes IA" value={stats.messages} />
              <KPI icon={<Rocket className="h-4 w-4" />} label="Publicaciones" value={stats.publishes} />
              <KPI icon={<Camera className="h-4 w-4" />} label="Snapshots" value={stats.snapshots} />
              <KPI icon={<KeyRound className="h-4 w-4" />} label="Secretos" value={stats.secrets} />
            </div>

            {stats.lastActivity && (
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> Última actividad:{" "}
                {new Date(stats.lastActivity).toLocaleString("es-MX")}
              </div>
            )}

            {/* Activity chart */}
            <div className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold mb-1">Actividad de chat — 7 días</h3>
              <p className="text-xs text-muted-foreground mb-3">Mensajes IA por día</p>
              <div className="h-56">
                <ResponsiveContainer>
                  <AreaChart data={stats.activity}>
                    <defs>
                      <linearGradient id="gcAct" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="messages"
                      stroke="hsl(var(--primary))"
                      fill="url(#gcAct)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Per project */}
            <div className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold mb-1">Top proyectos</h3>
              <p className="text-xs text-muted-foreground mb-3">Archivos y mensajes por proyecto</p>
              {stats.perProject.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Aún no tienes proyectos. Crea uno para empezar.
                </p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={stats.perProject}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="files" name="Archivos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="messages" name="Mensajes" fill="hsl(var(--accent-foreground))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function KPI({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString()}</div>
    </div>
  );
}
