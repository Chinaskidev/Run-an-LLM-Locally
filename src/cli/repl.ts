import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import type { Agent } from "../agent/loop.js";
import type { Logger } from "../logger.js";

const COMANDOS_SALIDA = new Set(["/salir", "salir", "exit", "/exit", "quit"]);

interface ReplDeps {
  readonly agent: Agent;
  readonly logger: Logger;
}

export async function startRepl(deps: ReplDeps): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  stdout.write(
    "Agente comercial de Yultic. Escribí tu mensaje como prospecto (/salir para terminar).\n\n",
  );

  try {
    for (;;) {
      const input = (await rl.question("vos › ")).trim();
      if (input.length === 0) {
        continue;
      }
      if (COMANDOS_SALIDA.has(input.toLowerCase())) {
        break;
      }

      try {
        const reply = await deps.agent.send(input);
        stdout.write(`\nagente › ${reply}\n\n`);
      } catch (err) {
        deps.logger.error({ err }, "fallo procesando el turno");
        stdout.write(
          "\nagente › Disculpá, tuve un problema técnico. Probá de nuevo en un momento.\n\n",
        );
      }
    }
  } finally {
    rl.close();
  }
}
