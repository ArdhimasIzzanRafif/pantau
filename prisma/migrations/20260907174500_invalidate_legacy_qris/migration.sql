-- QRIS uploaded before server-side validation cannot be trusted. Owners must
-- upload it once more so the payload and checksum are verified by the server.
UPDATE "Organization"
SET "qrisImageUrl" = NULL,
    "qrisPayload" = NULL
WHERE "qrisImageUrl" IS NOT NULL
   OR "qrisPayload" IS NOT NULL;
