import { z } from "zod";
import { parsedAppIdeaSchema } from "../input-parser/schema";

const blueprintSchema = z.object({
  version: z.literal(1),
  slug: z.string().min(1),
  parsed: parsedAppIdeaSchema,
  stack: z.object({
    frontend: z.literal("react-vite"),
    backend: z.literal("express"),
    database: z.literal("sqlite"),
    orm: z.literal("drizzle"),
  }),
  tables: z.array(
    z.object({
      name: z.string(),
      entity: z.string(),
      columns: z.array(
        z.object({
          name: z.string(),
          sqlType: z.enum(["TEXT", "INTEGER", "REAL"]),
          primaryKey: z.boolean().optional(),
          notNull: z.boolean().optional(),
          unique: z.boolean().optional(),
        }),
      ),
    }),
  ),
  apiRoutes: z.array(
    z.object({
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      path: z.string(),
      handler: z.string(),
      auth: z.boolean(),
      entity: z.string().optional(),
      description: z.string(),
    }),
  ),
  frontendRoutes: z.array(
    z.object({
      path: z.string(),
      component: z.string(),
      requiresAuth: z.boolean(),
    }),
  ),
  outputFiles: z.array(z.string()).min(1),
});

export { blueprintSchema };
