// Local browser-test entry point only. Never imported by the application.
import { createRoot } from "react-dom/client";
import { ParentPortalWorkspace } from "../../src/components/parent-portal-workspace";
import { TeacherMobileWorkspace } from "../../src/components/teacher-mobile-workspace";
import { FteReportForm, type FteReportRow } from "../../src/components/fte-report-form";
import { FteReportExplorer } from "../../src/components/fte-report-explorer";
import { executiveParentPortalDemo } from "../../src/lib/executive-demo-data";
import { SchoolTimeZoneProvider } from "../../src/components/school-time-zone-context";
import { TeamPermissionsPage, type TeamPermissionsData } from "../../src/components/team-permissions-page";
import { recordPagination, teamPermissionsHref } from "../../src/lib/record-pagination";
import { BillingWorkbench, type BillingWorkbenchFamily, type BillingWorkbenchCenter } from "../../src/components/billing-workbench";
import { DirectorPaymentTerminalWorkspace } from "../../src/components/director-payment-terminal-workspace";
import { FamilyLedgerCard } from "../../src/components/family-ledger-card";
import { billingSelectionKey } from "../../src/lib/billing-family-selection";
import { parentDocumentState } from "../../src/lib/parent-document-state";
import { prioritizeParentAttentionRecords } from "../../src/lib/parent-attention";
import { type ComponentProps, useEffect, useState } from "react";
import { CollapsibleCard } from "../../src/components/workspace-preferences";

const query = new URLSearchParams(location.search);
const view = query.get("view");
const attentionCase = query.get("attention-case") === "hidden";
const hiddenOpenInvoice = { ...executiveParentPortalDemo.invoices[0], id: "fake-older-open", number: "FAKE-OLDER-OPEN", status: "OPEN" };
const hiddenIncident = { ...executiveParentPortalDemo.incidents[0], id: "fake-older-incident", description: "Fake older report still needs acknowledgment", parentAcknowledgedAt: null };
const priorInvoiceRows = Array.from({ length: 20 }, (_, index) => ({ ...hiddenOpenInvoice, id: `fake-paid-${index}`, number: `FAKE-PAID-${index}`, status: "PAID" }));
const priorIncidentRows = Array.from({ length: 20 }, (_, index) => ({ ...hiddenIncident, id: `fake-ack-${index}`, parentAcknowledgedAt: "2026-09-12T00:00:00Z" }));
const documentCase = query.get("document-case");
const fixtureDocuments = documentCase === "many-required"
  ? Array.from({ length: 25 }, (_, index) => ({ id: `fake-required-${index + 1}`, name: `Fake required form ${index + 1}`, type: "school_form", status: "REQUESTED", expiresAt: null, storageKey: "internal_signature_pending" }))
  : documentCase === "history"
    ? [...Array.from({ length: 25 }, (_, index) => ({ id: `fake-complete-${index + 1}`, name: `Fake completed form ${index + 1}`, type: "school_form", status: "APPROVED", expiresAt: null, storageKey: null })), { id: "fake-required", name: "Fake required form", type: "school_form", status: "REQUESTED", expiresAt: null, storageKey: "internal_signature_pending" }]
    : documentCase ? [{ id: "fake-document", name: "Fake school document", type: "school_form", status: documentCase === "submitted" ? "SUBMITTED" : "APPROVED", expiresAt: null, storageKey: "internal_signature_pending" }] : executiveParentPortalDemo.documents;
