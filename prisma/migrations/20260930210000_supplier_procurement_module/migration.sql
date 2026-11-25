-- Modul pengadaan pemasok untuk Pantau startup 4-3.
-- Migrasi ini sengaja bersifat konsolidasi: master Supplier dan relasi
-- GoodsReceipt.supplierId sudah tersedia pada basis startup 4-3.

CREATE TYPE "PurchaseRequestStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'FAILED', 'CANCELLED');
CREATE TYPE "PurchaseRequestUrgency" AS ENUM ('NORMAL', 'URGENT');
CREATE TYPE "SupplierReplyStatus" AS ENUM ('WAITING', 'READY', 'PARTIAL', 'SHIPPED', 'UNAVAILABLE', 'NEEDS_REVIEW');
CREATE TYPE "WhatsAppDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'UNCERTAIN', 'DEAD');
CREATE TYPE "SupplierMessageDeliveryStatus" AS ENUM ('UNKNOWN', 'PROVIDER_ACCEPTED', 'WHATSAPP_SENT', 'DELIVERED', 'READ', 'UNDELIVERED');
CREATE TYPE "IncomingMessageStatus" AS ENUM ('RECEIVED', 'MATCHED', 'NEEDS_REVIEW', 'REJECTED', 'CLOSED');
CREATE TYPE "WhatsAppAggregateType" AS ENUM ('PURCHASE_REQUEST', 'PURCHASE_REMINDER', 'STOCK_TRANSFER');

ALTER TABLE "Supplier"
  ADD COLUMN "normalizedPhone" TEXT,
  ADD COLUMN "responseTimeoutMinutes" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN "urgentResponseTimeoutMinutes" INTEGER NOT NULL DEFAULT 30;

WITH normalized AS (
  SELECT id, "organizationId",
    CASE
      WHEN phone IS NULL OR regexp_replace(phone, '\D', '', 'g') = '' THEN NULL
      WHEN regexp_replace(phone, '\D', '', 'g') LIKE '0%' THEN '62' || substring(regexp_replace(phone, '\D', '', 'g') from 2)
      WHEN regexp_replace(phone, '\D', '', 'g') LIKE '62%' THEN regexp_replace(phone, '\D', '', 'g')
      WHEN regexp_replace(phone, '\D', '', 'g') LIKE '8%' THEN '62' || regexp_replace(phone, '\D', '', 'g')
      ELSE regexp_replace(phone, '\D', '', 'g')
    END AS normalized_phone
  FROM "Supplier"
), ranked AS (
  SELECT id, normalized_phone,
    row_number() OVER (PARTITION BY "organizationId", normalized_phone ORDER BY id) AS position
  FROM normalized
)
UPDATE "Supplier" supplier
SET "normalizedPhone" = CASE WHEN ranked.position = 1 THEN ranked.normalized_phone ELSE NULL END
FROM ranked
WHERE supplier.id = ranked.id;

CREATE UNIQUE INDEX "Supplier_organizationId_normalizedPhone_key"
  ON "Supplier"("organizationId", "normalizedPhone");

CREATE TABLE "OrganizationWhatsApp" (
  "organizationId" TEXT NOT NULL,
  "encryptedToken" TEXT NOT NULL,
  "encryptedWebhookSecret" TEXT,
  "senderPhone" TEXT NOT NULL,
  "webhookConfiguredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationWhatsApp_pkey" PRIMARY KEY ("organizationId")
);
CREATE UNIQUE INDEX "OrganizationWhatsApp_senderPhone_key" ON "OrganizationWhatsApp"("senderPhone");
ALTER TABLE "OrganizationWhatsApp" ADD CONSTRAINT "OrganizationWhatsApp_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ItemSupplier" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemSupplier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ItemSupplier_itemId_locationId_supplierId_key" ON "ItemSupplier"("itemId", "locationId", "supplierId");
CREATE UNIQUE INDEX "ItemSupplier_itemId_locationId_priority_key" ON "ItemSupplier"("itemId", "locationId", "priority");
CREATE INDEX "ItemSupplier_organizationId_itemId_locationId_priority_idx" ON "ItemSupplier"("organizationId", "itemId", "locationId", "priority");
ALTER TABLE "ItemSupplier" ADD CONSTRAINT "ItemSupplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemSupplier" ADD CONSTRAINT "ItemSupplier_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemSupplier" ADD CONSTRAINT "ItemSupplier_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemSupplier" ADD CONSTRAINT "ItemSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PurchaseRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "priority" INTEGER NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "receivedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  "message" TEXT NOT NULL,
  "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'ACTIVE',
  "messageStatus" "WhatsAppDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "messageAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastMessageError" TEXT,
  "providerMessageId" TEXT,
  "messageSentAt" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3),
  "providerDeliveryStatus" "SupplierMessageDeliveryStatus" NOT NULL DEFAULT 'UNKNOWN',
  "providerStatusRaw" TEXT,
  "providerStateRaw" TEXT,
  "providerStateId" TEXT,
  "deliveryStatusUpdatedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "undeliveredAt" TIMESTAMP(3),
  "urgency" "PurchaseRequestUrgency" NOT NULL DEFAULT 'NORMAL',
  "responseTimeoutMinutes" INTEGER NOT NULL DEFAULT 120,
  "responseDueAt" TIMESTAMP(3),
  "responseOverdueAt" TIMESTAMP(3),
  "reminderCount" INTEGER NOT NULL DEFAULT 0,
  "lastReminderAt" TIMESTAMP(3),
  "lastReminderStatus" "WhatsAppDeliveryStatus",
  "lastReminderError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "resolutionNote" TEXT,
  "escalatedFromId" TEXT,
  "procurementChainId" TEXT,
  "orderCode" TEXT NOT NULL,
  "supplierReplyStatus" "SupplierReplyStatus" NOT NULL DEFAULT 'WAITING',
  "inputQuantity" DECIMAL(15,3),
  "inputUnit" TEXT,
  "conversionFactor" DECIMAL(15,4),
  "baseUnit" TEXT,
  "promisedQuantity" DECIMAL(15,3),
  "shippedQuantity" DECIMAL(15,3),
  "supplierLastMessage" TEXT,
  "supplierLastMessageAt" TIMESTAMP(3),
  "supplierConfirmedAt" TIMESTAMP(3),
  "supplierShippedAt" TIMESTAMP(3),
  CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PurchaseRequest_orderCode_key" ON "PurchaseRequest"("orderCode");
