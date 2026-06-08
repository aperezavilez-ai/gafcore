import type { BlueprintColumn } from "../../../types/blueprint";
import type { EmitContext, GeneratedFile } from "../types";

function drizzleColumn(col: BlueprintColumn): string {
  const args: string[] = [`"${col.name}"`];
  let chain = "";

  if (col.sqlType === "INTEGER") {
    chain = `integer(${args.join(", ")})`;
    if (col.name === "completed") {
      chain = `integer(${args.join(", ")}, { mode: "boolean" })`;
    }
  } else if (col.sqlType === "REAL") {
    chain = `real(${args.join(", ")})`;
  } else {
    chain = `text(${args.join(", ")})`;
  }

  if (col.primaryKey) chain += ".primaryKey()";
  if (col.notNull) chain += ".notNull()";
  if (col.unique) chain += ".unique()";

  return `  ${col.name}: ${chain},`;
}

export function emitSchema(ctx: EmitContext): GeneratedFile[] {
  const { blueprint } = ctx;
  const tableBlocks = blueprint.tables
    .map((t) => {
      const cols = t.columns.map(drizzleColumn).join("\n");
      const exportName = t.name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      return `export const ${exportName} = sqliteTable("${t.name}", {\n${cols}\n});`;
    })
    .join("\n\n");

  const extra: string[] = [];

  if (blueprint.parsed.auth.required) {
    extra.push(`export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  expiresAt: text("expiresAt").notNull(),
});`);
  }

  if (blueprint.parsed.appType === "landing") {
    extra.push(`export const contactSubmissions = sqliteTable("contact_submissions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  createdAt: text("createdAt").notNull(),
});`);
  }

  return [
    {
      path: "server/schema.ts",
      content: `import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

${tableBlocks}

${extra.join("\n\n")}
`,
    },
  ];
}
