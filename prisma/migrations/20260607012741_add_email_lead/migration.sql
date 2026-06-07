/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `leads` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "leads_email_key" ON "leads"("email");
