import { defineTool } from "./types.js";
import { listarHorariosSchema } from "./schemas.js";
import { enHoraLocal, OFFSET_EL_SALVADOR } from "./tiempo.js";
import { aMinutos, fechaParedSV, pad, reglaParaFecha } from "./calendario.js";

const MAX_OFRECIDOS = 3; // pocos y claros: no abrumamos al modelo ni al cliente
// Un día completo con el horario default tiene 18 slots (8:00–16:30). Cuando el
// cliente preguntó por ESE día, devolverlos todos evita el falso "no hay".
const MAX_DIA_PUNTUAL = 18;

const UN_DIA_MS = 24 * 60 * 60 * 1000;

export const listarHorarios = defineTool({
  name: "listar_horarios_disponibles",
  description:
    "Devuelve horarios libres para agendar, ya calculados con su día y fecha correctos y sin los ocupados. Llamala SIEMPRE antes de ofrecer u opinar sobre horarios.Si el cliente pregunta por un día puntual, pasá ese día en 'fecha' (YYYY-MM-DD). Ofrecé solo lo que devuelva (campo 'etiqueta') y, al agendar, pasale a agendar_cita el campo 'iso' tal cual.",
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
      candidatos = [diaPedido];
      maximo = MAX_DIA_PUNTUAL;
    } else {
      candidatos = [];
      for (let i = 0; i <= args.dias; i += 1) {
        candidatos.push(new Date(medianocheHoy + i * UN_DIA_MS));
      }
      maximo = MAX_OFRECIDOS;
    }

    const horarios: Array<{ etiqueta: string; iso: string }> = [];

    for (const baseDia of candidatos) {
      if (horarios.length >= maximo) break;

      const regla = await reglaParaFecha(ctx.prisma, baseDia);
      if (regla.abre === null || regla.cierra === null) {
        // Día cerrado: en modo horizonte se saltea; si el cliente pidió ESE día,
        // se le explica el motivo real (dato de la base, no invención del modelo).
        if (args.fecha !== undefined) {
          return {
            ok: false,
            error:
              regla.motivo !== null
                ? `El ${args.fecha} está cerrado (${regla.motivo}). Ofrecé otro día.`
                : `El ${args.fecha} no se atiende. Ofrecé otro día.`,
          };
        }
        continue;
      }

      const { anio, mes, dia } = fechaParedSV(baseDia);
      const desde = aMinutos(regla.abre);
      const hasta = aMinutos(regla.cierra);

      for (let min = desde; min < hasta && horarios.length < maximo; min += 30) {
        const h = Math.floor(min / 60);
        const m = min % 60;
        // iso SIN zona: es lo que espera agendar_cita, que le ancla -06:00 al validar.
        const iso = `${anio}-${pad(mes)}-${pad(dia)}T${pad(h)}:${pad(m)}:00`;
        const instante = new Date(`${iso}${OFFSET_EL_SALVADOR}`);

        if (instante.getTime() <= ahora.getTime()) continue; // ya pasó
        if (tomadas.has(instante.getTime())) continue; // ocupado

        horarios.push({ etiqueta: enHoraLocal(instante), iso });
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

    // La lista del horizonte es PARCIAL a propósito (pocos slots para no abrumar).
    // Se lo decimos al modelo en el propio resultado: si no, la trata como exhaustiva
    // y rechaza horarios válidos que nunca vio ("solo tengo estos 3").
    if (args.fecha !== undefined) {
      return { ok: true, data: { horarios } };
    }
    return {
      ok: true,
      data: {
        horarios,
        nota: "Lista PARCIAL: solo los primeros horarios libres, hay más disponibilidad. Si el cliente propone otro día u hora, consultá ese día con 'fecha' o intentá agendar_cita directamente. NUNCA digas que un horario no está disponible solo porque no aparece en esta lista.",
      },
    };
  },
});
