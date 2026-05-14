#!/usr/bin/env node
/**
 * Sincroniza la plantilla de "recuperar contraseña" al proyecto Supabase (hosted)
 * vía Management API. No cambia SMTP: para remitente "GafCore" configura SMTP en el panel.
 *
 * Requiere (entorno):
 *   SUPABASE_ACCESS_TOKEN — https://supabase.com/dashboard/account/tokens
 *   SUPABASE_PROJECT_REF  — ref del proyecto (ej. hbfbqqwetaynblmkezeu), o usa VITE_SUPABASE_PROJECT_ID
 *
 * Uso: npm run gafcore:sync-recovery-email
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const ref = (process.env.SUPABASE_PROJECT_REF || process.env.VITE_SUPABASE_PROJECT_ID)?.trim();

if (!token || !ref) {
  console.error(
    "Faltan variables: SUPABASE_ACCESS_TOKEN y SUPABASE_PROJECT_REF (o VITE_SUPABASE_PROJECT_ID).",
  );
  console.error("Crea un token en https://supabase.com/dashboard/account/tokens");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "supabase", "templates", "recovery.html");
if (!fs.existsSync(htmlPath)) {
  console.error("No existe:", htmlPath);
  process.exit(1);
}

const mailer_templates_recovery_content = fs.readFileSync(htmlPath, "utf8");
const mailer_subjects_recovery = "GafCore — enlace para nueva contraseña";

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ mailer_subjects_recovery, mailer_templates_recovery_content }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`Error ${res.status}:`, body);
  process.exit(1);
}

console.log("Plantilla de recuperación actualizada en el proyecto:", ref);
console.log(body ? body : "(sin cuerpo en respuesta)");
