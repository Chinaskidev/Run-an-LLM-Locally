import type { RegisteredTool, ToolRegistry } from "./types.js";
import { guardarLead } from "./guardarLead.js";
import { agendarCita } from "./agendarCita.js";

const tools: readonly RegisteredTool[] = [guardarLead, agendarCita];

const byName = new Map<string, RegisteredTool>(
  tools.map((tool) => [tool.name, tool]),
);

export const registry: ToolRegistry = {
  definitions: tools.map((tool) => tool.definition),
  get(name) {
    return byName.get(name);
  },
};
