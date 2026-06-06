import { Prisma } from "@prisma/client";

import { defineTool } from "./types.js";
import { agendarCitaSchema } from "./schemas.js";

// El instante se guarda en UTC; al humano (modelo incluido) le mostramos la hora de
// pared de El Salvador, no el UTC, para que confirme "10:00" y no "16:00".
function enHoraLocal(fecha: Date): string {
  return fecha.toLocaleString("es-SV", {
    timeZone: "America/El_Salvador",
    dateStyle: "full",
    timeStyle: "short",
  });
}

export const agendarCita = defineTool({
  name: "agendar_cita",
  description:
    "Agenda una cita para un lead YA guardado. El campo 'lead' es el nombre o teléfono del cliente tal como lo guardaste. Las horas válidas caen en punto (:00) o y media (:30) y deben ser futuras.",
  parameters: {
    type: "object",
    properties: {
      lead: {
        type: "string",
        description: "Nombre o teléfono del lead ya guardado",
      },
      fecha_hora: {
        type: "string",
        description:
          "Fecha y hora en ISO 8601, por ejemplo 2026-06-10T15:00:00. Debe caer en :00 o :30 y ser futura.",
      },
      motivo: { type: "string", description: "Motivo de la cita" },
    },
    required: ["lead", "fecha_hora", "motivo"],
    additionalProperties: false,
  },
  schema: agendarCitaSchema,
  async execute(args, ctx) {
    const lead = await ctx.prisma.lead.findFirst({
      where: {
        OR: [
          { telefono: args.lead },
          { nombre: { equals: args.lead, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    if (!lead) {
      return {
        ok: false,
        error: `No encontré ningún lead que coincida con "${args.lead}". Guardá el lead primero con guardar_lead.`,
      };
    }

    try {
      const cita = await ctx.prisma.cita.create({
        data: { leadId: lead.id, fechaHora: args.fecha_hora, motivo: args.motivo },
      });

      ctx.logger.info({ citaId: cita.id, leadId: lead.id }, "cita agendada");

      return {
        ok: true,
        data: {
          id: cita.id,
          lead: lead.nombre,
          fecha_hora: enHoraLocal(cita.fechaHora),
          motivo: cita.motivo,
        },
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return {
          ok: false,
          error: `Ese horario (${enHoraLocal(args.fecha_hora)}) ya está ocupado. Ofrecé otro horario al cliente.`,
        };
      }
      throw err;
    }
  },
});
