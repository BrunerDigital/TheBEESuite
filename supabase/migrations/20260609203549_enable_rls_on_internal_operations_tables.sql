ALTER TABLE public."IntegrationDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MessageTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."NotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MedicationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."IntegrationCredential" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."IntegrationDelivery" FROM anon, authenticated;
REVOKE ALL ON TABLE public."MessageTemplate" FROM anon, authenticated;
REVOKE ALL ON TABLE public."NotificationPreference" FROM anon, authenticated;
REVOKE ALL ON TABLE public."MedicationLog" FROM anon, authenticated;
REVOKE ALL ON TABLE public."IntegrationCredential" FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."IntegrationDelivery" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."MessageTemplate" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."NotificationPreference" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."MedicationLog" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."IntegrationCredential" TO service_role;