const orderedDocuments = fixtureDocuments.toSorted((a, b) => Number(parentDocumentState(b) === "action_required") - Number(parentDocumentState(a) === "action_required"));
const documentPage = recordPagination(query.get("documentsPage"), fixtureDocuments.length, 20);
const requestedDocumentId = query.get("documentId") || undefined;
const linkedDocument = orderedDocuments.find((document) => document.id === requestedDocumentId) ?? null;
const teacherRoster = Array.from({ length: query.has("large-roster") ? 42 : 2 }, (_, index) => ({
  id: index ? `fake-child-${index + 1}` : "fake-child", fullName: index ? `Fake Child ${index + 1}` : "Fake Child", ageGroup: "Preschool", enrollmentStatus: "active", photoVideoPermission: true, classroom: { id: "fake-room", name: "Fake Classroom" },
}));
const centers = ["a", "b"].map((id) => ({ id, name: `Fake School ${id.toUpperCase()}`, licensedCapacity: 80, crmLocationId: null, city: null, state: null, ownerGroup: null }));
const report: FteReportRow = {
  id: "fake-historical-b", centerId: "b", centerName: "Fake School B", weekStart: "2026-04-08T00:00:00.000Z", weekEnd: "2026-04-15T00:00:00.000Z",
  locationData: "Fake historical location", accountReceivableAmount: 0, selfPayerBillAmount: 0, subsidyBillAmount: null, externalAgencyBillAmount: null, totalBilledAmount: 0,
  enrolledCount: 5, fullTimeCount: 5, partTimeCount: 0, twoDayCount: 0, threeDayCount: 0, fourDayCount: 0, fiveDayCount: 5, fteCount: 0,
  licenseCapacity: 80, payrollAmount: 0, infants: 0, toddlers: 0, twos: 0, preschool: 5, preK: 0, schoolAge: 0, status: query.get("approved") ? "approved" : "submitted",
  source: "manual_correction", notes: "Fake saved historical notes", submittedBy: "Fake Reviewer", updatedAt: "2026-04-16T14:00:00.000Z",
};

const team: TeamPermissionsData = {
  brandName: "Fake Demo Schools",
  directory: { ...recordPagination("6", 251), query: "Fake", totalAuthorized: 275, previousHref: teamPermissionsHref("Fake", 5, 3, "user-directory"), nextHref: null },
  sessionPagination: { ...recordPagination("3", 101), previousHref: teamPermissionsHref("Fake", 6, 2, "device-sessions"), nextHref: null },
  sessionSummary: { signedIn: 101, kiosk: 20, teacherAndParent: 70, idle: 11 },
  users: [{ id: "fake-user", name: "Fake Directory User", email: "fake@example.com", role: "TEACHER", isActive: true, mustResetPassword: false, staffProfile: null,
    accessGrants: Array.from({ length: 5 }, (_, index) => ({ id: `fake-grant-${index}`, role: "TEACHER", scopeType: "OWNER_GROUP", brand: null, organization: null, center: null, ownerGroup: { name: "Includes your assigned schools" } })),
  }],
  roleCounts: ["TEACHER", "CENTER_DIRECTOR", "BILLING_ADMIN", "READ_ONLY_AUDITOR", "EXECUTIVE"].map((role, index) => ({ role, count: 55 + index })),
  deviceSessions: [{ id: "fake-session", label: "Fake classroom tablet", deviceType: "tablet", appMode: "teacher", lastSeenAt: new Date().toISOString(), revokedAt: null, user: { name: "Fake Teacher", email: "teacher@example.com" } }],
  currentDeviceSessionId: query.has("current-device") ? "fake-session" : null,
  canManageDeviceSessions: query.has("manage"),
};

const billingCenters: BillingWorkbenchCenter[] = ["a", "b"].map((id) => ({ id, name: `Fake School ${id.toUpperCase()}`, crmLocationId: null, classrooms: [{ id: `room-${id}`, name: `Room ${id}`, ageGroup: "Preschool" }], hardwareTerminalConfigured: false }));
const billingFamilies: BillingWorkbenchFamily[] = ["a", "b", "c"].map((id) => ({
  id, centerId: id === "c" ? "a" : id, name: `Fake Family ${id.toUpperCase()}`, billingEmail: null, guardians: [],
  children: [1, 2].map((index) => ({ id: `child-${id}${index === 1 ? "" : "-2"}`, fullName: `Fake Child ${id.toUpperCase()}${index === 1 ? "" : " Two"}`, ageGroup: "Preschool", classroomId: `room-${id}`, enrollmentStatus: "active", startDate: null, careScheduleType: "full_time" as const, scheduledDaysPerWeek: 5 as const })),
  billingAccount: { id: `account-${id}`, balanceCents: 10000, autopayPlaceholder: false, openInvoices: [1, ...(query.has("selectors") ? [2] : [])].map((index) => ({ id: `invoice-${id}${index === 1 ? "" : "-2"}`, number: `FAKE-${id}${index === 1 ? "" : "-2"}`, status: "OPEN", dueDate: "2026-09-14", totalCents: 10000 })) },
}));

