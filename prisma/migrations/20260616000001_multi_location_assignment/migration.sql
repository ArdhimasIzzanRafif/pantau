-- CreateTable: UserLocation (many-to-many orgUser <-> location)
CREATE TABLE "UserLocation" (
    "id" TEXT NOT NULL,
    "orgUserId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "UserLocation_pkey" PRIMARY KEY ("id")
);

-- Migrate existing locationId data from OrganizationUser -> UserLocation
INSERT INTO "UserLocation" ("id", "orgUserId", "locationId")
SELECT gen_random_uuid(), "id", "locationId"
FROM "OrganizationUser"
WHERE "locationId" IS NOT NULL;

-- Drop old locationId column
ALTER TABLE "OrganizationUser" DROP COLUMN IF EXISTS "locationId";

-- CreateIndex
CREATE UNIQUE INDEX "UserLocation_orgUserId_locationId_key" ON "UserLocation"("orgUserId", "locationId");
CREATE INDEX "UserLocation_orgUserId_idx" ON "UserLocation"("orgUserId");

-- AddForeignKey
ALTER TABLE "UserLocation" ADD CONSTRAINT "UserLocation_orgUserId_fkey" FOREIGN KEY ("orgUserId") REFERENCES "OrganizationUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserLocation" ADD CONSTRAINT "UserLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
