// Tiempo del negocio, en un solo lugar. El negocio opera en El Salvador: UTC-6 fijo,
// sin horario de verano. Centralizar acá el offset y la zona evita que cada tool
// reinvente (mal) la conversión de zona horaria.

export const TZ_EL_SALVADOR = "America/El_Salvador";

// El modelo manda la hora sin zona ("...T10:00:00"); la anclamos a -06:00 para que el
// instante guardado sea el mismo corra donde corra el proceso (tu máquina en CST vs un
// servidor en UTC).
export const OFFSET_EL_SALVADOR = "-06:00";

// Al humano (modelo incluido) le mostramos la hora de pared de El Salvador, no el UTC,
// para que confirme "10:00" y no "16:00". `dateStyle: full` incluye el día de la semana
// ya calculado por el código: esa es la fuente de verdad, no la aritmética del modelo.
export function enHoraLocal(fecha: Date): string {
  return fecha.toLocaleString("es-SV", {
    timeZone: TZ_EL_SALVADOR,
    dateStyle: "full",
    timeStyle: "short",
  });
}
