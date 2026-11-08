-- AlterTable
ALTER TABLE "Product" ADD COLUMN "inHouse" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ServiceItem" ADD COLUMN "consumables" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN "staffId" TEXT,
ADD COLUMN "staff" TEXT NOT NULL DEFAULT '';
