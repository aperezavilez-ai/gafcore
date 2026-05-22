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
  category: z.enum(["starter", "landing", "ecommerce"]).default("starter"),
  files: z.array(templateFileSchema).min(1).max(80),
  requiredPaths: z.array(z.string().max(512)).max(40).optional(),
});

export const aiPluginManifestSchema = z.object({
  kind: z.literal("ai_plugin"),
  version: z.literal(EXTENSION_MANIFEST_VERSION),
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  hooks: z.array(z.enum(["before_chat", "after_chat", "before_workflow_task"])).max(5),
  webhookUrl: z.string().url().optional(),
});

export const externalAgentManifestSchema = z.object({
  kind: z.literal("agent"),
  version: z.literal(EXTENSION_MANIFEST_VERSION),
  slug: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  runner: z.enum(["webhook", "edge_function"]).default("webhook"),
  webhookUrl: z.string().url().optional(),
  canWriteFiles: z.boolean().default(false),
  allow: z.array(z.string()).max(40).optional(),
  deny: z.array(z.string()).max(40).optional(),
});

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
