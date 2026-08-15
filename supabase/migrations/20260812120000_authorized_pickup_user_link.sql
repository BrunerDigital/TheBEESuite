-- Mirror the reviewed Prisma migration in Supabase migration history.
-- The guards make this safe when the Prisma migration already created the schema objects.
-- This migration intentionally does not read or update Guardian PIN fields or pickup records.
ALTER TABLE "AuthorizedPickup" ADD COLUMN IF NOT EXISTS "userId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "AuthorizedPickup_userId_key"
ON "AuthorizedPickup"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AuthorizedPickup_userId_fkey'
      AND conrelid = '"AuthorizedPickup"'::regclass
  ) THEN
    ALTER TABLE "AuthorizedPickup"
    ADD CONSTRAINT "AuthorizedPickup_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END;
$$;
