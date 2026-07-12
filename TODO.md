# TODO — Issues pendientes

Backlog de mejoras detectadas probando el agente. **No se trabajan hoy**, quedan anotadas
para retomar. Ordenadas por prioridad sugerida.

---

## 1. [BUG/PROMPT] El agente alucina "casos reales" falsos

**Severidad:** alta (riesgo reputacional — el agente miente al cliente).

Probando el agente, inventó testimonios de clientes que **no existen**:

- > "Un cliente de **Skinner** automatizó respuestas en LinkedIn para filtrar CVs,
  >  ahorrando 10 horas semanales." → **FALSO.** Skinner no automatiza respuestas en LinkedIn.
- > "**YourMindz** usa IA para agendar citas en WhatsApp y responder dudas de pacientes 24/7." → **FALSO.** YourMindz no agenda en WhatsApp.

El modelo se está inventando casos de éxito / cifras / funcionalidades concretas para
vender. Eso es exactamente lo que el proyecto prohíbe (el agente capta lead y hace handoff,
no inventa).

**Posibles líneas de trabajo:**
- Endurecer `prompts/vendedor.md`: prohibir explícitamente inventar nombres de clientes,
  métricas ("10 horas semanales"), o funcionalidades que no estén en una fuente verificada.
- Si se quieren usar casos reales, que vivan como datos verificados (RAG / lista blanca),
  no en la memoria del modelo.
- Sumar escenario adversarial al checklist manual de la skill: "no inventar casos de éxito".

---

## 2. [FEATURE] Calendario propio local de disponibilidad

**Severidad:** alta (afecta el core: agendar).

Síntomas al probar:
- La disponibilidad que muestra está muy acotada (solo aparece **martes**), no refleja
  días reales.
- El cliente pidió **viernes 19 a la 1:00 p. m.** y el agente respondió que "no está
  disponible", cuando en realidad no hay un calendario que defina qué está libre — el
  agente improvisa.

Hoy `listar_horarios_disponibles` deriva fechas de forma determinista, pero **no hay un
modelo real de disponibilidad** (qué días opera, qué horarios, qué ya está ocupado más
allá del UNIQUE de `citas.fechaHora`).

**Restricción dura:** todo local. **NO** integrar Google Calendar ni ningún servicio cloud.

**Posibles líneas de trabajo:**
- Definir un modelo de disponibilidad local (p. ej. reglas de días/horarios laborables +
  tabla de slots, o config de horario de atención por día de la semana).
- Que `listar_horarios_disponibles` consulte esa disponibilidad y reste lo ya agendado.
- Mantener la grilla `:00`/`:30` y el anti-doble-booking actual (UNIQUE en `fechaHora`).
- Manejar correctamente el caso "el cliente pide un día/hora puntual": validar contra el
  calendario real y, si no aplica, ofrecer alternativas reales (no inventadas).

---

## 3. [FEATURE] Modo híbrido: probar el agente con APIs (Claude / OpenAI)

**Severidad:** media (es para vender/benchmark, no bloquea el uso local).

El proyecto nació 100% local (Ollama). Para **vender** el agente y **comparar rendimiento**,
se quiere poder correrlo opcionalmente contra APIs cloud (Claude, OpenAI) además de Ollama.

> Nota: esto **flexibiliza** la restricción "todo local, cero nube" del CLAUDE.md.
> El default sigue siendo local; la nube sería un modo opt-in para benchmarking.

**Posibles líneas de trabajo:**
- Aprovechar la abstracción `LlmClient` (`src/agent/types.ts`): hoy `llm/ollama.ts` la
  implementa; agregar implementaciones `llm/claude.ts` / `llm/openai.ts` detrás de la misma
  interfaz, sin tocar el loop.
- Seleccionar provider por env (junto a `MODEL`), p. ej. `LLM_PROVIDER=ollama|claude|openai`.
- Cuidar el manejo de tool calling: cada API expresa las tools distinto; mantener el
  contrato del registry.
- Revisar la skill `claude-api` del harness cuando se trabaje el provider de Claude.
- Actualizar `docs/comparacion-modelos.md` para incluir resultados con APIs.
- Actualizar CLAUDE.md (la cláusula "todo local, cero nube") cuando esto se implemente.
