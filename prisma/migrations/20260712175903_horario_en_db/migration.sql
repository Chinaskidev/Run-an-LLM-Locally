-- CreateTable
CREATE TABLE "horario_atencion" (
    "id" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "abre" TEXT,
    "cierra" TEXT,

    CONSTRAINT "horario_atencion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excepciones_disponibilidad" (
    "id" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "motivo" TEXT,
    "abre" TEXT,
    "cierra" TEXT,

    CONSTRAINT "excepciones_disponibilidad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "horario_atencion_diaSemana_key" ON "horario_atencion"("diaSemana");

-- CreateIndex
CREATE UNIQUE INDEX "excepciones_disponibilidad_fecha_key" ON "excepciones_disponibilidad"("fecha");