function BillingFixture() {
  const [selection, setSelection] = useState({ familyId: query.get("family") ?? "a", centerId: query.get("center") ?? "" });
  const canManageEnrollment = query.has("director");
  const targetKey = billingSelectionKey(selection);
  return <><nav aria-label="Fake target navigation" className="flex flex-wrap gap-2">{["a", "missing", "b"].map((id) => <button key={id} className="min-h-11 rounded border px-3" onClick={() => setSelection({ familyId: id, centerId: "" })}>Navigate to {id}</button>)}</nav>
    {view === "billing" ? <BillingWorkbench key={targetKey} families={billingFamilies} centers={billingCenters} products={[]} tuitionPlans={query.has("selectors") ? [{ id: "fake-rate", centerId: "a", name: "Fake saved rate", ageGroup: "Preschool", cadence: "weekly", amountCents: 20000 }] : []} currentRole={canManageEnrollment ? "CENTER_DIRECTOR" : "BILLING_ADMIN"} canOpenFamilyProfile={canManageEnrollment} canManageEnrollment={canManageEnrollment} initialChildId={query.get("child") ?? undefined} initialFamilyId={selection.familyId} initialCenterId={selection.centerId} /> : null}
    {view === "terminal" ? <DirectorPaymentTerminalWorkspace key={targetKey} families={billingFamilies} centers={billingCenters} initialFamilyId={selection.familyId} initialCenterId={selection.centerId} previewMode={!query.has("request-boundary")} /> : null}
    {view === "ledger" ? <FamilyLedgerCard key={targetKey} families={[...billingFamilies, { id: "past", name: "Fake Historical Family", centerId: "a" }]} accounts={[...billingFamilies.map((family) => ({ familyId: family.id, familyName: family.name, billingEmail: null, centerId: family.centerId, balanceCents: 10000 })), { familyId: "past", familyName: "Fake Historical Family", billingEmail: null, centerId: "a", balanceCents: 0 }]} entries={billingFamilies.map((family) => ({ id: `entry-${family.id}`, type: "tuition", description: `Fake ledger for ${family.id}`, amountCents: 10000, balanceAfterCents: 10000, effectiveAt: "2026-09-10T12:00:00.000Z", billingAccount: { family } }))} schools={billingCenters.map((center) => ({ ...center, ein: null }))} initialFamilyId={selection.familyId} initialCenterId={selection.centerId} canOpenFamilyProfile={canManageEnrollment} readOnly={!canManageEnrollment} /> : null}
  </>;
}

function Fixture() {
  if (view === "shortcuts") return <>
    <nav aria-label="Fake task shortcuts"><a href="#fake-task-a">First fake task</a><a href="#fake-task-b">Next fake task</a></nav>
    <CollapsibleCard id="fake-task-a" title="First fake task" defaultCollapsed><input aria-label="First fake input" /></CollapsibleCard>
    <CollapsibleCard id="fake-task-b" title="Next fake task" defaultCollapsed><input aria-label="Next fake input" /></CollapsibleCard>
  </>;
  if (["billing", "terminal", "ledger"].includes(view ?? "")) return <BillingFixture />;
  if (view === "team") return <TeamPermissionsPage data={team} />;
  if (view === "fte") return <FteReportForm centers={query.get("single-school") ? centers.filter((center) => center.id === "b") : centers} reports={[report]} initialCenterId="b" initialWeekStart="2026-04-08" allowCenterSelect={!query.get("director")} mode={query.get("director") ? "director" : "executive"} />;
  if (view === "fte-reader") return <FteReportExplorer centers={centers} reports={[report]} initialCenterId="b" initialWeekStart="2026-04-08" canEdit={false} />;
  if (view === "teacher") return <TeacherMobileWorkspace teacherName="Fake Teacher" roster={teacherRoster} teacherProfile={{ name: "Fake Teacher", loginEmail: "teacher@example.com", contactEmail: "teacher@example.com", phone: "", title: "Teacher", centerId: "fake-center", centerName: "Fake School", classroomId: "fake-room", hasStaffKioskCode: true }} classroomOptions={[{ id: "fake-room", name: "Fake Classroom", ageGroup: "Preschool" }]} />;
  return <ParentFixture />;
}

