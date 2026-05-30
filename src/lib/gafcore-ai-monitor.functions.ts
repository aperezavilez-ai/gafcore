import { createServerFn } from "@tanstack/react-start";
import { requireGafcoreAdmin } from "@/lib/server-fns/require-gafcore-admin.middleware";
import { validarIA } from "@/lib/gafcore-ai-monitor.server";

/** Detector de errores en código generado (admin). */
export const runValidarIA = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .handler(async () => validarIA());
