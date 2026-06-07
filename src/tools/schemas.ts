import { z } from "zod";

export const guardarLeadSchema = z
  .object({
    nombre: z.string().trim().min(1, "el nombre es obligatorio"),
    telefono: z
      .string()
      .trim()
      .regex(/^[+0-9][0-9\s-]{6,}$/, "teléfono inválido")
      .optional(),
    email: z.string().trim().email("email inválido").optional(),
    interes: z.string().trim().min(1, "el interés es obligatorio"),
  })
  .refine((d) => d.telefono != null || d.email != null, {
    message: "hace falta al menos un contacto: teléfono o email",
    // el error se muestra junto al teléfono, pero aplica a ambos campos
    path: ["telefono"],
  });

export type GuardarLeadArgs = z.infer<typeof guardarLeadSchema>;

// El negocio opera en El Salvador: UTC-6 fijo, sin horario de verano. El modelo manda
// la hora sin zona ("...T10:00:00"); la anclamos a -06:00 para que el instante guardado
// sea el mismo corra donde corra el proceso (tu máquina en CST vs un servidor en UTC).
const OFFSET_EL_SALVADOR = "-06:00";

export const agendarCitaSchema = z.object({
  lead: z.string().trim().min(1, "indicá el lead (nombre o teléfono)"),
  fecha_hora: z
    .string()
    .trim()
    .transform((s) =>
      /([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}${OFFSET_EL_SALVADOR}`,
    )
    .pipe(
      z.coerce
        .date()
        .refine((d) => !Number.isNaN(d.getTime()), "fecha_hora inválida")
        .refine((d) => d.getTime() > Date.now(), "la fecha debe ser futura")
        .refine(
          (d) =>
            (d.getMinutes() === 0 || d.getMinutes() === 30) && d.getSeconds() === 0,
          "la hora debe caer en :00 o :30",
        ),
    ),
  motivo: z.string().trim().min(1, "el motivo es obligatorio"),
});

export type AgendarCitaArgs = z.infer<typeof agendarCitaSchema>;
