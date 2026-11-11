-- Print history (Bluetooth and computer printers). New table only; existing data is not touched.
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "printer" TEXT NOT NULL,
    "connection" TEXT NOT NULL,
    "device" TEXT NOT NULL DEFAULT '',
    "copies" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "reprint" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrintJob_tenantId_createdAt_idx" ON "PrintJob"("tenantId", "createdAt");

ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;