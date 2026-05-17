import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Stripe } from "@stripe/stripe-js";
import { toast } from "sonner";
import { assertCheckoutSecretMatchesPublishableKey, getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createCheckoutSession } from "@/lib/server-fns/payments.functions";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  priceId: string;
  customerEmail?: string;
  userId?: string;
  returnUrl?: string;
}

const CS_RE = /^cs_(test|live)_[A-Za-z0-9_-]{8,}$/;

function readClientSecret(value: unknown): string | null {
  if (typeof value === "string") {
    const s = value.trim();
    if (CS_RE.test(s)) return s;
    return null;
  }
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const direct =
    readClientSecret(record.cs) ??
    readClientSecret(record.clientSecret) ??
    readClientSecret(record.client_secret) ??
    readClientSecret(record.data) ??
    readClientSecret(record.result);
  if (direct) return direct;

  /** TanStack / seroval a veces anidan el payload; buscamos cualquier string tipo client_secret de sesión. */
  const stack: unknown[] = [value];
  const seen = new Set<unknown>();
  let steps = 0;
  while (stack.length && steps++ < 500) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const v of Object.values(cur as Record<string, unknown>)) {
      if (typeof v === "string" && CS_RE.test(v.trim())) return v.trim();
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

export function StripeEmbeddedCheckout({ priceId, customerEmail, userId, returnUrl }: Props) {
  const createCheckout = useServerFn(createCheckoutSession);
  const [stripe, setStripe] = useState<Stripe | null | "pending">("pending");
  const [stripeInitError, setStripeInitError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getStripe().then((s) => {
      if (cancelled) return;
      if (!s) {
        setStripeInitError(
          import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN?.trim()
            ? "Stripe.js no pudo usar la clave pública (revisa que sea pk_test_ o pk_live_ válida del mismo proyecto que las claves secretas en el servidor)."
            : "Falta VITE_PAYMENTS_CLIENT_TOKEN (clave pública pk_…) en el entorno del build. Sin ella el checkout embebido no arranca.",
        );
        setStripe(null);
        return;
      }
      setStripeInitError(null);
      setStripe(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("Tu sesión expiró. Inicia sesión de nuevo para suscribirte.");

    try {
      const response = await createCheckout({
        data: {
          priceId,
          customerEmail,
          userId,
          returnUrl:
            returnUrl || `${window.location.origin}/gafcore/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          environment: getStripeEnvironment(),
          accessToken,
        },
      });
      const secret = readClientSecret(response);
      if (!secret) {
        const hint =
          response && typeof response === "object"
            ? Object.keys(response as object).join(", ") || "respuesta vacía"
            : typeof response;
        throw new Error(
          `El servidor no devolvió clientSecret del checkout (${hint}). Si acabas de configurar Stripe en Vercel, haz push del repo y redeploy (el checkout requiere ui_mode embedded en el servidor).`,
        );
      }
      assertCheckoutSecretMatchesPublishableKey(secret);
      setCheckoutError(null);
      return secret;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCheckoutError(msg);
      toast.error("No se pudo iniciar el pago con Stripe", { description: msg });
      throw e;
    }
  }, [createCheckout, customerEmail, priceId, returnUrl, userId]);

  const checkoutOptions = useMemo(() => ({ fetchClientSecret }), [fetchClientSecret]);

  if (stripe === "pending") {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        <p>Conectando con Stripe…</p>
      </div>
    );
  }

  if (stripeInitError || !stripe) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        <p className="font-medium text-foreground">No se puede mostrar el checkout</p>
        <p className="mt-1 text-muted-foreground">{stripeInitError ?? "Stripe no está disponible."}</p>
      </div>
    );
  }

  if (checkoutError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
      >
        <p className="font-medium text-foreground">Error al cargar el pago</p>
        <p className="mt-1 text-muted-foreground">{checkoutError}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          En Vercel usa pk_test_ y STRIPE_SANDBOX_API_KEY=sk_test_ (misma cuenta test). Luego npm run
          gafcore:stripe-bootstrap y redeploy.
        </p>
      </div>
    );
  }

  return (
    <div id="checkout" key={priceId}>
      <EmbeddedCheckoutProvider stripe={stripe} options={checkoutOptions}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
