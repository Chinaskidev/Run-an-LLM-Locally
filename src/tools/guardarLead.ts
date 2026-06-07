import { defineTool } from "./types.js";
import { guardarLeadSchema } from "./schemas.js";

export const guardarLead = defineTool({
  name: "guardar_lead",
  description:
    "Guarda un lead (cliente potencial) en la base de datos. Usala apenas tengas al menos el nombre, el interés y un contacto (teléfono o email) del cliente.",
  parameters: {
    type: "object",
    properties: {
      nombre: { type: "string", description: "Nombre del cliente" },
      telefono: {
        type: "string",
        description: "Teléfono del cliente (opcional si hay email)",
      },
      email: {
        type: "string",
        description: "Email del cliente (opcional si hay teléfono)",
      },
      interes: {
        type: "string",
        description: "Producto o servicio que le interesa al cliente",
      },
    },
    required: ["nombre", "interes"],
    additionalProperties: false,
  },
  schema: guardarLeadSchema,
  async execute(args, ctx) {
    // Clave natural de idempotencia: teléfono si lo hay, si no email. El ternario
    // anidado deja que TS estreche cada rama a string (el guard de dos variables no
    // propagaría ese narrowing). El .refine() del schema ya exige al menos un contacto.
    const where = args.telefono
      ? { telefono: args.telefono }
      : args.email
        ? { email: args.email }
        : undefined;

    if (!where) {
      // Inalcanzable salvo que cambie el schema: sin contacto no hay clave natural.
      return { ok: false, error: "hace falta al menos un contacto: teléfono o email" };
    }

    const datos = {
      nombre: args.nombre,
      interes: args.interes,
      ...(args.telefono ? { telefono: args.telefono } : {}),
      ...(args.email ? { email: args.email } : {}),
    };

    const lead = await ctx.prisma.lead.upsert({
      where,
      update: datos,
      create: datos,
    });

    ctx.logger.info({ leadId: lead.id }, "lead guardado");

    return {
      ok: true,
      data: {
        id: lead.id,
        nombre: lead.nombre,
        telefono: lead.telefono,
        email: lead.email,
        interes: lead.interes,
      },
    };
  },
});
