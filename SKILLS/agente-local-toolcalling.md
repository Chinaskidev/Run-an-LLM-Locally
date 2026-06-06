---
name: agente-local-toolcalling
description: Prácticas senior para construir y mantener un agente de IA con LLM local (Ollama) que hace tool calling — captar leads, agendar, persistir. Usá esta skill SIEMPRE que trabajes en este proyecto: al definir o editar tools, al tocar el loop del agente, al debuggear por qué un modelo local chico (Ministral 3 8B, Qwen 2.5 7B) alucina argumentos, inventa herramientas o entra en bucle, al swapear de modelo, o al portar el código a un módulo NestJS. Aplicala aunque el pedido no mencione "tool calling" — si el cambio toca el agente, sus tools o su persistencia, esta skill manda.
---

# Agente local con tool calling — estándares de ingeniería

## Principio rector: el modelo asiste, no decide

Estamos corriendo un modelo chico (7-8B) localmente. Es capaz, pero alucina más
que un modelo de frontera. Todo el diseño parte de una premisa: **el código es la
autoridad, el modelo es un extractor de intención.** El modelo propone llamadas a
tools; tu código valida, decide y ejecuta. Nunca al revés.

Si en algún punto el modelo termina tomando una decisión irreversible sin que el
código la haya validado, eso es el bug crítico del proyecto, no un detalle.

## Invariantes del loop (no negociables)

El loop de tool calling debe respetar estas tres invariantes siempre:

1. **Loop acotado.** Máximo de pasos fijo (5). Los modelos chicos entran en bucles
   de tool calling — piden la misma tool una y otra vez. Sin tope, eso es un colgón
   o una factura (cuando haya fallback en nube). Si se excede el tope, cortá con
   error explícito, no silenciosamente.

2. **Guard de tool desconocida.** El modelo alucina nombres de funciones que no
   existen. Antes de ejecutar, verificá que la tool exista en el registry. Si no
   existe, devolvele al modelo un resultado de error (`{ error: "herramienta
   desconocida" }`) y dejá que se recupere — no revientes el proceso.

3. **Nunca confiés en los argumentos del modelo.** Cada argumento que el modelo pasa
   a una tool se valida con Zod ANTES de ejecutar. Tipos, requeridos, formato. Si la
   validación falla, devolvé el error de Zod al modelo como tool result para que
   corrija. Un teléfono mal parseado o una fecha inventada se atrapan acá.

## La regla de oro: solo persistir lo que el usuario dijo

El modelo solo puede guardar información que apareció explícitamente en la
conversación. No puede inventar el nombre, el interés ni el teléfono de un lead, ni
"deducir" una fecha de cita que el cliente no mencionó.

Esto se hace cumplir en dos capas:
- En el system prompt: instrucción explícita de no inventar datos.
- En el código: si un campo requerido no fue mencionado, la tool no lo completa con
  un placeholder — falla la validación y el agente debe **preguntarle al usuario**.

Un lead con datos alucinados es peor que no tener lead: ensucia la base y rompe la
confianza del cliente.

## El cierre lo hace el humano, nunca el agente

El agente capta y califica el lead (caliente o frío) y hace avanzar la conversación
de venta, pero **NUNCA cierra la venta**. Cerrar —confirmar el trato, tomar el pago,
dar la venta por hecha— es una decisión irreversible, y por definición es del humano.

El trabajo del agente termina en el handoff: captar el lead, agendar la cita con el
vendedor humano y dejar la conversación lista para que la persona cierre. Si el
cliente quiere "comprar ya", el agente confirma el interés, lo agenda o deriva, y
avisa que un asesor humano finaliza — no confirma la venta, no inventa el precio
final, no cobra. Es el principio rector aplicado al caso más caro de equivocarse:
el modelo asiste, no decide.

## Diseño de las tools

- Una tool = una definición (schema JSON para el modelo) + un executor (tu lógica)
  + un validador Zod. Las tres viven juntas, en `tools/`.
- Los executors devuelven SIEMPRE un string (JSON serializado). El modelo necesita
  texto de vuelta, no objetos.
- Hacé los executors idempotentes donde se pueda. Si el modelo llama dos veces a
  `guardar_lead` con el mismo teléfono, no creés dos registros — upsert por la clave
  natural.
- Mantené pocas tools. Cada tool extra es una decisión más que el modelo chico puede
  errar. Empezá con `guardar_lead` y `agendar_cita`; agregá solo cuando una falta
  real lo justifique.

## Manejo de modelos locales chicos

- **Modelo swappable por env (`MODEL`).** Nunca hardcodees el nombre del modelo. El
  punto del experimento es comparar Ministral 3 8B vs Qwen 2.5 7B sin tocar código.
- **Temperatura baja para tool calling** (0.1-0.3). Alta creatividad = más
  alucinación de argumentos. Esto no es un chatbot creativo, es un extractor.
- **El agente responde en el idioma del cliente.** Si el cliente escribe en inglés
  (p. ej. un cliente de EE.UU.), respondé en inglés; si escribe en español, en español.
  Priorizá una respuesta correcta y profesional por sobre el modismo local: que suene
  *bien* importa más que que suene salvadoreño. Las transcripciones se revisan a mano.
- Si un modelo falla el formato de tool calling de forma sistemática, sospechá de la
  versión de Ollama o del template del modelo antes de culpar al diseño.

## Errores que NO cometer

- Dejar que el modelo maneje la lógica de calendario. El modelo dispara
  `agendar_cita`; la disponibilidad, los choques de horario y la confirmación del
  slot son del código.
- Meter el catálogo/precios en el system prompt y esperar que el modelo los recuerde
  sin errores. Eso es trabajo de RAG, no de memoria del modelo.
- Inflar el proyecto con NestJS antes de tiempo. Estructurá modular (`agent/`,
  `tools/`, `db/`, `prompts/`) para que porte fácil después, pero no metas el
  framework hasta que el experimento valide el loop.
- Comentarios que repiten el código. Comentá el *por qué* de una decisión no obvia,
  nada más.

## Cómo verificar un cambio

Antes de dar por buena una modificación al agente, corré mentalmente (o con un
script de prueba) estos escenarios adversariales, en español Y en inglés:
- Cliente que da el nombre pero no el interés → el agente pregunta, no inventa.
- Cliente que pide algo fuera del catálogo → el agente no inventa que lo tiene.
- Cliente que pide cita en un horario ocupado → la tool rechaza, el agente ofrece
  otro.
- Mensaje ambiguo que no requiere ninguna tool → el agente responde sin disparar
  nada (saber NO llamar una tool es tan importante como saber cuándo).
- Cliente que dice "lo compro, cerremos ya" → el agente confirma interés, agenda/deriva
  al asesor humano y NO da la venta por cerrada.
- Cliente que escribe en inglés → el agente responde en inglés.