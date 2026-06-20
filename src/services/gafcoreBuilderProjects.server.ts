import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Persistencia de proyectos del Builder V2.
 *
 * Reutiliza las tablas YA EXISTENTES `public.projects` y
 * `public.project_files` (no se crean tablas nuevas). El HTML generado
 * se guarda como un único archivo `index.html` (language = "html") por
 * proyecto.
 *
 * Convención: los proyectos creados desde Builder V2 se marcan con
 * `source = 'builder-v2'` en `public.projects` (columna agregada por la
 * migración `supabase_migration_add_source.sql`).
 *
 * Nota de esquema real (verificado en Supabase):
 * - public.projects: id, name, created_at, user_id, source, ... (NO tiene updated_at)
 * - public.project_files: id, project_id, name, language, content, created_at (NO tiene updated_at)
 */

const BUILDER_SOURCE = "builder-v2";
const INDEX_FILE_NAME = "index.html";
const INDEX_FILE_LANGUAGE = "html";

export interface BuilderProjectSummary {
  id: string;
  name: string;
  createdAt: string;
}

export interface BuilderProjectWithHtml extends BuilderProjectSummary {
  html: string;
}

/**
 * Lista los proyectos del Builder V2 del usuario, más recientes primero.
 */
export async function listBuilderProjects(
  userId: string,
): Promise<BuilderProjectSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id, name, created_at")
    .eq("user_id", userId)
    .eq("source", BUILDER_SOURCE)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`No se pudieron listar los proyectos: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  }));
}

/**
 * Carga un proyecto del Builder V2 (metadatos + HTML).
 * Devuelve null si no existe o no pertenece al usuario.
 */
export async function loadBuilderProject(
  userId: string,
  projectId: string,
): Promise<BuilderProjectWithHtml | null> {
  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("id, name, created_at")
    .eq("id", projectId)
    .eq("user_id", userId)
    .eq("source", BUILDER_SOURCE)
    .maybeSingle();

  if (projectError) {
    throw new Error(`No se pudo cargar el proyecto: ${projectError.message}`);
  }

  if (!project) return null;

  const { data: file, error: fileError } = await supabaseAdmin
    .from("project_files")
    .select("content")
    .eq("project_id", projectId)
    .eq("name", INDEX_FILE_NAME)
    .maybeSingle();

  if (fileError) {
    throw new Error(`No se pudo cargar el HTML del proyecto: ${fileError.message}`);
  }

  return {
    id: project.id,
    name: project.name,
    createdAt: project.created_at,
    html: file?.content ?? "",
  };
}

/**
 * Crea o actualiza un proyecto del Builder V2.
 * Si projectId es null, crea un proyecto nuevo.
 * Si projectId existe, actualiza nombre + HTML (verificando que sea del usuario).
 */
export async function saveBuilderProject(
  userId: string,
  params: { projectId: string | null; name: string; html: string },
): Promise<BuilderProjectWithHtml> {
  const { projectId, name, html } = params;
  const now = new Date().toISOString();

  let resolvedProjectId = projectId;

  if (resolvedProjectId) {
    // Actualizar proyecto existente (verificando propiedad).
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", resolvedProjectId)
      .eq("user_id", userId)
      .eq("source", BUILDER_SOURCE)
      .maybeSingle();

    if (existingError) {
      throw new Error(`No se pudo verificar el proyecto: ${existingError.message}`);
    }
    if (!existing) {
      throw new Error("El proyecto no existe o no pertenece al usuario.");
    }

    const { error: updateError } = await supabaseAdmin
      .from("projects")
      .update({ name })
      .eq("id", resolvedProjectId);

    if (updateError) {
      throw new Error(`No se pudo actualizar el proyecto: ${updateError.message}`);
    }
  } else {
    // Crear proyecto nuevo.
    const { data: created, error: createError } = await supabaseAdmin
      .from("projects")
      .insert({
        user_id: userId,
        name,
        source: BUILDER_SOURCE,
        created_at: now,
      })
      .select("id")
      .single();

    if (createError || !created) {
      throw new Error(
        `No se pudo crear el proyecto: ${createError?.message ?? "sin datos"}`,
      );
    }

    resolvedProjectId = created.id;
  }

  // Ver si ya existe el archivo index.html para este proyecto.
  const { data: existingFile, error: existingFileError } = await supabaseAdmin
    .from("project_files")
    .select("id")
    .eq("project_id", resolvedProjectId)
    .eq("name", INDEX_FILE_NAME)
    .maybeSingle();

  if (existingFileError) {
    throw new Error(
      `No se pudo verificar el archivo del proyecto: ${existingFileError.message}`,
    );
  }

  if (existingFile) {
    const { error: updateFileError } = await supabaseAdmin
      .from("project_files")
      .update({ content: html, language: INDEX_FILE_LANGUAGE })
      .eq("id", existingFile.id);

    if (updateFileError) {
      throw new Error(
        `No se pudo actualizar el HTML del proyecto: ${updateFileError.message}`,
      );
    }
  } else {
    const { error: insertFileError } = await supabaseAdmin
      .from("project_files")
      .insert({
        project_id: resolvedProjectId,
        name: INDEX_FILE_NAME,
        language: INDEX_FILE_LANGUAGE,
        content: html,
        created_at: now,
      });

    if (insertFileError) {
      throw new Error(
        `No se pudo guardar el HTML del proyecto: ${insertFileError.message}`,
      );
    }
  }

  return {
    id: resolvedProjectId as string,
    name,
    createdAt: now,
    html,
  };
}

/**
 * Renombra un proyecto del Builder V2 sin tocar su HTML.
 */
export async function renameBuilderProject(
  userId: string,
  params: { projectId: string; name: string },
): Promise<BuilderProjectSummary> {
  const { projectId, name } = params;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("projects")
    .select("id, created_at")
    .eq("id", projectId)
    .eq("user_id", userId)
    .eq("source", BUILDER_SOURCE)
    .maybeSingle();

  if (existingError) {
    throw new Error(`No se pudo verificar el proyecto: ${existingError.message}`);
  }
  if (!existing) {
    throw new Error("El proyecto no existe o no pertenece al usuario.");
  }

  const { error: updateError } = await supabaseAdmin
    .from("projects")
    .update({ name })
    .eq("id", projectId);

  if (updateError) {
    throw new Error(`No se pudo renombrar el proyecto: ${updateError.message}`);
  }

  return {
    id: projectId,
    name,
    createdAt: existing.created_at,
  };
}

/**
 * Elimina un proyecto del Builder V2 y su archivo asociado.
 */
export async function deleteBuilderProject(
  userId: string,
  projectId: string,
): Promise<void> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .eq("source", BUILDER_SOURCE)
    .maybeSingle();

  if (existingError) {
    throw new Error(`No se pudo verificar el proyecto: ${existingError.message}`);
  }
  if (!existing) {
    throw new Error("El proyecto no existe o no pertenece al usuario.");
  }

  // Eliminar archivos asociados primero (por si no hay cascade configurado).
  const { error: filesDeleteError } = await supabaseAdmin
    .from("project_files")
    .delete()
    .eq("project_id", projectId);

  if (filesDeleteError) {
    throw new Error(
      `No se pudieron eliminar los archivos del proyecto: ${filesDeleteError.message}`,
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (deleteError) {
    throw new Error(`No se pudo eliminar el proyecto: ${deleteError.message}`);
  }
}
