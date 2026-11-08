-- Which vendor supplied the stock (optional)
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "vendorId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "vendor" TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "StockMovement_tenantId_vendorId_idx" ON "StockMovement"("tenantId", "vendorId");

-- Purchases already received: record their vendor on the stock that came in.
UPDATE "StockMovement" m
SET "vendorId" = p."vendorId", "vendor" = p."vendorName"
FROM "Purchase" p
WHERE m."vendorId" IS NULL AND m."type" = 'in' AND m."tenantId" = p."tenantId" AND m."reference" = p."billNo";