function ParentFixture() {
  const [currentDocuments, setCurrentDocuments] = useState<ComponentProps<typeof ParentPortalWorkspace>["documents"]>(orderedDocuments);
  useEffect(() => {
    function refreshDocuments(event: Event) {
      const detail = (event as CustomEvent<{ id: string; status: string }>).detail;
      setCurrentDocuments((rows) => rows.map((row) => ({ ...row, ...(row.id === detail.id ? { status: detail.status } : {}) })));
    }
    window.addEventListener("fake-parent-server-refresh", refreshDocuments);
    return () => window.removeEventListener("fake-parent-server-refresh", refreshDocuments);
  }, []);
  const currentPageDocuments = currentDocuments.slice(documentPage.skip, documentPage.skip + documentPage.pageSize);
  const currentLinkedDocument = currentDocuments.find((record) => record.id === requestedDocumentId) ?? null;
  return <ParentPortalWorkspace {...executiveParentPortalDemo}
    invoices={attentionCase ? prioritizeParentAttentionRecords(priorInvoiceRows, hiddenOpenInvoice) : executiveParentPortalDemo.invoices}
    incidents={attentionCase ? prioritizeParentAttentionRecords<{ id: string; occurredAt: string | Date; type: string; description: string; actionTaken: string; parentAcknowledgedAt: string | Date | null; child: { fullName: string } }>(priorIncidentRows, hiddenIncident) : executiveParentPortalDemo.incidents}
    attentionSummary={attentionCase ? { openInvoiceCount: 7, unacknowledgedIncidentCount: 5 } : undefined}
    family={query.has("multi-child") ? { ...executiveParentPortalDemo.family!, children: Array.from({ length: 3 }, (_, index) => ({ ...executiveParentPortalDemo.family!.children[0], id: `fake-sibling-${index}`, preferredName: null, fullName: `Fake Sibling ${index + 1} With A Long Family Name` })) } : executiveParentPortalDemo.family}
    documents={currentPageDocuments}
    documentPagination={documentPage}
    documentSummary={{ total: currentDocuments.length, actionRequired: currentDocuments.filter((document) => parentDocumentState(document) === "action_required").length, firstRequired: currentDocuments.find((document) => parentDocumentState(document) === "action_required") ?? null }}
    linkedDocument={currentLinkedDocument && !currentPageDocuments.some((document) => document.id === currentLinkedDocument.id) ? currentLinkedDocument : null}
    requestedDocumentId={requestedDocumentId}
    requestedDocumentUnavailable={Boolean(requestedDocumentId && !linkedDocument)}
    centerTimeZone={query.get("tz")}
    dailyReports={query.has("tz") ? executiveParentPortalDemo.dailyReports.map((item, index) => ({ ...item, date: `2026-09-11T${index ? "23" : "14"}:00:00.000Z` })) : executiveParentPortalDemo.dailyReports}
    media={query.has("tz") ? [] : executiveParentPortalDemo.media}
    activeView={view === "payments" ? "payments" : view === "messages" ? "messages" : view === "updates" ? "updates" : view === "children" || view === "documents" ? "family" : "home"}
    familySection={view === "documents" ? "documents" : "children"}
    currentGuardianId="exec-demo-guardian-a"
    messages={[1, 2].map((index) => ({ id: `fake-message-${index}`, subject: `Fake subject ${index}`, body: `Fake school message ${index}`, createdAt: `2026-09-10T1${index}:00:00.000Z`, isFromFamily: false }))}
    announcements={[
      { id: "fake-latest", title: "Fake latest announcement", body: "Fake latest classroom news.", sendAt: "2026-09-10T14:00:00.000Z" },
      { id: "fake-earlier", title: "Fake earlier announcement", body: "Fake earlier classroom news remains available.", sendAt: "2026-09-09T14:00:00.000Z" },
    ]}
  />;
}

createRoot(document.getElementById("root")!).render(<SchoolTimeZoneProvider timeZone="America/New_York"><Fixture /></SchoolTimeZoneProvider>);
