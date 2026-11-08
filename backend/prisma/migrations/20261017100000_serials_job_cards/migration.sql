-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "serials" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "ProductSerial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_stock',
    "saleId" TEXT,
    "invoiceNo" TEXT,
    "customerName" TEXT,
    "soldAt" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "purchaseId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSerial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'repair',
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "item" TEXT NOT NULL,
    "identifier" TEXT NOT NULL DEFAULT '',
    "problem" TEXT NOT NULL DEFAULT '',
    "details" JSONB NOT NULL DEFAULT '{}',
    "estimate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advanceMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "assignedTo" TEXT NOT NULL DEFAULT '',
    "promisedAt" TIMESTAMP(3),
    "lines" JSONB NOT NULL DEFAULT '[]',
    "saleId" TEXT,
    "invoiceNo" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSerial_tenantId_productId_status_idx" ON "ProductSerial"("tenantId", "productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSerial_tenantId_serial_key" ON "ProductSerial"("tenantId", "serial");

-- CreateIndex
CREATE INDEX "JobCard_tenantId_status_idx" ON "JobCard"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JobCard_tenantId_number_key" ON "JobCard"("tenantId", "number");

-- AddForeignKey
ALTER TABLE "ProductSerial" ADD CONSTRAINT "ProductSerial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
