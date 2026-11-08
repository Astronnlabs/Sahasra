-- DropForeignKey
ALTER TABLE "public"."MenuItem" DROP CONSTRAINT "MenuItem_tenantId_fkey";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "addons" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "allowDecimalQty" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attributes" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "isSelfProduct" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "options" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "productType" TEXT NOT NULL DEFAULT 'outsider',
ADD COLUMN     "tradePrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "variantGroup" TEXT,
ALTER COLUMN "stock" SET DEFAULT 0,
ALTER COLUMN "stock" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "minStock" SET DEFAULT 0,
ALTER COLUMN "minStock" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "PurchaseItem" ALTER COLUMN "qty" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "packageId" TEXT,
ADD COLUMN     "packageName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "serviceId" TEXT,
ADD COLUMN     "stockQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
ALTER COLUMN "qty" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "ServiceItem" ADD COLUMN     "attributes" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "priceUnit" TEXT NOT NULL DEFAULT 'service';

-- AlterTable
ALTER TABLE "StockMovement" ALTER COLUMN "qty" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "placeId",
ADD COLUMN     "jobSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "skuSeq" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "public"."MenuItem";

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Packages',
    "description" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(12,2) NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "validityDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Package_tenantId_idx" ON "Package"("tenantId");

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
