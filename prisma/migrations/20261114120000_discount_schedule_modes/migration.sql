-- Aturan lama tetap mengikuti jadwal berulang yang sudah tersimpan.
ALTER TABLE "DiscountRule" ADD COLUMN "scheduleMode" TEXT NOT NULL DEFAULT 'RECURRING';
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_scheduleMode_check"
  CHECK ("scheduleMode" IN ('PERIOD', 'RECURRING'));
