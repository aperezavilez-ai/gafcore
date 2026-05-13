// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jsonOk, jsonError, requireApiAuth, requireScope } from "./-_auth";
import { enforceRateLimit, AI_LIMIT } from "./-_ratelimit";
import { MODEL_FAST } from "@/lib/gafcore-chat.shared";
import { getAiChatConfig, postChatCompletions } from "@/lib/ai-chat-completions.server";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";

const BodySchema = z.object({
  prompt: z.string().min(1).max(8000),
  system: z.string().max(4000).optional(),
  model: z.string().min(1).max(120).optional().default(MODEL_FAST),
  json: z.boolean().optional(),
  module: z.string().min(1).max(64).optional().default("api"),
  save: z.boolean().optional().default(false),
});

const COST = 1;

export const Route = createFileRoute("/api/v1/ai/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (auth instanceof Response) return auth;
        const denied = requireScope(auth, "write:ai");
        if (denied) return denied;

        const limitedDefault = await enforceRateLimit(auth.userId);
        if (limitedDefault) return limitedDefault;
        const limitedAi = await enforceRateLimit(auth.userId, AI_LIMIT);
        if (limitedAi) return limitedAi;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonError(400, "invalid_json", "Request body must be valid JSON.");
        }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return jsonError(400, "invalid_body", parsed.error.issues[0]?.message ?? "Invalid body.");
        }
        const { prompt, system, model, json, module, save } = parsed.data;

        try {
          getAiChatConfig();
        } catch {
          return jsonError(500, "ai_not_configured", "AI is not configured (set OPENROUTER_API_KEY or OPENAI_API_KEY).");
        }

        const skipCredits = await isGafcoreAdminUser(auth.userId);
        if (!skipCredits) {
          const { data: credit, error: cErr } = await supabaseAdmin.rpc("consume_credits", {
            p_user_id: auth.userId,
            p_amount: COST,
            p_reason: "api_v1_ai_generate",
            p_metadata: { module },
          });
          if (cErr) return jsonError(500, "credits_error", "Could not verify credits.");
          if (!(credit as { ok?: boolean } | null)?.ok) {
            return jsonError(402, "insufficient_credits", "Not enough credits to perform this request.");
          }
        }

        const messages = [
          system
            ? { role: "system", content: system }
            : {
                role: "system",
                content:
                  "Eres un asistente creativo para artistas de música. Responde claro y útil.",
              },
          { role: "user", content: prompt },
        ];

        const res = await postChatCompletions({
          model,
          messages,
          ...(json ? { response_format: { type: "json_object" } } : {}),
        });

        if (!res.ok) {
          if (!skipCredits) {
            await supabaseAdmin.rpc("add_credits", {
              p_user_id: auth.userId,
              p_amount: COST,
              p_reason: "api_v1_ai_generate_refund",
              p_metadata: { status: res.status },
            });
          }
          if (res.status === 429) return jsonError(429, "ai_rate_limited", "AI rate limit reached.");
          if (res.status === 402)
            return jsonError(402, "ai_credits_exhausted", "AI provider credits exhausted.");
          return jsonError(502, "ai_upstream_error", `AI provider error (${res.status}).`);
        }

        const payload: any = await res.json();
        const content: string = payload?.choices?.[0]?.message?.content ?? "";
        const result = json
          ? (() => {
              try {
                return JSON.parse(content);
              } catch {
                return { text: content };
              }
            })()
          : { text: content };

        if (save) {
          await supabaseAdmin
            .from("generations")
            .insert({ user_id: auth.userId, module, prompt, result });
        }

        return jsonOk({ model, result, balance: (credit as any)?.balance ?? null });
      },
    },
  },
});
