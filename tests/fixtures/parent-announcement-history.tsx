// Real components with fake local data only; no application route imports this fixture.
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../src/components/app-shell";
import { ParentPortalWorkspace } from "../../src/components/parent-portal-workspace";
import { executiveParentPortalDemo } from "../../src/lib/executive-demo-data";

function Fixture() {
  const [familyId, setFamilyId] = useState("exec-demo-family"), [version, setVersion] = useState(0);
  const query = new URLSearchParams(location.search);
  const [unavailable] = useState(() => new URLSearchParams(location.search).has("unavailable"));
  const announcements = useMemo(() => unavailable ? [] : Array.from({ length: 8 }, (_, index) => ({
    id: `notice-${String(16 - index).padStart(3, "0")}`, title: `Fake school notice ${16 - index}`,
    body: `A fake reminder about the upcoming school week.\nPlease bring a reusable water bottle and check classroom supplies.${version ? " Refreshed fake notice." : ""}`,
    sendAt: "2026-09-13T14:00:00.000Z",
  })), [version, unavailable]);
  useEffect(() => {
    const family = () => setFamilyId("fake-second-family"), refresh = () => setVersion(value => value + 1);
    window.addEventListener("fake-announcement-family", family); window.addEventListener("fake-announcement-refresh", refresh);
    document.documentElement.dataset.fixtureReady = "true";
    return () => { window.removeEventListener("fake-announcement-family", family); window.removeEventListener("fake-announcement-refresh", refresh); };
  }, []);
  return <AppShell previewMode previewHrefBase="/parents" currentUser={{ name: "Fake Parent", email: "parent@example.invalid", role: "PARENT_GUARDIAN", centerIds: ["fake-school"], timeZone: "America/New_York" }}>
    <ParentPortalWorkspace {...executiveParentPortalDemo} family={{ ...executiveParentPortalDemo.family!, id: familyId }} activeView="home" centerName="Sunshine Academy"
      announcements={announcements} announcementHistoryEnabled announcementHistoryUnavailable={unavailable} announcementHistoryNextCursor={unavailable ? null : "notice-009"}
      appReviewMode={query.has("reviewer")} demoMode={query.has("demo")} previewMode={query.has("preview")} />
  </AppShell>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
