import { Prisma, type PrismaClient } from "@prisma/client";

import type { Logger } from "../logger.js";
import type { AssistantMessage, LlmClient } from "../agent/types.js";
import type { RegisteredTool, ToolRegistry } from "../tools/types.js";


interface FakeLead {
  id: string;
  nombre: string;
  telefono: string | null;
  interes: string;
  createdAt: Date;
}

interface FakeCita {
  id: string;
  leadId: string;
  fechaHora: Date;
  motivo: string;
  createdAt: Date;
}

interface FakeHorarioAtencion {
  diaSemana: number;
  abre: string | null;
  cierra: string | null;
}

interface FakeExcepcion {
  fecha: string;
  motivo: string | null;
  abre: string | null;
  cierra: string | null;
}

interface FakeMessage {
  conversationId: string;
  role: string;
  content: string;
  toolName: string | null;
  toolArgs: unknown;
}

export interface FakeDb {
  readonly prisma: PrismaClient;
  readonly leads: FakeLead[];
  readonly citas: FakeCita[];
  readonly messages: FakeMessage[];
  readonly horarios: FakeHorarioAtencion[];
  readonly excepciones: FakeExcepcion[];
}

export function createFakeDb(): FakeDb {
  const leads: FakeLead[] = [];
  const citas: FakeCita[] = [];
  const messages: FakeMessage[] = [];
  const horarios: FakeHorarioAtencion[] = [
    { diaSemana: 0, abre: null, cierra: null },
    { diaSemana: 1, abre: "08:00", cierra: "17:00" },
    { diaSemana: 2, abre: "08:00", cierra: "17:00" },
    { diaSemana: 3, abre: "08:00", cierra: "17:00" },
    { diaSemana: 4, abre: "08:00", cierra: "17:00" },
    { diaSemana: 5, abre: "08:00", cierra: "17:00" },
    { diaSemana: 6, abre: "08:00", cierra: "17:00" },
  ];
  const excepciones: FakeExcepcion[] = [];
  let seq = 0;
  const nextId = (prefijo: string): string => `${prefijo}_${(seq += 1)}`;

  const fake = {
    lead: {
      async create({
        data,
      }: {
        data: { nombre: string; telefono: string | null; interes: string };
      }): Promise<FakeLead> {
        const lead: FakeLead = {
          id: nextId("lead"),
          nombre: data.nombre,
          telefono: data.telefono ?? null,
          interes: data.interes,
          createdAt: new Date(),
        };
        leads.push(lead);
        return lead;
      },
      async upsert({
        where,
        update,
        create,
      }: {
        where: { telefono: string };
        update: { nombre: string; interes: string };
        create: { nombre: string; telefono: string; interes: string };
      }): Promise<FakeLead> {
        const existente = leads.find((l) => l.telefono === where.telefono);
        if (existente) {
          existente.nombre = update.nombre;
          existente.interes = update.interes;
          return existente;
        }
        const lead: FakeLead = {
          id: nextId("lead"),
          nombre: create.nombre,
          telefono: create.telefono,
          interes: create.interes,
          createdAt: new Date(),
        };
        leads.push(lead);
        return lead;
      },
      async findFirst({
        where,
      }: {
        where: {
          OR: Array<{ telefono?: string; nombre?: { equals: string; mode: string } }>;
        };
      }): Promise<FakeLead | null> {
        const coincidencias = leads.filter((l) =>
          where.OR.some(
            (cond) =>
              (cond.telefono !== undefined && l.telefono === cond.telefono) ||
              (cond.nombre !== undefined &&
                l.nombre.toLowerCase() === cond.nombre.equals.toLowerCase()),
          ),
        );
        // orderBy createdAt desc en el código real → devolvemos la última coincidencia.
        return coincidencias.at(-1) ?? null;
      },
    },
    cita: {
      async create({
        data,
      }: {
        data: { leadId: string; fechaHora: Date; motivo: string };
      }): Promise<FakeCita> {
        if (citas.some((c) => c.fechaHora.getTime() === data.fechaHora.getTime())) {
          // Simula el UNIQUE de citas.fechaHora: el anti-doble-booking del código real.
          throw new Prisma.PrismaClientKnownRequestError(
            "Unique constraint failed on the fields: (`fechaHora`)",
            { code: "P2002", clientVersion: "test" },
          );
        }
        const cita: FakeCita = {
          id: nextId("cita"),
          leadId: data.leadId,
          fechaHora: data.fechaHora,
          motivo: data.motivo,
          createdAt: new Date(),
        };
        citas.push(cita);
        return cita;
      },
      async findMany({
        where,
      }: {
        where?: { fechaHora?: { gte?: Date } };
        select?: { fechaHora?: boolean };
      } = {}): Promise<Array<{ fechaHora: Date }>> {
        const gte = where?.fechaHora?.gte;
        return citas
          .filter((c) => (gte ? c.fechaHora.getTime() >= gte.getTime() : true))
          .map((c) => ({ fechaHora: c.fechaHora }));
      },
    },
    horarioAtencion: {
      async findUnique({
        where,
      }: {
        where: { diaSemana: number };
      }): Promise<FakeHorarioAtencion | null> {
        return horarios.find((h) => h.diaSemana === where.diaSemana) ?? null;
      },
    },
    excepcionDisponibilidad: {
      async findUnique({
        where,
      }: {
        where: { fecha: string };
      }): Promise<FakeExcepcion | null> {
        return excepciones.find((e) => e.fecha === where.fecha) ?? null;
      },
    },
    message: {
      async create({
        data,
      }: {
        data: {
          conversationId: string;
          role: string;
          content: string;
          toolName: string | null;
          toolArgs: unknown;
        };
      }): Promise<FakeMessage> {
        const mensaje: FakeMessage = {
          conversationId: data.conversationId,
          role: data.role,
          content: data.content,
          toolName: data.toolName,
          toolArgs: data.toolArgs,
        };
        messages.push(mensaje);
        return mensaje;
      },
    },
  };

  return { prisma: fake as unknown as PrismaClient, leads, citas, messages, horarios, excepciones };
}

export function createFakeLogger(): Logger {
  const noop = (): void => { };
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    fatal: noop,
    trace: noop,
  } as unknown as Logger;
}

// LLM scripteado: devuelve respuestas predefinidas en orden. Al agotarlas repite la
// última (útil para simular un modelo que insiste con la misma tool y dispara el corte
// del loop acotado). `calls()` expone cuántas veces se invocó al modelo.
export function scriptedLlm(responses: readonly AssistantMessage[]): {
  readonly llm: LlmClient;
  calls(): number;
} {
  let i = 0;
  const llm: LlmClient = {
    async chat() {
      const idx = Math.min(i, responses.length - 1);
      i += 1;
      const respuesta = responses[idx];
      if (respuesta === undefined) {
        throw new Error("scriptedLlm: no hay respuestas definidas");
      }
      return respuesta;
    },
  };
  return { llm, calls: () => i };
}

export function fakeRegistry(tools: readonly RegisteredTool[]): ToolRegistry {
  const porNombre = new Map(tools.map((t) => [t.name, t]));
  return {
    definitions: tools.map((t) => t.definition),
    get: (name) => porNombre.get(name),
  };
}
