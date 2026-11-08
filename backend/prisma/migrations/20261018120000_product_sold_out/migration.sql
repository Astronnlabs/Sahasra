-- Manual "out of stock" switch for products and dishes
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "soldOut" BOOLEAN NOT NULL DEFAULT false;
