import type { PrismaClient } from "@prisma/client";

import { TZ_EL_SALVADOR } from "./tiempo.js";

export const pad = (n: number): string => String(n).padStart(2, "0");

export function fechaParedSV(instante: Date): { anio: number; mes: number; dia: number } {
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

// "YYYY-MM-DD" del instante en El Salvador: la clave de las excepciones.
export function fechaISOSV(instante: Date): string {
  const { anio, mes, dia } = fechaParedSV(instante);
  return `${anio}-${pad(mes)}-${pad(dia)}`;
}

// Día de la semana calculado EN El Salvador. No usamos Date.getDay(): ese mira la TZ
// del proceso y clasifica mal los bordes de medianoche en un server UTC.
const NUMERO_DIA: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function diaSemanaNumSV(instante: Date): number {
  const abreviado = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_EL_SALVADOR,
    weekday: "short",
  }).format(instante);
  // Intl solo emite las 7 abreviaturas de arriba; el ?? es para noUncheckedIndexedAccess.
  return NUMERO_DIA[abreviado] ?? -1;
}

export interface ReglaDia {
  readonly abre: string | null;
  readonly cierra: string | null;
  readonly motivo: string | null;
}

export async function reglaParaFecha(
  prisma: PrismaClient,
  instante: Date,
): Promise<ReglaDia> {
  const excepcion = await prisma.excepcionDisponibilidad.findUnique({
    where: { fecha: fechaISOSV(instante) },
  });
  if (excepcion) {
    return { abre: excepcion.abre, cierra: excepcion.cierra, motivo: excepcion.motivo };
  }

  const regla = await prisma.horarioAtencion.findUnique({
    where: { diaSemana: diaSemanaNumSV(instante) },
  });
  if (!regla) {
    throw new Error(
      "No hay horario de atención configurado para ese día. Corré: pnpm db:seed",
    );
  }
  return { abre: regla.abre, cierra: regla.cierra, motivo: null };
}

export function aMinutos(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) {
    throw new Error(`Hora mal configurada en la base: "${hhmm}" (esperaba HH:MM)`);
  }
  return Number(m[1]) * 60 + Number(m[2]);
}

// Minutos desde medianoche del instante, EN El Salvador.
function minutosDelDiaSV(instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_EL_SALVADOR,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(instante);
  const valor = (tipo: string): number =>
    Number(partes.find((p) => p.type === tipo)?.value ?? "NaN");
  return valor("hour") * 60 + valor("minute");
}

export async function validarContraHorario(
  prisma: PrismaClient,
  instante: Date,
): Promise<string | null> {
  const regla = await reglaParaFecha(prisma, instante);

  if (regla.abre === null || regla.cierra === null) {
    return regla.motivo !== null
      ? `ese día está cerrado (${regla.motivo})`
      : "ese día no se atiende";
  }

  const minutos = minutosDelDiaSV(instante);
  if (minutos < aMinutos(regla.abre) || minutos >= aMinutos(regla.cierra)) {
    return `ese día se atiende de ${regla.abre} a ${regla.cierra}, hora de El Salvador`;
  }
  return null;
}
