import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { ToolDefinition } from "../tools/types.js";
import type {
  AssistantMessage,
  ChatMessage,
  LlmClient,
  ToolCallRequest,
} from "../agent/types.js";

// Mismo criterio que ollama.ts: el modelo es un extractor de intención, no un
// chatbot creativo. Más temperatura = más alucinación de argumentos.
const TEMPERATURE = 0.2;

const CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterDeps {
  readonly config: Config;
  readonly logger: Logger;
  readonly toolDefinitions: readonly ToolDefinition[];
}

// Shapes del protocolo OpenAI-compatible que habla OpenRouter. Solo los campos
// que consumimos; el resto de la respuesta se ignora.
interface WireToolCall {
  readonly id?: string;
  readonly function: {
    readonly name: string;
    // A diferencia de Ollama, los argumentos viajan como string JSON.
    readonly arguments: string;
  };
}

interface WireRequestMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

interface WireResponse {
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string | null;
      readonly tool_calls?: readonly WireToolCall[];
    };
  }[];
}

function toWireMessage(message: ChatMessage): WireRequestMessage {
  const mapped: WireRequestMessage = {
    role: message.role,
    content: message.content,
  };
  if (message.tool_calls) {
    mapped.tool_calls = message.tool_calls.map((call, index) => ({
      // Un historial generado por Ollama no trae ids; se sintetiza uno estable
      // para que el resultado (que referencia por tool_name) siga cuadrando.
      id: call.id ?? `call_${index}`,
      type: "function",
      function: { name: call.name, arguments: JSON.stringify(call.arguments) },
    }));
  }
  if (message.role === "tool") {
    mapped.tool_call_id = message.tool_call_id ?? message.tool_name ?? "";
  }
  return mapped;
}

function parseToolArgs(
  raw: string,
  logger: Logger,
  tool: string,
): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      // Cast seguro: acabamos de verificar que es un objeto plano.
      return parsed as Record<string, unknown>;
    }
  } catch {
    // JSON roto: cae al retorno de abajo.
  }
  // Args vacíos a propósito: el safeParse de la tool los rechaza y el error
  // vuelve al modelo para que reintente — la misma vía de recuperación que un
  // argumento inválido.
  logger.warn({ tool, raw }, "el modelo devolvió argumentos que no son JSON");
  return {};
}

export function createOpenRouterClient(deps: OpenRouterDeps): LlmClient {
  const apiKey = deps.config.OPENROUTER_API_KEY;
  if (apiKey === undefined) {
    // config.ts ya exige la key cuando LLM_PROVIDER=openrouter; este guard
    // cubre construcciones directas del cliente y narrowea el tipo a string.
    throw new Error("OPENROUTER_API_KEY es requerida para usar OpenRouter.");
  }

  return {
    async chat(messages) {
      const response = await fetch(CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // Header opcional de OpenRouter: identifica la app en su dashboard.
          "X-Title": "agente-local",
        },
        body: JSON.stringify({
          model: deps.config.MODEL,
          messages: messages.map(toWireMessage),
          tools: deps.toolDefinitions,
          temperature: TEMPERATURE,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `OpenRouter respondió ${String(response.status)}: ${body.slice(0, 300)}`,
        );
      }

      // Cast: el shape real se verifica campo a campo abajo (choices/message
      // opcionales); tipar el JSON crudo completo no aporta más seguridad.
      const data = (await response.json()) as WireResponse;
      const message = data.choices?.[0]?.message;
      if (message === undefined) {
        throw new Error(
          `OpenRouter devolvió una respuesta sin choices: ${JSON.stringify(data).slice(0, 300)}`,
        );
      }

      const toolCalls: ToolCallRequest[] = (message.tool_calls ?? []).map(
        (call) => ({
          name: call.function.name,
          arguments: parseToolArgs(
            call.function.arguments,
            deps.logger,
            call.function.name,
          ),
          ...(call.id === undefined ? {} : { id: call.id }),
        }),
      );

      deps.logger.debug(
        { model: deps.config.MODEL, toolCalls: toolCalls.map((call) => call.name) },
        "respuesta del modelo",
      );

      const result: AssistantMessage = {
        content: message.content ?? "",
        toolCalls,
      };
      return result;
    },
  };
}
