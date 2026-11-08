-- Seller details captured on each invoice so it can be re-downloaded exactly as issued
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "seller" JSONB;
