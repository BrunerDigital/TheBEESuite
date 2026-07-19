-- Resolve Supabase advisor notices without opening browser-side table access.
-- The app uses server-side database access/service-role credentials; keep
-- anon/authenticated without direct table grants and add only service_role RLS
-- policies for tables that currently have RLS enabled but no policy.

SET lock_timeout = '5s';
SET statement_timeout = '5min';

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT t.tablename
    FROM pg_tables t
    LEFT JOIN pg_policies p
      ON p.schemaname = t.schemaname
     AND p.tablename = t.tablename
    WHERE t.schemaname = 'public'
      AND t.rowsecurity
    GROUP BY t.tablename
    HAVING count(p.policyname) = 0
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', item.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      'service_role_full_access',
      item.tablename
    );
  END LOOP;
END $$;

-- Foreign-key indexes recommended by Supabase advisors. These do not change
-- row visibility or user permissions; they improve join/delete/update paths.
CREATE INDEX IF NOT EXISTS "idx_Organization_tenantId" ON public."Organization" ("tenantId");
CREATE INDEX IF NOT EXISTS "idx_Organization_brandId" ON public."Organization" ("brandId");
CREATE INDEX IF NOT EXISTS "idx_Center_organizationId" ON public."Center" ("organizationId");
CREATE INDEX IF NOT EXISTS "idx_User_tenantId" ON public."User" ("tenantId");
CREATE INDEX IF NOT EXISTS "idx_User_organizationId" ON public."User" ("organizationId");
CREATE INDEX IF NOT EXISTS "idx_Permission_roleId" ON public."Permission" ("roleId");
CREATE INDEX IF NOT EXISTS "idx_Guardian_familyId" ON public."Guardian" ("familyId");
CREATE INDEX IF NOT EXISTS "idx_Guardian_userId" ON public."Guardian" ("userId");
CREATE INDEX IF NOT EXISTS "idx_Child_familyId" ON public."Child" ("familyId");
CREATE INDEX IF NOT EXISTS "idx_Child_classroomId" ON public."Child" ("classroomId");
CREATE INDEX IF NOT EXISTS "idx_AuthorizedPickup_familyId" ON public."AuthorizedPickup" ("familyId");
CREATE INDEX IF NOT EXISTS "idx_EmergencyContact_familyId" ON public."EmergencyContact" ("familyId");
CREATE INDEX IF NOT EXISTS "idx_ChildMedicalNote_childId" ON public."ChildMedicalNote" ("childId");
CREATE INDEX IF NOT EXISTS "idx_Allergy_childId" ON public."Allergy" ("childId");
CREATE INDEX IF NOT EXISTS "idx_Enrollment_childId" ON public."Enrollment" ("childId");
CREATE INDEX IF NOT EXISTS "idx_Enrollment_leadId" ON public."Enrollment" ("leadId");
CREATE INDEX IF NOT EXISTS "idx_Tour_centerId" ON public."Tour" ("centerId");
CREATE INDEX IF NOT EXISTS "idx_Tour_leadId" ON public."Tour" ("leadId");
CREATE INDEX IF NOT EXISTS "idx_Task_leadId" ON public."Task" ("leadId");
CREATE INDEX IF NOT EXISTS "idx_Note_userId" ON public."Note" ("userId");
CREATE INDEX IF NOT EXISTS "idx_Note_leadId" ON public."Note" ("leadId");
CREATE INDEX IF NOT EXISTS "idx_Note_familyId" ON public."Note" ("familyId");
CREATE INDEX IF NOT EXISTS "idx_Message_senderId" ON public."Message" ("senderId");
CREATE INDEX IF NOT EXISTS "idx_Announcement_centerId" ON public."Announcement" ("centerId");
CREATE INDEX IF NOT EXISTS "idx_Automation_brandId" ON public."Automation" ("brandId");
CREATE INDEX IF NOT EXISTS "idx_AutomationRun_automationId" ON public."AutomationRun" ("automationId");
CREATE INDEX IF NOT EXISTS "idx_FormSubmission_formId" ON public."FormSubmission" ("formId");
CREATE INDEX IF NOT EXISTS "idx_Document_familyId" ON public."Document" ("familyId");
CREATE INDEX IF NOT EXISTS "idx_Document_childId" ON public."Document" ("childId");
CREATE INDEX IF NOT EXISTS "idx_AttendanceRecord_childId" ON public."AttendanceRecord" ("childId");
CREATE INDEX IF NOT EXISTS "idx_DailyReport_childId" ON public."DailyReport" ("childId");
CREATE INDEX IF NOT EXISTS "idx_DailyReport_classroomId" ON public."DailyReport" ("classroomId");
CREATE INDEX IF NOT EXISTS "idx_Meal_dailyReportId" ON public."Meal" ("dailyReportId");
CREATE INDEX IF NOT EXISTS "idx_Nap_dailyReportId" ON public."Nap" ("dailyReportId");
CREATE INDEX IF NOT EXISTS "idx_DiaperPottyLog_dailyReportId" ON public."DiaperPottyLog" ("dailyReportId");
CREATE INDEX IF NOT EXISTS "idx_ActivityLog_dailyReportId" ON public."ActivityLog" ("dailyReportId");
CREATE INDEX IF NOT EXISTS "idx_IncidentReport_childId" ON public."IncidentReport" ("childId");
CREATE INDEX IF NOT EXISTS "idx_IncidentReport_classroomId" ON public."IncidentReport" ("classroomId");
CREATE INDEX IF NOT EXISTS "idx_StaffProfile_classroomId" ON public."StaffProfile" ("classroomId");
CREATE INDEX IF NOT EXISTS "idx_StaffSchedule_staffId" ON public."StaffSchedule" ("staffId");
CREATE INDEX IF NOT EXISTS "idx_StaffSchedule_centerId" ON public."StaffSchedule" ("centerId");
CREATE INDEX IF NOT EXISTS "idx_Certification_staffId" ON public."Certification" ("staffId");
CREATE INDEX IF NOT EXISTS "idx_Invoice_billingAccountId" ON public."Invoice" ("billingAccountId");
CREATE INDEX IF NOT EXISTS "idx_InvoiceItem_invoiceId" ON public."InvoiceItem" ("invoiceId");
CREATE INDEX IF NOT EXISTS "idx_InvoiceItem_productId" ON public."InvoiceItem" ("productId");
CREATE INDEX IF NOT EXISTS "idx_Payment_billingAccountId" ON public."Payment" ("billingAccountId");
CREATE INDEX IF NOT EXISTS "idx_AuditLog_tenantId" ON public."AuditLog" ("tenantId");
CREATE INDEX IF NOT EXISTS "idx_AuditLog_centerId" ON public."AuditLog" ("centerId");
CREATE INDEX IF NOT EXISTS "idx_AuditLog_userId" ON public."AuditLog" ("userId");
CREATE INDEX IF NOT EXISTS "idx_Integration_tenantId" ON public."Integration" ("tenantId");
CREATE INDEX IF NOT EXISTS "idx_CheckInOutLog_classroomId" ON public."CheckInOutLog" ("classroomId");
CREATE INDEX IF NOT EXISTS "idx_ChildMedia_uploadedById" ON public."ChildMedia" ("uploadedById");
CREATE INDEX IF NOT EXISTS "idx_ChildMedia_dailyReportId" ON public."ChildMedia" ("dailyReportId");
CREATE INDEX IF NOT EXISTS "idx_ProcareImportBatch_uploadedById" ON public."ProcareImportBatch" ("uploadedById");
CREATE INDEX IF NOT EXISTS "idx_FteReport_submittedById" ON public."FteReport" ("submittedById");
CREATE INDEX IF NOT EXISTS "idx_Message_templateId" ON public."Message" ("templateId");
CREATE INDEX IF NOT EXISTS "idx_Message_replyToMessageId" ON public."Message" ("replyToMessageId");
CREATE INDEX IF NOT EXISTS "idx_MessageTemplate_centerId" ON public."MessageTemplate" ("centerId");
CREATE INDEX IF NOT EXISTS "idx_MessageTemplate_createdById" ON public."MessageTemplate" ("createdById");
CREATE INDEX IF NOT EXISTS "idx_NotificationPreference_userId" ON public."NotificationPreference" ("userId");
CREATE INDEX IF NOT EXISTS "idx_EmergencyDrillLog_createdById" ON public."EmergencyDrillLog" ("createdById");
CREATE INDEX IF NOT EXISTS "idx_ComplianceTask_createdById" ON public."ComplianceTask" ("createdById");
CREATE INDEX IF NOT EXISTS "idx_CalendarEvent_createdById" ON public."CalendarEvent" ("createdById");
CREATE INDEX IF NOT EXISTS "idx_ChildLiveLocation_currentClassroomId" ON public."ChildLiveLocation" ("currentClassroomId");
CREATE INDEX IF NOT EXISTS "idx_ChildLiveLocation_movedById" ON public."ChildLiveLocation" ("movedById");
CREATE INDEX IF NOT EXISTS "idx_ChildLocationTransition_fromClassroomId" ON public."ChildLocationTransition" ("fromClassroomId");
CREATE INDEX IF NOT EXISTS "idx_ChildLocationTransition_movedById" ON public."ChildLocationTransition" ("movedById");
