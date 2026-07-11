export interface ToolCallRequest {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  // Las APIs estilo OpenAI (OpenRouter) identifican cada tool call con un id y
  // exigen devolverlo en el resultado; Ollama no lo usa, por eso es opcional.
  readonly id?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCallRequest[];
  tool_name?: string;
  tool_call_id?: string;
}

export interface AssistantMessage {
  readonly content: string;
  readonly toolCalls: ToolCallRequest[];
}

export interface LlmClient {
  chat(messages: readonly ChatMessage[]): Promise<AssistantMessage>;
}
