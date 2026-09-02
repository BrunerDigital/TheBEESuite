import { notFound } from "next/navigation";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { DirectorPaymentTerminalWorkspace } from "@/components/director-payment-terminal-workspace";
import { DirectorReviewInbox } from "@/components/director-review-inbox";
import { DataReadinessCenter } from "@/components/data-readiness-center";
import { BillingWorkbench } from "@/components/billing-workbench";
import { StaffManagementPanel } from "@/components/staff-management-panel";
import { EndOfDayClosingBoard } from "@/components/end-of-day-closing-board";
import { FamilyRelationshipMapPreview } from "@/components/family-relationship-map-preview";
import { WorkspaceSectionDirectory } from "@/components/workspace-section-directory";
import { CollapsibleCard } from "@/components/workspace-preferences";
import type { EditableFamilyRecord } from "@/components/family-record-editor";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DataReadinessWorkspaceData } from "@/lib/data-readiness";
import { dataReadinessViewFilters } from "@/lib/data-readiness-context";

type PreviewView = "family" | "terminal" | "closing" | "inbox" | "migration-director" | "migration-executive" | "declutter" | "billing-declutter" | "staff-declutter";

const family: EditableFamilyRecord = {
  id: "preview-family",
  centerId: "preview-center",
  centerName: "Sunshine Academy · Carmel",
  name: "Rivera Family",
  billingEmail: "daniel.rivera@example.com",
  address: "123 Honeycomb Way",
  notes: null,
  custodyNotes: "Restricted guidance exists for authorized staff review.",
  createdAt: "2026-01-12T12:00:00.000Z",
  updatedAt: "2026-08-09T14:10:00.000Z",
  guardians: [
    { id: "preview-guardian-1", fullName: "Jessica Rivera", email: "jessica.rivera@example.com", phone: "317-555-0142", relation: "Mother", preferredCommunication: "sms", isBillingContact: false, userId: "preview-parent-user", checkInPinSetAt: "2026-01-12T12:00:00.000Z" },
    { id: "preview-guardian-2", fullName: "Daniel Rivera", email: "daniel.rivera@example.com", phone: "317-555-0188", relation: "Father", preferredCommunication: "email", isBillingContact: true, userId: null, checkInPinSetAt: "2026-01-12T12:00:00.000Z" },
  ],
  children: [
    { id: "preview-child-1", fullName: "Ava Rivera", preferredName: "Ava", dateOfBirth: "2021-05-18T00:00:00.000Z", ageGroup: "Pre-K", enrollmentStatus: "enrolled", startDate: "2025-08-12T00:00:00.000Z", classroomId: "preview-classroom", photoVideoPermission: true, fieldTripPermission: true, allergies: [], medicalNotes: [], documents: [], tuitionAssignment: { enabled: true, tuitionPlanId: "preview-plan", tuitionPlanName: "Pre-K Weekly", cadence: "weekly", amountCents: 24500, billingDay: 5, startsPeriod: "2026-W32", description: "Weekly tuition" } },
    { id: "preview-child-2", fullName: "Liam Rivera", preferredName: "Liam", dateOfBirth: "2023-02-03T00:00:00.000Z", ageGroup: "Toddlers", enrollmentStatus: "enrolled", startDate: "2026-08-03T00:00:00.000Z", classroomId: null, photoVideoPermission: true, fieldTripPermission: false, allergies: [], medicalNotes: [], documents: [], tuitionAssignment: null },
  ],
  pickups: [
    { id: "preview-pickup", fullName: "Maria Santos", phone: "317-555-0104", relation: "Aunt", verificationNotes: "Photo ID required" },
  ],
  emergencyContacts: [
    { id: "preview-emergency", fullName: "Robert Rivera", phone: "317-555-0199", relation: "Grandparent" },
  ],
  documents: [],
  notesList: [],
  billingAccount: {
    id: "preview-billing-account",
    balanceCents: 24500,
    autopayPlaceholder: false,
    paymentMethodManagement: { autopayEnabled: false, autopayStatus: "disabled", hasStripeCustomer: true, hasSavedPaymentMethod: false, stripeCustomerId: "preview-customer", stripeDefaultPaymentMethodId: null, paymentMethodType: null, paymentMethodLabel: null, lastUpdatedAt: null },
  },
};