CREATE UNIQUE INDEX "PurchaseRequest_escalatedFromId_key" ON "PurchaseRequest"("escalatedFromId");
CREATE INDEX "PurchaseRequest_organizationId_itemId_locationId_status_idx" ON "PurchaseRequest"("organizationId", "itemId", "locationId", "status");
CREATE INDEX "PurchaseRequest_organizationId_messageStatus_createdAt_idx" ON "PurchaseRequest"("organizationId", "messageStatus", "createdAt");
CREATE INDEX "PurchaseRequest_organizationId_providerDeliveryStatus_respo_idx" ON "PurchaseRequest"("organizationId", "providerDeliveryStatus", "responseDueAt");
CREATE UNIQUE INDEX "PurchaseRequest_one_active_per_item_location"
  ON "PurchaseRequest"("organizationId", "itemId", "locationId") WHERE "status" = 'ACTIVE';
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_escalatedFromId_fkey" FOREIGN KEY ("escalatedFromId") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GoodsReceipt"
  ADD COLUMN "purchaseRequestId" TEXT,
  ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "GoodsReceipt_clientRequestId_key" ON "GoodsReceipt"("clientRequestId");
CREATE INDEX "GoodsReceipt_purchaseRequestId_idx" ON "GoodsReceipt"("purchaseRequestId");
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseRequestId_fkey"
  FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GoodsReceiptItem"
  ADD COLUMN "damagedQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
  ADD COLUMN "missingQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0;

CREATE TABLE "IncomingWhatsAppMessage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "purchaseRequestId" TEXT,
  "supplierId" TEXT,
  "eventKey" TEXT NOT NULL,
  "providerInboxId" TEXT,
  "devicePhone" TEXT NOT NULL,
  "senderPhone" TEXT NOT NULL,
  "senderName" TEXT,
  "message" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "processingStatus" "IncomingMessageStatus" NOT NULL DEFAULT 'RECEIVED',
  "processingNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncomingWhatsAppMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IncomingWhatsAppMessage_eventKey_key" ON "IncomingWhatsAppMessage"("eventKey");
CREATE INDEX "IncomingWhatsAppMessage_organizationId_receivedAt_idx" ON "IncomingWhatsAppMessage"("organizationId", "receivedAt");
CREATE INDEX "IncomingWhatsAppMessage_purchaseRequestId_receivedAt_idx" ON "IncomingWhatsAppMessage"("purchaseRequestId", "receivedAt");
CREATE INDEX "IncomingWhatsAppMessage_senderPhone_receivedAt_idx" ON "IncomingWhatsAppMessage"("senderPhone", "receivedAt");
ALTER TABLE "IncomingWhatsAppMessage" ADD CONSTRAINT "IncomingWhatsAppMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncomingWhatsAppMessage" ADD CONSTRAINT "IncomingWhatsAppMessage_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncomingWhatsAppMessage" ADD CONSTRAINT "IncomingWhatsAppMessage_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SupplierMessageStatusEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "purchaseRequestId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "providerStateId" TEXT,
  "providerStatus" TEXT,
  "providerState" TEXT,
  "mappedStatus" "SupplierMessageDeliveryStatus" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB NOT NULL,
  CONSTRAINT "SupplierMessageStatusEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierMessageStatusEvent_eventKey_key" ON "SupplierMessageStatusEvent"("eventKey");
CREATE INDEX "SupplierMessageStatusEvent_organizationId_providerMessageId_idx" ON "SupplierMessageStatusEvent"("organizationId", "providerMessageId");
CREATE INDEX "SupplierMessageStatusEvent_organizationId_providerStateId_idx" ON "SupplierMessageStatusEvent"("organizationId", "providerStateId");
CREATE INDEX "SupplierMessageStatusEvent_purchaseRequestId_occurredAt_idx" ON "SupplierMessageStatusEvent"("purchaseRequestId", "occurredAt");
ALTER TABLE "SupplierMessageStatusEvent" ADD CONSTRAINT "SupplierMessageStatusEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierMessageStatusEvent" ADD CONSTRAINT "SupplierMessageStatusEvent_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhatsAppOutbox" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "aggregateType" "WhatsAppAggregateType" NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "targetPhone" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "WhatsAppDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 4,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "sendStartedAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppOutbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppOutbox_idempotencyKey_key" ON "WhatsAppOutbox"("idempotencyKey");
CREATE INDEX "WhatsAppOutbox_status_nextAttemptAt_idx" ON "WhatsAppOutbox"("status", "nextAttemptAt");
CREATE INDEX "WhatsAppOutbox_organizationId_aggregateType_aggregateId_idx" ON "WhatsAppOutbox"("organizationId", "aggregateType", "aggregateId");
ALTER TABLE "WhatsAppOutbox" ADD CONSTRAINT "WhatsAppOutbox_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
