import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Horario default del negocio: lun–sáb 08:00–17:00, domingo cerrado. Después se edita
// directo en la base; este seed solo garantiza que las filas existan.
const HORARIO_DEFAULT = [
  { diaSemana: 0, abre: null, cierra: null }, // domingo cerrado
  { diaSemana: 1, abre: "08:00", cierra: "17:00" },
  { diaSemana: 2, abre: "08:00", cierra: "17:00" },
  { diaSemana: 3, abre: "08:00", cierra: "17:00" },
  { diaSemana: 4, abre: "08:00", cierra: "17:00" },
  { diaSemana: 5, abre: "08:00", cierra: "17:00" },
  { diaSemana: 6, abre: "08:00", cierra: "17:00" },
];

async function main(): Promise<void> {
  for (const regla of HORARIO_DEFAULT) {
    await prisma.horarioAtencion.upsert({
      where: { diaSemana: regla.diaSemana },
      // update vacío a propósito: si la fila existe, pudo haber sido editada a mano
      // y el seed no debe pisarla.
      update: {},
      create: regla,
    });
  }
  console.log("horario de atención sembrado (lun-sáb 08:00-17:00, dom cerrado)");
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
