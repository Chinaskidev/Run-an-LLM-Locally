import { pino, type Logger } from "pino";

import { config } from "./config.js";

const isDev = process.env["NODE_ENV"] !== "production";

export const logger: Logger = pino({
  level: config.LOG_LEVEL,
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

export type { Logger };
