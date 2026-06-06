import { Prisma, type PrismaClient, type Role } from "@prisma/client";

import type { Logger } from "../logger.js";
import type { ToolContext, ToolRegistry } from "../tools/types.js";
import type { ChatMessage, LlmClient } from "./types.js";

const MAX_STEPS = 5;

const LIMITE_ALCANZADO =
  "Disculpá, me enredé y no pude completar la acción. ¿Me repetís el dato que falta o lo intentamos de otra forma?";

interface AgentDeps {
  readonly llm: LlmClient;
  readonly registry: ToolRegistry;
  readonly prisma: PrismaClient;
  readonly logger: Logger;
  readonly conversationId: string;
  readonly systemPrompt: string;
}

export interface Agent {
  send(userText: string): Promise<string>;
}

export function createAgent(deps: AgentDeps): Agent {
  const history: ChatMessage[] = [
    { role: "system", content: deps.systemPrompt },
  ];

  const toolCtx: ToolContext = {
    prisma: deps.prisma,
    logger: deps.logger,
    conversationId: deps.conversationId,
  };

  async function persist(
    role: Role,
    content: string,
    extra?: { toolName?: string; toolArgs?: unknown },
  ): Promise<void> {
    await deps.prisma.message.create({
      data: {
        conversationId: deps.conversationId,
        role,
        content,
        toolName: extra?.toolName ?? null,
        // Valores siempre JSON-serializables (args crudos o tool_calls del modelo).
        toolArgs:
          extra?.toolArgs === undefined
            ? Prisma.DbNull
            : (extra.toolArgs as Prisma.InputJsonValue),
      },
    });
  }

  return {
    async send(userText) {
      history.push({ role: "user", content: userText });
      await persist("user", userText);

      for (let step = 0; step < MAX_STEPS; step++) {
        const assistant = await deps.llm.chat(history);

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: assistant.content,
        };
        if (assistant.toolCalls.length > 0) {
          assistantMsg.tool_calls = assistant.toolCalls;
        }
        history.push(assistantMsg);
        await persist("assistant", assistant.content, {
          ...(assistant.toolCalls.length > 0
            ? { toolArgs: assistant.toolCalls }
            : {}),
        });

        if (assistant.toolCalls.length === 0) {
          return assistant.content;
        }

        for (const call of assistant.toolCalls) {
          const tool = deps.registry.get(call.name);

          let resultJson: string;
          if (!tool) {
            deps.logger.warn(
              { tool: call.name },
              "el modelo pidió una tool desconocida",
            );
            resultJson = JSON.stringify({
              ok: false,
              error: `Herramienta desconocida: ${call.name}. Usá únicamente las herramientas disponibles.`,
            });
          } else {
            const outcome = await tool.run(call.arguments, toolCtx);
            resultJson = JSON.stringify(outcome);
          }

          history.push({
            role: "tool",
            content: resultJson,
            tool_name: call.name,
          });
          await persist("tool", resultJson, {
            toolName: call.name,
            toolArgs: call.arguments,
          });
        }
      }

      deps.logger.error(
        { conversationId: deps.conversationId, maxSteps: MAX_STEPS },
        "el loop excedió el máximo de pasos",
      );
      await persist("assistant", LIMITE_ALCANZADO);
      return LIMITE_ALCANZADO;
    },
  };
}
