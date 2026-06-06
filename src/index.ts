import { join } from "node:path";

import { config } from "./config.js";
import { logger } from "./logger.js";
import { prisma, disconnectDb } from "./db/client.js";
import { registry } from "./tools/registry.js";
import { createOllamaClient } from "./llm/ollama.js";
import { createAgent } from "./agent/loop.js";
import { loadSystemPrompt } from "./agent/prompt.js";
import { startRepl } from "./cli/repl.js";

async function main(): Promise<void> {
  const systemPrompt = await loadSystemPrompt(
    join(process.cwd(), "prompts", "vendedor.md"),
  );

  const conversation = await prisma.conversation.create({ data: {} });
  logger.info(
    { conversationId: conversation.id, model: config.MODEL },
    "conversación iniciada",
  );

  const llm = createOllamaClient({
    config,
    logger,
    toolDefinitions: registry.definitions,
  });

  const agent = createAgent({
    llm,
    registry,
    prisma,
    logger,
    conversationId: conversation.id,
    systemPrompt,
  });

  await startRepl({ agent, logger });
}

main()
  .catch((err: unknown) => {
    logger.error({ err }, "error fatal");
    process.exitCode = 1;
  })
  .finally(() => {
    void disconnectDb();
  });
