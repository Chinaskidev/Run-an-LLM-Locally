import { readFile } from "node:fs/promises";

const FRONTMATTER = /^---\n[\s\S]*?\n---\n/;

export async function loadSystemPrompt(path: string): Promise<string> {
  const raw = await readFile(path, "utf8");
  return raw.replace(FRONTMATTER, "").trim();
}

export function conContextoTemporal(prompt: string, ahora = new Date()): string {
  const fmt = new Intl.DateTimeFormat("es-SV", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const hoy = fmt.format(ahora);

  // Los modelos pequeños no hacen aritmética de calendarios
  // así que ya le damos la tabla ya resuelta de los próximos días: un cálculo que alucina se vuelve un lookup
  const dias: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(ahora);
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dias.push(`- ${fmt.format(d)}: ${iso}`);
  }
  return `${prompt}

## Fecha de hoy y calendario

  Hoy es ${hoy}. Próximos días (usá esta tabla para mapear el día que pida el cliente a su fecha real; NUNCA la calcules de memoria):
  ${dias.join("\n")}

  Cuando el cliente diga un día (p. ej. "el lunes"), buscá su fecha en esta tabla. Si el cliente da un día y un número que NO coinciden (p. ej. "lunes 10"
  cuando el 10 es miércoles), avisale de la inconsistencia y pedile que confirme antes de agendar. Al llamar agendar_cita, pasá fecha_hora en ISO 8601
  (YYYY-MM-DDTHH:mm:ss) en la grilla :00 o :30.`;
}
