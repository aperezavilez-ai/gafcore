import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getIdeConfig, setIdeConfig } from "@/lib/ideConfig";
import {
  isBlockedDeployHost,
  isGafcoreProductionHost,
  isValidGithubRepo,
  normalizeDeployHost,
} from "@/lib/gafcore-deploy.shared";
import { connectGithubOnServer } from "@/lib/gafcore-api";
import { markGithubServerConnected } from "@/lib/gafcore-deploy.shared";
import { ensureProjectId, saveProjectDeployMeta } from "@/lib/userSupabase";

export function SettingsDialog({
  children,
  open: openProp,
  onOpenChange,
  highlightDeploy = false,
}: {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Al abrir, resalta la sección GitHub Deploy (desde Publicar). */
  highlightDeploy?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    setInternalOpen(v);
  };
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [githubToken, setGithubToken] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubBranch, setGithubBranch] = useState("main");
  const [githubExcludeEnv, setGithubExcludeEnv] = useState(true);
  const [deploySiteUrl, setDeploySiteUrl] = useState("");
  const [vercelDeployHookUrl, setVercelDeployHookUrl] = useState("");

  useEffect(() => {
    const c = getIdeConfig();
    setSupabaseUrl(c.supabaseUrl ?? "");
    setSupabaseKey(c.supabaseKey ?? "");
    setOpenaiKey(c.openaiKey ?? "");
    setOpenaiModel(c.openaiModel ?? "gpt-4o-mini");
    setGithubToken(c.githubToken ?? "");
    const repo = c.githubRepo ?? "";
    setGithubRepo(isValidGithubRepo(repo) ? repo : "");
    setGithubBranch(c.githubBranch ?? "main");
    setGithubExcludeEnv(c.githubExcludeEnv ?? true);
    setDeploySiteUrl(c.deploySiteUrl ?? "");
    setVercelDeployHookUrl(c.vercelDeployHookUrl ?? "");
    void (async () => {
      const pid = await ensureProjectId();
      if (!pid) return;
      const { getProjectDeployMeta } = await import("@/lib/userSupabase");
      const meta = await getProjectDeployMeta(pid);
      if (meta?.deploy_site_url && !c.deploySiteUrl) setDeploySiteUrl(meta.deploy_site_url);
      if (meta?.vercel_deploy_hook_url && !c.vercelDeployHookUrl) {
        setVercelDeployHookUrl(meta.vercel_deploy_hook_url);
      }
      if (meta?.github_repo && !c.githubRepo) {
        const mrepo = meta.github_repo;
        if (isValidGithubRepo(mrepo)) setGithubRepo(mrepo);
      }
      if (meta?.github_branch && c.githubBranch === "main") setGithubBranch(meta.github_branch);
    })();
  }, [open]);

  useEffect(() => {
    if (!open || !highlightDeploy) return;
    const t = window.setTimeout(() => {
      document.getElementById("gafcore-deploy-github")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(t);
  }, [open, highlightDeploy]);

  const save = () => {
    void (async () => {
      const onProd = isGafcoreProductionHost();
      const repoTrim = githubRepo.trim();
      if (githubToken.trim() && repoTrim && !isValidGithubRepo(repoTrim)) {
        toast.error("Repo de GitHub inválido", {
          description: "Usa tu-usuario/nombre-repo real (no usuario/mi-app).",
        });
        return;
      }
      if (!onProd && supabaseUrl.trim() && !/^https:\/\/.+\.supabase\.co/i.test(supabaseUrl.trim())) {
        toast.error("URL de Supabase incorrecta", {
          description: "Debe ser https://xxxx.supabase.co — no un email.",
        });
        return;
      }
      const deployHost = normalizeDeployHost(deploySiteUrl);
      if (deploySiteUrl.trim() && !deployHost) {
        toast.error("URL del sitio incorrecta", {
          description: "Usa tu dominio de Vercel (ej. mi-tienda.vercel.app), no gafcore.com.",
        });
        return;
      }
      if (deploySiteUrl.trim() && isBlockedDeployHost(deploySiteUrl)) {
        toast.error("No uses gafcore.com como URL de tu tienda");
        return;
      }
      if (githubToken.trim()) {
        const linked = await connectGithubOnServer(githubToken.trim());
        if (!linked.ok) {
          toast.error("No se pudo guardar GitHub en el servidor", {
            description: linked.message,
          });
          return;
        }
        markGithubServerConnected();
      }

      const prev = getIdeConfig();
      setIdeConfig({
        ...prev,
        ...(onProd
          ? { supabaseUrl: undefined, supabaseKey: undefined }
          : {
              supabaseUrl: supabaseUrl.trim() || undefined,
              supabaseKey: supabaseKey.trim() || undefined,
            }),
        openaiKey,
        openaiModel,
        githubToken,
        githubRepo: repoTrim,
        githubBranch,
        githubExcludeEnv,
        deploySiteUrl: deploySiteUrl.trim() || undefined,
        vercelDeployHookUrl: vercelDeployHookUrl.trim() || undefined,
      });
      const pid = await ensureProjectId();
      if (pid) {
        await saveProjectDeployMeta(pid, {
          github_repo: githubRepo.trim() || null,
          github_branch: githubBranch.trim() || "main",
          deploy_site_url: deploySiteUrl.trim() || null,
          vercel_deploy_hook_url: vercelDeployHookUrl.trim() || null,
        });
      }
      toast.success(
        githubToken.trim()
          ? "GitHub conectado en el servidor. Ya puedes publicar."
          : "Configuración guardada",
      );
      setOpen(false);
    })();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {openProp === undefined && (
        <DialogTrigger asChild>
          {children ?? (
            <Button variant="outline" size="sm" className="gap-2 border-border bg-card">
              <Settings className="h-4 w-4" />
              Configuración
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuración del IDE</DialogTitle>
          <DialogDescription>
            Conecta Supabase, OpenAI y GitHub. Las credenciales se guardan localmente en tu
            navegador.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {isGafcoreProductionHost() ? (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              En <strong className="text-foreground">gafcore.com</strong> tus proyectos se guardan en
              tu cuenta GafCore (no hace falta pegar URL de Supabase). Solo configura{" "}
              <strong className="text-foreground">GitHub Deploy</strong> abajo para publicar.
            </p>
          ) : null}
          {!isGafcoreProductionHost() ? (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Supabase</h3>
            <div className="space-y-2">
              <Label htmlFor="sb-url">URL</Label>
              <Input id="sb-url" placeholder="https://xxxx.supabase.co" value={supabaseUrl} onChange={(e) => setSupabaseUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sb-key">API Key</Label>
              <Input id="sb-key" type="password" placeholder="eyJhbGciOi..." value={supabaseKey} onChange={(e) => setSupabaseKey(e.target.value)} />
            </div>
          </section>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">OpenAI</h3>
            <div className="space-y-2">
              <Label htmlFor="oa-key">API Key</Label>
              <Input id="oa-key" type="password" placeholder="sk-..." value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oa-model">Modelo</Label>
              <Input id="oa-model" placeholder="gpt-4o-mini" value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)} />
            </div>
          </section>

          <section
            id="gafcore-deploy-github"
            className={`space-y-3 rounded-lg border p-3 transition-colors ${
              highlightDeploy ? "border-primary bg-primary/5" : "border-transparent"
            }`}
          >
            <h3 className="text-xs font-semibold uppercase text-foreground">GitHub (automático)</h3>
            <p className="text-xs text-muted-foreground">
              Pega el token una vez. GafCore crea el repo y publica por ti; no hace falta crear el
              repositorio a mano.
            </p>
            <div className="space-y-2">
              <Label htmlFor="gh-token">Personal Access Token (repo scope)</Label>
              <Input id="gh-token" type="password" placeholder="ghp_..." value={githubToken} onChange={(e) => setGithubToken(e.target.value)} />
            </div>
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-medium text-foreground">
                Opciones avanzadas (repo / Vercel)
              </summary>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="space-y-2 col-span-2 sm:col-span-1">
                <Label htmlFor="gh-repo">Repo (opcional)</Label>
                <Input
                  id="gh-repo"
                  placeholder="Se crea automáticamente"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gh-branch">Rama</Label>
                <Input id="gh-branch" placeholder="main" value={githubBranch} onChange={(e) => setGithubBranch(e.target.value)} />
              </div>
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={githubExcludeEnv}
                onChange={(e) => setGithubExcludeEnv(e.target.checked)}
              />
              <span>
                No subir <code>.env</code> al repo (recomendado). Se añadirá <code>.env</code> a{" "}
                <code>.gitignore</code> automáticamente.
              </span>
            </label>
              <div className="mt-3 space-y-3 col-span-2">
            <div className="space-y-2">
              <Label htmlFor="deploy-url">URL del sitio (Vercel, opcional)</Label>
              <Input
                id="deploy-url"
                placeholder="mi-app.vercel.app"
                value={deploySiteUrl}
                onChange={(e) => setDeploySiteUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vercel-hook">Deploy Hook de Vercel (opcional)</Label>
              <Input
                id="vercel-hook"
                type="url"
                placeholder="https://api.vercel.com/v1/integrations/deploy/..."
                value={vercelDeployHookUrl}
                onChange={(e) => setVercelDeployHookUrl(e.target.value)}
              />
            </div>
              </div>
            </details>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Volver al IDE
          </Button>
          <Button onClick={save} className="bg-primary hover:bg-primary/90">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
