// Reglas de negocio del calendario, en un solo lugar. Viven en el CÓDIGO, no en el
// prompt: un modelo chico no decide la disponibilidad, solo ofrece lo que las tools
// le devuelven ya resuelto.

import { TZ_EL_SALVADOR } from "./tiempo.js";

export const HORA_APERTURA = 8; // primer slot 08:00
export const HORA_CIERRE = 17; // último slot 16:30 (la cita de media hora cierra a las 17:00)
export const DIA_CERRADO = "Sun"; // se atiende lun–sáb; solo el domingo no

// Día de la semana (abreviado en-US: "Sun".."Sat") calculado EN El Salvador. No usamos
// Date.getDay(): ese mira la TZ del proceso y clasifica mal los bordes de medianoche en
// un server UTC. Acá el criterio es siempre la zona del negocio.
export function diaSemanaSV(instante: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_EL_SALVADOR,
    weekday: "short",
  }).format(instante);
}

// Hora de pared (0-23) del instante EN El Salvador, por la misma razón que arriba.
function horaSV(instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_EL_SALVADOR,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(instante);
  return Number(partes.find((p) => p.type === "hour")?.value ?? "NaN");
}

// null = horario válido; string = motivo del rechazo, redactado para que el modelo
// se lo pueda explicar al cliente y ofrecer una alternativa.
export function validarContraHorario(instante: Date): string | null {
  if (diaSemanaSV(instante) === DIA_CERRADO) {
    return "los domingos no se atiende; ofrecé un día de lunes a sábado";
  }
  const hora = horaSV(instante);
  if (hora < HORA_APERTURA || hora >= HORA_CIERRE) {
    return `se atiende de ${HORA_APERTURA}:00 a ${HORA_CIERRE}:00, hora de El Salvador`;
  }
  return null;
}
