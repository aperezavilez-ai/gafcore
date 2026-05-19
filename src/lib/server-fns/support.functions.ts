import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  completeChatMessage,
  getGafcoreAiGateway,
  resolveGatewayModel,
} from "@/lib/gafcore-ai-gateway.server";

const SYSTEM_PROMPT = `Eres "Gafia", la asistente virtual de soporte de **GafCore**, la plataforma de creación con IA (chat, preview en vivo y editor de código).

Conocimiento clave:
- **GafCore IDE**: En /gafcore/app puedes describir tu idea, iterar con el chat y ver el preview en vivo.
- **Créditos**: Los planes de GafCore incluyen créditos mensuales para generación con IA; los administradores internos pueden tener uso ampliado.
- **Planes y facturación**: Desde la landing /gafcore (#planes) o Ajustes del proyecto.
- **Cupones y promos**: Si el usuario tiene un código, debe aplicarlo donde indique el checkout o soporte.

Reglas de respuesta:
1. Responde SIEMPRE en el idioma del usuario (predeterminado: español).
2. Sé breve, claro y amable. Usa **markdown** y emojis con moderación.
3. Si el problema requiere intervención humana (reembolsos, eliminar cuenta, fallos de pago), indica que escriba a soporte@gafcore.com o use el botón de ticket si está disponible.
4. NO inventes precios, fechas o funciones que no estén en el conocimiento de arriba.
5. Si preguntan por distribución musical, estudios de otro producto o módulos que ya no forman parte de esta app, explica con tacto que GafCore se centra en creación con IA y ofrece ayuda solo dentro de ese alcance.`;

const messageSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .min(1)
    .max(30),
});

export const supportChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => messageSchema.parse(input))
  .handler(async ({ data }) => {
    const gateway = getGafcoreAiGateway();
    const model = resolveGatewayModel(gateway, { tier: "support" });

    const completed = await completeChatMessage({
      model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...data.messages],
    });
    const reply = completed.content || "Lo siento, no pude responder.";
    return { reply };
  });

export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subject: string; message: string; category: string }) => {
    if (!input.subject?.trim() || !input.message?.trim()) throw new Error("Faltan datos");
    if (input.subject.length > 200 || input.message.length > 4000) throw new Error("Texto muy largo");
    const cat = ["billing", "technical", "account", "general"].includes(input.category)
      ? input.category
      : "general";
    return { subject: input.subject.trim(), message: input.message.trim(), category: cat };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: userId, ...data })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { ticket };
  });

export const getMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });
    return { tickets: data || [] };
  });
