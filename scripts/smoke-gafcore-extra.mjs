#!/usr/bin/env node
/**
 * Smoke: instala workflow pack + import mínimo vía API.
 *
 *   npm run gafcore:smoke-marketplace-workflow
 *   npm run gafcore:smoke-project-import
 */
import {
  createAdminClient,
  getAdminAccessToken,
  loadEnvFiles,
} from "./lib/gafcore-smoke-auth.mjs";

const base = (process.env.GAFCORE_SMOKE_BASE ?? "https://www.gafcore.com").replace(/\/$/, "");

async function authPost(path, token, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  let payload;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  return { status: res.status, payload };
}

async function smokeWorkflowPack(token, admin) {
  const slug = process.env.GAFCORE_SMOKE_WORKFLOW_SLUG ?? "landing-build-pack";
  const { data, error } = await admin
    .from("gafcore_marketplace_listings")
    .select("id")
    .eq("slug", slug)
    .eq("state", "published")
    .maybeSingle();

  if (error || !data?.id) throw new Error(`Listing ${slug} no encontrado`);

  const install = await authPost("/api/extensions/v1/install", token, { listingId: data.id });
  console.log("[smoke-workflow] install HTTP:", install.status, install.payload);
  if (install.status === 500 || !install.payload?.ok) {
    throw new Error(install.payload?.error ?? "install_failed");
  }
  console.log("[smoke-workflow] OK —", install.payload.installSlug);
}

async function smokeImport(token) {
  const name = `Import smoke ${new Date().toISOString().slice(0, 19)}`;
  const create = await authPost("/api/gafcore/projects-create", token, {
    name,
    files: [
      {
        name: "src/App.tsx",
        language: "tsx",
        content:
          'export default function App(){return <main className="p-8"><h1>Import OK</h1></main>;}',
      },
      {
        name: "src/main.tsx",
        language: "tsx",
        content:
          'import React from "react";import { createRoot } from "react-dom/client";import App from "./App";createRoot(document.getElementById("root")!).render(<App />);',
      },
    ],
  });
  console.log("[smoke-import] create HTTP:", create.status, create.payload?.ok);
  if (create.status === 500 || !create.payload?.ok) {
    throw new Error(create.payload?.error ?? "import_failed");
  }
  const projectId = create.payload.project.id;
  const del = await authPost("/api/gafcore/projects-delete", token, { projectId });
  console.log("[smoke-import] delete HTTP:", del.status, del.payload?.ok);
  if (del.status !== 200 || !del.payload?.ok) throw new Error("delete_failed");
  console.log("[smoke-import] OK");
}

async function main() {
  loadEnvFiles();
  const admin = createAdminClient();
  const token = await getAdminAccessToken(admin);
  const mode = process.argv[2] ?? "all";

  console.log("[smoke-extra] base:", base);
  if (mode === "workflow" || mode === "all") await smokeWorkflowPack(token, admin);
  if (mode === "import" || mode === "all") await smokeImport(token);
}

main().catch((e) => {
  console.error("[smoke-extra]", e instanceof Error ? e.message : e);
  process.exit(1);
});
