import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  deleteAdminAiProviderConfigFn,
  listAdminAiProviderConfigsFn,
  saveAdminAiProviderConfigFn,
  testAdminAiProviderConfigFn,
} from "@/lib/gafcore-ai-provider-configs.functions";
import type { AdminAiProviderConfig } from "@/lib/gafcore-ai-provider-configs.server";
import type { AiWireApi, ResolvedProvider } from "@/lib/gafcore-model-routing.shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2, PlugZap, RefreshCw, Save, Trash2 } from "lucide-react";

type ApiFormState = {
  id?: string;
  provider: ResolvedProvider;
  label: string;
  baseUrl: string;
  defaultModel: string;
  wireApi: AiWireApi;
  priority: number;
  isActive: boolean;
  apiKey: string;
};

const providerDefaults: Record<ResolvedProvider, Omit<ApiFormState, "provider" | "apiKey" | "isActive" | "priority">> = {
  gptpro4all: {
    label: "GPTPRO4ALL",
    baseUrl: "https://api.chatgptpro4all.com/v1",
    defaultModel: "gpt-5.5",
    wireApi: "responses",
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "openai/gpt-4o-mini",
    wireApi: "chat_completions",
  },
  gemini: {
    label: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.0-flash",
    wireApi: "gemini_generate_content",
  },
  custom: {
    label: "Custom",
    baseUrl: "",
    defaultModel: "",
    wireApi: "chat_completions",
  },
};

function newForm(provider: ResolvedProvider = "gptpro4all"): ApiFormState {
  return {
    provider,
    ...providerDefaults[provider],
    priority: provider === "gptpro4all" ? 10 : 50,
    isActive: true,
    apiKey: "",
  };
}

function formFromConfig(config: AdminAiProviderConfig): ApiFormState {
  return {
    id: config.id,
    provider: config.provider,
    label: config.label,
    baseUrl: config.baseUrl,
    defaultModel: config.defaultModel,
    wireApi: config.wireApi,
    priority: config.priority,
    isActive: config.isActive,
    apiKey: "",
  };
}

export function AdminApisPanel() {
  const listConfigs = useServerFn(listAdminAiProviderConfigsFn);
  const saveConfig = useServerFn(saveAdminAiProviderConfigFn);
  const deleteConfig = useServerFn(deleteAdminAiProviderConfigFn);
  const testConfig = useServerFn(testAdminAiProviderConfigFn);

  const [configs, setConfigs] = useState<AdminAiProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ApiFormState>(() => newForm());

  const sortedConfigs = useMemo(
    () => [...configs].sort((a, b) => a.priority - b.priority || a.provider.localeCompare(b.provider)),
    [configs],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listConfigs();
      setConfigs(res.configs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cargar las APIs.");
    } finally {
      setLoading(false);
    }
  }, [listConfigs]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateProvider = (provider: ResolvedProvider) => {
    const defaults = providerDefaults[provider];
    setForm((prev) => ({
      ...prev,
      provider,
      label: prev.id ? prev.label : defaults.label,
      baseUrl: prev.id ? prev.baseUrl : defaults.baseUrl,
      defaultModel: prev.id ? prev.defaultModel : defaults.defaultModel,
      wireApi: defaults.wireApi,
    }));
  };

  const onNew = () => {
    setForm(newForm());
    setOpen(true);
  };

  const onEdit = (config: AdminAiProviderConfig) => {
    setForm(formFromConfig(config));
    setOpen(true);
  };

  const onSave = async () => {
    if (!form.apiKey.trim() && !form.id) {
      toast.error("Pega la API key antes de guardar.");
      return;
    }
    setBusyId(form.id ?? "new");
    try {
      await saveConfig({
        data: {
          id: form.id,
          provider: form.provider,
          label: form.label,
          baseUrl: form.baseUrl,
          defaultModel: form.defaultModel,
          wireApi: form.wireApi,
          priority: Number(form.priority),
          isActive: form.isActive,
          apiKey: form.apiKey.trim() || undefined,
        },
      });
      toast.success("API guardada.");
      setOpen(false);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la API.");
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteConfig({ data: { id } });
      toast.success("API eliminada.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar.");
    } finally {
      setBusyId(null);
    }
  };

  const onTest = async (id: string) => {
    setBusyId(id);
    try {
      const res = await testConfig({ data: { id } });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo probar la API.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section id="apis" className="border-b border-border bg-background">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">APIs de IA</h2>
              <p className="text-sm text-muted-foreground">
                Configura proveedores para el chat y el builder sin redeploy.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void reload()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Actualizar
            </Button>
            <Button type="button" onClick={onNew}>
              <PlugZap className="mr-2 h-4 w-4" />
              APIs
            </Button>
          </div>
        </div>

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Proveedores activos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : sortedConfigs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay APIs guardadas. GafCore seguirá usando las variables de Vercel como respaldo.
              </p>
            ) : (
              sortedConfigs.map((config) => (
                <div
                  key={config.id}
                  className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <button type="button" className="min-w-0 text-left" onClick={() => onEdit(config)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{config.label}</span>
                      <Badge variant={config.isActive ? "secondary" : "outline"}>
                        {config.isActive ? "Activa" : "Pausada"}
                      </Badge>
                      <Badge variant="outline">Prioridad {config.priority}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {config.provider} · {config.defaultModel || "sin modelo"} · {config.wireApi}
                    </p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {config.apiKeyHint || "llave guardada"} · {config.baseUrl || "URL por defecto"}
                    </p>
                  </button>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void onTest(config.id)} disabled={busyId === config.id}>
                      {busyId === config.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Probar
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => onEdit(config)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => void onDelete(config.id)} disabled={busyId === config.id}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar API" : "Nueva API"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Proveedor</Label>
              <select
                value={form.provider}
                onChange={(e) => updateProvider(e.target.value as ResolvedProvider)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="gptpro4all">GPTPRO4ALL</option>
                <option value="openrouter">OpenRouter</option>
                <option value="gemini">Gemini</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Base URL</Label>
              <Input value={form.baseUrl} onChange={(e) => setForm((p) => ({ ...p, baseUrl: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Modelo</Label>
              <Input value={form.defaultModel} onChange={(e) => setForm((p) => ({ ...p, defaultModel: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Wire API</Label>
              <select
                value={form.wireApi}
                onChange={(e) => setForm((p) => ({ ...p, wireApi: e.target.value as AiWireApi }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="responses">Responses</option>
                <option value="chat_completions">Chat completions</option>
                <option value="gemini_generate_content">Gemini generateContent</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Input
                type="number"
                min={1}
                max={999}
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) || 100 }))}
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
              />
              Activa
            </label>
            <div className="space-y-2 sm:col-span-2">
              <Label>API key</Label>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))}
                placeholder={form.id ? "Deja vacio para conservar la llave guardada" : "Pega aqui la API key"}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void onSave()} disabled={busyId === (form.id ?? "new")}>
              {busyId === (form.id ?? "new") ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
