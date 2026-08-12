"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedTimestamp } from "@/lib/zoned-date-time";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  MailPlus,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AI_COMMAND_GUARDRAIL_NOTE, aiSuggestionDisplayText, parseAiSuggestionEntries } from "@/lib/ai-command";

type AiSummaryRow = {
  id: string;
  scope: string;
  title: string;
  body: string;
  requiresReview: boolean;
  createdAt: Date | string;
};

type AiSuggestionRow = {
  id: string;
  type: string;
  promptContext: unknown;
  suggestion: string;
  status: string;
  guardrailNote: string;
  createdAt: Date | string;
};

type AiLeadOption = {
  id: string;
  centerId: string;
  centerName: string;
  familyName: string;
  childName: string | null;
  programInterest: string | null;
  stage: string;
  score: number;
  createdAt: Date | string;
};

type AiFamilyOption = {
  id: string;
  centerId: string | null;
  centerName: string;
  name: string;
  guardianLabel: string;
  childCount: number;
};

export type AiCommandCenterData = {
  centers: Array<{ id: string; name: string }>;
  leads: AiLeadOption[];
  families: AiFamilyOption[];
  summaries: AiSummaryRow[];
  suggestions: AiSuggestionRow[];
  stats: { summaries: number; suggestions: number; pendingReview: number };
  pulse: {
    activeChildren: number;
    checkedInChildren: number;
    staffClockedIn: number;
    staffTotal: number;
    licensedCapacity: number;
    openLeads: number;
    highIntentLeads: number;
    unreadMessages: number;
    openInvoices: number;
    overdueInvoices: number;
    overdueInvoiceCents: number;
    pendingIncidents: number;
    upcomingTours: number;
    openComplianceTasks: number;
  };
};

type MessageMode = "family" | "broadcast";

type AiChangePlan = {
  proposalId: string;
  entries: Array<{ action: string; targets: Array<{ id: string; label: string }>; patch: Record<string, unknown> }>;
};

