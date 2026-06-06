import { defineTool } from "./types.js";
import { guardarLeadSchema } from "./schemas.js";

export const guardarLead = defineTool({
  name: "guardar_lead",
  description:
    "Guarda un lead (cliente potencial) en la base de datos. Usala apenas tengas al menos el nombre y el interés del cliente.",
  parameters: {
    type: "object",
    properties: {
      nombre: { type: "string", description: "Nombre del cliente" },
      telefono: { type: "string", description: "Teléfono del cliente (opcional)" },
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
    const lead = args.telefono
      ? await ctx.prisma.lead.upsert({
          where: { telefono: args.telefono },
          update: { nombre: args.nombre, interes: args.interes },
          create: { nombre: args.nombre, telefono: args.telefono, interes: args.interes },
        })
      : await ctx.prisma.lead.create({
          data: { nombre: args.nombre, telefono: null, interes: args.interes },
        });

    ctx.logger.info({ leadId: lead.id }, "lead guardado");

    return {
      ok: true,
      data: {
        id: lead.id,
        nombre: lead.nombre,
        telefono: lead.telefono,
        interes: lead.interes,
      },
    };
  },
});
