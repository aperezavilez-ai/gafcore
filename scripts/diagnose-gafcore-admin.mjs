/**
 * Diagnóstico admin GafCore (sin volcar secretos).
 * Requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.local o .env
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ADMIN_EMAIL = (process.env.GAFCORE_ADMIN_EMAIL || "alfonsoavilery@icloud.com").trim().toLowerCase();
const COMMON_TYPO = "alfonsoavilez@icloud.com";

function loadEnvFiles() {
  for (const name of [".env.local", ".env", ".env.production"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
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

async function main() {
  loadEnvFiles();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Falta SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 500 });
  if (listErr) {
    console.error("listUsers:", listErr.message);
    process.exit(1);
  }

  const users = list.users ?? [];
  const match = users.filter((u) => (u.email || "").trim().toLowerCase() === ADMIN_EMAIL);
  const similar = users.filter((u) => (u.email || "").toLowerCase().includes("alfonso"));

  console.log("--- GafCore admin diagnose ---");
  console.log("Email objetivo:", ADMIN_EMAIL);
  console.log("Usuarios auth totales (página 1):", users.length);

  if (match.length === 0) {
    console.log("RESULTADO: NO existe usuario Auth con ese email exacto.");
    if (ADMIN_EMAIL === COMMON_TYPO) {
      console.log("NOTA: En el panel a veces se lee «avilez»; en Auth el admin es alfonsoavilery@icloud.com (con r).");
    }
    if (similar.length) {
      console.log("Correos parecidos en Auth:");
      for (const u of similar) console.log(" -", u.email, "| id:", u.id);
    }
    process.exit(2);
  }

  for (const u of match) {
    console.log("\nUsuario Auth encontrado:");
    console.log("  id:", u.id);
    console.log("  email:", u.email);
    console.log("  email_confirmed_at:", u.email_confirmed_at ?? "(null)");
    console.log("  created_at:", u.created_at);
    console.log("  last_sign_in_at:", u.last_sign_in_at ?? "(nunca)");

    const { data: roles, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.id);
    if (roleErr) console.log("  user_roles ERROR:", roleErr.message);
    else console.log("  user_roles:", roles?.map((r) => r.role).join(", ") || "(ninguno)");

    const { data: profile } = await supabase.from("profiles").select("user_id").eq("user_id", u.id).maybeSingle();
    console.log("  profile:", profile ? "ok" : "falta");

    const { data: rpcAdmin, error: rpcErr } = await supabase.rpc("has_role", {
      _user_id: u.id,
      _role: "admin",
    });
    if (rpcErr) console.log("  has_role(admin) RPC error:", rpcErr.message);
    else console.log("  has_role(admin):", rpcAdmin);

    if (!roles?.some((r) => r.role === "admin")) {
      console.log("\nACCION: ejecuta supabase/scripts/bootstrap-gafcore-admin.sql en SQL Editor");
    } else if (!profile) {
      const { error: profFix } = await supabase.from("profiles").upsert(
        { user_id: u.id, email: u.email },
        { onConflict: "user_id" },
      );
      console.log(profFix ? "  profile fix ERROR:" + profFix.message : "  profile: creado/actualizado");
    } else {
      console.log("\nRESULTADO: cuenta OK en BD. Si no entra, resetea contraseña o revisa cookies en gafcore.com.");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
