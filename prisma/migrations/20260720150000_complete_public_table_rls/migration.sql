-- Defense in depth for Prisma-managed tables in Supabase's exposed public schema.
-- Browser clients use application API routes; direct anon/authenticated table
-- access remains revoked while the server-side service role retains access.

SET lock_timeout = '5s';
SET statement_timeout = '5min';

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'CalendarEvent',
    'ComplianceTask',
    'EmergencyDrillLog',
    'PaymentMethodRequestLink',
    'SurveyResponse'
  ]
  LOOP
    IF to_regclass(format('public.%I', target_table)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', target_table);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = target_table
          AND policyname = 'service_role_full_access'
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
          'service_role_full_access',
          target_table
        );
      END IF;
    END IF;
  END LOOP;
END $$;
