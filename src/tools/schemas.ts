import { z } from "zod";

import { OFFSET_EL_SALVADOR } from "./tiempo.js";

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

export const listarHorariosSchema = z.object({
  // Horizonte hacia adelante. Lo damos opcional con default: una decisión menos que el
  // modelo chico puede errar. `coerce` tolera que el modelo lo mande como string ("7").
  dias: z.coerce.number().int().min(1).max(14).default(7),
});

export type ListarHorariosArgs = z.infer<typeof listarHorariosSchema>;
