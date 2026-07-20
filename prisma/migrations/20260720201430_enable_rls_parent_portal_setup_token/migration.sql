-- Keep parent setup tokens server-only even though Prisma stores them in the
-- exposed public schema. Application API routes use the service role; browser
-- roles do not receive direct table grants.

SET lock_timeout = '5s';
SET statement_timeout = '5min';

REVOKE ALL ON TABLE public."ParentPortalSetupToken" FROM anon, authenticated;
ALTER TABLE public."ParentPortalSetupToken" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ParentPortalSetupToken'
      AND policyname = 'service_role_full_access'
  ) THEN
    CREATE POLICY "service_role_full_access"
      ON public."ParentPortalSetupToken"
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
