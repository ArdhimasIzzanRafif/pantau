ALTER TABLE "Organization"
  DROP COLUMN "midtransServerKey",
  DROP COLUMN "midtransClientKey",
  DROP COLUMN "midtransProduction";

ALTER TABLE "POSOrder"
  DROP COLUMN "snapToken";
