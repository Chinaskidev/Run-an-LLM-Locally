import { defineTool } from "./types.js";
import { listarHorariosSchema } from "./schemas.js";
import { enHoraLocal, OFFSET_EL_SALVADOR, TZ_EL_SALVADOR } from "./tiempo.js";

// Reglas de negocio del calendario. Viven en el CÓDIGO, no en el prompt: un modelo chico
// no decide la disponibilidad, solo ofrece lo que esta tool le devuelve ya resuelto.
const HORA_APERTURA = 8; // primer slot 08:00
const HORA_CIERRE = 17; // último slot 16:30 (la cita de media hora cierra a las 17:00)
const MAX_OFRECIDOS = 3; // pocos y claros: no abrumamos al modelo ni al cliente
const DIA_CERRADO = "Sun"; // se atiende lun–sáb; solo el domingo no

const pad = (n: number): string => String(n).padStart(2, "0");

// Fecha de pared (Y-M-D) de un instante EN El Salvador, sin depender de la TZ del
// proceso. `formatToParts` evita el split frágil de un string formateado.
function fechaParedSV(instante: Date): { anio: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_EL_SALVADOR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instante);
  const valor = (tipo: string): number =>
    Number(partes.find((p) => p.type === tipo)?.value ?? "NaN");
  return { anio: valor("year"), mes: valor("month"), dia: valor("day") };
}

// Día de la semana (abreviado en-US: "Sun".."Sat") calculado EN El Salvador. No usamos
// Date.getDay(): ese mira la TZ del proceso y clasifica mal los bordes de medianoche en
// un server UTC. Acá el criterio es siempre la zona del negocio.
function diaSemanaSV(instante: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_EL_SALVADOR,
    weekday: "short",
  }).format(instante);
}

const UN_DIA_MS = 24 * 60 * 60 * 1000;

export const listarHorarios = defineTool({
  name: "listar_horarios_disponibles",
  description:
    "Devuelve los próximos horarios libres para agendar, ya calculados con su día y fecha correctos y sin los que ya están ocupados. Llamala SIEMPRE antes de ofrecerle horarios al cliente: ofrecé solo lo que devuelva (campo 'etiqueta') y, al agendar, pasale a agendar_cita el campo 'iso' tal cual.",
  parameters: {
    type: "object",
    properties: {
      dias: {
        type: "integer",
        description: "Cuántos días hacia adelante mirar (opcional, por defecto 7)",
      },
    },
    required: [],
    additionalProperties: false,
  },
  schema: listarHorariosSchema,
  async execute(args, ctx) {
    const ahora = new Date();

    // Slots ya tomados a futuro: los restamos para no proponer un horario ocupado (el
    // UNIQUE de citas.fechaHora sigue siendo la red final ante una carrera entre dos
    // clientes; esto solo adelanta el filtro para una mejor conversación).
    const ocupadas = await ctx.prisma.cita.findMany({
      where: { fechaHora: { gte: ahora } },
      select: { fechaHora: true },
    });
    const tomadas = new Set(ocupadas.map((c) => c.fechaHora.getTime()));

    // Medianoche de HOY en El Salvador, como instante. Avanzar de a 24h cae siempre en el
    // día calendario siguiente porque el país no tiene horario de verano.
    const hoy = fechaParedSV(ahora);
    const medianocheHoy = Date.parse(
      `${hoy.anio}-${pad(hoy.mes)}-${pad(hoy.dia)}T00:00:00${OFFSET_EL_SALVADOR}`,
    );

    const horarios: Array<{ etiqueta: string; iso: string }> = [];

    for (let i = 0; i <= args.dias && horarios.length < MAX_OFRECIDOS; i += 1) {
      const baseDia = new Date(medianocheHoy + i * UN_DIA_MS);
      if (diaSemanaSV(baseDia) === DIA_CERRADO) continue;
      const { anio, mes, dia } = fechaParedSV(baseDia);

      for (let h = HORA_APERTURA; h < HORA_CIERRE; h += 1) {
        for (const min of [0, 30]) {
          // iso SIN zona: es lo que espera agendar_cita, que le ancla -06:00 al validar.
          const iso = `${anio}-${pad(mes)}-${pad(dia)}T${pad(h)}:${pad(min)}:00`;
          const instante = new Date(`${iso}${OFFSET_EL_SALVADOR}`);

          if (instante.getTime() <= ahora.getTime()) continue; // ya pasó
          if (tomadas.has(instante.getTime())) continue; // ocupado

          horarios.push({ etiqueta: enHoraLocal(instante), iso });
          if (horarios.length >= MAX_OFRECIDOS) break;
        }
        if (horarios.length >= MAX_OFRECIDOS) break;
      }
    }

    if (horarios.length === 0) {
      return {
        ok: false,
        error:
          "No hay horarios libres en el rango pedido. Probá con un horizonte de más días.",
      };
    }

    return { ok: true, data: { horarios } };
  },
});
