#!/usr/bin/env node
/**
 * Smoke: crear y eliminar proyecto vía API HTTP (prod o local).
 *
 *   npm run gafcore:smoke-projects
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

async function main() {
  loadEnvFiles();
  createAdminClient();

  const name = `Smoke ${new Date().toISOString().slice(0, 19)}`;
  console.log("[smoke-projects] base:", base);

  const token = await getAdminAccessToken();

  const create = await authPost("/api/gafcore/projects-create", token, {
    name,
    templateSlug: "blank-vite",
  });

  console.log("[smoke-projects] create HTTP:", create.status, create.payload);

  if (create.status === 500) {
    console.error("[smoke-projects] FAIL: HTTP 500 (HTTPError Vercel)");
    process.exit(1);
  }
  if (create.status !== 200 || !create.payload?.ok || !create.payload?.project?.id) {
    console.error("[smoke-projects] FAIL:", create.payload?.error ?? "create_failed");
    process.exit(1);
  }

  const projectId = create.payload.project.id;

  const del = await authPost("/api/gafcore/projects-delete", token, { projectId });
  console.log("[smoke-projects] delete HTTP:", del.status, del.payload);

  if (del.status === 500) {
    console.error("[smoke-projects] FAIL: delete HTTP 500");
    process.exit(1);
  }
  if (del.status !== 200 || !del.payload?.ok) {
    console.error("[smoke-projects] FAIL:", del.payload?.error ?? "delete_failed");
    process.exit(1);
  }

  console.log("[smoke-projects] OK — create + delete");
}

main().catch((e) => {
  console.error("[smoke-projects]", e instanceof Error ? e.message : e);
  process.exit(1);
});
