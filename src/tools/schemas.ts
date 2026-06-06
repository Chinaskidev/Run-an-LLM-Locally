import { z } from "zod";

export const guardarLeadSchema = z.object({
  nombre: z.string().trim().min(1, "el nombre es obligatorio"),
  telefono: z
    .string()
    .trim()
    .regex(/^[+0-9][0-9\s-]{6,}$/, "teléfono inválido")
    .optional(),
  interes: z.string().trim().min(1, "el interés es obligatorio"),
});

export type GuardarLeadArgs = z.infer<typeof guardarLeadSchema>;

export const agendarCitaSchema = z.object({
  lead: z.string().trim().min(1, "indicá el lead (nombre o teléfono)"),
  fecha_hora: z.coerce
    .date()
    .refine((d) => !Number.isNaN(d.getTime()), "fecha_hora inválida")
    .refine((d) => d.getTime() > Date.now(), "la fecha debe ser futura")
    .refine(
      (d) => (d.getMinutes() === 0 || d.getMinutes() === 30) && d.getSeconds() === 0,
      "la hora debe caer en :00 o :30",
    ),
  motivo: z.string().trim().min(1, "el motivo es obligatorio"),
});

export type AgendarCitaArgs = z.infer<typeof agendarCitaSchema>;