const terminalFamily = {
  id: family.id,
  centerId: family.centerId,
  name: family.name,
  billingEmail: family.billingEmail,
  guardians: family.guardians.map((guardian) => ({ id: guardian.id, fullName: guardian.fullName, email: guardian.email, userId: guardian.userId ?? null })),
  billingAccount: {
    id: "preview-billing-account",
    balanceCents: 24500,
    autopayPlaceholder: false,
    openInvoices: [{ id: "preview-invoice", number: "INV-10482", status: "OPEN", dueDate: "2026-08-14T00:00:00.000Z", totalCents: 24500, items: [{ id: "preview-item", description: "Weekly tuition", amountCents: 24500, productId: null }] }],
    recentPayments: [],
  },
  children: family.children.map((child) => ({ id: child.id, fullName: child.fullName, ageGroup: child.ageGroup, enrollmentStatus: child.enrollmentStatus, classroomId: child.classroomId ?? null, startDate: child.startDate ?? null, careScheduleType: "full_time" as const, scheduledDaysPerWeek: 5 as const, tuitionAssignment: child.tuitionAssignment ? { ...child.tuitionAssignment, grossAmountCents: child.tuitionAssignment.amountCents, additionalCharges: [], additionalChargesTotalCents: 0, credits: [], creditsTotalCents: 0, netAmountCents: child.tuitionAssignment.amountCents } : null })),
};

const terminalCenter = {
  id: "preview-center",
  name: "Sunshine Academy",
  crmLocationId: "Carmel",
  classrooms: [{ id: "preview-classroom", name: "Butterflies", ageGroup: "Pre-K" }],
  checkoutReadiness: { accountId: "preview-account", label: "Sunshine Academy", canAcceptParentPayments: true, blockingReason: null, stripeConfigured: true, webhookConfigured: true },
};

const closingData = {
  serviceDate: "2026-08-09T12:00:00.000Z",
  checkIns: 142,
  checkOuts: 139,
  stillCheckedIn: 3,
  latePickups: 1,
  authorizationWarnings: 1,
  signaturesCaptured: 0,
  credentialConfirmations: 134,
  pinVerified: 92,
  qrVerified: 42,
  staffVerified: 5,
  logs: [
    { id: "preview-log-1", type: "check_out", occurredAt: "2026-08-09T21:31:00.000Z", pickupName: "Maria Santos", verificationStatus: "qr_verified", pinVerified: false, signatureCaptured: false, credentialConfirmed: true, latePickup: true, pickupAuthorizationWarning: false, child: { fullName: "Ava Rivera", ageGroup: "Pre-K" }, guardian: null, classroom: { name: "Butterflies" }, center: { name: "Sunshine Academy", crmLocationId: "Carmel" } },
    { id: "preview-log-2", type: "check_out", occurredAt: "2026-08-09T21:12:00.000Z", pickupName: "Unlisted pickup", verificationStatus: null, pinVerified: false, signatureCaptured: false, credentialConfirmed: false, latePickup: false, pickupAuthorizationWarning: true, child: { fullName: "Mason Brooks", ageGroup: "Pre-K" }, guardian: null, classroom: { name: "Butterflies" }, center: { name: "Sunshine Academy", crmLocationId: "Carmel" } },
    { id: "preview-log-3", type: "check_out", occurredAt: "2026-08-09T20:48:00.000Z", pickupName: "Jessica Rivera", verificationStatus: "pin_verified", pinVerified: true, signatureCaptured: false, credentialConfirmed: true, latePickup: false, pickupAuthorizationWarning: false, child: { fullName: "Liam Rivera", ageGroup: "Toddlers" }, guardian: { fullName: "Jessica Rivera", email: "jessica.rivera@example.com" }, classroom: { name: "Busy Bees" }, center: { name: "Sunshine Academy", crmLocationId: "Carmel" } },
  ],
};

