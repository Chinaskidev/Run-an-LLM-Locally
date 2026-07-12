import { test } from "node:test";
import assert from "node:assert/strict";

import { guardarLeadSchema, agendarCitaSchema } from "./schemas.js";

test("guardarLead: rechaza nombre + interés sin ningún contacto", () => {
  const r = guardarLeadSchema.safeParse({ nombre: "Sandra", interes: "agente IA" });
  assert.ok(!r.success);
});

test("guardarLead: acepta nombre + interés + email (sin teléfono)", () => {
  const r = guardarLeadSchema.safeParse({
    nombre: "Sandra",
    interes: "agente IA",
    email: "sandra@ejemplo.com",
  });
  assert.ok(r.success);
});

test("guardarLead: rechaza un email inválido", () => {
  const r = guardarLeadSchema.safeParse({
    nombre: "Sandra",
    interes: "agente IA",
    email: "no-es-un-email",
  });
  assert.ok(!r.success);
});

test("guardarLead: rechaza si falta el interés", () => {
  const r = guardarLeadSchema.safeParse({ nombre: "Sandra" });
  assert.ok(!r.success);
});

test("guardarLead: rechaza si falta el nombre", () => {
  const r = guardarLeadSchema.safeParse({ interes: "agente IA" });
  assert.ok(!r.success);
});

test("guardarLead: rechaza un teléfono inválido", () => {
  const r = guardarLeadSchema.safeParse({
    nombre: "Sandra",
    interes: "agente IA",
    telefono: "no-es-un-numero",
  });
  assert.ok(!r.success);
});

test("guardarLead: acepta un teléfono con prefijo y separadores", () => {
  const r = guardarLeadSchema.safeParse({
    nombre: "Sandra",
    interes: "agente IA",
    telefono: "+503 7840-2040",
  });
  assert.ok(r.success);
});

test("agendarCita: una hora sin zona se ancla a El Salvador (UTC-6), determinista", () => {
  const r = agendarCitaSchema.safeParse({
    lead: "78402040",
    fecha_hora: "2030-06-10T10:00:00",
    motivo: "evaluación",
  });
  assert.ok(r.success);
  // 10:00 en El Salvador (UTC-6) === 16:00 UTC, sin importar la TZ del proceso.
  assert.equal(r.data.fecha_hora.toISOString(), "2030-06-10T16:00:00.000Z");
});

test("agendarCita: respeta una zona explícita en vez de re-anclar", () => {
  const r = agendarCitaSchema.safeParse({
    lead: "78402040",
    fecha_hora: "2030-06-10T16:00:00Z",
    motivo: "evaluación",
  });
  assert.ok(r.success);
  assert.equal(r.data.fecha_hora.toISOString(), "2030-06-10T16:00:00.000Z");
});

test("agendarCita: rechaza una fecha en el pasado", () => {
  const r = agendarCitaSchema.safeParse({
    lead: "78402040",
    fecha_hora: "2020-01-01T10:00:00",
    motivo: "evaluación",
  });
  assert.ok(!r.success);
});

test("agendarCita: rechaza una hora fuera de la grilla :00/:30", () => {
  const r = agendarCitaSchema.safeParse({
    lead: "78402040",
    fecha_hora: "2030-06-10T10:15:00",
    motivo: "evaluación",
  });
  assert.ok(!r.success);
});

test("agendarCita: rechaza un domingo (día cerrado)", () => {
  const r = agendarCitaSchema.safeParse({
    lead: "78402040",
    fecha_hora: "2030-06-09T10:00:00", // domingo
    motivo: "evaluación",
  });
  assert.ok(!r.success);
});

test("agendarCita: rechaza una hora fuera del horario de atención", () => {
  const r = agendarCitaSchema.safeParse({
    lead: "78402040",
    fecha_hora: "2030-06-10T19:00:00", // lunes, pero ya cerrado
    motivo: "evaluación",
  });
  assert.ok(!r.success);
});

test("agendarCita: acepta el último slot del día (16:30) y rechaza el cierre (17:00)", () => {
  const ultimo = agendarCitaSchema.safeParse({
    lead: "78402040",
    fecha_hora: "2030-06-10T16:30:00",
    motivo: "evaluación",
  });
  assert.ok(ultimo.success);

  const cierre = agendarCitaSchema.safeParse({
    lead: "78402040",
    fecha_hora: "2030-06-10T17:00:00",
    motivo: "evaluación",
  });
  assert.ok(!cierre.success);
});
