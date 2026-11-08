-- These columns were first added to some databases without a migration; create them where missing.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "astronLabsService" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "planValidFrom" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "planValidTo" TIMESTAMP(3);