const inboxItems = [
  { id: "incidents", label: "Incident Reports", count: 2, detail: "Safety documentation awaiting director review.", href: "#", tone: "urgent" as const },
  { id: "media", label: "Parent Media", count: 6, detail: "Photos or videos waiting for sharing approval.", href: "#", tone: "attention" as const },
  { id: "registration", label: "Registration Packets", count: 3, detail: "Submitted applications requiring placement review.", href: "#", tone: "attention" as const },
  { id: "documents", label: "Submitted Documents", count: 4, detail: "Family or child documents ready for review.", href: "#", tone: "standard" as const },
  { id: "guardian-changes", label: "Guardian Changes", count: 1, detail: "Parent-submitted contact or pickup changes.", href: "#", tone: "attention" as const },
  { id: "messages", label: "Family Messages", count: 5, detail: "Unread family conversations that may need a response.", href: "#", tone: "standard" as const },
];

const migrationPreviewData: DataReadinessWorkspaceData = {
  generatedAt: "2026-08-17T12:00:00.000Z",
  truncated: false,
  summary: { BLOCKED: 2, CONFIRM: 2, READY: 1, EXCLUDED: 0, IMPORTED: 0, VERIFIED: 0, FAILED: 0, actionable: 4, total: 5, completionPercent: 20, sourceRows: 389, lastUpdated: "2026-08-17T12:00:00.000Z" },
  batches: [{ id: "batch-baden", centerId: "baden", centerName: "Baden Strasse", filename: "Previous-system report package", status: "REVIEW", sourceSha256: "preview-source-hash", reviewFingerprint: "preview-review-fingerprint", rowCount: 389, importedRows: 0, unresolvedRows: 38, disposedRows: 0, createdAt: "2026-08-17T12:00:00.000Z", verified: false }],
  tasks: [
    ["family-link", "baden", "Baden Strasse", "Family account 1042 · Child 2078", "Access and identity", "BLOCKED", "high", 2, "Child-to-family link is not proven by a stable source relationship.", "No confirmed family link", "Match source Account ID 1042", "Child relationships.csv", 18, false],
    ["balance", "baden", "Baden Strasse", "Family account 1091", "Billing and balances", "CONFIRM", "high", 3, "Opening balance requires an exact school confirmation.", "$58.00 source balance", "$58.00 opening balance", "Account balance summary.csv", 44, false],
    ["tuition", "baden", "Baden Strasse", "Child 2120", "Billing and balances", "CONFIRM", "medium", 3, "Weekly tuition needs a stable child binding and effective week.", "No confirmed weekly rate", "$245.00 weekly starting 2026-W35", "child contract billing summary.csv", 27, false],
    ["classroom", "east", "Jasper East", "Child 4108", "Enrollment and classroom placement", "BLOCKED", "medium", 4, "The source classroom is unknown.", "Unknown", "Butterflies", "Classroom schedule summary weekly.csv", 12, true],
    ["contact", "east", "Jasper East", "Family account 3098", "Parent communication readiness", "READY", "low", 6, "Guardian contact evidence is complete.", "Source contact", "Confirmed", "Child relationships.csv", 31, true],
  ].map(([id, centerId, centerName, entity, category, status, risk, priority, reason, currentValue, proposedValue, sourceFilename, sourceRow, bulkEligible]) => ({
    id: String(id), resource: "ProcareImportRow" as const, resourceId: String(id), batchId: "batch-baden", centerId: String(centerId), centerName: String(centerName), entity: String(entity), category: String(category), status: status as "BLOCKED" | "CONFIRM" | "READY", risk: risk as "high" | "medium" | "low", priority: Number(priority), dueDate: null, reason: String(reason), currentValue: String(currentValue), proposedValue: String(proposedValue), difference: String(reason), sourceFilename: String(sourceFilename), sourceRow: Number(sourceRow), sourceIds: [`source-${id}`], parsingConfidence: "high" as const, relatedRecords: [], downstreamImpact: "Held from the confirmed migration package until reviewed.", bulkEligible: Boolean(bulkEligible), decision: null, decisionNote: "", updatedAt: "2026-08-17T12:00:00.000Z",
  })),
};

