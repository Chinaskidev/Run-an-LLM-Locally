import { Prisma, type PrismaClient } from "@prisma/client";

import type { Logger } from "../logger.js";
import type { AssistantMessage, LlmClient } from "../agent/types.js";
import type { RegisteredTool, ToolRegistry } from "../tools/types.js";

// Dobles de prueba para correr el agente sin Postgres ni Ollama: todo en memoria y
// determinista. El fake implementa SOLO los métodos de Prisma que tocan las tools y el
// loop; el resto de la superficie de PrismaClient no se ejerce en estos tests, por eso
// el doble cast `as unknown as PrismaClient` está justificado.

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
}

export function createFakeDb(): FakeDb {
  const leads: FakeLead[] = [];
  const citas: FakeCita[] = [];
  const messages: FakeMessage[] = [];
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

  return { prisma: fake as unknown as PrismaClient, leads, citas, messages };
}

export function createFakeLogger(): Logger {
  const noop = (): void => {};
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
