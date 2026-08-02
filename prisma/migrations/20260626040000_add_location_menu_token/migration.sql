-- Add menuToken to Location with gen_random_uuid() for existing rows
ALTER TABLE "Location" ADD COLUMN "menuToken" TEXT;
UPDATE "Location" SET "menuToken" = gen_random_uuid()::text WHERE "menuToken" IS NULL;
ALTER TABLE "Location" ALTER COLUMN "menuToken" SET NOT NULL;
CREATE UNIQUE INDEX "Location_menuToken_key" ON "Location"("menuToken");
