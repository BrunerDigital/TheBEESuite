"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
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
  Sparkles,
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

function formatDate(value: Date | string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function suggestionLabel(type: string) {
  return type.replaceAll("_", " ");
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
  if (!response.ok) throw new Error(json?.error || "AI command could not be completed.");
  return json as T;
}

export function AiCommandCenter({ data }: { data: AiCommandCenterData }) {
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
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [queueFilter, setQueueFilter] = useState("pending_review");
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

  function generateSummary() {
    startTransition(async () => {
      clearNotices();
      try {
        const json = await jsonRequest<{ ok: boolean; summary: AiSummaryRow }>("/api/ai/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate_summary", centerId }),
        });
        setSummaries((current) => [json.summary, ...current].slice(0, 20));
        setStatusMessage("Operations summary generated and added to the review log.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Operations summary could not be generated.");
      }
    });
  }

  function runDirectorCommand() {
    const command = commandText.trim();
    if (!command) {
      setErrorMessage("Tell Mr. Bee what you want to review or prepare.");
      return;
    }
    if (/message|announce|family|parent/i.test(command)) {
      clearNotices();
      setMessageBody(command);
      setStatusMessage("Your request is ready in the message drafting studio below. Choose the audience and generate reviewable options.");
      document.getElementById("ai-action-studio")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    generateSummary();
  }

  function draftLeadFollowUp() {
    if (!effectiveLeadId) {
      setErrorMessage("Choose a lead before drafting a follow-up.");
      return;
    }
    startTransition(async () => {
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
        setStatusMessage("Lead follow-up draft added to the suggestion queue.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Lead follow-up could not be drafted.");
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

    startTransition(async () => {
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
    startTransition(async () => {
      clearNotices();
      try {
        const json = await jsonRequest<{ ok: boolean; suggestion: AiSuggestionRow }>("/api/ai/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_suggestion_status", suggestionId, status, ...review }),
        });
        setSuggestions((current) => current.map((suggestion) => suggestion.id === suggestionId ? json.suggestion : suggestion));
        setStatusMessage(`Suggestion marked ${status.replaceAll("_", " ")}.`);
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
      setStatusMessage("Draft approved. Open the linked lead to review and send it from CRM.");
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
    try {
      await navigator.clipboard.writeText(aiSuggestionDisplayText(suggestion.suggestion));
      setStatusMessage("Suggestion copied.");
    } catch {
      setErrorMessage("Clipboard access was not available.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-[28px] border border-amber-400/30 bg-[#090909] p-5 text-white shadow-2xl shadow-amber-950/20 md:p-8">
        <div className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="relative">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Ask Mr. Bee to run the school with you</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Get a live operating brief, identify exceptions, prepare family communication, and move directly into the dashboard workflow that needs you.</p>
            </div>
            <div className="w-full lg:w-72">
              <Label className="sr-only">School scope</Label>
              <Select value={centerId} onValueChange={(value) => value && setCenterId(value)}>
                <SelectTrigger className="h-11 w-full border-zinc-700 bg-zinc-900 text-white">
                  <SelectValue placeholder="Choose school" />
                </SelectTrigger>
                <SelectContent>
                  {data.centers.length > 1 ? <SelectItem value="all">All visible schools</SelectItem> : null}
                  {data.centers.map((center) => <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-400/50 bg-zinc-950/90 p-3 shadow-[0_0_40px_rgba(245,158,11,0.08)] md:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-400 text-black"><Sparkles className="size-5" /></div>
                <Input aria-label="Director command" value={commandText} onChange={(event) => setCommandText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") runDirectorCommand(); }} className="h-11 border-0 bg-transparent px-0 text-base text-white shadow-none placeholder:text-zinc-500 focus-visible:ring-0" placeholder="Ask for a summary, plan, follow-up, or message…" />
              </div>
              <Button onClick={runDirectorCommand} disabled={isPending} className="h-11 bg-amber-400 px-6 text-black hover:bg-amber-300">
                <Send data-icon="inline-start" /> Run command
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-800 pt-3">
              {["Daily operating brief", "Enrollment follow-up plan", "Draft a family update", "Billing exceptions"].map((command) => (
                <button key={command} type="button" onClick={() => setCommandText(command)} className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-amber-400/60 hover:text-amber-300">{command}</button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold"><Activity className="size-5 text-amber-500" /> School pulse</h2>
            <p className="mt-1 text-sm text-muted-foreground">Live signals from across the director dashboard.</p>
          </div>
          <div className="text-xs text-muted-foreground">{stats.pendingReview} draft{stats.pendingReview === 1 ? "" : "s"} awaiting review</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            { label: "Attendance", value: data.pulse.activeChildren ? `${Math.round((data.pulse.checkedInChildren / data.pulse.activeChildren) * 100)}%` : "0%", detail: `${data.pulse.checkedInChildren} of ${data.pulse.activeChildren} checked in`, icon: Users, href: "/attendance", tone: "text-lime-400", barClass: "bg-lime-400", bar: data.pulse.activeChildren ? (data.pulse.checkedInChildren / data.pulse.activeChildren) * 100 : 0 },
            { label: "Staffing", value: `${data.pulse.staffClockedIn}/${data.pulse.staffTotal}`, detail: "Team members clocked in", icon: Users, href: "/staff", tone: "text-amber-400", barClass: "bg-amber-400", bar: data.pulse.staffTotal ? (data.pulse.staffClockedIn / data.pulse.staffTotal) * 100 : 0 },
            { label: "Enrollment", value: `${data.pulse.activeChildren}/${data.pulse.licensedCapacity || data.pulse.activeChildren}`, detail: `${data.pulse.highIntentLeads} high-intent leads`, icon: CalendarDays, href: "/enrollment-pipeline", tone: "text-sky-400", barClass: "bg-sky-400", bar: data.pulse.licensedCapacity ? (data.pulse.activeChildren / data.pulse.licensedCapacity) * 100 : 100 },
            { label: "Billing", value: formatMoney(data.pulse.overdueInvoiceCents), detail: `${data.pulse.overdueInvoices} accounts past due`, icon: CircleDollarSign, href: "/billing-invoices", tone: "text-emerald-400", barClass: "bg-emerald-400", bar: data.pulse.openInvoices ? ((data.pulse.openInvoices - data.pulse.overdueInvoices) / data.pulse.openInvoices) * 100 : 100 },
            { label: "Family messages", value: data.pulse.unreadMessages.toLocaleString(), detail: data.pulse.unreadMessages ? "Unread · requires response" : "Inbox is clear", icon: MessageSquare, href: "/messages", tone: "text-violet-400", barClass: "bg-violet-400", bar: Math.max(10, 100 - data.pulse.unreadMessages * 10) },
            { label: "Compliance", value: data.pulse.openComplianceTasks.toLocaleString(), detail: data.pulse.openComplianceTasks ? "Items need attention" : "All items on track", icon: ShieldCheck, href: "/compliance", tone: "text-orange-400", barClass: "bg-orange-400", bar: data.pulse.openComplianceTasks ? Math.max(15, 100 - data.pulse.openComplianceTasks * 8) : 100 },
          ].map((item) => (
            <Link key={item.label} href={item.href} className="group rounded-xl border bg-[#0b0d10] p-4 text-white transition hover:-translate-y-0.5 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-950/20">
              <div className="flex items-center justify-between"><item.icon className={`size-5 ${item.tone}`} /><ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-1" /></div>
              <div className="mt-4 text-xs text-zinc-400">{item.label}</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">{item.value}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full rounded-full ${item.barClass}`} style={{ width: `${Math.max(4, Math.min(100, item.bar))}%` }} /></div>
              <div className="mt-2 text-[11px] leading-4 text-zinc-500">{item.detail}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <Card className="overflow-hidden border-amber-400/30">
          <CardHeader className="border-b bg-amber-400/[0.04]">
            <CardTitle className="flex items-center gap-2"><ClipboardCheck className="size-5 text-amber-500" /> Priority plan</CardTitle>
            <CardDescription>AI-organized work based on live dashboard exceptions. You stay in control of every action.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {[
              { level: data.pulse.pendingIncidents ? "High" : "Ready", title: data.pulse.pendingIncidents ? `${data.pulse.pendingIncidents} incident report${data.pulse.pendingIncidents === 1 ? "" : "s"} need review` : "Incident review queue is clear", detail: "Review details, documentation, and parent acknowledgement.", href: "/incident-reports", icon: AlertTriangle },
              { level: data.pulse.overdueInvoices ? "High" : "Ready", title: data.pulse.overdueInvoices ? `${data.pulse.overdueInvoices} overdue invoice${data.pulse.overdueInvoices === 1 ? "" : "s"}` : "No overdue billing exceptions", detail: "Open family ledgers and decide the next follow-up.", href: "/billing-invoices", icon: CircleDollarSign },
              { level: data.pulse.unreadMessages ? "Medium" : "Ready", title: data.pulse.unreadMessages ? `${data.pulse.unreadMessages} unread family message${data.pulse.unreadMessages === 1 ? "" : "s"}` : "Family inbox is caught up", detail: "Respond while questions and requests are current.", href: "/messages", icon: MessageSquare },
              { level: "Growth", title: `${data.pulse.highIntentLeads} high-intent lead${data.pulse.highIntentLeads === 1 ? "" : "s"}`, detail: `${data.pulse.upcomingTours} upcoming tours across the current scope.`, href: "/enrollment-pipeline", icon: CalendarDays },
            ].map((item) => (
              <div key={item.title} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted"><item.icon className="size-5" /></div>
                  <div><div className="font-medium">{item.title}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</div></div>
                </div>
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={item.href} />}>Review <ArrowRight data-icon="inline-end" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="grid gap-4">
          <Card className="border-amber-400/30">
            <CardHeader className="border-b py-4"><CardTitle className="flex items-center gap-2"><Bot className="size-5 text-amber-500" /> Review queue</CardTitle><CardDescription>Drafts and decisions waiting for you.</CardDescription></CardHeader>
            <CardContent className="divide-y p-0">
              {suggestions.filter((suggestion) => suggestion.status === "pending_review").slice(0, 4).map((suggestion) => (
                <div key={suggestion.id} className="flex items-center gap-3 px-4 py-3">
                  <MessageSquare className="size-4 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium capitalize">{suggestionLabel(suggestion.type)}</div><div className="text-xs text-muted-foreground">{suggestion.status.replaceAll("_", " ")}</div></div>
                  <Button variant="ghost" size="icon-sm" onClick={() => document.getElementById("suggestion-review-queue")?.scrollIntoView({ behavior: "smooth", block: "start" })} title="Review draft"><ArrowRight /></Button>
                </div>
              ))}
              {!suggestions.some((suggestion) => suggestion.status === "pending_review") ? <div className="p-4 text-sm text-muted-foreground">No drafts are waiting for review.</div> : null}
            </CardContent>
          </Card>
          <Card className="border-amber-400/30">
            <CardHeader className="border-b py-4"><CardTitle className="flex items-center gap-2"><Sparkles className="size-5 text-amber-500" /> Recent intelligence</CardTitle><CardDescription>Latest operating insights from your school.</CardDescription></CardHeader>
            <CardContent className="divide-y p-0">
              {summaries.slice(0, 3).map((summary) => <div key={summary.id} className="px-4 py-3"><div className="text-sm font-medium">{summary.title}</div><div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{summary.body}</div></div>)}
              {!summaries.length ? <div className="p-4 text-sm text-muted-foreground">Generate a live brief to start the intelligence log.</div> : null}
            </CardContent>
          </Card>
        </div>
      </section>

      {statusMessage ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>AI command completed</AlertTitle>
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <XCircle />
          <AlertTitle>AI command failed</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="glass-panel" id="ai-action-studio">
        <CardHeader>
          <div>
            <CardTitle>Action studio</CardTitle>
            <CardDescription>Turn the priorities above into a reviewed summary, enrollment follow-up, or family communication draft.</CardDescription>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="glass-panel" id="suggestion-review-queue">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles /> Operations Summary</CardTitle>
            <CardDescription>Generate a current summary from live lead, attendance, staff, family message, billing, and incident data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={generateSummary} disabled={isPending || !data.centers.length}>
              <RefreshCw data-icon="inline-start" />
              Generate Summary
            </Button>
            <p className="text-xs text-muted-foreground">{AI_COMMAND_GUARDRAIL_NOTE}</p>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bot /> Lead Follow-Up</CardTitle>
            <CardDescription>Create a reviewable Mr. Bee draft for an active enrollment lead.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Lead</Label>
              <Select value={effectiveLeadId} onValueChange={(value) => value && setLeadId(value)} disabled={!filteredLeads.length}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose lead" />
                </SelectTrigger>
                <SelectContent>
                  {filteredLeads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.familyName} - {lead.stage.replaceAll("_", " ")} - {lead.score}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Purpose</Label>
              <Select value={leadPurpose} onValueChange={(value) => value && setLeadPurpose(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="follow_up">General follow-up</SelectItem>
                  <SelectItem value="tour_reminder">Tour reminder</SelectItem>
                  <SelectItem value="application_reminder">Application reminder</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={draftLeadFollowUp} disabled={isPending || !effectiveLeadId}>
              <MailPlus data-icon="inline-start" />
              Draft Follow-Up
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Megaphone /> Family Message Draft</CardTitle>
            <CardDescription>Create family or broadcast message options for staff review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={messageMode} onValueChange={(value) => value && setMessageMode(value as MessageMode)}>
              <TabsList>
                <TabsTrigger value="broadcast">Broadcast</TabsTrigger>
                <TabsTrigger value="family">Family</TabsTrigger>
              </TabsList>
              <TabsContent value="broadcast" className="space-y-3">
                <div className="text-xs text-muted-foreground">{selectedCenterIds.length.toLocaleString()} school scope for the recipient estimate.</div>
              </TabsContent>
              <TabsContent value="family" className="space-y-3">
                <div className="grid gap-2">
                  <Label>Family</Label>
                  <Select value={effectiveFamilyId} onValueChange={(value) => value && setFamilyId(value)} disabled={!filteredFamilies.length}>
                    <SelectTrigger className="w-full">
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
              <Label>Purpose</Label>
              <Select value={messagePurpose} onValueChange={(value) => value && setMessagePurpose(value)}>
                <SelectTrigger className="w-full">
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
              <Label>Subject</Label>
              <Input value={messageSubject} onChange={(event) => setMessageSubject(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Context</Label>
              <Textarea value={messageBody} onChange={(event) => setMessageBody(event.target.value)} placeholder="Paste the key update, question, or office note to turn into message options." rows={4} />
            </div>
            <Button onClick={draftMessage} disabled={isPending || (messageMode === "family" ? !effectiveFamilyId : !selectedCenterIds.length)}>
              <Send data-icon="inline-start" />
              Draft Message Options
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <Card className="glass-panel">
          <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Suggestion Review Queue</CardTitle>
              <CardDescription>Review the target, choose a draft, and move it into the workflow where staff will finish the action.</CardDescription>
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
                    return (
                      <TableRow key={suggestion.id}>
                        <TableCell className="min-w-40 align-top">
                          <div className="font-medium capitalize">{suggestionLabel(suggestion.type)}</div>
                          <div className="mt-1 text-xs font-medium text-primary">{lead ? `${lead.familyName} · ${lead.centerName}` : family ? `${family.name} · ${family.centerName}` : context.targetMode === "broadcast" ? "School broadcast" : "Operations draft"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{suggestion.guardrailNote}</div>
                        </TableCell>
                        <TableCell className="min-w-80 align-top">
                          <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-background/50 p-3 text-xs leading-5">
                            {displayText}
                          </div>
                          {variants.length ? <div className="mt-2 text-xs text-muted-foreground">{variants.length} draft options</div> : null}
                          {suggestion.status === "pending_review" ? <div className="mt-3 flex flex-wrap gap-2">{choices.map((choice) => <Button key={choice.label} size="sm" onClick={() => applySuggestion(suggestion, choice)}><CheckCircle2 data-icon="inline-start" />Use {choice.label}</Button>)}</div> : null}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant={statusVariant(suggestion.status)}>{suggestion.status.replaceAll("_", " ")}</Badge>
                        </TableCell>
                        <TableCell className="min-w-36 align-top text-xs text-muted-foreground">{formatDate(suggestion.createdAt)}</TableCell>
                        <TableCell className="min-w-52 align-top">
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="icon-sm" onClick={() => copySuggestion(suggestion)} title="Copy suggestion">
                              <Copy />
                            </Button>
                            {lead ? <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/crm-leads?q=${encodeURIComponent(lead.familyName)}`} />}><ArrowRight data-icon="inline-end" />Open lead</Button> : null}
                            {family ? <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/messages?familyId=${encodeURIComponent(family.id)}`} />}><ArrowRight data-icon="inline-end" />Messages</Button> : null}
                            <Button variant="outline" size="icon-sm" onClick={() => updateSuggestionStatus(suggestion.id, "rejected")} disabled={isPending} title="Reject">
                              <XCircle />
                            </Button>
                            <Button variant="outline" size="icon-sm" onClick={() => updateSuggestionStatus(suggestion.id, "archived")} disabled={isPending} title="Archive">
                              <Archive />
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
            <CardTitle>Recent Summaries</CardTitle>
            <CardDescription>Generated school snapshots for director review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summaries.map((summary) => (
              <div key={summary.id} className="rounded-xl border bg-background/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{summary.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatDate(summary.createdAt)}</div>
                  </div>
                  <Badge variant={summary.requiresReview ? "outline" : "default"}>{summary.scope}</Badge>
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
