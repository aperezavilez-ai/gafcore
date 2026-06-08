import { z } from "zod";

const fieldTypeSchema = z.enum([
  "string",
  "text",
  "number",
  "boolean",
  "datetime",
  "uuid",
  "json",
]);

export const parsedAppIdeaSchema = z.object({
  raw: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  appType: z.enum(["todo", "ecommerce", "blog", "landing", "saas", "crm", "custom"]),
  complexity: z.enum(["simple", "medium", "complex"]),
  auth: z.object({
    required: z.boolean(),
    methods: z.array(z.enum(["email_password", "magic_link", "oauth"])),
  }),
  pages: z.array(
    z.object({
      route: z.string(),
      name: z.string(),
      purpose: z.string(),
      requiresAuth: z.boolean(),
    }),
  ),
  features: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      functional: z.literal(true),
    }),
  ),
  entities: z.array(
    z.object({
      name: z.string(),
      tableName: z.string(),
      description: z.string(),
      fields: z.array(
        z.object({
          name: z.string(),
          type: fieldTypeSchema,
          required: z.boolean(),
          unique: z.boolean().optional(),
        }),
      ),
    }),
  ),
  keywords: z.array(z.string()),
  constraints: z.object({
    mustBeFunctional: z.literal(true),
    noMocks: z.literal(true),
    runnableLocally: z.literal(true),
  }),
});
