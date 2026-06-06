import { PrismaClient } from "@prisma/client";

import { config } from "../config.js";

export const prisma = new PrismaClient({
  datasources: { db: { url: config.DATABASE_URL } },
  log: config.LOG_LEVEL === "debug" ? ["query", "warn", "error"] : ["warn", "error"],
});

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
