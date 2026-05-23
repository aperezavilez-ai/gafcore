import { z } from "zod";

export const EXTENSION_MANIFEST_VERSION = 1 as const;

const templateFileSchema = z.object({
  name: z.string().min(1).max(512),
  language: z.string().max(64).optional(),
  content: z.string().max(500_000),
});

export const templateManifestSchema = z.object({
  kind: z.literal("template"),
  version: z.literal(EXTENSION_MANIFEST_VERSION),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  category: z
    .enum(["starter", "landing", "ecommerce", "mobile", "dashboard", "blog", "portfolio"])
    .default("starter"),
  files: z.array(templateFileSchema).min(1).max(80),
  requiredPaths: z.array(z.string().max(512)).max(40).optional(),
});

export const aiPluginManifestSchema = z.object({
  kind: z.literal("ai_plugin"),
  version: z.literal(EXTENSION_MANIFEST_VERSION),
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  hooks: z.array(z.enum(["before_chat", "after_chat", "before_workflow_task"])).min(1).max(5),
  /** Texto añadido al system prompt del chat IDE (hook before_chat). */
  systemPromptAppend: z.string().max(8000).optional(),
  webhookUrl: z.string().url().optional(),
});

export function extensionAiPluginSlug(listingSlug: string): string {
  return `plugin:${listingSlug.replace(/^plugin:/, "")}`;
}

export const externalAgentManifestSchema = z.object({
  kind: z.literal("agent"),
  version: z.literal(EXTENSION_MANIFEST_VERSION),
  slug: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  hooks: z
    .array(z.enum(["workflow_complete", "workflow_failed"]))
    .min(1)
    .max(5)
    .default(["workflow_complete"]),
  runner: z.enum(["webhook", "edge_function"]).default("webhook"),
  webhookUrl: z.string().url().optional(),
  canWriteFiles: z.boolean().default(false),
  allow: z.array(z.string()).max(40).optional(),
  deny: z.array(z.string()).max(40).optional(),
});

export function extensionAgentSlug(listingSlug: string): string {
  return `agent:${listingSlug.replace(/^agent:/, "")}`;
}

export const extensionManifestSchema = z.discriminatedUnion("kind", [
  templateManifestSchema,
  aiPluginManifestSchema,
  externalAgentManifestSchema,
]);

export type ExtensionManifest = z.infer<typeof extensionManifestSchema>;
export type TemplateExtensionManifest = z.infer<typeof templateManifestSchema>;

export function extensionTemplateSlug(listingSlug: string): string {
  return `ext:${listingSlug.replace(/^ext:/, "")}`;
}
