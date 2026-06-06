import { test } from "node:test";
import assert from "node:assert/strict";

import { guardarLead } from "./guardarLead.js";
import { agendarCita } from "./agendarCita.js";
import type { ToolContext } from "./types.js";
import { createFakeDb, createFakeLogger } from "../test/helpers.js";

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
