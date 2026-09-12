// Local browser-test entry only; not imported by the application.
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import { ParentPortalWorkspace } from "../../src/components/parent-portal-workspace";
import { SchoolTimeZoneProvider } from "../../src/components/school-time-zone-context";
import { executiveParentPortalDemo } from "../../src/lib/executive-demo-data";

function Fixture() {
  const [familyId, setFamilyId] = useState("exec-demo-family");
  const [version, setVersion] = useState(0);
  const messages = useMemo(() => Array.from({ length: 20 }, (_, index) => ({
    id: `message-${String(40 - index).padStart(3, "0")}`, subject: `Fake canonical subject ${40 - index}`,
    body: `Fake school conversation entry ${40 - index}. Classroom supplies are ready for the new week.${version ? " Refreshed fixture." : ""}`,
    createdAt: "2026-09-12T14:00:00.000Z", sender: { name: "Fake Teacher" }, isFromFamily: false, canReport: false, attachments: [],
  })), [version]);
  useEffect(() => {
    const changeFamily = () => setFamilyId("fake-second-family");
    const refresh = () => setVersion(value => value + 1);
    window.addEventListener("fake-message-family", changeFamily); window.addEventListener("fake-message-refresh", refresh);
    document.documentElement.dataset.fixtureReady = "true";
    return () => { window.removeEventListener("fake-message-family", changeFamily); window.removeEventListener("fake-message-refresh", refresh); };
  }, []);
  return <ParentPortalWorkspace {...executiveParentPortalDemo} family={{ ...executiveParentPortalDemo.family!, id: familyId }}
    centerName="Sunshine Academy" activeView="messages" messages={messages} messageHistoryNextCursor="message-021"
    messageSchoolUnavailable={new URLSearchParams(window.location.search).has("ambiguous-school")}
    classroomTeachers={[{ id: "fake-teacher", name: "Fake Teacher", classroomNames: ["Butterflies"] }]} />;
}
createRoot(document.getElementById("root")!).render(<SchoolTimeZoneProvider timeZone="America/New_York"><Fixture /></SchoolTimeZoneProvider>);
