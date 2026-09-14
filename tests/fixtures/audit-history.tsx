import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AuditHistoryUnavailable, AuditLogsPage } from "../../src/components/audit-history-page";
import { auditHistoryHref, parseAuditHistoryFilters, type AuditHistoryData } from "../../src/lib/audit-history";
import { recordPagination } from "../../src/lib/record-pagination";

function Fixture() {
  const [search, setSearch] = useState(() => location.search);
  const [latestFilteredSearch, setLatestFilteredSearch] = useState("");
  const setFixtureSearch = (next: string) => { history.pushState({}, "", "/audit-logs" + next); if (next.includes("q=")) setLatestFilteredSearch(next); setSearch(next); };
  useEffect(() => {
    document.documentElement.dataset.fixtureReady = "true";
    const changed = () => { const next = location.search; if (next.includes("q=")) setLatestFilteredSearch(next); setSearch(next); }; window.addEventListener("fake-audit-navigation", changed); window.addEventListener("popstate", changed);
    return () => { window.removeEventListener("fake-audit-navigation", changed); window.removeEventListener("popstate", changed); };
  }, []);
  let data: AuditHistoryData;
  try {
    const filters = parseAuditHistoryFilters(new URLSearchParams(search));
    const all = Array.from({ length: 121 }, (_, index) => ({ id: "fake-event-" + index, action: index === 120 ? "historic.record.reviewed" : "document.reviewed",
      resource: "Document", resourceId: "fake-record-" + index + "-long-readable-identifier", createdAt: "2026-09-13T16:00:00.000Z",
      user: { name: "Fake School Reviewer", email: "synthetic-reviewer@example.test" }, actorUnavailable: false,
      center: { id: index % 2 ? "fake-school-a" : "fake-school-b", label: index % 2 ? "Fake School · school-a" : "Fake School · school-b" } }));
    const matching = all.filter(log => (!filters.q || JSON.stringify(log).toLowerCase().includes(filters.q.toLowerCase()))
      && (!filters.action || log.action === filters.action) && (!filters.resource || log.resource === filters.resource) && (!filters.centerId || log.center.id === filters.centerId));
    const pagination = recordPagination(filters.page, matching.length), canonical = { ...filters, page: String(pagination.page) };
    data = { filters: canonical, logs: matching.slice(pagination.skip, pagination.skip + pagination.pageSize), timeZone: "America/New_York",
      stats: { total: matching.length, sensitive: 0, leadActions: 0 }, actions: ["document.reviewed", "historic.record.reviewed"], resources: ["Document"],
      centers: [{ id: "fake-school-a", label: "Fake School · school-a" }, { id: "fake-school-b", label: "Fake School · school-b" }], globalAvailable: false,
      pagination: { ...pagination, previousHref: pagination.page > 1 ? auditHistoryHref(canonical, pagination.page - 1) : null,
        nextHref: pagination.page < pagination.totalPages ? auditHistoryHref(canonical, pagination.page + 1) : null } };
  } catch (error) { return <AuditHistoryUnavailable message={error instanceof Error ? error.message : "Invalid filters"} />; }
  return <><button type="button" className="hidden" data-fixture-audit-search="all" onClick={() => setFixtureSearch("?page=3")}>Fixture all schools</button>
    <button type="button" className="hidden" data-fixture-audit-search="filtered" onClick={() => setFixtureSearch(latestFilteredSearch)}>Fixture filtered school</button><AuditLogsPage data={data} /></>;
}
createRoot(document.getElementById("root")!).render(<main className="bee-app-frame min-w-0 p-3 sm:p-5" data-role="READ_ONLY_AUDITOR"><Fixture /></main>);
