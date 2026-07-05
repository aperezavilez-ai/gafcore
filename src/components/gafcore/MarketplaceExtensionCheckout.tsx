import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Stripe } from "@stripe/stripe-js";
import {
  assertCheckoutSecretMatchesPublishableKey,
  getStripe,
  getStripeEnvironment,
} from "@/lib/stripe";
import { supabase } from "@/lib/gafcore-supabase-client-proxy";

type Props = {
  listingId: string;
  listingName: string;
  returnUrl?: string;
  customerEmail?: string;
};

function isCheckoutClientSecret(value: string): boolean {
  const s = value.trim();
  return s.startsWith("cs_test_") || s.startsWith("cs_live_");
}

export function MarketplaceExtensionCheckout({
  listingId,
  listingName,
  returnUrl,
  customerEmail,
}: Props) {
  const [stripe, setStripe] = useState<Stripe | null | "pending">("pending");
  const [stripeInitError, setStripeInitError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getStripe().then((s) => {
      if (cancelled) return;
      if (!s) {
        setStripeInitError("Stripe no está configurado en este entorno.");
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
    if (!accessToken) throw new Error("Inicia sesión para comprar extensiones.");

    const checkoutReturnUrl =
      returnUrl ||
      `${window.location.origin}/gafcore/marketplace?checkout=success&session_id={CHECKOUT_SESSION_ID}&listing_id=${listingId}`;

    const res = await fetch("/api/extensions/v1/checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        listingId,
        customerEmail,
        returnUrl: checkoutReturnUrl,
        environment: getStripeEnvironment(),
      }),
    });

    const payload = (await res.json()) as { client_secret?: string; error?: string };
    if (!res.ok) {
      throw new Error(payload.error ?? `Error ${res.status}`);
    }

    const secret = payload.client_secret?.trim();
    if (!secret || !isCheckoutClientSecret(secret)) {
      throw new Error("El servidor no devolvió client_secret válido.");
    }

    assertCheckoutSecretMatchesPublishableKey(secret);
    setCheckoutError(null);
    return secret;
  }, [customerEmail, listingId, returnUrl]);

  const checkoutOptions = useMemo(() => ({ fetchClientSecret }), [fetchClientSecret]);

  if (stripe === "pending") {
    return (
      <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
        Conectando con Stripe…
      </div>
    );
  }

  if (stripeInitError || !stripe) {
    return (
      <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {stripeInitError ?? "Stripe no disponible."}
      </p>
    );
  }

  if (checkoutError) {
    return (
      <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {checkoutError}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Comprar <span className="font-medium text-foreground">{listingName}</span>
      </p>
      <EmbeddedCheckoutProvider stripe={stripe} options={checkoutOptions}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
