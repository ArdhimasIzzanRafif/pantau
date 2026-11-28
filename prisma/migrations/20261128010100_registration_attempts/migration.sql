ALTER TABLE "Organization" ADD COLUMN "registrationAttempts" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_registrationAttempts_positive" CHECK ("registrationAttempts" >= 1);

-- Legacy signup rejection set SUSPENDED without a suspension timestamp.
-- Preserve manual suspensions and any business with operational history.
UPDATE "Organization" o SET status = 'REJECTED', "updatedAt" = CURRENT_TIMESTAMP
WHERE o.status = 'SUSPENDED' AND o."suspendedAt" IS NULL AND o."trialEndsAt" IS NULL
  AND (SELECT COUNT(*) FROM "OrganizationUser" u WHERE u."organizationId" = o.id) = 1
  AND EXISTS (SELECT 1 FROM "OrganizationUser" u WHERE u."organizationId" = o.id AND u.role = 'OWNER')
  AND NOT EXISTS (SELECT 1 FROM "Location" x WHERE x."organizationId" = o.id)
  AND NOT EXISTS (SELECT 1 FROM "POSOrder" x WHERE x."organizationId" = o.id)
  AND NOT EXISTS (SELECT 1 FROM "InventoryItem" x WHERE x."organizationId" = o.id)
  AND NOT EXISTS (SELECT 1 FROM "GoodsReceipt" x WHERE x."organizationId" = o.id)
  AND NOT EXISTS (SELECT 1 FROM "PlatformAuditLog" x WHERE x."targetId" = o.id AND x.action IN ('change_status', 'extend_trial', 'approve_registration'));
