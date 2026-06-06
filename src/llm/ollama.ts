import { Ollama, type Message, type Tool } from "ollama";

import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { ToolDefinition } from "../tools/types.js";
import type { AssistantMessage, ChatMessage, LlmClient } from "../agent/types.js";

// Baja a propósito: el modelo es un extractor de intención, no un chatbot creativo.
// Más temperatura = más alucinación de argumentos en tool calling.
const TEMPERATURE = 0.2;

interface OllamaDeps {
  readonly config: Config;
  readonly logger: Logger;
  readonly toolDefinitions: readonly ToolDefinition[];
}

function toOllamaMessage(message: ChatMessage): Message {
  const mapped: Message = { role: message.role, content: message.content };
  if (message.tool_calls) {
    mapped.tool_calls = message.tool_calls.map((call) => ({
      function: { name: call.name, arguments: call.arguments },
    }));
  }
  if (message.tool_name !== undefined) {
    mapped.tool_name = message.tool_name;
  }
  return mapped;
}

export function createOllamaClient(deps: OllamaDeps): LlmClient {
  const client = new Ollama({ host: deps.config.OLLAMA_HOST });
  // Nuestro ToolDefinition es estructuralmente el Tool de ollama, pero el shape de
  // `parameters` (JSON Schema) es más laxo de nuestro lado; el cast evita duplicar
  // la tipación del schema sin perder la forma.
  const tools = deps.toolDefinitions as readonly unknown[] as Tool[];

  return {
    async chat(messages) {
      const response = await client.chat({
        model: deps.config.MODEL,
        messages: messages.map(toOllamaMessage),
        tools,
        stream: false,
        options: { temperature: TEMPERATURE },
      });

      const toolCalls = (response.message.tool_calls ?? []).map((call) => ({
        name: call.function.name,
        arguments: call.function.arguments as Record<string, unknown>,
      }));

      deps.logger.debug(
        { model: deps.config.MODEL, toolCalls: toolCalls.map((call) => call.name) },
        "respuesta del modelo",
      );

      const result: AssistantMessage = {
        content: response.message.content,
        toolCalls,
      };
      return result;
    },
  };
}
