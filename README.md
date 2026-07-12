# Local Agent — lead capture + scheduling

*[English](#english) · [Español](#español)*

---

## English

An AI agent that talks to a prospect, **understands what they need, captures the lead,
and books an appointment** with a human advisor. It runs **local-first**: Ollama by
default, with an opt-in cloud provider (OpenRouter) behind the same abstraction — the
project started 100% local and became hybrid; the ["real story"](#the-real-story-from-100-local-to-hybrid)
section below explains why, honestly.

The core idea: **the code is in charge, the model only extracts intent.** The model
proposes what to do; the code validates and decides. That's why it works even with small
models (Ministral 3 8B, Qwen 3.5 4B), which hallucinate more than a frontier model.

> The agent **never closes the sale**. It captures and qualifies the lead, moves the
> conversation forward, and hands off to a human advisor — closing is always a person's
> job.

### What it does, in a conversation

```
Prospect:  Hi, I run a workshop and lose hours invoicing by hand.
Agent:     Tell me a bit more — how many invoices do you do per week?
           (understands the real problem, saves nothing yet)

Prospect:  About 200. I'm Juan, from MecaSur workshop.
Agent:     [ guardar_lead ]  ← captures name + interest
           Got it, Juan. That can be automated. Shall we book an evaluation?

Prospect:  Sure, Tuesday at 3.
Agent:     [ agendar_cita ]  ← coordinates with a human advisor
           Booked for Tuesday at 3. An advisor will reach out to close.
```

The agent has **three tools** and nothing else:

| Tool | What it does |
|---|---|
| `guardar_lead` | registers the prospect (name, interest, phone and/or email) |
| `listar_horarios_disponibles` | returns the real free slots (business hours live in code, not in the model) |
| `agendar_cita` | books an appointment with a human advisor, validating hours and rejecting double-booking |

### How it thinks: the loop

Each prospect message enters a bounded loop. The model decides whether a tool is needed;
the code makes sure it runs correctly (or rejects it).

```
   prospect
       │
       ▼
 ┌───────────────┐     asks for a       no
 │      LLM      │──── tool? ─────────────────▶ replies with words
 │Ollama/OpenRtr │         │ yes
 └───────────────┘         ▼
       ▲           does the tool exist?
       │            │ no            │ yes
       │            ▼               ▼
       │      error to model    are the arguments
       │      (hallucinated)     valid? (Zod)
       │                         │ no        │ yes
       │                         ▼           ▼
       └──── result ◀──── error to model     executes
              to model     (retries)         (saves to Postgres)
```

Three rules the loop never breaks:

1. **Max 5 steps.** If the model gets stuck asking for the same thing, it cuts off — no
   infinite loops.
2. **Invented tool → rejected.** If the model asks for a function that doesn't exist, it
   gets told and recovers; the agent doesn't crash.
3. **Arguments always validated.** Every value the model passes to a tool is checked with
   Zod before touching the database. A malformed phone or a made-up date is caught here.

### What gets stored

```
┌─────────────┐        ┌─────────────┐
│   leads     │◀──────▶│    citas    │   unique phone · unique time slot
└─────────────┘        └─────────────┘   (anti double-booking)

┌───────────────┐      ┌─────────────┐
│ conversations │◀────▶│  messages   │   the full chat, to review later
└───────────────┘      └─────────────┘   (includes the model's raw arguments)
```

- Every **lead** and **appointment** lands in the database, with the phone and time slot
  unique (two prospects can't book the same instant).
- The **entire conversation** is persisted, down to the raw arguments the model passed,
  to audit afterwards how each local model behaved.

### The real story: from 100% local to hybrid

This project was born with a hard rule: everything local, zero cloud. Reality bent that
rule, and documenting it honestly is worth more than hiding it.

- **Hardware is the real limit.** On a laptop with an integrated GPU (AMD Radeon 780M)
  through Ollama's experimental Vulkan backend, the runner froze after 3-4 conversations.
  An agent is much heavier than casual chat: a large system prompt, tool schemas, growing
  history, and several model calls per turn. Light prompts flew; the real workload hung
  the GPU runtime (with flash attention it stalled; without it, it crashed). On CPU it
  ran — but made the whole machine unusable.
- **`ministral-3:8b` worked wonderfully with tools** (leads and appointments persisted
  correctly), but hallucinated a lot: it went as far as inventing fake success stories
  with real client names and made-up metrics.
- **`qwen2.5:7b` was discarded**: it never emitted the tool calls
  (see `docs/comparacion-modelos.md`).
- **`qwen3.5:4b` also worked** — but it hallucinated too, lost the thread of the
  conversation, and ended up freezing with the Vulkan hangs. It also ships with
  **thinking enabled by default**; we had to turn it off (`think: false` in the Ollama
  client), because the reasoning tokens broke the agent's responses.
- **The outcome: hybrid.** The default is still local Ollama, but `LLM_PROVIDER=openrouter`
  runs the *same* agent against the cloud without touching a line of the loop, thanks to
  the `LlmClient` abstraction. Conscious trade-off: lead data leaves the machine.
- **Is fully-local dead? No.** On a **VPS with 16 GB of RAM** the model runs entirely
  local, without the laptop's limits — same code, same env var, zero changes. Fair
  warning: latency changes significantly — the network round-trip between the agent and
  the VPS adds up, and CPU inference is slower than a cloud API. It's a trade-off:
  data sovereignty in exchange for response time. It hasn't been benchmarked yet;
  when it is, the numbers go in `docs/comparacion-modelos.md`.

The project is still under active construction: a real availability calendar, lead
capture by email, and whatever the experiment demands next.

### Principles

- **Local by default, cloud opt-in.** Ollama is the default; OpenRouter is an explicit
  choice with a known privacy trade-off.
- **The model assists, it doesn't decide.** It proposes tool calls; the code validates
  and executes.
- **The human closes the sale.** The agent captures, qualifies, and books; it never
  confirms a sale or invents prices.
- **Replies in the prospect's language** (Spanish or English).
- **Swappable model** without touching code, to compare models — local and cloud.

> The project's engineering standards live in `SKILLS/agente-local-toolcalling.md`.

---

## Español

Un agente de IA que conversa con un prospecto, **entiende qué necesita, capta el lead y
agenda una cita** con un asesor humano. Corre **local primero**: Ollama por defecto, con
un proveedor de nube opcional (OpenRouter) detrás de la misma abstracción — el proyecto
nació 100% local y se volvió híbrido; la sección
["la historia real"](#la-historia-real-de-100-local-a-híbrido) de abajo cuenta por qué,
con honestidad.

La idea central: **el código manda, el modelo solo extrae intención.** El modelo propone
qué hacer; el código valida y decide. Por eso funciona incluso con modelos chicos
(Ministral 3 8B, Qwen 3.5 4B), que alucinan más que uno de frontera.

> El agente **nunca cierra la venta**. Capta y califica el lead, hace avanzar la
> conversación y deriva a un asesor humano — el cierre es siempre de una persona.

### Qué hace, en una conversación

```
Prospecto:  Hola, tengo un taller y pierdo horas facturando a mano.
Agente:     Contame un poco más — ¿cuántas facturas hacés por semana?
            (entiende el problema real, todavía no guarda nada)

Prospecto:  Como 200. Soy Juan, del taller MecaSur.
Agente:     [ guardar_lead ]  ← capta nombre + interés
            Listo Juan. Eso se automatiza. ¿Agendamos una evaluación?

Prospecto:  Dale, el martes a las 3.
Agente:     [ agendar_cita ]  ← coordina con un asesor humano
            Agendado para el martes a las 3. Un asesor te contacta para cerrar.
```

El agente tiene **tres herramientas** y nada más:

| Herramienta | Qué hace |
|---|---|
| `guardar_lead` | registra al prospecto (nombre, interés, teléfono y/o email) |
| `listar_horarios_disponibles` | devuelve los horarios libres reales (el horario de atención vive en el código, no en el modelo) |
| `agendar_cita` | coordina una cita con un asesor humano, validando horario y sin chocar turnos |

### Cómo piensa: el loop

Cada mensaje del prospecto entra a un loop acotado. El modelo decide si hace falta una
herramienta; el código se encarga de que se ejecute bien (o de rechazarla).

```
   prospecto
       │
       ▼
 ┌───────────────┐     ¿pide una        no
 │      LLM      │──── herramienta? ──────────▶ responde con palabras
 │Ollama/OpenRtr │         │ sí
 └───────────────┘         ▼
       ▲           ¿la herramienta existe?
       │            │ no            │ sí
       │            ▼               ▼
       │      error al modelo   ¿los argumentos
       │      (la inventó)       son válidos? (Zod)
       │                         │ no        │ sí
       │                         ▼           ▼
       └──── resultado ◀── error al modelo   ejecuta
              al modelo     (reintenta)      (guarda en Postgres)
```

Tres reglas que el loop nunca rompe:

1. **Máximo 5 pasos.** Si el modelo se traba pidiendo lo mismo, se corta — no hay loops
   infinitos.
2. **Herramienta inventada → se rechaza.** Si el modelo pide una función que no existe,
   se le avisa y se recupera; el agente no se cae.
3. **Argumentos siempre validados.** Cada dato que el modelo pasa a una herramienta se
   revisa con Zod antes de tocar la base. Un teléfono mal escrito o una fecha inventada
   se atrapan acá.

### Qué se guarda

```
┌─────────────┐        ┌─────────────┐
│   leads     │◀──────▶│    citas    │   teléfono único · horario único
└─────────────┘        └─────────────┘   (anti-doble-booking)

┌───────────────┐      ┌─────────────┐
│ conversations │◀────▶│  messages   │   la charla completa, para revisarla después
└───────────────┘      └─────────────┘   (incluye los argumentos crudos del modelo)
```

- Cada **lead** y cada **cita** quedan en la base, con el teléfono y el horario únicos
  (dos prospectos no pueden agendar el mismo instante).
- La **conversación entera** se persiste, hasta los argumentos crudos que pasó el modelo,
  para auditar después cómo se comportó cada modelo local.

### La historia real: de 100% local a híbrido

Este proyecto nació con una regla dura: todo local, cero nube. La realidad la dobló, y
documentarlo con honestidad vale más que esconderlo.

- **El hardware es el límite real.** En una laptop con GPU integrada (AMD Radeon 780M)
  vía el backend Vulkan (experimental) de Ollama, el runner se congelaba después de 3-4
  conversaciones. Un agente pesa mucho más que un chat casual: system prompt grande,
  schemas de herramientas, historial que crece y varias llamadas al modelo por turno.
  Los prompts livianos volaban; la carga real colgaba el runtime de la GPU (con flash
  attention se trababa; sin él, crasheaba). En CPU corría — pero dejaba la máquina
  inutilizable.
- **`ministral-3:8b` funcionó de maravilla con las herramientas** (leads y citas
  persistidos correctamente), pero alucinaba mucho: llegó a inventar casos de éxito
  falsos con nombres de clientes reales y métricas inventadas.
- **`qwen2.5:7b` se descartó**: nunca emitió los tool calls
  (ver `docs/comparacion-modelos.md`).
- **`qwen3.5:4b` también funcionaba** — pero también alucinaba, perdía el hilo de la
  conversación y terminaba congelándose con los cuelgues de Vulkan. Además trae el
  **thinking activado por defecto**; hubo que apagarlo (`think: false` en el cliente de
  Ollama), porque los tokens de razonamiento rompían las respuestas del agente.
- **El desenlace: híbrido.** El default sigue siendo Ollama local, pero
  `LLM_PROVIDER=openrouter` corre el *mismo* agente contra la nube sin tocar una línea
  del loop, gracias a la abstracción `LlmClient`. Trade-off consciente: los datos del
  lead salen de la máquina.
- **¿Murió lo 100% local? No.** En un **VPS con 16 GB de RAM** el modelo corre entero en
  local, sin los límites de la laptop — mismo código, misma variable de entorno, cero
  cambios. Advertencia honesta: la latencia cambia significativamente — el viaje de red
  entre el agente y el VPS suma, y la inferencia en CPU es más lenta que una API de
  nube. Es un trade-off: soberanía del dato a cambio de tiempo de respuesta. Todavía no
  está medido; cuando se haga el benchmark, los números van a `docs/comparacion-modelos.md`.

El proyecto sigue en construcción activa: calendario de disponibilidad real, captación
de leads por email, y lo que el experimento pida después.

### Principios

- **Local por defecto, nube opt-in.** Ollama es el default; OpenRouter es una elección
  explícita con un trade-off de privacidad conocido.
- **El modelo asiste, no decide.** Propone llamadas a herramientas; el código valida y
  ejecuta.
- **El humano cierra la venta.** El agente capta, califica y agenda; nunca confirma una
  venta ni inventa precios.
- **Responde en el idioma del prospecto** (español o inglés).
- **Modelo intercambiable** sin tocar código, para comparar modelos — locales y de nube.

> Los estándares de ingeniería del proyecto viven en `SKILLS/agente-local-toolcalling.md`.
