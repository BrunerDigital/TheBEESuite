// Fake local browser-test entry only. Never imported by application routes.
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { ParentPortalWorkspace } from "../../src/components/parent-portal-workspace";
import { SchoolTimeZoneProvider } from "../../src/components/school-time-zone-context";
import { executiveParentPortalDemo } from "../../src/lib/executive-demo-data";
import { fakeUpdateFamily, fakeUpdateReports, fakeUpdatesPage } from "./parent-updates-data";
import type { ParentUpdatesPage } from "../../src/lib/parent-updates-history";

const params = new URLSearchParams(location.search);
const initial = fakeUpdatesPage({ familyId: fakeUpdateFamily, day: params.get("updateDay"), kind: "day", cursor: null });
if (params.has("photo") && initial.photos[0]) initial.photos[0] = { ...initial.photos[0], url: `${location.origin}/fake-photo.png?demo=1` };
function Fixture() {
  const [state, setState] = useState({ familyId: fakeUpdateFamily, page: initial, enabled: true });
  useEffect(() => {
    const update = (event: Event) => setState(previous => ({ ...previous, ...(event as CustomEvent<Partial<{ familyId: string; page: ParentUpdatesPage; enabled: boolean }>>).detail }));
    window.addEventListener("fake-update-snapshot", update);
    return () => window.removeEventListener("fake-update-snapshot", update);
  }, []);
  return <SchoolTimeZoneProvider timeZone="Asia/Tokyo"><ParentPortalWorkspace {...executiveParentPortalDemo}
    family={{ ...executiveParentPortalDemo.family!, id: state.familyId }}
    activeView={params.get("view") === "home" ? "home" : "updates"} centerTimeZone="America/New_York"
    dailyReports={state.page.reports} media={state.page.photos} messages={[]} incidents={[]} invoices={[]} documents={[]}
    announcements={[]} latestSharedReport={fakeUpdateReports[0]} updatesHistory={state.page}
    updatesHistoryEnabled={state.enabled} requestedUpdateDay={params.get("updateDay")} previewMode={params.has("preview")}
  /></SchoolTimeZoneProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
