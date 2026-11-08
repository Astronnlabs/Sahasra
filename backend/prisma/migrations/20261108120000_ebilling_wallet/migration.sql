-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "walletBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "walletExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WhatsAppSetup" (
    "tenantId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "displayPhone" TEXT NOT NULL DEFAULT '',
    "verifiedName" TEXT NOT NULL DEFAULT '',
    "tokenEnc" TEXT NOT NULL,
    "templateName" TEXT NOT NULL DEFAULT 'sahasra_bill_thank_you',
    "templateLang" TEXT NOT NULL DEFAULT 'en',
    "templateStatus" TEXT NOT NULL DEFAULT 'NOT_CREATED',
    "templateReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppSetup_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "WalletTxn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTxn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTopup" (
    "id" TEXT NOT NULL,
    "txnid" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payuId" TEXT,
    "mode" TEXT,
    "error" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WalletTopup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "customer" TEXT NOT NULL DEFAULT '',
    "to" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "waMessageId" TEXT,
    "error" TEXT,
    "charged" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletTxn_tenantId_createdAt_idx" ON "WalletTxn"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTopup_txnid_key" ON "WalletTopup"("txnid");

-- CreateIndex
CREATE INDEX "WalletTopup_tenantId_createdAt_idx" ON "WalletTopup"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillMessage_saleId_key" ON "BillMessage"("saleId");

-- CreateIndex
CREATE INDEX "BillMessage_tenantId_createdAt_idx" ON "BillMessage"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "WhatsAppSetup" ADD CONSTRAINT "WhatsAppSetup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTxn" ADD CONSTRAINT "WalletTxn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTopup" ADD CONSTRAINT "WalletTopup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillMessage" ADD CONSTRAINT "BillMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only the app (database owner) may read these tables; nothing is exposed through Supabase's public API.
ALTER TABLE "WhatsAppSetup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WalletTxn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WalletTopup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillMessage" ENABLE ROW LEVEL SECURITY;

