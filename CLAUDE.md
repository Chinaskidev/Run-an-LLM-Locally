# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Lectura obligatoria antes de tocar el agente

`SKILLS/agente-local-toolcalling.md` es la **autoridad de ingeniería del proyecto**.
Rige cualquier cambio que toque el agente, sus tools, el loop o la persistencia —
aunque el pedido no mencione "tool calling". Leela antes de modificar nada en
`src/agent/`, `src/tools/` o `src/llm/`. Lo que sigue es un resumen; ante conflicto,
manda la skill.

## Restricciones duras (no negociables)

- **Local por defecto; nube opt-in.** El default es Ollama (`LLM_PROVIDER=ollama`,
  `OLLAMA_HOST`). `LLM_PROVIDER=openrouter` habilita OpenRouter (API OpenAI-compatible,
  `src/llm/openrouter.ts`) para benchmarking — trade-off consciente: los datos del lead
  salen a un tercero. No agregar otros providers salvo como implementaciones de
  `LlmClient`; el loop nunca sabe qué provider corre.
- **Modelo swappable por env `MODEL`.** Nunca hardcodear el nombre del modelo; el punto
  del experimento es comparar modelos (locales y de nube) sin tocar código.
- **TypeScript strict.** Sin `any` sin justificar (los casts existentes están comentados
  con su porqué), sin `var`. El proyecto usa `exactOptionalPropertyTypes` y
  `noUncheckedIndexedAccess`: las propiedades opcionales se agregan condicionalmente, no
  con `undefined` explícito.
- **El gestor de paquetes es pnpm**, no npm.

## Comandos

```bash
podman-compose up -d              # levanta Postgres local (esperar a healthy: podman ps)
pnpm install
pnpm db:generate                  # genera el cliente Prisma
pnpm db:migrate --name <nombre>   # crea y aplica una migración
pnpm dev                          # corre el agente (REPL de consola)
pnpm typecheck                    # tsc --noEmit (correr tras cada cambio)
pnpm build                        # compila a dist/ (vía tsconfig.build.json, sin tests)
pnpm test                         # smoke test determinista (node:test vía tsx)
pnpm db:studio                    # UI web para inspeccionar la base
```

`pnpm test` corre un smoke test **determinista y hermético** (sin Postgres ni Ollama):
valida los schemas Zod, la lógica de las tools (idempotencia, anti-doble-booking,
zona horaria) con un fake de Prisma en memoria (`src/test/helpers.ts`), y las tres
invariantes del loop con un `LlmClient` scripteado. Cubre el código-autoridad, no el
comportamiento del modelo: los escenarios adversariales del final de la skill (no
cerrar venta, responder en inglés, saber NO llamar una tool) siguen verificándose a
mano contra Ollama, en español Y en inglés.

## Arquitectura

El flujo de una conversación: `index.ts` cablea todo por **composición** (sin herencia,
sin singletons escondidos) y arranca el REPL. Cada turno del usuario entra al **loop
acotado** de `agent/loop.ts`, que habla con el modelo vía la abstracción `LlmClient` y
despacha las tools que el modelo pide.

```
cli/repl.ts → agent/loop.ts → llm/ollama.ts (LlmClient) → Ollama
                   │
                   └─▶ tools/registry.ts → tools/{guardarLead,agendarCita}.ts → db (Prisma)
```

Piezas clave para entender el "por qué":

- **`agent/loop.ts`** implementa las tres invariantes de la skill: (1) máx 5 pasos con
  corte explícito; (2) guard de tool desconocida vía `registry.get(name)` que devuelve
  error al modelo sin reventar; (3) validación Zod de args antes de ejecutar. También
  **persiste cada mensaje** (`user`/`assistant`/`tool`) en la tabla `messages`,
  guardando los `toolArgs` crudos para auditar alucinaciones del modelo.

- **`tools/types.ts` → `defineTool()`** es el patrón central: combina definición (JSON
  Schema para el modelo) + schema Zod + executor. Su `run()` hace `safeParse` ANTES de
  ejecutar; si los args son inválidos, devuelve `{ ok:false, error }` (que vuelve al
  modelo para reintentar) en vez de ejecutar con basura. **El código es la autoridad, el
  modelo solo extrae intención.**

- **`llm/ollama.ts`** aísla Ollama detrás de `LlmClient` (definido en `agent/types.ts`),
  para que el loop sea testeable y portable. Fija `temperature: 0.2` (extractor, no
  chatbot). El loop no sabe que Ollama existe.

- **`prompts/vendedor.md`** es el system prompt versionado (los prompts son código).
  Tiene frontmatter YAML que `agent/prompt.ts` **strippea** al cargarlo. No meter
  catálogo/precios acá (eso sería RAG, no memoria del modelo).

### Reglas de comportamiento del agente

- **El agente NUNCA cierra la venta.** Capta/califica el lead y hace handoff: agenda o
  deriva a un asesor humano. No confirma ventas, no inventa precios finales, no cobra.
- **Responde en el idioma del cliente** (inglés si el cliente escribe en inglés).
- **Solo persiste lo que el usuario dijo.** Si falta un dato requerido, la validación
  falla y el agente debe preguntárselo al usuario, no inventarlo.

### Base de datos

Schema en `prisma/schema.prisma`. Constraints pensados desde el día uno:
`leads.telefono` es `UNIQUE` (idempotencia: `guardar_lead` hace upsert por teléfono);
`citas.fechaHora` es `UNIQUE` — ese es el **anti-doble-booking**: el `P2002` de Prisma
es lo que rechaza el slot ocupado, la lógica de calendario vive en el código, no en el
modelo. La hora debe caer en grilla `:00`/`:30` (lo exige el schema Zod de
`agendarCita`), por eso el prompt instruye al modelo a proponer horas en esa grilla.

## Estructura para portar a NestJS

Cada carpeta de `src/` (`db/`, `llm/`, `tools/`, `agent/`) está pensada como un futuro
provider inyectable. Mantener esa separación; **no** introducir NestJS hasta que el
experimento del loop esté validado.
