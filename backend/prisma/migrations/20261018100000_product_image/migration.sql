-- Product photo (uploaded file or built-in picture)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "image" TEXT NOT NULL DEFAULT '';
