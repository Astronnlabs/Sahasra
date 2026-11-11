-- Public sign-up and online plan purchase (PayU hosted checkout).

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "selfSignup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "planPeriod" TEXT;

-- CreateTable
CREATE TABLE "PlanPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "txnid" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mihpayid" TEXT,
    "mode" TEXT,
    "error" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanPayment_txnid_key" ON "PlanPayment"("txnid");
CREATE INDEX "PlanPayment_tenantId_createdAt_idx" ON "PlanPayment"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlanPayment" ADD CONSTRAINT "PlanPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Not reachable through Supabase's public data API (the app connects as the table owner).
ALTER TABLE "PlanPayment" ENABLE ROW LEVEL SECURITY;
