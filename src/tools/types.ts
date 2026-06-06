import type { PrismaClient } from "@prisma/client";
import type { ZodType, ZodTypeDef } from "zod";

import type { Logger } from "../logger.js";

export interface ToolContext {
  readonly prisma: PrismaClient;
  readonly logger: Logger;
  readonly conversationId: string;
}

export type ToolOutcome =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export interface ToolDefinition {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
}

export interface RegisteredTool {
  readonly name: string;
  readonly definition: ToolDefinition;
  run(rawArgs: unknown, ctx: ToolContext): Promise<ToolOutcome>;
}

export interface ToolRegistry {
  readonly definitions: readonly ToolDefinition[];
  get(name: string): RegisteredTool | undefined;
}

interface DefineToolOptions<A> {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  // La entrada es `unknown`: los args del modelo llegan crudos y el schema puede
  // transformarlos (p. ej. string ISO → Date). El executor recibe el tipo ya validado A.
  readonly schema: ZodType<A, ZodTypeDef, unknown>;
  readonly execute: (args: A, ctx: ToolContext) => Promise<ToolOutcome>;
}

export function defineTool<A>(opts: DefineToolOptions<A>): RegisteredTool {
  return {
    name: opts.name,
    definition: {
      type: "function",
      function: {
        name: opts.name,
        description: opts.description,
        parameters: opts.parameters,
      },
    },
    async run(rawArgs, ctx) {
      const parsed = opts.schema.safeParse(rawArgs);
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
          .join("; ");
        return { ok: false, error: `Argumentos inválidos: ${detail}` };
      }

      try {
        return await opts.execute(parsed.data, ctx);
      } catch (err) {
        ctx.logger.error({ err, tool: opts.name }, "error ejecutando tool");
        return { ok: false, error: "Ocurrió un error interno al ejecutar la herramienta." };
      }
    },
  };
}
