import { defineTool } from "./types.js";
import { listarHorariosSchema } from "./schemas.js";
import { enHoraLocal, OFFSET_EL_SALVADOR, TZ_EL_SALVADOR } from "./tiempo.js";
import { DIA_CERRADO, HORA_APERTURA, HORA_CIERRE, diaSemanaSV } from "./calendario.js";

const MAX_OFRECIDOS = 3; // pocos y claros: no abrumamos al modelo ni al cliente
// Un día completo tiene 18 slots (8:00–16:30). Cuando el cliente preguntó por ESE día,
// devolverlos todos es información factual, no ruido: evita el falso "no hay".
const MAX_DIA_PUNTUAL = 18;

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

const UN_DIA_MS = 24 * 60 * 60 * 1000;

export const listarHorarios = defineTool({
  name: "listar_horarios_disponibles",
  description:
    "Devuelve horarios libres para agendar, ya calculados con su día y fecha correctos y sin los ocupados. Llamala SIEMPRE antes de ofrecer u opinar sobre horarios. Si el cliente pregunta por un día puntual, pasá ese día en 'fecha' (YYYY-MM-DD). Ofrecé solo lo que devuelva (campo 'etiqueta') y, al agendar, pasale a agendar_cita el campo 'iso' tal cual.",
  parameters: {
    type: "object",
    properties: {
      dias: {
        type: "integer",
        description: "Cuántos días hacia adelante mirar (opcional, por defecto 7)",
      },
      fecha: {
        type: "string",
        description:
          "Día puntual que pidió el cliente, formato YYYY-MM-DD (opcional)",
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

    // Días candidatos: el puntual que pidió el cliente, o el horizonte desde hoy.
    let candidatos: Date[];
    let maximo: number;

    if (args.fecha !== undefined) {
      const diaPedido = new Date(`${args.fecha}T00:00:00${OFFSET_EL_SALVADOR}`);
      if (Number.isNaN(diaPedido.getTime())) {
        return { ok: false, error: `La fecha ${args.fecha} no existe en el calendario.` };
      }
      if (diaPedido.getTime() < medianocheHoy) {
        return { ok: false, error: `${args.fecha} ya pasó; pedile al cliente una fecha futura.` };
      }
      if (diaSemanaSV(diaPedido) === DIA_CERRADO) {
        return { ok: false, error: "Ese día es domingo y no se atiende; ofrecé otro día de lunes a sábado." };
      }
      candidatos = [diaPedido];
      maximo = MAX_DIA_PUNTUAL;
    } else {
      candidatos = [];
      for (let i = 0; i <= args.dias; i += 1) {
        const baseDia = new Date(medianocheHoy + i * UN_DIA_MS);
        if (diaSemanaSV(baseDia) === DIA_CERRADO) continue;
        candidatos.push(baseDia);
      }
      maximo = MAX_OFRECIDOS;
    }

    const horarios: Array<{ etiqueta: string; iso: string }> = [];

    for (const baseDia of candidatos) {
      if (horarios.length >= maximo) break;
      const { anio, mes, dia } = fechaParedSV(baseDia);

      for (let h = HORA_APERTURA; h < HORA_CIERRE && horarios.length < maximo; h += 1) {
        for (const min of [0, 30]) {
          // iso SIN zona: es lo que espera agendar_cita, que le ancla -06:00 al validar.
          const iso = `${anio}-${pad(mes)}-${pad(dia)}T${pad(h)}:${pad(min)}:00`;
          const instante = new Date(`${iso}${OFFSET_EL_SALVADOR}`);

          if (instante.getTime() <= ahora.getTime()) continue; // ya pasó
          if (tomadas.has(instante.getTime())) continue; // ocupado

          horarios.push({ etiqueta: enHoraLocal(instante), iso });
          if (horarios.length >= maximo) break;
        }
      }
    }

    if (horarios.length === 0) {
      return {
        ok: false,
        error:
          args.fecha !== undefined
            ? `No quedan horarios libres el ${args.fecha}. Ofrecé otro día.`
            : "No hay horarios libres en el rango pedido. Probá con un horizonte de más días.",
      };
    }

    return { ok: true, data: { horarios } };
  },
});
