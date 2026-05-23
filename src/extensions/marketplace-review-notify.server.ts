/**
 * Avisos cuando un creador envía un listing a revisión (sin depender de email transaccional).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MarketplaceReviewNotice = {
  listingId: string;
  slug: string;
  name: string;
  kind: string;
  creatorUserId?: string;
};

export async function notifyMarketplaceReviewSubmitted(
  notice: MarketplaceReviewNotice,
): Promise<void> {
  const adminUrl = "https://gafcore.com/gafcore/admin/marketplace";
  let creatorLabel = notice.creatorUserId ?? "desconocido";

  if (notice.creatorUserId) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("artist_name, first_name, last_name, email")
      .eq("user_id", notice.creatorUserId)
      .maybeSingle();
    const name =
      profile?.artist_name?.trim() ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
    if (name) creatorLabel = name;
    else if (profile?.email?.trim()) creatorLabel = profile.email.trim();
  }

  const payload = {
    type: "marketplace_listing_review",
    listingId: notice.listingId,
    slug: notice.slug,
    name: notice.name,
    kind: notice.kind,
    creatorUserId: notice.creatorUserId ?? null,
    creatorLabel,
    adminUrl,
    at: new Date().toISOString(),
  };

  console.info("[marketplace-review]", JSON.stringify(payload));

  const webhook = process.env.GAFCORE_MARKETPLACE_REVIEW_WEBHOOK_URL?.trim();
  if (!webhook) return;

  const body = buildReviewWebhookBody(webhook, payload);

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      console.warn("[marketplace-review] webhook HTTP", res.status);
    }
  } catch (e) {
    console.warn("[marketplace-review] webhook failed:", e);
  }
}

type ReviewWebhookPayload = {
  type: string;
  listingId: string;
  slug: string;
  name: string;
  kind: string;
  creatorUserId: string | null;
  creatorLabel: string;
  adminUrl: string;
  at: string;
  test?: boolean;
};

/** Cuerpo JSON según Slack, Discord o genérico. */
export function buildReviewWebhookBody(webhookUrl: string, payload: ReviewWebhookPayload): string {
  const label = payload.test ? "[TEST] " : "";
  const url = webhookUrl.toLowerCase();

  if (url.includes("discord.com/api/webhooks")) {
    return JSON.stringify({
      content: `${label}📋 Nuevo listing en revisión`,
      embeds: [
        {
          title: payload.name,
          description: [
            `**Slug:** \`${payload.slug}\``,
            `**Tipo:** ${payload.kind}`,
            `**Creador:** ${payload.creatorLabel}`,
          ].join("\n"),
          url: payload.adminUrl,
          color: payload.test ? 0xfbbf24 : 0x6366f1,
          timestamp: payload.at,
        },
      ],
    });
  }

  if (url.includes("hooks.slack.com")) {
    return JSON.stringify({
      text: `${label}Marketplace: *${payload.name}* en revisión`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${label}*${payload.name}*\n\`${payload.slug}\` · ${payload.kind}\nCreador: ${payload.creatorLabel}`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Revisar en admin" },
              url: payload.adminUrl,
            },
          ],
        },
      ],
    });
  }

  return JSON.stringify(payload);
}
