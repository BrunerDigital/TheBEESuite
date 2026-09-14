// Fake local UI fixture only; never imported by production routes.
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { AppShell } from "../../src/components/app-shell";
import { AnnouncementWorkspace } from "../../src/components/announcement-workspace";
import { recordPagination } from "../../src/lib/record-pagination";
import type { AnnouncementRecord } from "../../src/lib/announcement-workflow";

export const fakeAnnouncementRows = [
  { id: "fake-draft", centerId: "fake-school", title: "Fake family picnic", body: "Please review this fake school picnic notice.\nBring a reusable water bottle.", audience: { label: "school_parent_portal" }, status: "draft", sendAt: null, center: { name: "Fake School A", crmLocationId: null } },
  { id: "fake-published", centerId: "fake-school", title: "Fake published school update", body: "This is a fake published notice.", audience: null, status: "published", sendAt: "2026-09-13T20:00:00Z", center: { name: "Fake School A", crmLocationId: null } },
  { id: "fake-global", centerId: null, title: "Fake platform-wide notice", body: "A fake platform notice that school directors may read but not change.", audience: null, status: "published", sendAt: "2026-09-13T20:00:00Z", center: null },
  { id: "fake-targeted", centerId: "fake-school", title: "Fake legacy staff notice", body: "Fake targeted staff-only content.", audience: { staffIds: ["fake-staff"] }, status: "scheduled", sendAt: "2026-09-14T20:00:00Z", center: { name: "Fake School A", crmLocationId: null } },
] satisfies Array<AnnouncementRecord & { center: { name: string; crmLocationId: string | null } | null }>;

function Fixture() {
  const query = new URLSearchParams(location.search), auditor = query.has("auditor"), owner = query.has("owner");
  const [rows, setRows] = useState(fakeAnnouncementRows);
  useEffect(() => {
    const update = (event: Event) => setRows((event as CustomEvent<typeof rows>).detail);
    window.addEventListener("fake-announcement-refresh", update);
    document.documentElement.dataset.fixtureReady = "true";
    return () => { window.removeEventListener("fake-announcement-refresh", update); delete document.documentElement.dataset.fixtureReady; };
  }, []);
  return <AppShell previewMode previewHrefBase={location.pathname + location.search} currentUser={{ name: "Fake School Reviewer", email: "reviewer@example.invalid", role: auditor ? "READ_ONLY_AUDITOR" : owner ? "PLATFORM_OWNER" : "CENTER_DIRECTOR", centerIds: ["fake-school", "fake-school-b"], timeZone: "America/New_York", scopeContext: { kind: "school", label: "Fake School A", detail: "Fake school workspace", href: "/announcements" } }}>
    <AnnouncementWorkspace data={{ centers: [{ id: "fake-school", name: "Fake School A" }, { id: "fake-school-b", name: "Fake School B" }], announcements: rows, canEdit: !auditor, canManagePlatform: owner && !query.has("selected-school"), pagination: { ...recordPagination("1", 101), previousHref: null, nextHref: "/announcements?page=2" } }} />
  </AppShell>;
}
if (typeof document !== "undefined") createRoot(document.getElementById("root")!).render(<Fixture />);
