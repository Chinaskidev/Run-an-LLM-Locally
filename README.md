# Local Agent — lead capture + scheduling

*[English](#english) · [Español](#español)*

---

## English

An AI agent that talks to a prospect, **understands what they need, captures the lead,
and books an appointment** with a human advisor. It runs on a **100% local LLM via
Ollama**: no cloud, no external APIs, the data never leaves the machine.

The core idea: **the code is in charge, the model only extracts intent.** The model
proposes what to do; the code validates and decides. That's why it works even with small
models (Ministral 3 8B, Qwen 2.5 7B), which hallucinate more than a frontier model.

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

The agent has **two tools** and nothing else:

| Tool | What it does |
|---|---|
| `guardar_lead` | registers the prospect (name, interest, optional phone) |
| `agendar_cita` | books an appointment with a human advisor, no double-booking |

### How it thinks: the loop

Each prospect message enters a bounded loop. The model decides whether a tool is needed;
the code makes sure it runs correctly (or rejects it).

```
   prospect
       │
       ▼
 ┌───────────────┐     asks for a       no
 │  local LLM    │──── tool? ─────────────────▶ replies with words
 │   (Ollama)    │         │ yes
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

### Principles

- **100% local.** The LLM runs on Ollama; the data never leaves the machine.
- **The model assists, it doesn't decide.** It proposes tool calls; the code validates
  and executes.
- **The human closes the sale.** The agent captures, qualifies, and books; it never
  confirms a sale or invents prices.
- **Replies in the prospect's language** (Spanish or English).
- **Swappable model** without touching code, to compare Ministral vs Qwen.

> The project's engineering standards live in `SKILLS/agente-local-toolcalling.md`.

---

## Español

Un agente de IA que conversa con un prospecto, **entiende qué necesita, capta el lead y
agenda una cita** con un asesor humano. Corre con un **LLM 100% local vía Ollama**: sin
nube, sin APIs externas, el dato nunca sale de la máquina.

La idea central: **el código manda, el modelo solo extrae intención.** El modelo propone
qué hacer; el código valida y decide. Por eso funciona incluso con modelos chicos
(Ministral 3 8B, Qwen 2.5 7B), que alucinan más que uno de frontera.

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

El agente tiene **dos herramientas** y nada más:

| Herramienta | Qué hace |
|---|---|
| `guardar_lead` | registra al prospecto (nombre, interés, teléfono opcional) |
| `agendar_cita` | coordina una cita con un asesor humano, sin chocar horarios |

### Cómo piensa: el loop

Cada mensaje del prospecto entra a un loop acotado. El modelo decide si hace falta una
herramienta; el código se encarga de que se ejecute bien (o de rechazarla).

```
   prospecto
       │
       ▼
 ┌───────────────┐     ¿pide una        no
 │  LLM local    │──── herramienta? ──────────▶ responde con palabras
 │   (Ollama)    │         │ sí
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

### Principios

- **100% local.** El LLM corre en Ollama; el dato no sale de la máquina.
- **El modelo asiste, no decide.** Propone llamadas a herramientas; el código valida y
  ejecuta.
- **El humano cierra la venta.** El agente capta, califica y agenda; nunca confirma una
  venta ni inventa precios.
- **Responde en el idioma del prospecto** (español o inglés).
- **Modelo intercambiable** sin tocar código, para comparar Ministral vs Qwen.

> Los estándares de ingeniería del proyecto viven en `SKILLS/agente-local-toolcalling.md`.
