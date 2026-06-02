"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Clipboard, Download, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SnapshotDateRange = "7" | "30" | "90" | "month";

type DashboardSnapshotView = {
  id: string;
  name: string;
  dateRange: SnapshotDateRange;
  lens: string;
};

type SnapshotKpi = {
  label: string;
  value: string;
  trend: string;
};

type SnapshotPipelineStage = {
  name: string | number;
  count: number;
  value: string | number;
};

type SnapshotCenter = {
  name: string;
  region: string;
  director: string;
  children: number;
  staff: number;
  compliance: number;
};

type SnapshotLead = {
  family: string;
  child: string;
  source: string;
  desiredStart: string;
  score: number;
  stage: string;
  tags: string[];
};

type Props = {
  kpis: SnapshotKpi[];
  pipelineStages: SnapshotPipelineStage[];
  centers: SnapshotCenter[];
  leads: SnapshotLead[];
  visibleLenses: readonly string[];
  defaultLens: string;
  aiSummary: string;
};

const dashboardViewsStorageKey = "bee-suite.dashboard.savedViews.v1";
const dashboardViewsEventName = "bee-suite-dashboard-saved-views";
let dashboardViewsRawSnapshot = "";
let dashboardViewsSnapshot: DashboardSnapshotView[] = [];

const dateRangeLabels: Record<SnapshotDateRange, string> = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
  month: "This month",
};

const lensLabels: Record<string, string> = {
  platform: "Platform admin",
  brand: "Brand admin",
  regional: "Regional",
  director: "Center director",
  teacher: "Teacher",
  parent: "Parent",
};

function parseDashboardViews(value: string | null): DashboardSnapshotView[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as DashboardSnapshotView[];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((view) => {
      if (!view?.id || !view?.name) return [];
      const dateRange = view.dateRange in dateRangeLabels ? view.dateRange : "30";
      return [{
        id: String(view.id),
        name: String(view.name),
        dateRange,
        lens: String(view.lens ?? "director"),
      }];
    });
  } catch {
    return [];
  }
}

function getDashboardViewsSnapshot() {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(dashboardViewsStorageKey) ?? "";
  if (raw !== dashboardViewsRawSnapshot) {
    dashboardViewsRawSnapshot = raw;
    dashboardViewsSnapshot = parseDashboardViews(raw);
  }
  return dashboardViewsSnapshot;
}

function getServerDashboardViewsSnapshot() {
  return [];
}

function subscribeDashboardViews(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const listener = () => callback();
  window.addEventListener("storage", listener);
  window.addEventListener(dashboardViewsEventName, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(dashboardViewsEventName, listener);
  };
}

function safeCsvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function makeSnapshotCsv({
  dateRange,
  lens,
  kpis,
  pipelineStages,
  centers,
  leads,
}: {
  dateRange: string;
  lens: string;
  kpis: SnapshotKpi[];
  pipelineStages: SnapshotPipelineStage[];
  centers: SnapshotCenter[];
  leads: SnapshotLead[];
}) {
  const rows = [
    ["Section", "Name", "Value", "Detail"],
    ["Snapshot", "Date range", dateRange, ""],
    ["Snapshot", "Dashboard lens", lens, ""],
    ...kpis.map((kpi) => ["KPI", kpi.label, kpi.value, kpi.trend]),
    ...pipelineStages.map((stage) => ["Pipeline", stage.name, stage.count, stage.value]),
    ...centers.map((center) => [
      "Center",
      center.name,
      `${center.children} children / ${center.staff} staff`,
      `${center.region}; ${center.director}; compliance ${center.compliance}%`,
    ]),
    ...leads.map((lead) => [
      "Lead",
      lead.family,
      `${lead.stage}; score ${lead.score}`,
      `${lead.child}; ${lead.source}; start ${lead.desiredStart}; ${lead.tags.join(", ")}`,
    ]),
  ];
  return rows.map((row) => row.map(safeCsvCell).join(",")).join("\r\n");
}

