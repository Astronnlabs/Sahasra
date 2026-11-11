-- E-billing now goes through VAAHAK: bills are sent on the business's VAAHAK WhatsApp number and
-- paid from its VAAHAK wallet. SAHASRA's own wallet and WhatsApp setup are removed.

-- DropTable
DROP TABLE IF EXISTS "WhatsAppSetup";
DROP TABLE IF EXISTS "WalletTxn";
DROP TABLE IF EXISTS "WalletTopup";

-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "walletBalance",
DROP COLUMN IF EXISTS "walletExpiresAt";

-- AlterTable
ALTER TABLE "BillMessage" ADD COLUMN "delivery" TEXT;

-- CreateTable
CREATE TABLE "VaahakLink" (
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "keyEnc" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL DEFAULT '',
    "businessName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaahakLink_pkey" PRIMARY KEY ("tenantId")
);

-- AddForeignKey
ALTER TABLE "VaahakLink" ADD CONSTRAINT "VaahakLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Not reachable through Supabase's public data API (the app connects as the table owner).
ALTER TABLE "VaahakLink" ENABLE ROW LEVEL SECURITY;