/**
 * CRUD de proyectos por HTTP — invocado desde `server.ts` sin pasar por el entry SSR
 * (en Vercel POST vía TanStack devuelve HTTPError 500).
 */
import { z } from "zod";
import { requireGafcoreApiUser } from "@/lib/gafcore-api-auth.server";
import {
  deleteProjectForUser,
  listProjectTemplatesForUser,
  listProjectsForUser,
  saveProjectFilesForUser,
} from "@/lib/gafcore-projects-api.server";
import {
  CreateProjectFileSchema,
  CreateProjectInputSchema,
} from "@/lib/projects/project-create.shared";
import { executeCreateProject } from "@/lib/projects/project-create.service.server";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

const DeleteBodySchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().min(1).max(128).optional(),
});

const SaveFilesBodySchema = z.object({
  projectId: z.string().uuid(),
  files: z.array(CreateProjectFileSchema).max(500),
});

/** GET /api/gafcore/projects-list */
export async function handleGafcoreProjectsListGet(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;

  const result = await listProjectsForUser(userId);
  if (!result.ok) {
    return json({ ok: false, error: result.error }, 503);
  }

  return json({ ok: true, projects: result.projects });
}

/** POST /api/gafcore/projects-list */
export async function handleGafcoreProjectsListPost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;

  const result = await listProjectsForUser(userId);
  if (!result.ok) {
    return json({ ok: false, error: result.error }, 503);
  }

  return json({ ok: true, projects: result.projects });
}

/** POST /api/gafcore/projects-create */
export async function handleGafcoreProjectsCreatePost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = CreateProjectInputSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body" }, 400);
  }

  const result = await executeCreateProject(userId, parsed.data);
  if (!result.ok) {
    return json(
      { ok: false, error: result.error, code: result.code, requestId: result.requestId },
      result.code === "SERVER_MISCONFIGURED" ? 503 : 400,
    );
  }

  return json({
    ok: true,
    project: result.project,
    files: result.files,
    requestId: result.requestId,
  });
}

/** POST /api/gafcore/projects-delete */
export async function handleGafcoreProjectsDeletePost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = DeleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body" }, 400);
  }

  const result = await deleteProjectForUser(
    userId,
    parsed.data.projectId,
    parsed.data.approvalId,
  );
  if (!result.ok) {
    return json({ ok: false, error: result.error }, 400);
  }

  return json({ ok: true });
}

/** POST /api/gafcore/projects-files-save */
export async function handleGafcoreProjectsFilesSavePost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = SaveFilesBodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body" }, 400);
  }

  const result = await saveProjectFilesForUser(
    userId,
    parsed.data.projectId,
    parsed.data.files,
  );
  if (!result.ok) {
    return json({ ok: false, error: result.error }, 400);
  }

  return json({ ok: true });
}

/** POST /api/gafcore/project-templates */
export async function handleGafcoreProjectTemplatesPost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;

  const result = await listProjectTemplatesForUser(userId);
  if (!result.ok) {
    return json({ ok: false, error: result.error }, 503);
  }

  return json({ ok: true, templates: result.templates });
}