export default async function UiPreviewPage({ searchParams }: { searchParams: Promise<{ view?: string; theme?: string; chrome?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const view: PreviewView = ["terminal", "closing", "inbox", "migration-director", "migration-executive", "declutter", "billing-declutter", "staff-declutter"].includes(params.view ?? "") ? params.view as PreviewView : "family";
  const dark = params.theme === "dark";
  const showChrome = params.chrome !== "0";
  const nextTheme = dark ? "light" : "dark";

  return (
    <div className={cn(dark && "dark", "min-h-screen bg-background text-foreground")}>
      {showChrome ? (
        <header className="sticky top-0 z-50 border-b bg-background/90 px-4 py-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[96rem] flex-wrap items-center justify-between gap-3">
            <div><Badge>Honeyglass UI Preview</Badge><span className="ml-3 text-sm text-muted-foreground">Synthetic data only</span></div>
            <nav className="flex flex-wrap gap-2" aria-label="Preview screens">
              {(["family", "terminal", "closing", "inbox", "migration-director", "migration-executive", "declutter", "billing-declutter", "staff-declutter"] as const).map((item) => <Link key={item} href={`/ui-preview?view=${item}&theme=${dark ? "dark" : "light"}`} className={buttonVariants({ variant: view === item ? "default" : "outline", size: "sm" })}>{item}</Link>)}
              <Link href={`/ui-preview?view=${view}&theme=${nextTheme}`} className={buttonVariants({ variant: "outline", size: "sm" })}>{dark ? <Sun data-icon="inline-start" /> : <Moon data-icon="inline-start" />}{dark ? "Light" : "Dark"}</Link>
            </nav>
          </div>
        </header>
      ) : null}
      <main className="mx-auto max-w-[96rem] p-3 sm:p-5 lg:p-7">
        {view === "family" ? <FamilyRelationshipMapPreview family={family} /> : null}
        {view === "terminal" ? <DirectorPaymentTerminalWorkspace families={[terminalFamily]} centers={[terminalCenter]} initialFamilyId={family.id} previewMode /> : null}
        {view === "closing" ? <EndOfDayClosingBoard data={closingData} /> : null}
        {view === "inbox" ? <DirectorReviewInbox items={inboxItems} /> : null}
        {view === "migration-director" ? <DataReadinessCenter data={migrationPreviewData} centers={[{ id: "baden", name: "Baden Strasse" }]} allowBulkImport={false} initialView={dataReadinessViewFilters({ tab: "procare" })} /> : null}
        {view === "migration-executive" ? <DataReadinessCenter data={migrationPreviewData} centers={[{ id: "baden", name: "Baden Strasse" }, { id: "east", name: "Jasper East" }]} allowBulkImport initialView={dataReadinessViewFilters({ tab: "queue" })} /> : null}
        {view === "declutter" ? (
          <div className="space-y-5">
            <header className="rounded-2xl border bg-card p-5">
              <Badge>Director workspace</Badge>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">Staff operations</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">See current coverage first, then move directly to the form needed for a change.</p>
            </header>
            <WorkspaceSectionDirectory
              id="declutter-preview-directory"
              description="Viewing sections stay compact until they are needed. Editing work has an explicit destination instead of competing with current status."
              reviewDestinations={[
                { href: "#preview-coverage", label: "Classroom coverage", description: "Assignments, gaps, and active schedules" },
                { href: "#preview-payroll", label: "Payroll summary", description: "Hours, overtime, and open shifts" },
              ]}
              actionDestinations={[
                { href: "#preview-assignment", label: "Assign a teacher" },
                { href: "#preview-profile", label: "Add or edit staff" },
                { href: "#preview-schedule", label: "Update a schedule" },
              ]}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <CollapsibleCard id="preview-coverage" title="Classroom coverage" description="3 classrooms · 1 needs attention" collapsedSummary="3 classrooms · Butterflies needs a schedule" defaultCollapsed>
                <div className="grid gap-3 sm:grid-cols-3">
                  {["Busy Bees · Covered", "Butterflies · Needs schedule", "Fireflies · Covered"].map((item) => <div key={item} className="rounded-xl border bg-background/50 p-3 text-sm">{item}</div>)}
                </div>
              </CollapsibleCard>
              <CollapsibleCard id="preview-payroll" title="Payroll summary" description="Current pay period" collapsedSummary="142.50 regular · 3.25 overtime · 1 open shift" defaultCollapsed>
                <div className="grid grid-cols-3 gap-3 text-center"><div>142.50<br /><span className="text-xs text-muted-foreground">Regular</span></div><div>3.25<br /><span className="text-xs text-muted-foreground">Overtime</span></div><div>1<br /><span className="text-xs text-muted-foreground">Open shift</span></div></div>
              </CollapsibleCard>
            </div>
            <section id="preview-assignment" className="scroll-mt-28 rounded-2xl border bg-card p-5">
              <h2 className="text-lg font-semibold">Assign a teacher</h2>
              <p className="mt-1 text-sm text-muted-foreground">The focused input task begins here after choosing the action above.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border bg-background p-3 text-sm">Teacher selection</div><div className="rounded-lg border bg-background p-3 text-sm">Classroom selection</div></div>
            </section>
          </div>
        ) : null}
        {view === "billing-declutter" ? (
          <div className="space-y-5">
            <header className="rounded-2xl border bg-card p-5">
              <Badge>Director workspace</Badge>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">Billing &amp; invoices</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Synthetic family data showing the actual decluttered billing workbench.</p>
            </header>
            <BillingWorkbench
              families={[terminalFamily]}
              centers={[terminalCenter]}
              products={[{ id: "preview-registration", name: "Registration fee", type: "registration_fee", amountCents: 7500 }]}
              tuitionPlans={[{ id: "preview-plan", centerId: terminalCenter.id, name: "Pre-K Weekly", ageGroup: "Pre-K", cadence: "weekly", amountCents: 24500 }]}
              currentRole="CENTER_DIRECTOR"
              initialCenterId={terminalCenter.id}
              initialFamilyId={terminalFamily.id}
            />
          </div>
        ) : null}
        {view === "staff-declutter" ? (
          <div className="space-y-5">
            <header className="rounded-2xl border bg-card p-5">
              <Badge>Director workspace</Badge>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">Staff</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Synthetic staffing data showing the actual decluttered staff workspace.</p>
            </header>
            <StaffManagementPanel
              centers={[{ id: "preview-center", name: "Sunshine Academy · Carmel", city: "Carmel", state: "IN", timezone: "America/Indiana/Indianapolis" }]}
              classrooms={[
                { id: "preview-classroom", centerId: "preview-center", name: "Butterflies", ageGroup: "Pre-K" },
                { id: "preview-classroom-2", centerId: "preview-center", name: "Busy Bees", ageGroup: "Toddlers" },
              ]}
              staff={[
                { id: "preview-teacher-1", centerId: "preview-center", classroomId: "preview-classroom", title: "Lead Teacher", phone: "317-555-0110", backgroundCheckStatus: "placeholder_clear", user: { name: "Jordan Lee", email: "jordan.lee@example.com", isActive: true }, classroom: { id: "preview-classroom", name: "Butterflies" } },
                { id: "preview-teacher-2", centerId: "preview-center", classroomId: "preview-classroom-2", title: "Teacher", phone: "317-555-0111", backgroundCheckStatus: "placeholder_clear", user: { name: "Morgan Reed", email: "morgan.reed@example.com", isActive: true }, classroom: { id: "preview-classroom-2", name: "Busy Bees" } },
              ]}
              schedules={[{ id: "preview-schedule", startsAt: "2026-09-02T12:00:00.000Z", endsAt: "2026-09-02T20:00:00.000Z", status: "scheduled", staff: { id: "preview-teacher-1", user: { name: "Jordan Lee" } } }]}
              timeClockSummaryGeneratedAt="2026-09-02T15:00:00.000Z"
              canManageCompensation={false}
              canFilterPayrollByCenter={false}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
