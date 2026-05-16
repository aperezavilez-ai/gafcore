import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enrichGafcoreOutputFiles } from "@/lib/gafcore-media.server";

const fileSchema = z.object({
  name: z.string().min(1).max(512),
  content: z.string().max(500_000),
  language: z.string().optional(),
});

export const enrichGafcoreMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        files: z.array(fileSchema).max(40),
        projectFiles: z.array(fileSchema).max(80).optional(),
        instruction: z.string().max(8000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const instruction = data.instruction ?? "";
    const projectFiles = data.projectFiles ?? [];
    const files = await enrichGafcoreOutputFiles(data.files, projectFiles, instruction);
    return { files };
  });
