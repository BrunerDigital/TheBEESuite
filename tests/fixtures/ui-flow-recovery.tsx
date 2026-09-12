// Local browser-test entry point only. Never imported by the application.
import { createRoot } from "react-dom/client";
import { ParentPortalWorkspace } from "../../src/components/parent-portal-workspace";
import { TeacherMobileWorkspace } from "../../src/components/teacher-mobile-workspace";
import { FteReportForm, type FteReportRow } from "../../src/components/fte-report-form";
import { FteReportExplorer } from "../../src/components/fte-report-explorer";
import { executiveParentPortalDemo } from "../../src/lib/executive-demo-data";
import { SchoolTimeZoneProvider } from "../../src/components/school-time-zone-context";

const query = new URLSearchParams(location.search);
const view = query.get("view");
const centers = ["a", "b"].map((id) => ({ id, name: `Fake School ${id.toUpperCase()}`, licensedCapacity: 80, crmLocationId: null, city: null, state: null, ownerGroup: null }));
const report: FteReportRow = {
  id: "fake-historical-b", centerId: "b", centerName: "Fake School B", weekStart: "2026-04-08T00:00:00.000Z", weekEnd: "2026-04-15T00:00:00.000Z",
  locationData: "Fake historical location", accountReceivableAmount: 0, selfPayerBillAmount: 0, subsidyBillAmount: null, externalAgencyBillAmount: null, totalBilledAmount: 0,
  enrolledCount: 5, fullTimeCount: 5, partTimeCount: 0, twoDayCount: 0, threeDayCount: 0, fourDayCount: 0, fiveDayCount: 5, fteCount: 0,
  licenseCapacity: 80, payrollAmount: 0, infants: 0, toddlers: 0, twos: 0, preschool: 5, preK: 0, schoolAge: 0, status: query.get("approved") ? "approved" : "submitted",
  source: "manual_correction", notes: "Fake saved historical notes", submittedBy: "Fake Reviewer", updatedAt: "2026-04-16T14:00:00.000Z",
};

function Fixture() {
  if (view === "fte") return <FteReportForm centers={query.get("single-school") ? centers.filter((center) => center.id === "b") : centers} reports={[report]} initialCenterId="b" initialWeekStart="2026-04-08" allowCenterSelect mode={query.get("director") ? "director" : "executive"} />;
  if (view === "fte-reader") return <FteReportExplorer centers={centers} reports={[report]} initialCenterId="b" initialWeekStart="2026-04-08" canEdit={false} />;
  if (view === "teacher") return <TeacherMobileWorkspace teacherName="Fake Teacher" roster={[{
    id: "fake-child", fullName: "Fake Child", ageGroup: "Preschool", enrollmentStatus: "active", photoVideoPermission: true, classroom: { id: "fake-room", name: "Fake Classroom" },
  }]} teacherProfile={{ name: "Fake Teacher", loginEmail: "teacher@example.com", contactEmail: "teacher@example.com", phone: "", title: "Teacher", centerId: "fake-center", centerName: "Fake School", classroomId: "fake-room", hasStaffKioskCode: true }} classroomOptions={[{ id: "fake-room", name: "Fake Classroom", ageGroup: "Preschool" }]} />;
  return <ParentPortalWorkspace {...executiveParentPortalDemo}
    activeView={view === "messages" ? "messages" : view === "updates" ? "updates" : view === "children" ? "family" : "home"}
    familySection="children"
    currentGuardianId="exec-demo-guardian-a"
    messages={[1, 2].map((index) => ({ id: `fake-message-${index}`, subject: `Fake subject ${index}`, body: `Fake school message ${index}`, createdAt: `2026-09-10T1${index}:00:00.000Z`, isFromFamily: false }))}
    announcements={[
      { id: "fake-latest", title: "Fake latest announcement", body: "Fake latest classroom news.", sendAt: "2026-09-10T14:00:00.000Z" },
      { id: "fake-earlier", title: "Fake earlier announcement", body: "Fake earlier classroom news remains available.", sendAt: "2026-09-09T14:00:00.000Z" },
    ]}
  />;
}

createRoot(document.getElementById("root")!).render(<SchoolTimeZoneProvider timeZone="America/New_York"><Fixture /></SchoolTimeZoneProvider>);
