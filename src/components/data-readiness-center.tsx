"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Database,
  Download,
  FileCheck2,
  Filter,
  ListChecks,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { ProcareImportPanel } from "@/components/procare-import-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  CONFIRMED_PROCARE_AREAS,
  DATA_READINESS_STATUSES,
  GUARDED_PROCARE_GAPS,
  type DataReadinessDecision,
  type DataReadinessStatus,
  type DataReadinessTask,
  type DataReadinessWorkspaceData,
} from "@/lib/data-readiness";
import {
  DATA_READINESS_CONTEXTS,
  normalizeDataReadinessContext,
  type DataReadinessViewFilters,
} from "@/lib/data-readiness-context";
import { cn } from "@/lib/utils";

type DataReadinessCenterProps = {
  data: DataReadinessWorkspaceData;
  centers: Array<{ id: string; name: string }>;
  allowBulkImport: boolean;
  initialView: DataReadinessViewFilters;
};

const statusCopy: Record<DataReadinessStatus, { label: string; detail: string; icon: typeof ShieldCheck }> = {
  BLOCKED: { label: "Blocked", detail: "Missing or unsafe", icon: ShieldAlert },
  CONFIRM: { label: "Confirm", detail: "Staff review needed", icon: CircleDashed },
  READY: { label: "Ready", detail: "Ready for import", icon: Check },
  EXCLUDED: { label: "Excluded", detail: "Intentionally left out", icon: AlertTriangle },
  IMPORTED: { label: "Imported", detail: "Import completed", icon: Database },
  VERIFIED: { label: "Verified", detail: "Import checked", icon: ShieldCheck },
  FAILED: { label: "Failed", detail: "Review and retry", icon: AlertTriangle },
};

const decisionOptions: Array<{ action: DataReadinessDecision; label: string; detail: string }> = [
  { action: "confirm", label: "Confirm", detail: "Approve the reviewed source decision" },
  { action: "edit", label: "Edit", detail: "Record a corrected proposed value or instruction" },
  { action: "match_existing", label: "Match existing", detail: "Approve a stable existing-record match" },
  { action: "create_new", label: "Create new", detail: "Approve creation only for a later import after review" },
  { action: "exclude", label: "Exclude", detail: "Intentionally omit with a documented reason" },
  { action: "request_information", label: "Request information", detail: "Hold until the source owner responds" },
  { action: "defer", label: "Defer", detail: "Keep the task in confirmation state" },
];

const statusWeight = new Map<DataReadinessStatus, number>([
  ["BLOCKED", 0], ["FAILED", 1], ["CONFIRM", 2], ["READY", 3], ["IMPORTED", 4], ["VERIFIED", 5], ["EXCLUDED", 6],
]);

function statusVariant(status: DataReadinessStatus) {
  if (status === "BLOCKED" || status === "FAILED") return "destructive" as const;
  if (status === "CONFIRM" || status === "EXCLUDED") return "secondary" as const;
  return status === "VERIFIED" ? "default" as const : "outline" as const;
}

function riskClass(risk: DataReadinessTask["risk"]) {
  if (risk === "critical") return "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-200";
  if (risk === "high") return "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-100";
  if (risk === "medium") return "border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-100";
  return "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100";
}

function riskLabel(risk: DataReadinessTask["risk"]) {
  return `${risk.charAt(0).toUpperCase()}${risk.slice(1)}`;
}

