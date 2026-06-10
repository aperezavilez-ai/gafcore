/**
 * CRUD de proyectos por HTTP — invocado desde `server.ts` sin pasar por el entry SSR
 * (en Vercel POST vía TanStack devuelve HTTPError 500).
 */
import { z } from "zod";
import { requireGafcoreApiUser } from "@/lib/gafcore-api-auth.server";
import {
  createProjectForUser,
  deleteProjectForUser,
  listProjectTemplatesForUser,
  listProjectsForUser,
} from "@/lib/gafcore-projects-api.server";
import { validateTemplateFiles } from "@/lib/gafcore-templates.shared";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

const FileRowSchema = z.object({
  name: z.string().min(1).max(512),
  language: z.string().max(64).optional(),
  content: z.string().max(500_000),
});

const CreateBodySchema = z
  .object({
    name: z.string().min(1).max(200),
    templateSlug: z.string().min(1).max(80).optional(),
    files: z.array(FileRowSchema).max(500).optional(),
  })
  .refine((d) => !(d.files?.length && d.templateSlug), {
    message: "Usa plantilla o archivos importados, no ambos",
  });

const DeleteBodySchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().min(1).max(128).optional(),
});

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

  const parsed = CreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body" }, 400);
  }

  const customFiles = parsed.data.files?.length
    ? validateTemplateFiles(parsed.data.files)
    : undefined;

  const result = await createProjectForUser(userId, parsed.data.name, {
    templateSlug: parsed.data.templateSlug,
    customFiles,
  });
  if (!result.ok) {
    return json({ ok: false, error: result.error }, 400);
  }

  return json({
    ok: true,
    project: result.project,
    files: result.files,
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
