-- Link an authorized-pickup login to exactly one reviewed pickup record.
-- This migration intentionally does not read or update Guardian PIN fields.
ALTER TABLE "AuthorizedPickup" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "AuthorizedPickup_userId_key" ON "AuthorizedPickup"("userId");

ALTER TABLE "AuthorizedPickup"
ADD CONSTRAINT "AuthorizedPickup_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
