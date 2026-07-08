// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { jsonOk, jsonError, requireApiAuth, requireScope } from "./-_auth";
import { enforceRateLimit, AI_LIMIT } from "./-_ratelimit";
import {
  completeChatMessage,
  consumeAiCredits,
  getGafcoreAiGateway,
  refundAiCredits,
  resolveGatewayModel,
} from "@/lib/gafcore-ai-gateway.server";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";

const BodySchema = z.object({
  prompt: z.string().min(1).max(8000),
  system: z.string().max(4000).optional(),
  model: z.string().min(1).max(120).optional(),
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
        const { prompt, system, json, module, save } = parsed.data;

        let gateway: ReturnType<typeof getGafcoreAiGateway>;
        try {
          gateway = getGafcoreAiGateway();
        } catch {
          return jsonError(
            500,
            "ai_not_configured",
            "AI is not configured (set MEAI_API_KEY, GPTPRO4ALL_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY/GOOGLE_AI_API_KEY, or an allowed AI_CHAT_COMPLETIONS_URL).",
          );
        }

        const resolvedModel = resolveGatewayModel(gateway, {
          explicit: parsed.data.model,
          tier: "fast",
        });

        const skipCredits = await isGafcoreAdminUser(auth.userId);
        let balanceAfter: number | null = null;
        if (!skipCredits) {
          const credit = await consumeAiCredits(auth.userId, COST, "api_v1_ai_generate", { module });
          if (!credit.ok) {
            if (credit.error === "insufficient_credits") {
              return jsonError(402, "insufficient_credits", "Not enough credits to perform this request.");
            }
            return jsonError(500, "credits_error", "Could not verify credits.");
          }
          balanceAfter = credit.balance;
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

        let content: string;
        try {
          const completed = await completeChatMessage({
            model: resolvedModel,
            messages,
            json: Boolean(json),
          });
          content = completed.content;
        } catch (e: unknown) {
          if (!skipCredits) {
            await refundAiCredits(auth.userId, COST, "api_v1_ai_generate_refund", {
              error: String((e as Error)?.message ?? e),
            });
          }
          const err = e as Error & { code?: string; status?: number };
          if (err.code === "rate_limited") return jsonError(429, "ai_rate_limited", err.message);
          if (err.code === "provider_credits")
            return jsonError(402, "ai_credits_exhausted", err.message);
          return jsonError(502, "ai_upstream_error", err.message);
        }
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

        return jsonOk({ model: resolvedModel, result, balance: balanceAfter });
      },
    },
  },
});
