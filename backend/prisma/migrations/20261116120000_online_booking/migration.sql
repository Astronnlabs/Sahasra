-- Online booking link and appointments forwarded from VAAHAK. Adds columns only; existing data is kept.
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'counter';
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_tenantId_externalId_key" ON "Appointment"("tenantId", "externalId");

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "bookingSlug" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_bookingSlug_key" ON "Tenant"("bookingSlug");

ALTER TABLE "VaahakLink" ADD COLUMN IF NOT EXISTS "appointmentsCursor" TIMESTAMP(3);
ALTER TABLE "VaahakLink" ADD COLUMN IF NOT EXISTS "appointmentsSyncedAt" TIMESTAMP(3);
ALTER TABLE "VaahakLink" ADD COLUMN IF NOT EXISTS "appointmentsError" TEXT;