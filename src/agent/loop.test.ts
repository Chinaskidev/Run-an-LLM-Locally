import { test } from "node:test";
import assert from "node:assert/strict";

import { createAgent, LIMITE_ALCANZADO } from "./loop.js";
import type { AssistantMessage } from "./types.js";
import type { RegisteredTool } from "../tools/types.js";
import {
  createFakeDb,
  createFakeLogger,
  scriptedLlm,
  fakeRegistry,
} from "../test/helpers.js";

// Tool trivial que no toca la base: sirve para ejercitar el despacho del loop.
const echoTool: RegisteredTool = {
  name: "echo",
  definition: {
    type: "function",
    function: {
      name: "echo",
      description: "devuelve siempre ok",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  async run() {
    return { ok: true, data: { echoed: true } };
  },
};

function sinTools(content: string): AssistantMessage {
  return { content, toolCalls: [] };
}

function pideTool(name: string): AssistantMessage {
  return { content: "", toolCalls: [{ name, arguments: {} }] };
}

function armar(responses: readonly AssistantMessage[], tools: RegisteredTool[]) {
  const db = createFakeDb();
  const { llm, calls } = scriptedLlm(responses);
  const agent = createAgent({
    llm,
    registry: fakeRegistry(tools),
    prisma: db.prisma,
    logger: createFakeLogger(),
    conversationId: "test",
    systemPrompt: "sos un agente de prueba",
  });
  return { agent, db, calls };
}

test("loop: si el modelo no pide tools, devuelve su respuesta directo", async () => {
  const { agent, calls } = armar([sinTools("¡Hola! ¿En qué te ayudo?")], []);
  const out = await agent.send("hola");
  assert.equal(out, "¡Hola! ¿En qué te ayudo?");
  assert.equal(calls(), 1);
});

test("loop acotado: corta a MAX_STEPS si el modelo insiste con una tool", async () => {
  // El LLM scripteado repite la última respuesta → pide 'echo' indefinidamente.
  const { agent, calls } = armar([pideTool("echo")], [echoTool]);
  const out = await agent.send("agendame algo");
  assert.equal(out, LIMITE_ALCANZADO);
  assert.equal(calls(), 5); // MAX_STEPS
});

test("guard de tool desconocida: no revienta y el agente se recupera", async () => {
  const { agent } = armar(
    [pideTool("herramienta_inventada"), sinTools("Listo, seguimos.")],
    [echoTool],
  );
  const out = await agent.send("hacé magia");
  assert.equal(out, "Listo, seguimos.");
});

test("loop: persiste user, assistant y tool en la conversación", async () => {
  const { agent, db } = armar(
    [pideTool("echo"), sinTools("Hecho.")],
    [echoTool],
  );
  await agent.send("dale");
  const roles = db.messages.map((m) => m.role);
  assert.deepEqual(roles, ["user", "assistant", "tool", "assistant"]);
});
