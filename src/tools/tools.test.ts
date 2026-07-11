import { test } from "node:test";
import assert from "node:assert/strict";

import { guardarLead } from "./guardarLead.js";
import { agendarCita } from "./agendarCita.js";
import { listarHorarios } from "./listarHorarios.js";
import { OFFSET_EL_SALVADOR, TZ_EL_SALVADOR } from "./tiempo.js";
import type { ToolContext } from "./types.js";
import { createFakeDb, createFakeLogger } from "../test/helpers.js";

interface Horario {
  etiqueta: string;
  iso: string;
}

// El executor garantiza la forma; el cast evita arrastrar `unknown` por todo el test.
function horariosDe(data: Record<string, unknown>): Horario[] {
  return data.horarios as Horario[];
}

function contexto() {
  const db = createFakeDb();
  const ctx: ToolContext = {
    prisma: db.prisma,
    logger: createFakeLogger(),
    conversationId: "test",
  };
  return { db, ctx };
}

const FUTURO = "2030-06-10T15:00:00";

test("guardarLead: persiste un lead nuevo", async () => {
  const { db, ctx } = contexto();
  const r = await guardarLead.run(
    { nombre: "Sandra", interes: "agente IA", telefono: "78402040" },
    ctx,
  );
  assert.ok(r.ok);
  assert.equal(db.leads.length, 1);
  assert.equal(db.leads[0]?.nombre, "Sandra");
});

test("guardarLead: es idempotente por teléfono (upsert, no duplica)", async () => {
  const { db, ctx } = contexto();
  await guardarLead.run(
    { nombre: "Sandra", interes: "interés viejo", telefono: "78402040" },
    ctx,
  );
  await guardarLead.run(
    { nombre: "Sandra", interes: "interés nuevo", telefono: "78402040" },
    ctx,
  );
  assert.equal(db.leads.length, 1);
  assert.equal(db.leads[0]?.interes, "interés nuevo");
});

test("guardarLead: rechaza args inválidos antes de tocar la base", async () => {
  const { db, ctx } = contexto();
  const r = await guardarLead.run({ nombre: "Sandra" }, ctx);
  assert.ok(!r.ok);
  assert.equal(db.leads.length, 0);
});

test("agendarCita: falla si el lead no existe", async () => {
  const { db, ctx } = contexto();
  const r = await agendarCita.run(
    { lead: "fantasma", fecha_hora: FUTURO, motivo: "evaluación" },
    ctx,
  );
  assert.ok(!r.ok);
  assert.match(r.error, /No encontré/);
  assert.equal(db.citas.length, 0);
});

test("agendarCita: agenda contra un lead existente", async () => {
  const { db, ctx } = contexto();
  await guardarLead.run(
    { nombre: "Sandra", interes: "agente IA", telefono: "78402040" },
    ctx,
  );
  const r = await agendarCita.run(
    { lead: "78402040", fecha_hora: FUTURO, motivo: "evaluación" },
    ctx,
  );
  assert.ok(r.ok);
  assert.equal(db.citas.length, 1);
});

test("agendarCita: rechaza el doble-booking del mismo horario (P2002)", async () => {
  const { db, ctx } = contexto();
  await guardarLead.run(
    { nombre: "Sandra", interes: "agente IA", telefono: "78402040" },
    ctx,
  );
  await agendarCita.run(
    { lead: "78402040", fecha_hora: FUTURO, motivo: "primera" },
    ctx,
  );
  const r = await agendarCita.run(
    { lead: "78402040", fecha_hora: FUTURO, motivo: "choca" },
    ctx,
  );
  assert.ok(!r.ok);
  assert.match(r.error, /ocupado/);
  assert.equal(db.citas.length, 1);
});

// Día de la semana de un iso, en El Salvador, en español. Es lo que el cliente lee:
// si la etiqueta dice "jueves 18" el código debe coincidir, sin desfase.
function diaSemanaEsperado(iso: string): string {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: TZ_EL_SALVADOR,
    weekday: "long",
  }).format(new Date(`${iso}${OFFSET_EL_SALVADOR}`));
}