function decisionResultStatus(action: DataReadinessDecision): DataReadinessStatus {
  if (action === "exclude") return "EXCLUDED";
  if (action === "request_information" || action === "defer") return "CONFIRM";
  return "READY";
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function ReadinessHex({ status, value }: { status: DataReadinessStatus; value: number }) {
  const copy = statusCopy[status];
  const Icon = copy.icon;
  return (
    <div className={cn("readiness-hex", `readiness-hex--${status.toLowerCase()}`)}>
      <span className="readiness-hex__inner">
        <Icon className="size-5" aria-hidden="true" />
        <strong>{value.toLocaleString()}</strong>
        <span>{copy.label}</span>
      </span>
    </div>
  );
}

export function DataReadinessCenter({ data, centers, allowBulkImport, initialView }: DataReadinessCenterProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState(data.tasks);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialView.status);
  const [riskFilter, setRiskFilter] = useState(initialView.risk);
  const [categoryFilter, setCategoryFilter] = useState(initialView.category);
  const [tab, setTab] = useState(initialView.tab);
  const [sort, setSort] = useState(initialView.sort);
  const [page, setPage] = useState(1);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [bulkTaskIds, setBulkTaskIds] = useState<string[]>([]);
  const [action, setAction] = useState<DataReadinessDecision>("confirm");
  const [note, setNote] = useState("");
  const [proposedValue, setProposedValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const pageSize = 20;
  const categoryContext = normalizeDataReadinessContext(categoryFilter.startsWith("context:") ? categoryFilter.slice(8) : "");
  const exportParams = new URLSearchParams({ format: "csv" });
  if (categoryContext) exportParams.set("context", categoryContext);
  if (!categoryContext && categoryFilter !== "all") exportParams.set("category", categoryFilter);
  const exportHref = `/api/data-readiness?${exportParams.toString()}`;

  const categories = useMemo(() => [...new Set(tasks.map((task) => task.category))], [tasks]);
  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    const contextCategories = categoryContext
      ? DATA_READINESS_CONTEXTS[categoryContext].categories as readonly string[]
      : [];
    return tasks
      .filter((task) => {
        if (statusFilter === "actionable" && !["BLOCKED", "CONFIRM", "FAILED"].includes(task.status)) return false;
        if (statusFilter !== "all" && statusFilter !== "actionable" && task.status !== statusFilter) return false;
        if (riskFilter !== "all" && task.risk !== riskFilter) return false;
        if (categoryContext && contextCategories.length && !contextCategories.includes(task.category)) return false;
        if (!categoryContext && categoryFilter !== "all" && task.category !== categoryFilter) return false;
        if (!query) return true;
        return [task.entity, task.centerName, task.reason, task.sourceFilename, task.category, ...task.sourceIds]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .toSorted((left, right) => {
        if (sort === "updated") return right.updatedAt.localeCompare(left.updatedAt);
        if (sort === "location") return left.centerName.localeCompare(right.centerName) || left.priority - right.priority;
        return (statusWeight.get(left.status) ?? 9) - (statusWeight.get(right.status) ?? 9)
          || left.priority - right.priority
          || right.updatedAt.localeCompare(left.updatedAt);
      });
  }, [categoryContext, categoryFilter, riskFilter, search, sort, statusFilter, tasks]);
  const pageCount = Math.max(1, Math.ceil(filteredTasks.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleTasks = filteredTasks.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const bulkEligibleVisible = visibleTasks.filter((task) => task.bulkEligible).map((task) => task.id);

  function updateView(next: Partial<Pick<DataReadinessViewFilters, "tab" | "status" | "risk" | "category" | "sort">>) {
    const view = {
      tab: next.tab ?? tab,
      status: next.status ?? statusFilter,
      risk: next.risk ?? riskFilter,
      category: next.category ?? categoryFilter,
      sort: next.sort ?? sort,
    };
    const params = new URLSearchParams();
    if (view.tab !== "overview") params.set("tab", view.tab);
    if (view.status !== "actionable") params.set("status", view.status);
    if (view.risk !== "all") params.set("risk", view.risk);
    const nextContext = normalizeDataReadinessContext(view.category.startsWith("context:") ? view.category.slice(8) : "");
    if (nextContext) params.set("context", nextContext);
    else if (view.category !== "all") params.set("category", view.category);
    if (view.sort !== "priority") params.set("sort", view.sort);
    router.replace(params.size ? `/data-readiness?${params.toString()}` : "/data-readiness", { scroll: false });
  }

  function openTask(task: DataReadinessTask) {
    setSelectedTaskId(task.id);
    setAction(task.decision ?? "confirm");
    setNote(task.decisionNote);
    setProposedValue(task.proposedValue);
    setFeedback(null);
  }

  function nextTaskId(currentId: string) {
    const currentIndex = filteredTasks.findIndex((task) => task.id === currentId);
    if (currentIndex < 0) return null;
    return filteredTasks.slice(currentIndex + 1).find((task) => ["BLOCKED", "CONFIRM", "FAILED"].includes(task.status))?.id ?? null;
  }

  async function recordDecision(taskIds: string[], selectedAction: DataReadinessDecision, saveAndNext = false) {
    if (!taskIds.length || saving) return;
    setSaving(true);
    setFeedback(null);
    const response = await fetch("/api/data-readiness", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds, action: selectedAction, note, proposedValue }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => null) as { ok?: boolean; error?: string; message?: string } | null : null;
    if (!response?.ok || !result?.ok) {
      setFeedback({ tone: "error", message: result?.error || "The readiness decision could not be recorded." });
      setSaving(false);
      return;
    }
    const updatedStatus = decisionResultStatus(selectedAction);
    const updatedAt = new Date().toISOString();
    setTasks((current) => current.map((task) => taskIds.includes(task.id)
      ? { ...task, status: updatedStatus, decision: selectedAction, decisionNote: note, proposedValue: proposedValue || task.proposedValue, updatedAt }
      : task));
    setBulkTaskIds([]);
    setFeedback({ tone: "success", message: result.message || "Readiness evidence recorded." });
    if (selectedTaskId && taskIds.includes(selectedTaskId)) {
      const nextId = saveAndNext ? nextTaskId(selectedTaskId) : null;
      if (nextId) {
        const nextTask = tasks.find((task) => task.id === nextId);
        if (nextTask) openTask(nextTask);
      } else if (saveAndNext) {
        setSelectedTaskId(null);
      }
    }
    router.refresh();
    setSaving(false);
  }

  function toggleBulk(taskId: string) {
    setBulkTaskIds((current) => current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="honeyglass-hero relative overflow-hidden rounded-[1.75rem] border p-6 sm:p-8">
        <div className="hive-texture pointer-events-none absolute inset-0 opacity-[0.07]" />
        <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1fr)_34rem] xl:items-center">
          <div>
            <Badge className="mb-4" variant="outline"><Sparkles data-icon="inline-start" /> Director workflow</Badge>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">Data Readiness Center</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
              Resolve reviewed source-data differences with school-scoped evidence. Decisions are append-only and do not change operational records, access, balances, invitations, payments, or launch state.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{data.summary.sourceRows.toLocaleString()} retained source rows</Badge>
              <Badge variant="outline">{centers.length.toLocaleString()} authorized location{centers.length === 1 ? "" : "s"}</Badge>
              <Badge variant="outline">Updated {formatDate(data.summary.lastUpdated)}</Badge>
            </div>
          </div>
          <div className="readiness-honeycomb" aria-label="Data readiness status summary">
            {DATA_READINESS_STATUSES.map((status) => <ReadinessHex key={status} status={status} value={data.summary[status]} />)}
          </div>
        </div>
        <div className="honeyline mt-7" aria-label={`${data.summary.completionPercent}% of readiness tasks resolved`}>
          <span style={{ width: `${data.summary.completionPercent}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>{data.summary.completionPercent}% readiness evidence complete</span>
          <span>{data.summary.actionable} actionable</span>
        </div>
      </section>

      {feedback ? (
        <Alert variant={feedback.tone === "error" ? "destructive" : "default"} aria-live="polite">
          {feedback.tone === "error" ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
          <AlertTitle>{feedback.tone === "error" ? "Decision not saved" : "Decision recorded"}</AlertTitle>
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => { const nextTab = value as DataReadinessViewFilters["tab"]; setTab(nextTab); updateView({ tab: nextTab }); }} className="gap-5">
        <TabsList className="nectar-tabs h-auto w-full justify-start overflow-x-auto rounded-xl border bg-card/75 p-1 sm:w-fit" aria-label="Data readiness views">
          <TabsTrigger value="overview" className="min-h-10 px-4"><ShieldCheck /> Overview</TabsTrigger>
          <TabsTrigger value="queue" className="min-h-10 px-4"><ListChecks /> Action queue <Badge variant="secondary">{data.summary.actionable}</Badge></TabsTrigger>
          <TabsTrigger value="procare" className="min-h-10 px-4"><Database /> Data onboarding</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>Readiness by priority</CardTitle>
                <CardDescription>Safety and access decisions always rise above billing, enrollment, staff, communication, and historical follow-up.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {[
                  ["Safety and custody", 1], ["Access and identity", 2], ["Billing and balances", 3],
                  ["Enrollment and classroom placement", 4], ["Staff readiness", 5], ["Parent communication readiness", 6],
                  ["Historical and informational data", 7],
                ].map(([category, priority]) => {
                  const matching = tasks.filter((task) => task.category === category);
                  const actionable = matching.filter((task) => ["BLOCKED", "CONFIRM", "FAILED"].includes(task.status)).length;
                  return (
                    <button key={category} type="button" className="group flex min-h-14 items-center gap-3 rounded-xl border bg-background/55 p-3 text-left transition hover:border-primary/35 hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { const nextCategory = String(category); setCategoryFilter(nextCategory); setStatusFilter("actionable"); setPage(1); setTab("queue"); updateView({ category: nextCategory, status: "actionable", tab: "queue" }); }}>
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 font-semibold text-primary">{priority}</span>
                      <span className="min-w-0 flex-1"><span className="block font-medium">{category}</span><span className="text-xs text-muted-foreground">{matching.length} tracked · {actionable} actionable</span></span>
                      <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <div className="grid gap-6">
              <Card className="glass-panel">
                <CardHeader><CardTitle>Independent launch gates</CardTitle><CardDescription>Readiness never silently activates the business.</CardDescription></CardHeader>
                <CardContent className="grid gap-3">
                  {["Parent invitations", "Payment and billing activation", "Kiosk and PIN activation", "School launch approval", "Legacy-system archival"].map((gate) => (
                    <div key={gate} className="flex items-center justify-between gap-3 rounded-xl border bg-background/50 p-3"><span className="text-sm font-medium">{gate}</span><Badge variant="outline">Separate approval</Badge></div>
                  ))}
                </CardContent>
              </Card>
              <Card className="glass-panel">
                <CardHeader><CardTitle>Recent import evidence</CardTitle><CardDescription>Latest reviewed batches in your current location scope.</CardDescription></CardHeader>
                <CardContent className="grid gap-3">
                  {data.batches.slice(0, 5).map((batch) => (
                    <div key={batch.id} className="rounded-xl border bg-background/50 p-3">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{batch.centerName}</div><div className="truncate text-xs text-muted-foreground">{batch.filename}</div></div><Badge variant={batch.verified ? "default" : batch.unresolvedRows ? "destructive" : "outline"}>{batch.verified ? "Verified" : batch.status}</Badge></div>
                      <div className="mt-2 text-xs text-muted-foreground">{batch.importedRows} imported · {batch.unresolvedRows} unresolved · {formatDate(batch.createdAt)}</div>
                    </div>
                  ))}
                  {!data.batches.length ? <p className="rounded-xl border bg-background/50 p-4 text-sm text-muted-foreground">No import batches are visible for this scope yet.</p> : null}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="glass-panel"><CardHeader><CardTitle>Confirmed current coverage</CardTitle><CardDescription>Supported by the existing guarded importer and retained raw evidence.</CardDescription></CardHeader><CardContent className="grid gap-3">{CONFIRMED_PROCARE_AREAS.map((item) => <div key={item} className="flex gap-3 rounded-xl border bg-emerald-500/[0.06] p-3 text-sm"><FileCheck2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /><span>{item}</span></div>)}</CardContent></Card>
            <Card className="glass-panel"><CardHeader><CardTitle>Guarded validation gaps</CardTitle><CardDescription>Do not claim first-class automation until representative unencrypted exports are validated.</CardDescription></CardHeader><CardContent className="grid gap-3">{GUARDED_PROCARE_GAPS.map((item) => <div key={item} className="flex gap-3 rounded-xl border bg-amber-500/[0.07] p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /><span>{item}</span></div>)}</CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="queue" className="grid gap-4">
          <Card className="glass-panel">
            <CardHeader className="border-b">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div><CardTitle>Prioritized action queue</CardTitle><CardDescription>Search, filter, sort, and open a focused review drawer. Results stay inside your authorized school scope.</CardDescription></div>
                <Button variant="outline" nativeButton={false} render={<Link href={exportHref} />}><Download data-icon="inline-start" /> Export CSV</Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 pt-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_11rem_11rem_16rem_11rem]">
                <label className="relative"><span className="sr-only">Search readiness tasks</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="min-h-11 pl-10" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search entity, location, source ID..." /></label>
                <Select value={statusFilter} onValueChange={(value) => { if (value) { setStatusFilter(value); setPage(1); updateView({ status: value }); } }}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="actionable">Actionable</SelectItem><SelectItem value="all">All statuses</SelectItem>{DATA_READINESS_STATUSES.map((status) => <SelectItem key={status} value={status}>{statusCopy[status].label}</SelectItem>)}</SelectContent></Select>
                <Select value={riskFilter} onValueChange={(value) => { if (value) { setRiskFilter(value); setPage(1); updateView({ risk: value }); } }}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All risks</SelectItem>{["critical", "high", "medium", "low"].map((risk) => <SelectItem key={risk} value={risk}>{risk}</SelectItem>)}</SelectContent></Select>
                <Select value={categoryFilter} onValueChange={(value) => { if (value) { setCategoryFilter(value); setPage(1); updateView({ category: value }); } }}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categoryContext ? <SelectItem value={`context:${categoryContext}`}>{DATA_READINESS_CONTEXTS[categoryContext].label}</SelectItem> : null}{categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select>
                <Select value={sort} onValueChange={(value) => { if (value) { const nextSort = value as DataReadinessViewFilters["sort"]; setSort(nextSort); updateView({ sort: nextSort }); } }}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="priority">Priority</SelectItem><SelectItem value="updated">Last updated</SelectItem><SelectItem value="location">Location</SelectItem></SelectContent></Select>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border bg-background/45 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Filter className="size-4" /> {filteredTasks.length.toLocaleString()} matching task{filteredTasks.length === 1 ? "" : "s"}{data.truncated ? " · older row tasks are available in source backups" : ""}</div>
                <div className="flex flex-wrap gap-2">
                  {bulkEligibleVisible.length ? <Button size="sm" variant="outline" onClick={() => setBulkTaskIds(bulkTaskIds.length === bulkEligibleVisible.length ? [] : bulkEligibleVisible)}>{bulkTaskIds.length === bulkEligibleVisible.length ? "Clear page selection" : "Select safe page rows"}</Button> : null}
                  <Button size="sm" disabled={!bulkTaskIds.length || saving} onClick={() => recordDecision(bulkTaskIds, "confirm")}>Confirm {bulkTaskIds.length || "safe"} low-risk row{bulkTaskIds.length === 1 ? "" : "s"}</Button>
                </div>
              </div>

              <div className="hidden overflow-hidden rounded-xl border lg:block">
                <Table>
                  <TableHeader><TableRow><TableHead className="w-10"><span className="sr-only">Select</span></TableHead><TableHead>Status</TableHead><TableHead>Priority</TableHead><TableHead>Entity and location</TableHead><TableHead>Reason</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Review</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {visibleTasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>{task.bulkEligible ? <input type="checkbox" className="size-4" aria-label={`Select ${task.entity} for safe bulk confirmation`} checked={bulkTaskIds.includes(task.id)} onChange={() => toggleBulk(task.id)} /> : null}</TableCell>
                        <TableCell><Badge variant={statusVariant(task.status)}>{statusCopy[task.status].label}</Badge></TableCell>
                        <TableCell><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-primary/12 text-xs font-semibold text-primary">{task.priority}</span><Badge variant="outline" className={riskClass(task.risk)}>{riskLabel(task.risk)}</Badge></div></TableCell>
                        <TableCell><div className="font-medium">{task.entity}</div><div className="max-w-56 truncate text-xs text-muted-foreground">{task.centerName}</div></TableCell>
                        <TableCell className="max-w-[25rem] whitespace-normal"><div className="line-clamp-2 text-sm">{task.reason}</div><div className="mt-1 text-xs text-muted-foreground">{task.category}</div></TableCell>
                        <TableCell className="max-w-48"><div className="truncate text-xs">{task.sourceFilename}</div><div className="text-xs text-muted-foreground">{task.sourceRow ? `Row ${task.sourceRow}` : "Batch evidence"}</div></TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => openTask(task)}>Open <ArrowRight data-icon="inline-end" /></Button></TableCell>
                      </TableRow>
                    ))}
                    {!visibleTasks.length ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No readiness tasks match these filters.</TableCell></TableRow> : null}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 lg:hidden">
                {visibleTasks.map((task) => (
                  <button key={task.id} type="button" onClick={() => openTask(task)} className="rounded-2xl border bg-background/60 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <div className="flex items-start justify-between gap-3"><div><div className="font-medium">{task.entity}</div><div className="text-xs text-muted-foreground">{task.centerName}</div></div><Badge variant={statusVariant(task.status)}>{statusCopy[task.status].label}</Badge></div>
                    <p className="mt-3 line-clamp-3 text-sm leading-5">{task.reason}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant="outline" className={riskClass(task.risk)}>{riskLabel(task.risk)}</Badge><Badge variant="outline">Priority {task.priority}</Badge><span className="text-xs text-muted-foreground">{task.sourceRow ? `Row ${task.sourceRow}` : "Batch"}</span></div>
                  </button>
                ))}
                {!visibleTasks.length ? <p className="rounded-xl border bg-background/50 p-8 text-center text-sm text-muted-foreground">No readiness tasks match these filters.</p> : null}
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">Page {safePage} of {pageCount}</span>
                <div className="flex gap-2"><Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous readiness page"><ChevronLeft /></Button><Button size="sm" variant="outline" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label="Next readiness page"><ChevronRight /></Button></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="procare" className="grid gap-5">
          <Alert><ShieldCheck className="size-4" /><AlertTitle>Review before importing</AlertTitle><AlertDescription>Upload the source file for one location and review the preview first. Confirm it before importing; the system keeps a backup, imports in smaller groups, and provides reconciliation results afterward.</AlertDescription></Alert>
          <ProcareImportPanel centers={centers} allowBulkImport={allowBulkImport} />
        </TabsContent>
      </Tabs>

      <Sheet open={Boolean(selectedTask)} onOpenChange={(open) => { if (!open) setSelectedTaskId(null); }}>
        <SheetContent className="w-full overflow-hidden p-0 sm:max-w-2xl" side="right">
          {selectedTask ? (
            <>
              <SheetHeader className="border-b p-5 pr-14">
                <div className="flex flex-wrap items-center gap-2"><Badge variant={statusVariant(selectedTask.status)}>{statusCopy[selectedTask.status].label}</Badge><Badge variant="outline" className={riskClass(selectedTask.risk)}>{riskLabel(selectedTask.risk)} risk</Badge><Badge variant="outline">Priority {selectedTask.priority}</Badge></div>
                <SheetTitle className="mt-3 text-xl">{selectedTask.entity} · {selectedTask.centerName}</SheetTitle>
                <SheetDescription>{selectedTask.reason}</SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <div className="grid gap-5">
                  <section aria-labelledby="readiness-difference-heading"><h2 id="readiness-difference-heading" className="text-sm font-semibold">Reviewed difference</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border bg-background/55 p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current BEE value</div><div className="mt-2 text-sm">{selectedTask.currentValue}</div></div><div className="rounded-xl border border-primary/30 bg-primary/[0.08] p-4"><div className="text-xs font-medium uppercase tracking-wide text-primary">Proposed source value</div><div className="mt-2 text-sm">{selectedTask.proposedValue}</div></div></div><p className="mt-2 text-xs text-muted-foreground">{selectedTask.difference}</p></section>
                  <section className="grid gap-3 rounded-xl border bg-background/45 p-4" aria-labelledby="readiness-evidence-heading"><h2 id="readiness-evidence-heading" className="text-sm font-semibold">Source evidence</h2><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Filename</dt><dd className="break-all">{selectedTask.sourceFilename}</dd></div><div><dt className="text-xs text-muted-foreground">Source row</dt><dd>{selectedTask.sourceRow ?? "Batch-level evidence"}</dd></div><div><dt className="text-xs text-muted-foreground">Parsing confidence</dt><dd className="capitalize">{selectedTask.parsingConfidence}</dd></div><div><dt className="text-xs text-muted-foreground">Last updated</dt><dd>{formatDate(selectedTask.updatedAt)}</dd></div></dl>{selectedTask.sourceIds.length ? <div><div className="text-xs text-muted-foreground">Source IDs</div><div className="mt-2 flex flex-wrap gap-2">{selectedTask.sourceIds.map((id) => <Badge key={id} variant="outline" className="h-auto max-w-full whitespace-normal break-all py-1">{id}</Badge>)}</div></div> : <Alert variant="destructive"><AlertTriangle className="size-4" /><AlertTitle>No stable source ID detected</AlertTitle><AlertDescription>Do not use bulk confirmation. Resolve this row individually against the source export.</AlertDescription></Alert>}</section>
                  <section className="rounded-xl border bg-background/45 p-4"><h2 className="text-sm font-semibold">Downstream impact</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedTask.downstreamImpact}</p>{selectedTask.relatedRecords.length ? <div className="mt-3 flex flex-wrap gap-2">{selectedTask.relatedRecords.map((record) => <Badge key={record} variant="outline">{record}</Badge>)}</div> : null}</section>
                  <section aria-labelledby="readiness-decision-heading"><h2 id="readiness-decision-heading" className="text-sm font-semibold">Director decision</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{decisionOptions.map((option) => <button key={option.action} type="button" aria-pressed={action === option.action} onClick={() => setAction(option.action)} className={cn("min-h-16 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", action === option.action ? "border-primary/45 bg-primary/10" : "bg-background/55 hover:border-primary/30")}><span className="block text-sm font-medium">{option.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.detail}</span></button>)}</div></section>
                  <label className="grid gap-2 text-sm"><span className="font-medium">Proposed resolution</span><Textarea value={proposedValue} onChange={(event) => setProposedValue(event.target.value)} rows={3} maxLength={500} /><span className="text-xs text-muted-foreground">Evidence only; this does not write to a family, child, staff, billing, access, or import record.</span></label>
                  <label className="grid gap-2 text-sm"><span className="font-medium">Decision note</span><Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={1000} placeholder="Explain the source evidence or next action..." /><span className="text-xs text-muted-foreground">Required for edit, exclude, and request-information decisions.</span></label>
                  {feedback ? <Alert variant={feedback.tone === "error" ? "destructive" : "default"}><AlertTitle>{feedback.tone === "error" ? "Decision not saved" : "Decision recorded"}</AlertTitle><AlertDescription>{feedback.message}</AlertDescription></Alert> : null}
                </div>
              </div>
              <SheetFooter className="sticky bottom-0 border-t bg-popover/95 p-4 backdrop-blur-xl sm:flex-row sm:justify-end">
                <Button variant="outline" disabled={saving} onClick={() => setSelectedTaskId(null)}>Close</Button>
                <Button variant="outline" disabled={saving} onClick={() => recordDecision([selectedTask.id], action)}>{saving ? "Saving..." : "Save decision"}</Button>
                <Button disabled={saving} onClick={() => recordDecision([selectedTask.id], action, true)}>{saving ? "Saving..." : "Save and next"}<ArrowRight data-icon="inline-end" /></Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
