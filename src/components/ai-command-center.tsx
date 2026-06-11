"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  Archive,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  MailPlus,
  Megaphone,
  RefreshCw,
  Send,
  Sparkles,
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
};

type MessageMode = "family" | "broadcast";

function formatDate(value: Date | string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleString();
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
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
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

  function updateSuggestionStatus(suggestionId: string, status: string) {
    startTransition(async () => {
      clearNotices();
      try {
        const json = await jsonRequest<{ ok: boolean; suggestion: AiSuggestionRow }>("/api/ai/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_suggestion_status", suggestionId, status }),
        });
        setSuggestions((current) => current.map((suggestion) => suggestion.id === suggestionId ? json.suggestion : suggestion));
        setStatusMessage(`Suggestion marked ${status.replaceAll("_", " ")}.`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Suggestion status could not be updated.");
      }
    });
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
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass-panel">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Summaries</div>
            <div className="mt-1 text-2xl font-semibold">{stats.summaries.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Suggestions</div>
            <div className="mt-1 text-2xl font-semibold">{stats.suggestions.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Pending review</div>
            <div className="mt-1 text-2xl font-semibold">{stats.pendingReview.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

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

      <Card className="glass-panel">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Command Scope</CardTitle>
            <CardDescription>Choose which school the AI actions should use for summaries, drafts, and recipient counts.</CardDescription>
          </div>
          <div className="w-full md:w-80">
            <Label className="sr-only">School</Label>
            <Select value={centerId} onValueChange={(value) => value && setCenterId(value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose school" />
              </SelectTrigger>
              <SelectContent>
                {data.centers.length > 1 ? <SelectItem value="all">All visible schools</SelectItem> : null}
                {data.centers.map((center) => (
                  <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="glass-panel">
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
              <CardDescription>Approve, reject, archive, or copy generated drafts.</CardDescription>
            </div>
            <Button variant="outline" nativeButton={false} render={<Link href="/messages" />}>
              <ClipboardCheck data-icon="inline-start" />
              Open Messages
            </Button>
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
                  {suggestions.map((suggestion) => {
                    const variants = parseAiSuggestionEntries(suggestion.suggestion);
                    const displayText = aiSuggestionDisplayText(suggestion.suggestion);
                    return (
                      <TableRow key={suggestion.id}>
                        <TableCell className="min-w-40 align-top">
                          <div className="font-medium capitalize">{suggestionLabel(suggestion.type)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{suggestion.guardrailNote}</div>
                        </TableCell>
                        <TableCell className="min-w-80 align-top">
                          <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-background/50 p-3 text-xs leading-5">
                            {displayText}
                          </div>
                          {variants.length ? <div className="mt-2 text-xs text-muted-foreground">{variants.length} draft options</div> : null}
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
                            <Button variant="outline" size="icon-sm" onClick={() => updateSuggestionStatus(suggestion.id, "approved")} disabled={isPending} title="Approve">
                              <CheckCircle2 />
                            </Button>
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
                  {!suggestions.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">No AI suggestions have been created yet.</TableCell>
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