test("listarHorarios: ofrece a lo sumo 3, futuros, sin domingos y con etiqueta coherente", async () => {
  const { ctx } = contexto();
  const r = await listarHorarios.run({}, ctx);
  assert.ok(r.ok);
  const horarios = horariosDe(r.data);
  assert.ok(horarios.length > 0 && horarios.length <= 3);

  for (const { etiqueta, iso } of horarios) {
    const instante = new Date(`${iso}${OFFSET_EL_SALVADOR}`);
    assert.ok(instante.getTime() > Date.now(), `${iso} no es futuro`);
    const dia = diaSemanaEsperado(iso);
    assert.notEqual(dia, "domingo", `${iso} cae domingo`);
    // El bug que perseguimos: que el nombre del día y la fecha no se desfasen.
    assert.ok(
      etiqueta.toLowerCase().startsWith(dia),
      `etiqueta "${etiqueta}" no arranca con "${dia}"`,
    );
  }
});

test("listarHorarios: no propone un horario ya ocupado", async () => {
  const { db, ctx } = contexto();
  const primero = await listarHorarios.run({}, ctx);
  assert.ok(primero.ok);
  const ocupado = horariosDe(primero.data)[0];
  assert.ok(ocupado);

  // Ocupamos ese slot tal como lo guardaría agendar_cita (mismo anclaje -06:00).
  db.citas.push({
    id: "cita_seed",
    leadId: "lead_seed",
    fechaHora: new Date(`${ocupado.iso}${OFFSET_EL_SALVADOR}`),
    motivo: "ya tomado",
    createdAt: new Date(),
  });

  const segundo = await listarHorarios.run({}, ctx);
  assert.ok(segundo.ok);
  const isos = horariosDe(segundo.data).map((h) => h.iso);
  assert.ok(!isos.includes(ocupado.iso), "ofreció un slot ocupado");
});

test("listarHorarios: con fecha puntual devuelve solo slots de ese día", async () => {
  const { ctx } = contexto();
  const r = await listarHorarios.run({ fecha: "2030-06-10" }, ctx);
  assert.ok(r.ok);
  const horarios = horariosDe(r.data);
  // Día completo y libre: los 18 slots de la grilla 8:00–16:30.
  assert.equal(horarios.length, 18);
  for (const { iso } of horarios) {
    assert.ok(iso.startsWith("2030-06-10T"), `${iso} no es del día pedido`);
  }
});

test("listarHorarios: con fecha puntual descuenta los slots ocupados de ese día", async () => {
  const { db, ctx } = contexto();
  db.citas.push({
    id: "cita_seed",
    leadId: "lead_seed",
    fechaHora: new Date(`2030-06-10T10:00:00${OFFSET_EL_SALVADOR}`),
    motivo: "ya tomado",
    createdAt: new Date(),
  });

  const r = await listarHorarios.run({ fecha: "2030-06-10" }, ctx);
  assert.ok(r.ok);
  const isos = horariosDe(r.data).map((h) => h.iso);
  assert.ok(!isos.includes("2030-06-10T10:00:00"), "ofreció el slot ocupado");
  assert.ok(isos.includes("2030-06-10T10:30:00"), "faltó el slot libre contiguo");
});

test("listarHorarios: con fecha en domingo avisa que está cerrado, sin listar nada", async () => {
  const { ctx } = contexto();
  const r = await listarHorarios.run({ fecha: "2030-06-09" }, ctx);
  assert.ok(!r.ok);
  assert.match(r.error, /domingo/);
});

test("listarHorarios: con fecha en el pasado pide una futura", async () => {
  const { ctx } = contexto();
  const r = await listarHorarios.run({ fecha: "2020-01-01" }, ctx);
  assert.ok(!r.ok);
  assert.match(r.error, /pasó/);
});
