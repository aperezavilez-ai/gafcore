import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireGafcoreAdmin } from "@/lib/server-fns/require-gafcore-admin.middleware";
import {
  deleteGafcoreAiProviderConfig,
  listGafcoreAiProviderConfigs,
  saveGafcoreAiProviderConfig,
  testGafcoreAiProviderRoute,
} from "@/lib/gafcore-ai-provider-configs.server";

const providerSchema = z.enum(["gptpro4all", "anthropic", "openai", "openrouter", "custom"]);
const wireSchema = z.enum(["chat_completions", "responses"]);

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  provider: providerSchema,
  label: z.string().max(80).optional(),
  baseUrl: z.string().max(300).optional(),
  defaultModel: z.string().max(120).optional(),
  wireApi: wireSchema.optional(),
  priority: z.number().int().min(1).max(999).optional(),
  isActive: z.boolean().optional(),
  apiKey: z.string().max(4000).optional(),
});

const idSchema = z.object({ id: z.string().uuid() });

export const listAdminAiProviderConfigsFn = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .handler(async () => ({ configs: await listGafcoreAiProviderConfigs() }));

export const saveAdminAiProviderConfigFn = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator((input) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await saveGafcoreAiProviderConfig({ ...data, userId: context.userId });
    return { ok: true };
  });

export const deleteAdminAiProviderConfigFn = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data }) => {
    await deleteGafcoreAiProviderConfig(data.id);
    return { ok: true };
  });

export const testAdminAiProviderConfigFn = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data }) => testGafcoreAiProviderRoute(data.id));