export function DashboardSnapshotControls({
  kpis,
  pipelineStages,
  centers,
  leads,
  visibleLenses,
  defaultLens,
  aiSummary,
}: Props) {
  const savedViews = useSyncExternalStore(
    subscribeDashboardViews,
    getDashboardViewsSnapshot,
    getServerDashboardViewsSnapshot,
  );
  const availableLenses = visibleLenses.length ? visibleLenses : ["director"];
  const [dateRange, setDateRange] = useState<SnapshotDateRange>("30");
  const [lens, setLens] = useState(availableLenses.includes(defaultLens) ? defaultLens : availableLenses[0]);
  const [viewName, setViewName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const snapshotSummary = useMemo(() => {
    const topKpis = kpis.slice(0, 4).map((kpi) => `${kpi.label}: ${kpi.value} (${kpi.trend})`).join("\n");
    const topLeads = leads.slice(0, 3).map((lead) => `${lead.family}: ${lead.stage}, score ${lead.score}`).join("\n");
    return [
      `The Bee Suite dashboard snapshot`,
      `Range: ${dateRangeLabels[dateRange]}`,
      `Lens: ${lensLabels[lens] ?? lens}`,
      "",
      "KPIs",
      topKpis || "No KPI rows visible.",
      "",
      "Priority leads",
      topLeads || "No leads visible.",
      "",
      "AI brief",
      aiSummary,
    ].join("\n");
  }, [aiSummary, dateRange, kpis, leads, lens]);

  function persistSavedViews(nextViews: DashboardSnapshotView[]) {
    window.localStorage.setItem(dashboardViewsStorageKey, JSON.stringify(nextViews));
    window.dispatchEvent(new Event(dashboardViewsEventName));
  }

  function saveView() {
    const name = viewName.trim() || `${lensLabels[lens] ?? lens} ${dateRangeLabels[dateRange]}`;
    const view: DashboardSnapshotView = {
      id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
      name,
      dateRange,
      lens,
    };
    persistSavedViews([view, ...savedViews].slice(0, 10));
    setViewName("");
    setStatusMessage("Dashboard view saved on this device.");
  }

  function applyView(view: DashboardSnapshotView) {
    setDateRange(view.dateRange);
    setLens(availableLenses.includes(view.lens) ? view.lens : availableLenses[0]);
    setStatusMessage(`Applied dashboard view: ${view.name}.`);
  }

  function deleteView(viewId: string) {
    persistSavedViews(savedViews.filter((view) => view.id !== viewId));
    setStatusMessage("Dashboard view removed from this device.");
  }

  function exportSnapshot() {
    const blob = new Blob([
      makeSnapshotCsv({
        dateRange: dateRangeLabels[dateRange],
        lens: lensLabels[lens] ?? lens,
        kpis,
        pipelineStages,
        centers,
        leads,
      }),
    ], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bee-suite-dashboard-snapshot-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatusMessage("Dashboard snapshot exported.");
  }

  async function copySnapshot() {
    await navigator.clipboard.writeText(snapshotSummary);
    setStatusMessage("Dashboard snapshot copied.");
  }

  return (
    <Card className="glass-panel">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[12rem_14rem_1fr_auto_auto_auto]">
          <Select value={dateRange} onValueChange={(value) => value && setDateRange(value as SnapshotDateRange)}>
            <SelectTrigger aria-label="Dashboard date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(dateRangeLabels) as SnapshotDateRange[]).map((range) => (
                <SelectItem key={range} value={range}>
                  {dateRangeLabels[range]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={lens} onValueChange={(value) => value && setLens(value)}>
            <SelectTrigger aria-label="Dashboard lens">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableLenses.map((availableLens) => (
                <SelectItem key={availableLens} value={availableLens}>
                  {lensLabels[availableLens] ?? availableLens}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={viewName}
            onChange={(event) => setViewName(event.target.value)}
            placeholder="Saved dashboard view name"
            aria-label="Saved dashboard view name"
          />
          <Button variant="outline" onClick={saveView}>
            <Save data-icon="inline-start" />
            Save view
          </Button>
          <Button variant="outline" onClick={exportSnapshot}>
            <Download data-icon="inline-start" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={copySnapshot}>
            <Clipboard data-icon="inline-start" />
            Copy summary
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{dateRangeLabels[dateRange]}</Badge>
          <Badge variant="outline">{lensLabels[lens] ?? lens}</Badge>
          {statusMessage ? <span className="text-xs text-muted-foreground">{statusMessage}</span> : null}
        </div>
        {savedViews.length ? (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {savedViews.map((view) => (
              <div key={view.id} className="flex items-center gap-1 rounded-lg border bg-background/55 p-1">
                <Button size="xs" variant="ghost" onClick={() => applyView(view)}>
                  {view.name}
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => deleteView(view.id)}
                  aria-label={`Delete saved dashboard view ${view.name}`}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
