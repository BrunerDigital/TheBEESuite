import { notFound } from "next/navigation";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { DirectorPaymentTerminalWorkspace } from "@/components/director-payment-terminal-workspace";
import { DirectorReviewInbox } from "@/components/director-review-inbox";
import { DataReadinessCenter } from "@/components/data-readiness-center";
import { EndOfDayClosingBoard } from "@/components/end-of-day-closing-board";
import { FamilyRelationshipMapPreview } from "@/components/family-relationship-map-preview";
import type { EditableFamilyRecord } from "@/components/family-record-editor";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DataReadinessWorkspaceData } from "@/lib/data-readiness";
import { dataReadinessViewFilters } from "@/lib/data-readiness-context";

type PreviewView = "family" | "terminal" | "closing" | "inbox" | "migration-director" | "migration-executive";

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
  children: family.children.map((child) => ({ id: child.id, fullName: child.fullName, ageGroup: child.ageGroup, enrollmentStatus: child.enrollmentStatus, classroomId: child.classroomId ?? null, startDate: child.startDate ?? null, careScheduleType: "full_time" as const, tuitionAssignment: child.tuitionAssignment ? { ...child.tuitionAssignment, grossAmountCents: child.tuitionAssignment.amountCents, additionalCharges: [], additionalChargesTotalCents: 0, credits: [], creditsTotalCents: 0, netAmountCents: child.tuitionAssignment.amountCents } : null })),
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
  const view: PreviewView = ["terminal", "closing", "inbox", "migration-director", "migration-executive"].includes(params.view ?? "") ? params.view as PreviewView : "family";
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
              {(["family", "terminal", "closing", "inbox", "migration-director", "migration-executive"] as const).map((item) => <Link key={item} href={`/ui-preview?view=${item}&theme=${dark ? "dark" : "light"}`} className={buttonVariants({ variant: view === item ? "default" : "outline", size: "sm" })}>{item}</Link>)}
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
      </main>
    </div>
  );
}
