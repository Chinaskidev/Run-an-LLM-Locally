export interface ToolCallRequest {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCallRequest[];
  tool_name?: string;
}

export interface AssistantMessage {
  readonly content: string;
  readonly toolCalls: ToolCallRequest[];
}

export interface LlmClient {
  chat(messages: readonly ChatMessage[]): Promise<AssistantMessage>;
}
