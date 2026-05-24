import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function loadEnvFiles() {
  for (const name of [".env", ".env.development", ".env.local"]) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]?.trim()) process.env[k] = v;
    }
  }
  if (!process.env.SUPABASE_URL?.trim() && process.env.VITE_SUPABASE_URL?.trim()) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL.trim();
  }
  if (
    !process.env.SUPABASE_PUBLISHABLE_KEY?.trim() &&
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  ) {
    process.env.SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim();
  }
}

export function createAdminClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getAdminAccessToken(admin = createAdminClient()) {
  const { data: roleRow, error: roleErr } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (roleErr || !roleRow?.user_id) {
    throw new Error("No hay usuario admin en user_roles");
  }

  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(roleRow.user_id);
  const email = userData?.user?.email?.trim();
  if (userErr || !email) {
    throw new Error("No se pudo obtener email del admin");
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const tokenHash = linkData?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    throw new Error(`generateLink falló: ${linkErr?.message ?? "sin hashed_token"}`);
  }

  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!anonKey) throw new Error("Falta SUPABASE_PUBLISHABLE_KEY o VITE_SUPABASE_PUBLISHABLE_KEY");

  const client = createClient(process.env.SUPABASE_URL.trim(), anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: sessionData, error: otpErr } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });

  const token = sessionData.session?.access_token;
  if (otpErr || !token) {
    throw new Error(`verifyOtp falló: ${otpErr?.message ?? "sin access_token"}`);
  }

  return token;
}
