CREATE TABLE IF NOT EXISTS "CalendarEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "centerId" TEXT,
  "title" TEXT NOT NULL,
  "eventType" TEXT NOT NULL DEFAULT 'event',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "visibility" TEXT NOT NULL DEFAULT 'staff',
  "recurrenceRule" TEXT,
  "recurrenceEndAt" TIMESTAMP(3),
  "closureReason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "googleCalendarId" TEXT,
  "googleEventId" TEXT,
  "googleSyncStatus" TEXT NOT NULL DEFAULT 'not_synced',
  "googleSyncedAt" TIMESTAMP(3),
  "lastGooglePayload" JSONB,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarEvent_tenantId_fkey') THEN
    ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarEvent_centerId_fkey') THEN
    ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_centerId_fkey"
      FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarEvent_createdById_fkey') THEN
    ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CalendarEvent_tenantId_startsAt_idx" ON "CalendarEvent"("tenantId", "startsAt");
CREATE INDEX IF NOT EXISTS "CalendarEvent_centerId_startsAt_idx" ON "CalendarEvent"("centerId", "startsAt");
CREATE INDEX IF NOT EXISTS "CalendarEvent_eventType_startsAt_idx" ON "CalendarEvent"("eventType", "startsAt");
CREATE INDEX IF NOT EXISTS "CalendarEvent_googleCalendarId_googleEventId_idx" ON "CalendarEvent"("googleCalendarId", "googleEventId");
CREATE INDEX IF NOT EXISTS "CalendarEvent_googleSyncStatus_startsAt_idx" ON "CalendarEvent"("googleSyncStatus", "startsAt");
