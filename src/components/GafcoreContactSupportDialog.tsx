import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n/I18nProvider";
import { supportChat } from "@/lib/server-fns/support.functions";
import { TurnstileWidget, isTurnstileSiteKeyConfigured } from "@/components/TurnstileWidget";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

export function GafcoreContactSupportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const callSupport = useServerFn(supportChat);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnKey, setTurnKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setTurnstileToken(null);
    setTurnKey((k) => k + 1);
  }, [open]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setLoading(true);
    try {
      if (user?.id) {
        const history = [...msgs, { role: "user" as const, content: q }].slice(-20);
        const { reply } = await callSupport({ data: { messages: history } });
        setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: reply }]);
      } else {
        if (isTurnstileSiteKeyConfigured() && !turnstileToken?.trim()) {
          toast.error(t("gc.support.turnstileFirst"));
          setInput(q);
          setLoading(false);
          return;
        }
        const res = await fetch("/api/public/gafcore/support-faq", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: q,
            ...(turnstileToken?.trim() ? { turnstileToken: turnstileToken.trim() } : {}),
          }),
        });
        let j: { reply?: string; error?: string } = {};
        try {
          j = (await res.json()) as typeof j;
        } catch {
          j = {};
        }
        if (!res.ok) {
          throw new Error(j.error || "err");
        }
        setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: j.reply || "…" }]);
        setTurnstileToken(null);
        setTurnKey((k) => k + 1);
      }
    } catch {
      toast.error(t("gc.support.error"));
      setInput(q);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg gap-0 border-border bg-background p-0 text-foreground">
        <DialogHeader className="border-b border-border px-4 py-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4 text-primary" aria-hidden />
            {t("gc.support.title")}
          </DialogTitle>
          <DialogDescription className="text-left text-xs text-muted-foreground">
            {t("gc.support.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[42vh] px-4 py-3">
          <div className="space-y-3 pr-2">
            {msgs.map((m, i) => (
              <div
                key={`${i}-${m.role}`}
                className={
                  m.role === "user"
                    ? "ml-6 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
                    : "mr-4 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm"
                }
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none text-foreground [&>p]:m-0 [&>ul]:my-1 [&>ol]:my-1">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            ))}
            {loading && (
              <p className="text-xs text-muted-foreground">{t("gc.support.thinking")}</p>
            )}
          </div>
        </ScrollArea>

        {!user?.id && isTurnstileSiteKeyConfigured() ? (
          <div className="border-t border-border px-4 py-2">
            <TurnstileWidget key={turnKey} theme="auto" onToken={setTurnstileToken} />
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-border p-4">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("gc.support.placeholder")}
            rows={3}
            className="resize-none border-border bg-background text-sm"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button type="button" className="self-end" disabled={loading} onClick={() => void send()}>
            {t("gc.support.send")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
