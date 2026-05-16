/**
 * Borra en Supabase todos los usuarios de Auth excepto el correo indicado.
 *
 * Uso (en la raíz del proyecto, con .env o .env.local que tengan):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 *   bun run scripts/delete-users-except-admin.mjs
 *   o: bun run purge-users
 *
 * NUNCA subas la service role a Git ni la compartas.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const KEEPER_EMAIL = "alfonsoavilery@icloud.com";
const CHUNK = 120;

function loadEnvFiles() {
  for (const name of [".env.local", ".env", ".env.production"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

async function listAllAuthUsers(supabase) {
  const out = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const batch = data.users ?? [];
    out.push(...batch);
    if (batch.length < 200) break;
    page += 1;
  }
  return out;
}

async function safeDelete(label, fn) {
  try {
    await fn();
  } catch (e) {
    console.warn(`[omitido] ${label}:`, e?.message ?? e);
  }
}

async function deleteInChunks(supabase, table, column, ids) {
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).delete().in(column, chunk);
    if (error) throw error;
  }
}

async function deleteWhereUserNotKeeper(supabase, table, keeperId) {
  const { error } = await supabase.from(table).delete().neq("user_id", keeperId);
  if (error) throw error;
}

async function main() {
  loadEnvFiles();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno o en .env.local / .env");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const users = await listAllAuthUsers(supabase);
  const keeper = users.find((u) => (u.email ?? "").toLowerCase() === KEEPER_EMAIL.toLowerCase());
  if (!keeper) {
    console.error(`No hay ningún usuario en Auth con el correo: ${KEEPER_EMAIL}`);
    process.exit(1);
  }
  const keeperId = keeper.id;
  console.log(`Se conserva: ${KEEPER_EMAIL} (${keeperId})`);

  const toRemove = users.filter((u) => u.id !== keeperId);
  console.log(`Usuarios a eliminar: ${toRemove.length}`);

  // Misma base que supabase/scripts/delete-users-except-one-admin.sql + hijos de projects y tablas user_id frecuentes.
  await safeDelete("credit_transactions", () => deleteWhereUserNotKeeper(supabase, "credit_transactions", keeperId));
  await safeDelete("user_credits", () => deleteWhereUserNotKeeper(supabase, "user_credits", keeperId));
  await safeDelete("subscriptions", () => deleteWhereUserNotKeeper(supabase, "subscriptions", keeperId));
  await safeDelete("notifications", () => deleteWhereUserNotKeeper(supabase, "notifications", keeperId));

  const { data: badProjects, error: projErr } = await supabase
    .from("projects")
    .select("id")
    .neq("user_id", keeperId);
  if (projErr) throw projErr;
  const badIds = (badProjects ?? []).map((r) => r.id);

  if (badIds.length) {
    await safeDelete("chat_messages", () => deleteInChunks(supabase, "chat_messages", "project_id", badIds));
    await safeDelete("project_publishes", () => deleteInChunks(supabase, "project_publishes", "project_id", badIds));
    await safeDelete("project_files", () => deleteInChunks(supabase, "project_files", "project_id", badIds));
    await safeDelete("project_secrets", () => deleteInChunks(supabase, "project_secrets", "project_id", badIds));
    await safeDelete("project_snapshots", () => deleteInChunks(supabase, "project_snapshots", "project_id", badIds));
  }

  await safeDelete("projects", () => deleteWhereUserNotKeeper(supabase, "projects", keeperId));
  await safeDelete("generations", () => deleteWhereUserNotKeeper(supabase, "generations", keeperId));

  await safeDelete("api_keys", () => deleteWhereUserNotKeeper(supabase, "api_keys", keeperId));
  await safeDelete("api_rate_limits", () => deleteWhereUserNotKeeper(supabase, "api_rate_limits", keeperId));
  await safeDelete("gafsites", () => deleteWhereUserNotKeeper(supabase, "gafsites", keeperId));
  await safeDelete("gafsite_publications", () => deleteWhereUserNotKeeper(supabase, "gafsite_publications", keeperId));
  await safeDelete("oauth_states", () => deleteWhereUserNotKeeper(supabase, "oauth_states", keeperId));
  await safeDelete("mcp_connections", () => deleteWhereUserNotKeeper(supabase, "mcp_connections", keeperId));

  await safeDelete("user_roles", () => deleteWhereUserNotKeeper(supabase, "user_roles", keeperId));
  await safeDelete("profiles", () => deleteWhereUserNotKeeper(supabase, "profiles", keeperId));

  for (const u of toRemove) {
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    if (error) console.error(`No se pudo borrar ${u.email}:`, error.message);
    else console.log(`Eliminado: ${u.email ?? u.id}`);
  }

  const { error: roleErr } = await supabase.from("user_roles").upsert(
    { user_id: keeperId, role: "admin" },
    { onConflict: "user_id,role" },
  );
  if (roleErr) console.warn("user_roles admin:", roleErr.message);
  else console.log("Rol admin asegurado para la cuenta conservada.");

  const { error: credErr } = await supabase.from("user_credits").upsert(
    {
      user_id: keeperId,
      balance: 1000,
      monthly_allowance: 1000,
      daily_limit: 1000,
    },
    { onConflict: "user_id" },
  );
  if (credErr) console.warn("user_credits:", credErr.message);
  else console.log("Créditos ilimitados (allowance 1000) aplicados al keeper.");

  console.log("Listo. Revisa Authentication → Users en Supabase.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
