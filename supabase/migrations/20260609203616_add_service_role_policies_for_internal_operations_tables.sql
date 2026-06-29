DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'IntegrationDelivery' AND policyname = 'internal_service_role_full_access') THEN
    CREATE POLICY "internal_service_role_full_access" ON public."IntegrationDelivery"
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'MessageTemplate' AND policyname = 'internal_service_role_full_access') THEN
    CREATE POLICY "internal_service_role_full_access" ON public."MessageTemplate"
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'NotificationPreference' AND policyname = 'internal_service_role_full_access') THEN
    CREATE POLICY "internal_service_role_full_access" ON public."NotificationPreference"
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'MedicationLog' AND policyname = 'internal_service_role_full_access') THEN
    CREATE POLICY "internal_service_role_full_access" ON public."MedicationLog"
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'IntegrationCredential' AND policyname = 'internal_service_role_full_access') THEN
    CREATE POLICY "internal_service_role_full_access" ON public."IntegrationCredential"
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
