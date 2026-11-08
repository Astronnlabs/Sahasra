-- DropIndex
DROP INDEX "public"."BillTemplate_tenantId_idx";

-- AlterTable
ALTER TABLE "BillTemplate" ADD COLUMN     "key" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BillTemplate_tenantId_key_key" ON "BillTemplate"("tenantId", "key");