function formatDate(value: Date | string, timeZone: string) {
  return formatZonedTimestamp(value, timeZone, "Recently");
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

const AI_LABEL_ACRONYMS: Record<string, string> = {
  api: "API",
  id: "ID",
  sms: "SMS",
  url: "URL",
};

function aiDisplayLabel(value: string, fallback = "Status unavailable") {
  const labels: Record<string, string> = {
    approved: "Approved",
    archived: "Archived",
    center: "One school",
    center_group: "Selected schools",
    message_broadcast_draft: "School message draft",
    message_family_reply_draft: "Family reply draft",
    mr_bee_lead_follow_up: "Enrollment follow-up",
    pending_review: "Needs review",
    rejected: "Rejected",
  };
  if (labels[value]) return labels[value];
  const words = value.trim().replaceAll("_", " ").replaceAll("-", " ").toLocaleLowerCase("en-US").split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;
  return words.map((word, index) => {
    const acronym = AI_LABEL_ACRONYMS[word];
    if (acronym) return acronym;
    return index === 0 ? word.charAt(0).toLocaleUpperCase("en-US") + word.slice(1) : word;
  }).join(" ");
}

function statusVariant(status: string): "default" | "outline" | "destructive" | "secondary" {
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  if (status === "archived") return "secondary";
  return "outline";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function jsonRequest<T>(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const json = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(json?.error || "The request could not be completed.");
  return json as T;
}

export function AiCommandCenter({ data }: { data: AiCommandCenterData }) {
  const timeZone = useSchoolTimeZone();
  const initialCenterId = data.centers.length === 1 ? data.centers[0].id : "all";
  const [centerId, setCenterId] = useState(initialCenterId);
  const [summaries, setSummaries] = useState(data.summaries);
  const [suggestions, setSuggestions] = useState(data.suggestions);
  const [leadId, setLeadId] = useState(data.leads[0]?.id ?? "");
  const [leadPurpose, setLeadPurpose] = useState("follow_up");
  const [messageMode, setMessageMode] = useState<MessageMode>("broadcast");
  const [familyId, setFamilyId] = useState(data.families[0]?.id ?? "");
  const [messagePurpose, setMessagePurpose] = useState("broadcast");
  const [messageSubject, setMessageSubject] = useState("Update from the school");
  const [messageBody, setMessageBody] = useState("");
  const [commandText, setCommandText] = useState("What needs my attention today?");
  const [commandResponse, setCommandResponse] = useState("");
  const [pendingChangePlan, setPendingChangePlan] = useState<AiChangePlan | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [queueFilter, setQueueFilter] = useState("pending_review");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [copyingSuggestionId, setCopyingSuggestionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedCenterIds = useMemo(() => {
    if (centerId === "all") return data.centers.map((center) => center.id);
    return centerId ? [centerId] : [];
  }, [centerId, data.centers]);

  const filteredLeads = useMemo(() => {
    if (centerId === "all") return data.leads;
    return data.leads.filter((lead) => lead.centerId === centerId);
  }, [centerId, data.leads]);

  const filteredFamilies = useMemo(() => {
    if (centerId === "all") return data.families;
    return data.families.filter((family) => family.centerId === centerId);
  }, [centerId, data.families]);

  const stats = useMemo(() => ({
    summaries: summaries.length,
    suggestions: suggestions.length,
    pendingReview: suggestions.filter((suggestion) => suggestion.status === "pending_review").length,
  }), [summaries, suggestions]);
  const effectiveLeadId = filteredLeads.some((lead) => lead.id === leadId) ? leadId : filteredLeads[0]?.id ?? "";
  const effectiveFamilyId = filteredFamilies.some((family) => family.id === familyId) ? familyId : filteredFamilies[0]?.id ?? "";

  function clearNotices() {
    setStatusMessage("");
    setErrorMessage("");
  }

  function runPendingAction(action: string, task: () => Promise<void>) {
    setPendingAction(action);
    startTransition(async () => {
      try {
        await task();
      } finally {
        setPendingAction(null);
      }
    });
  }

  function generateSummary() {
    runPendingAction("summary", async () => {
      clearNotices();
      try {
        const json = await jsonRequest<{ ok: boolean; summary: AiSummaryRow }>("/api/ai/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate_summary", centerId }),
        });
        setSummaries((current) => [json.summary, ...current].slice(0, 20));
        setStatusMessage("School summary generated and added to the review history.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "The school summary could not be generated.");
      }
    });
  }

  function runDirectorCommand() {
    const command = commandText.trim();
    if (!command) {
      setErrorMessage("Tell Mr. Bee what you want to review, correct, or update.");
      return;
    }
    runPendingAction("command", async () => {
      clearNotices();
      setCommandResponse("");
      setPendingChangePlan(null);
      try {
        const json = await jsonRequest<{ ok: boolean; message: string; model: string; changes: Array<{ action: string; recordId: string; changedFields: string[] }>; requiresConfirmation?: boolean; proposalId?: string; plan?: AiChangePlan["entries"] }>("/api/ai/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "run_data_command", centerId, command, operationId: crypto.randomUUID() }),
        });
        setCommandResponse(json.message);
        if (json.requiresConfirmation && json.proposalId && json.plan) {
          setPendingChangePlan({ proposalId: json.proposalId, entries: json.plan });
          setStatusMessage("Review the proposed changes below. No data has changed yet.");
        } else {
          setStatusMessage("Mr. Bee completed the request without changing data.");
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Mr. Bee could not complete the request.");
      }
    });
  }

  function resolveChangePlan(decision: "confirm" | "cancel") {
    if (!pendingChangePlan) return;
    runPendingAction(decision === "confirm" ? "confirm-plan" : "cancel-plan", async () => {
      clearNotices();
      try {
        const json = await jsonRequest<{ ok: boolean; message: string; changes?: Array<{ action: string; recordId: string }> }>("/api/ai/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve_data_command_plan", proposalId: pendingChangePlan.proposalId, decision }),
        });
        setCommandResponse(json.message);
        setPendingChangePlan(null);
        setStatusMessage(decision === "confirm" ? `${json.changes?.length ?? 0} confirmed change${json.changes?.length === 1 ? "" : "s"} completed and audited.` : "Change plan cancelled. No data was changed.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "The proposed changes could not be completed.");
      }
    });
  }

  function draftLeadFollowUp() {
    if (!effectiveLeadId) {
      setErrorMessage("Choose an enrollment inquiry before drafting a follow-up.");
      return;
    }
    runPendingAction("lead-draft", async () => {
      clearNotices();
      try {
        const json = await jsonRequest<{ ok: boolean; suggestion: string; suggestionId: string; guardrailNote: string }>("/api/ai/mr-bee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: effectiveLeadId, purpose: leadPurpose }),
        });
        setSuggestions((current) => [{
          id: json.suggestionId,
          type: "mr_bee_lead_follow_up",
          promptContext: { leadId: effectiveLeadId, centerId: filteredLeads.find((lead) => lead.id === effectiveLeadId)?.centerId, purpose: leadPurpose },
          suggestion: json.suggestion,
          status: "pending_review",
          guardrailNote: json.guardrailNote,
          createdAt: new Date().toISOString(),
        }, ...current].slice(0, 30));
        setStatusMessage("Enrollment follow-up draft added to the review queue.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "The enrollment follow-up could not be drafted.");
      }
    });
  }

  function draftMessage() {
    if (messageMode === "family" && !effectiveFamilyId) {
      setErrorMessage("Choose a family before drafting a family message.");
      return;
    }
    if (messageMode === "broadcast" && !selectedCenterIds.length) {
      setErrorMessage("Choose at least one school before drafting a broadcast.");
      return;
    }

    runPendingAction("message-draft", async () => {
      clearNotices();
      try {
        const json = await jsonRequest<{
          ok: boolean;
          suggestions: Array<{ label: string; subject: string; body: string }>;
          suggestionId: string;
          guardrailNote: string;
        }>("/api/communications/messages/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetMode: messageMode,
            familyId: messageMode === "family" ? effectiveFamilyId : undefined,
            subject: messageSubject,
            message: messageBody,
            purpose: messagePurpose,
            broadcastSegment: messageMode === "broadcast" ? { centerIds: selectedCenterIds } : undefined,
          }),
        });
        setSuggestions((current) => [{
          id: json.suggestionId,
          type: messageMode === "broadcast" ? "message_broadcast_draft" : "message_family_reply_draft",
          promptContext: { targetMode: messageMode, familyId: messageMode === "family" ? effectiveFamilyId : null, centerIds: selectedCenterIds, purpose: messagePurpose },
          suggestion: JSON.stringify(json.suggestions),
          status: "pending_review",
          guardrailNote: json.guardrailNote,
          createdAt: new Date().toISOString(),
        }, ...current].slice(0, 30));
        setStatusMessage("Message draft options added to the suggestion queue.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Message suggestions could not be drafted.");
      }
    });
  }

  function updateSuggestionStatus(suggestionId: string, status: string, review?: { selectedSubject?: string; selectedBody?: string; destination?: string }) {
    runPendingAction(`suggestion:${suggestionId}:${status}`, async () => {
      clearNotices();
      try {
        const json = await jsonRequest<{ ok: boolean; suggestion: AiSuggestionRow }>("/api/ai/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_suggestion_status", suggestionId, status, ...review }),
        });
        setSuggestions((current) => current.map((suggestion) => suggestion.id === suggestionId ? json.suggestion : suggestion));
        setStatusMessage(`Suggestion marked ${aiDisplayLabel(status).toLocaleLowerCase("en-US")}.`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Suggestion status could not be updated.");
      }
    });
  }

  function applySuggestion(suggestion: AiSuggestionRow, entry: { subject?: string; body: string }) {
    const context = record(suggestion.promptContext);
    const targetMode = context.targetMode === "family" ? "family" : "broadcast";
    const targetFamilyId = typeof context.familyId === "string" ? context.familyId : "";
    const targetCenterId = typeof context.centerId === "string" ? context.centerId : "";
    if (suggestion.type.includes("lead")) {
      updateSuggestionStatus(suggestion.id, "approved", { selectedSubject: entry.subject, selectedBody: entry.body, destination: "crm_lead" });
      setStatusMessage("Draft approved. Open the enrollment inquiry to review and send it.");
      return;
    }
    setMessageMode(targetMode);
    if (targetMode === "family" && targetFamilyId) setFamilyId(targetFamilyId);
    if (targetMode === "broadcast" && targetCenterId && data.centers.some((center) => center.id === targetCenterId)) setCenterId(targetCenterId);
    setMessageSubject(entry.subject || messageSubject);
    setMessageBody(entry.body);
    updateSuggestionStatus(suggestion.id, "approved", { selectedSubject: entry.subject, selectedBody: entry.body, destination: "message_studio" });
    document.getElementById("ai-action-studio")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function copySuggestion(suggestion: AiSuggestionRow) {
    clearNotices();
    setCopyingSuggestionId(suggestion.id);
    try {
      await navigator.clipboard.writeText(aiSuggestionDisplayText(suggestion.suggestion));
      setStatusMessage("Suggestion copied.");
    } catch {
      setErrorMessage("Clipboard access was not available.");
    } finally {
      setCopyingSuggestionId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card p-5 text-card-foreground md:p-6">
        <div>
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Ask Mr. Bee about school activity</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Review current school information, prepare family communication, and open the related task.</p>
            </div>
            <div className="w-full lg:w-72">
              <Label htmlFor="mr-bee-school" className="sr-only">School</Label>
              <Select value={centerId} onValueChange={(value) => { if (value) { setCenterId(value); setPendingChangePlan(null); } }}>
                <SelectTrigger id="mr-bee-school" className="h-11 w-full bg-background text-foreground">
                  <SelectValue placeholder="Choose school" />
                </SelectTrigger>
                <SelectContent>
                  {data.centers.length > 1 ? <SelectItem value="all">All available schools</SelectItem> : null}
                  {data.centers.map((center) => <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/30 p-3 md:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <Input id="mr-bee-request" aria-label="Request for Mr. Bee" value={commandText} onChange={(event) => setCommandText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !isPending) runDirectorCommand(); }} className="h-11 bg-background text-base text-foreground" placeholder="Ask for a summary, follow-up, or message…" />
              </div>
              <Button onClick={runDirectorCommand} disabled={isPending} aria-busy={pendingAction === "command"} className="h-11 px-6">
                <Send aria-hidden="true" data-icon="inline-start" /> {pendingAction === "command" ? "Working…" : "Ask Mr. Bee"}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
              {["What needs my attention today?", "Summarize enrollment follow-ups.", "Show attendance items that need review.", "Draft a family update for me to review."].map((command) => (
                <Button key={command} type="button" variant="outline" size="sm" onClick={() => setCommandText(command)} className="h-auto min-h-9 whitespace-normal text-left text-xs font-normal">{command}</Button>
              ))}
            </div>
          </div>
          {commandResponse ? (
            <div className="mt-4 rounded-xl border bg-muted/40 p-4 text-sm leading-6 text-foreground" aria-live="polite">
              <div className="mb-1 flex items-center gap-2 font-medium"><Bot aria-hidden="true" className="size-4 text-amber-600 dark:text-amber-400" /> Mr. Bee</div>
              <p className="whitespace-pre-wrap">{commandResponse}</p>
            </div>
          ) : null}
          {pendingChangePlan ? (
            <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-50/50 p-4 dark:bg-amber-950/20" aria-live="polite">
              <div className="flex items-start gap-3">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-foreground">Confirm the exact changes</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Nothing will be changed until you confirm. Review every target and new value.</p>
                  <div className="mt-3 space-y-3">
                    {pendingChangePlan.entries.map((entry, index) => (
                      <div key={`${entry.action}-${index}`} className="rounded-lg border bg-background p-3">
                        <div className="text-sm font-medium text-foreground">{aiDisplayLabel(entry.action, "Proposed change")}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{entry.targets.length} record{entry.targets.length === 1 ? "" : "s"}: {entry.targets.slice(0, 8).map((target) => target.label).join(", ")}{entry.targets.length > 8 ? `, and ${entry.targets.length - 8} more` : ""}</div>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-2 text-xs text-foreground">{JSON.stringify(entry.patch, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => resolveChangePlan("confirm")} disabled={isPending} aria-busy={pendingAction === "confirm-plan"} className="bg-amber-400 text-black hover:bg-amber-300"><CheckCircle2 aria-hidden="true" data-icon="inline-start" /> {pendingAction === "confirm-plan" ? "Applying…" : "Confirm and apply"}</Button>
                    <Button onClick={() => resolveChangePlan("cancel")} disabled={isPending} aria-busy={pendingAction === "cancel-plan"} variant="outline"><XCircle aria-hidden="true" data-icon="inline-start" /> {pendingAction === "cancel-plan" ? "Cancelling…" : "Cancel"}</Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Mr. Bee can review information and propose changes for the selected school. You must confirm proposed changes before they are applied. Payments, account access, messages, and deletions are not completed here.</p>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold"><Activity aria-hidden="true" className="size-5 text-amber-500" /> School activity</h2>
            <p className="mt-1 text-sm text-muted-foreground">Current attendance, staffing, enrollment, billing, messages, and compliance.</p>
          </div>
          <div className="text-xs text-muted-foreground">{stats.pendingReview} draft{stats.pendingReview === 1 ? "" : "s"} awaiting review</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            { label: "Attendance", value: data.pulse.activeChildren ? `${Math.round((data.pulse.checkedInChildren / data.pulse.activeChildren) * 100)}%` : "0%", detail: `${data.pulse.checkedInChildren} of ${data.pulse.activeChildren} checked in`, icon: Users, href: "/attendance", tone: "text-lime-400", barClass: "bg-lime-400", bar: data.pulse.activeChildren ? (data.pulse.checkedInChildren / data.pulse.activeChildren) * 100 : 0 },
            { label: "Staffing", value: `${data.pulse.staffClockedIn}/${data.pulse.staffTotal}`, detail: "Team members clocked in", icon: Users, href: "/staff", tone: "text-amber-400", barClass: "bg-amber-400", bar: data.pulse.staffTotal ? (data.pulse.staffClockedIn / data.pulse.staffTotal) * 100 : 0 },
            { label: "Enrollment", value: `${data.pulse.activeChildren}/${data.pulse.licensedCapacity || data.pulse.activeChildren}`, detail: `${data.pulse.highIntentLeads} inquiries ready for follow-up`, icon: CalendarDays, href: "/enrollment-pipeline", tone: "text-sky-400", barClass: "bg-sky-400", bar: data.pulse.licensedCapacity ? (data.pulse.activeChildren / data.pulse.licensedCapacity) * 100 : 100 },
            { label: "Billing", value: formatMoney(data.pulse.overdueInvoiceCents), detail: `${data.pulse.overdueInvoices} accounts past due`, icon: CircleDollarSign, href: "/billing-invoices", tone: "text-emerald-400", barClass: "bg-emerald-400", bar: data.pulse.openInvoices ? ((data.pulse.openInvoices - data.pulse.overdueInvoices) / data.pulse.openInvoices) * 100 : 100 },
            { label: "Family messages", value: data.pulse.unreadMessages.toLocaleString(), detail: data.pulse.unreadMessages ? "Unread · requires response" : "Inbox is clear", icon: MessageSquare, href: "/messages", tone: "text-violet-400", barClass: "bg-violet-400", bar: Math.max(10, 100 - data.pulse.unreadMessages * 10) },
            { label: "Compliance", value: data.pulse.openComplianceTasks.toLocaleString(), detail: data.pulse.openComplianceTasks ? "Items need attention" : "All items on track", icon: ShieldCheck, href: "/compliance", tone: "text-orange-400", barClass: "bg-orange-400", bar: data.pulse.openComplianceTasks ? Math.max(15, 100 - data.pulse.openComplianceTasks * 8) : 100 },
          ].map((item) => (
            <Link key={item.label} href={item.href} className="group rounded-xl border bg-card p-4 text-card-foreground transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex items-center justify-between"><item.icon aria-hidden="true" className={`size-5 ${item.tone}`} /><ArrowRight aria-hidden="true" className="size-4 text-muted-foreground transition group-hover:translate-x-1" /></div>
              <div className="mt-4 text-xs text-muted-foreground">{item.label}</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">{item.value}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${item.barClass}`} style={{ width: `${Math.max(4, Math.min(100, item.bar))}%` }} /></div>
              <div className="mt-2 text-[11px] leading-4 text-muted-foreground">{item.detail}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <Card className="overflow-hidden border-amber-400/30">
          <CardHeader className="border-b bg-amber-400/[0.04]">
            <CardTitle as="h2" className="flex items-center gap-2"><ClipboardCheck aria-hidden="true" className="size-5 text-amber-500" /> Items to review</CardTitle>
            <CardDescription>Tasks that may need attention based on current school records.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {[
              { level: data.pulse.pendingIncidents ? "High" : "Ready", title: data.pulse.pendingIncidents ? `${data.pulse.pendingIncidents} incident report${data.pulse.pendingIncidents === 1 ? "" : "s"} need review` : "Incident review queue is clear", detail: "Review details, documentation, and parent acknowledgement.", href: "/incident-reports", icon: AlertTriangle },
              { level: data.pulse.overdueInvoices ? "High" : "Ready", title: data.pulse.overdueInvoices ? `${data.pulse.overdueInvoices} overdue invoice${data.pulse.overdueInvoices === 1 ? "" : "s"}` : "No overdue billing exceptions", detail: "Open family ledgers and decide the next follow-up.", href: "/billing-invoices", icon: CircleDollarSign },
              { level: data.pulse.unreadMessages ? "Medium" : "Ready", title: data.pulse.unreadMessages ? `${data.pulse.unreadMessages} unread family message${data.pulse.unreadMessages === 1 ? "" : "s"}` : "Family inbox is caught up", detail: "Respond while questions and requests are current.", href: "/messages", icon: MessageSquare },
              { level: "Enrollment", title: `${data.pulse.highIntentLeads} enrollment inquir${data.pulse.highIntentLeads === 1 ? "y" : "ies"} ready for follow-up`, detail: `${data.pulse.upcomingTours} upcoming tour${data.pulse.upcomingTours === 1 ? "" : "s"} at the selected schools.`, href: "/enrollment-pipeline", icon: CalendarDays },
            ].map((item) => (
              <div key={item.title} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted"><item.icon aria-hidden="true" className="size-5" /></div>
                  <div><div className="font-medium">{item.title}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</div></div>
                </div>
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={item.href} />}>Review <ArrowRight aria-hidden="true" data-icon="inline-end" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="grid gap-4">
          <Card className="border-amber-400/30">
            <CardHeader className="border-b py-4"><CardTitle as="h2" className="flex items-center gap-2"><Bot aria-hidden="true" className="size-5 text-amber-500" /> Review queue</CardTitle><CardDescription>Drafts and decisions waiting for you.</CardDescription></CardHeader>
            <CardContent className="divide-y p-0">
              {suggestions.filter((suggestion) => suggestion.status === "pending_review").slice(0, 4).map((suggestion) => (
                <div key={suggestion.id} className="flex items-center gap-3 px-4 py-3">
                  <MessageSquare aria-hidden="true" className="size-4 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{aiDisplayLabel(suggestion.type, "Draft")}</div><div className="text-xs text-muted-foreground">{aiDisplayLabel(suggestion.status)}</div></div>
                  <Button variant="ghost" size="icon-sm" onClick={() => document.getElementById("suggestion-review-queue")?.scrollIntoView({ behavior: "smooth", block: "start" })} aria-label="Review draft"><ArrowRight aria-hidden="true" /></Button>
                </div>
              ))}
              {!suggestions.some((suggestion) => suggestion.status === "pending_review") ? <div className="p-4 text-sm text-muted-foreground">No drafts are waiting for review.</div> : null}
            </CardContent>
          </Card>
          <Card className="border-amber-400/30">
            <CardHeader className="border-b py-4"><CardTitle as="h2" className="flex items-center gap-2"><ClipboardCheck aria-hidden="true" className="size-5 text-amber-600 dark:text-amber-400" /> Recent summaries</CardTitle><CardDescription>Latest school summaries prepared for review.</CardDescription></CardHeader>
            <CardContent className="divide-y p-0">
              {summaries.slice(0, 3).map((summary) => <div key={summary.id} className="px-4 py-3"><div className="text-sm font-medium">{summary.title}</div><div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{summary.body}</div></div>)}
              {!summaries.length ? <div className="p-4 text-sm text-muted-foreground">Generate a school summary to begin the review history.</div> : null}
            </CardContent>
          </Card>
        </div>
      </section>

      {statusMessage ? (
        <Alert>
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Request completed</AlertTitle>
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <XCircle aria-hidden="true" />
          <AlertTitle>Request could not be completed</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="glass-panel" id="ai-action-studio">
        <CardHeader>
          <div>
            <CardTitle as="h2">Drafting tools</CardTitle>
            <CardDescription>Prepare a school summary, enrollment follow-up, or family message for review.</CardDescription>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="glass-panel" id="suggestion-review-queue">
          <CardHeader>
            <CardTitle as="h3" className="flex items-center gap-2"><ClipboardCheck aria-hidden="true" /> School summary</CardTitle>
            <CardDescription>Prepare a current summary of enrollment inquiries, attendance, staffing, family messages, billing, and incidents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={generateSummary} disabled={isPending || !data.centers.length} aria-busy={pendingAction === "summary"}>
              <RefreshCw aria-hidden="true" data-icon="inline-start" />
              {pendingAction === "summary" ? "Generating…" : "Generate summary"}
            </Button>
            <p className="text-xs text-muted-foreground">{AI_COMMAND_GUARDRAIL_NOTE}</p>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle as="h3" className="flex items-center gap-2"><Bot aria-hidden="true" /> Enrollment follow-up</CardTitle>
            <CardDescription>Prepare a follow-up draft for an active enrollment inquiry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="ai-lead-inquiry">Enrollment inquiry</Label>
              <Select value={effectiveLeadId} onValueChange={(value) => value && setLeadId(value)} disabled={!filteredLeads.length}>
                <SelectTrigger id="ai-lead-inquiry" className="w-full">
                  <SelectValue placeholder="Choose inquiry" />
                </SelectTrigger>
                <SelectContent>
                  {filteredLeads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.familyName} - {aiDisplayLabel(lead.stage)} - {lead.score}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ai-lead-purpose">Purpose</Label>
              <Select value={leadPurpose} onValueChange={(value) => value && setLeadPurpose(value)}>
                <SelectTrigger id="ai-lead-purpose" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="follow_up">General follow-up</SelectItem>
                  <SelectItem value="tour_reminder">Tour reminder</SelectItem>
                  <SelectItem value="application_reminder">Application reminder</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={draftLeadFollowUp} disabled={isPending || !effectiveLeadId} aria-busy={pendingAction === "lead-draft"}>
              <MailPlus aria-hidden="true" data-icon="inline-start" />
              {pendingAction === "lead-draft" ? "Drafting…" : "Draft follow-up"}
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle as="h3" className="flex items-center gap-2"><Megaphone aria-hidden="true" /> Family message draft</CardTitle>
            <CardDescription>Create family or broadcast message options for staff review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={messageMode} onValueChange={(value) => value && setMessageMode(value as MessageMode)}>
              <TabsList>
                <TabsTrigger value="broadcast">Broadcast</TabsTrigger>
                <TabsTrigger value="family">Family</TabsTrigger>
              </TabsList>
              <TabsContent value="broadcast" className="space-y-3">
                <div className="text-xs text-muted-foreground">{selectedCenterIds.length.toLocaleString()} selected school{selectedCenterIds.length === 1 ? "" : "s"} included in the recipient estimate.</div>
              </TabsContent>
              <TabsContent value="family" className="space-y-3">
                <div className="grid gap-2">
                  <Label htmlFor="ai-message-family">Family</Label>
                  <Select value={effectiveFamilyId} onValueChange={(value) => value && setFamilyId(value)} disabled={!filteredFamilies.length}>
                    <SelectTrigger id="ai-message-family" className="w-full">
                      <SelectValue placeholder="Choose family" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredFamilies.map((family) => (
                        <SelectItem key={family.id} value={family.id}>{family.name} - {family.centerName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
            </Tabs>
            <div className="grid gap-2">
              <Label htmlFor="ai-message-purpose">Purpose</Label>
              <Select value={messagePurpose} onValueChange={(value) => value && setMessagePurpose(value)}>
                <SelectTrigger id="ai-message-purpose" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="broadcast">General update</SelectItem>
                  <SelectItem value="attendance">Attendance</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="documents">Documents</SelectItem>
                  <SelectItem value="classroom">Classroom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ai-message-subject">Subject</Label>
              <Input id="ai-message-subject" value={messageSubject} onChange={(event) => setMessageSubject(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ai-message-context">Context</Label>
              <Textarea id="ai-message-context" value={messageBody} onChange={(event) => setMessageBody(event.target.value)} placeholder="Paste the key update, question, or office note to turn into message options." rows={4} />
            </div>
            <Button onClick={draftMessage} disabled={isPending || (messageMode === "family" ? !effectiveFamilyId : !selectedCenterIds.length)} aria-busy={pendingAction === "message-draft"}>
              <Send aria-hidden="true" data-icon="inline-start" />
              {pendingAction === "message-draft" ? "Drafting…" : "Draft message options"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <Card className="glass-panel">
          <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle as="h2">Suggestion review queue</CardTitle>
              <CardDescription>Review the recipient and draft, then open the related screen to finish the action.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {[["pending_review", "Needs review"], ["approved", "Approved"], ["all", "All"]].map(([value, label]) => <Button key={value} size="sm" variant={queueFilter === value ? "default" : "outline"} onClick={() => setQueueFilter(value)}>{label}</Button>)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Draft</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.filter((suggestion) => queueFilter === "all" || suggestion.status === queueFilter).map((suggestion) => {
                    const variants = parseAiSuggestionEntries(suggestion.suggestion);
                    const displayText = aiSuggestionDisplayText(suggestion.suggestion);
                    const context = record(suggestion.promptContext);
                    const leadId = typeof context.leadId === "string" ? context.leadId : "";
                    const familyId = typeof context.familyId === "string" ? context.familyId : "";
                    const lead = data.leads.find((item) => item.id === leadId);
                    const family = data.families.find((item) => item.id === familyId);
                    const choices = variants.length ? variants : [{ label: "Draft", subject: "", body: displayText }];
                    const approvingSuggestion = pendingAction === `suggestion:${suggestion.id}:approved`;
                    const rejectingSuggestion = pendingAction === `suggestion:${suggestion.id}:rejected`;
                    const archivingSuggestion = pendingAction === `suggestion:${suggestion.id}:archived`;
                    const copyingSuggestion = copyingSuggestionId === suggestion.id;
                    return (
                      <TableRow key={suggestion.id}>
                        <TableCell className="min-w-40 align-top">
                          <div className="font-medium">{aiDisplayLabel(suggestion.type, "Draft")}</div>
                          <div className="mt-1 text-xs font-medium text-primary">{lead ? `${lead.familyName} · ${lead.centerName}` : family ? `${family.name} · ${family.centerName}` : context.targetMode === "broadcast" ? "School broadcast" : "School draft"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{suggestion.guardrailNote}</div>
                        </TableCell>
                        <TableCell className="min-w-80 align-top">
                          <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-background/50 p-3 text-xs leading-5">
                            {displayText}
                          </div>
                          {variants.length ? <div className="mt-2 text-xs text-muted-foreground">{variants.length} draft options</div> : null}
                          {suggestion.status === "pending_review" ? <div className="mt-3 flex flex-wrap gap-2">{choices.map((choice) => <Button key={choice.label} size="sm" onClick={() => applySuggestion(suggestion, choice)} disabled={isPending} aria-busy={approvingSuggestion}><CheckCircle2 aria-hidden="true" data-icon="inline-start" />{approvingSuggestion ? "Applying…" : `Use ${choice.label}`}</Button>)}</div> : null}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant={statusVariant(suggestion.status)}>{aiDisplayLabel(suggestion.status)}</Badge>
                        </TableCell>
                        <TableCell className="min-w-36 align-top text-xs text-muted-foreground">{formatDate(suggestion.createdAt, timeZone)}</TableCell>
                        <TableCell className="min-w-52 align-top">
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="icon-sm" onClick={() => copySuggestion(suggestion)} disabled={copyingSuggestionId !== null} aria-label={copyingSuggestion ? "Copying suggestion…" : "Copy suggestion"} aria-busy={copyingSuggestion}>
                              <Copy aria-hidden="true" />
                            </Button>
                            {lead ? <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/crm-leads?q=${encodeURIComponent(lead.familyName)}`} />}><ArrowRight aria-hidden="true" data-icon="inline-end" />Open inquiry</Button> : null}
                            {family ? <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/messages?familyId=${encodeURIComponent(family.id)}`} />}><ArrowRight aria-hidden="true" data-icon="inline-end" />Messages</Button> : null}
                            <Button variant="outline" size="icon-sm" onClick={() => updateSuggestionStatus(suggestion.id, "rejected")} disabled={isPending} aria-label={rejectingSuggestion ? "Rejecting suggestion…" : "Reject suggestion"} aria-busy={rejectingSuggestion}>
                              <XCircle aria-hidden="true" />
                            </Button>
                            <Button variant="outline" size="icon-sm" onClick={() => updateSuggestionStatus(suggestion.id, "archived")} disabled={isPending} aria-label={archivingSuggestion ? "Archiving suggestion…" : "Archive suggestion"} aria-busy={archivingSuggestion}>
                              <Archive aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!suggestions.filter((suggestion) => queueFilter === "all" || suggestion.status === queueFilter).length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">No suggestions match this review view.</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle as="h2">Recent summaries</CardTitle>
            <CardDescription>Generated school snapshots for director review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summaries.map((summary) => (
              <div key={summary.id} className="rounded-xl border bg-background/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{summary.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatDate(summary.createdAt, timeZone)}</div>
                  </div>
                  <Badge variant={summary.requiresReview ? "outline" : "default"}>{aiDisplayLabel(summary.scope, "Selected schools")}</Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{summary.body}</p>
              </div>
            ))}
            {!summaries.length ? <div className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">No summaries have been generated yet.</div> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
