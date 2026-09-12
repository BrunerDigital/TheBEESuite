"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { RecordPaginationNav } from "@/components/record-pagination";
import type { LinkedRecordPagination } from "@/lib/record-pagination";
import { formatZonedDateTime } from "@/lib/zoned-date-time";
import { Bot, GitBranch, History, Save, ShieldCheck, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import { requestWithNetworkRecovery } from "@/lib/client-request-recovery";
import { automationDraftFromRecord, automationDraftSignature, automationRecordSignature, newAutomationDraft, normalizeAutomationDraft, readAutomationSaveReceipt, type AutomationDraft, type AutomationRecord } from "@/lib/automation-workflow-state";
import { campaignTemplates } from "@/lib/marketing-workflows";
import styles from "./automation-workflow.module.css";

type AutomationRow = {
  id: string;
  name: string;
  trigger: string;
  condition: unknown;
  action: unknown;
  delay: string | null;
  status: string;
  brand: { name: string } | null;
  runs: Array<{ id: string; status: string; createdAt: Date | string; logs: unknown }>;
};

export type AutomationWorkflowBuilderData = {
  automations: AutomationRow[];
  pagination?: LinkedRecordPagination;
  stats: {
    total: number;
    active: number;
    paused: number;
    recentRuns: number;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : fallback;
}

function formatDate(value: Date | string, timeZone: string) {
  return formatZonedDateTime(value, timeZone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }, "Unknown");
}

function displayTokenLabel(value: string) {
  if (value === "active") return "Configured";
  const words = value.trim().replaceAll("_", " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "Not set";
  return words.map((word, index) => index === 0
    ? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
    : word.toLowerCase()).join(" ");
}

function legacyOption(value: string, supported: string[]) {
  return value && !supported.includes(value) ? <SelectItem value={value}>{displayTokenLabel(value)} (saved value)</SelectItem> : null;
}

function actionSummary(value: unknown) {
  const record = asRecord(value);
  const entries = Object.entries(record)
    .filter(([, item]) => item !== null && item !== undefined && item !== "")
    .slice(0, 3)
    .map(([key, item]) => {
      const rawValue = stringValue(item, "Configured");
      const displayValue = typeof item === "boolean"
        ? item ? "Yes" : "No"
        : /^[a-z0-9_]+$/i.test(rawValue)
          ? displayTokenLabel(rawValue)
          : rawValue;
      return `${displayTokenLabel(key)}: ${displayValue}`;
    });
  return entries.length ? entries.join(" · ") : "No action set";
}

export function AutomationWorkflowBuilder({ data, readOnly = false }: { data: AutomationWorkflowBuilderData; readOnly?: boolean }) {
  const timeZone = useSchoolTimeZone();
  const router = useRouter();
  const [editor, setEditor] = useState(() => {
    const record = data.automations[0], draft = record ? automationDraftFromRecord(record) : newAutomationDraft();
    return { selectedId: record?.id ?? "", draft, baseline: automationDraftSignature(draft), source: record as AutomationRecord | undefined };
  });
  const [confirmed, setConfirmed] = useState<{ record: AutomationRecord; source: AutomationRow[] } | null>(null);
  const { selectedId, draft, baseline } = editor;
  const { name, trigger, audience, condition, requiresReview, delay, actionType, channel, templateKey, subject, body, status } = draft;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saveUnknown, setSaveUnknown] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const dirty = automationDraftSignature(draft) !== baseline;
  useUnsavedChangesGuard(dirty || saveUnknown, "Discard your unsaved workflow configuration and leave this page?");
  const automations: AutomationRow[] = data.automations.map(row => confirmed?.record.id === row.id && confirmed.source === data.automations ? { ...row, ...confirmed.record } : row);
  if (confirmed && !automations.some(row => row.id === confirmed.record.id)) automations.push({ ...confirmed.record, brand: null, runs: [] });

  function updateDraft<K extends keyof AutomationDraft>(key: K, value: AutomationDraft[K]) {
    if (inFlight.current) return;
    setEditor(current => ({ ...current, draft: { ...current.draft, [key]: value } }));
    setMessage("");
  }

  function loadAutomation(id: string) {
    if (inFlight.current || ((dirty || saveUnknown) && !window.confirm(saveUnknown ? "The previous save may have completed. Check the saved list before creating another copy. Discard these entries and load the selected workflow or start a new draft?" : "Discard your unsaved workflow changes?"))) return;
    const record = id ? automations.find(item => item.id === id) : null;
    if (id && !record) { setError("This workflow is no longer in the saved list. Refresh to review available workflows."); return; }
    const next = record ? automationDraftFromRecord(record) : newAutomationDraft();
    setEditor({ selectedId: id, draft: next, baseline: automationDraftSignature(next), source: record ?? undefined });
    setMessage(""); setError(""); setSaveUnknown(false);
  }

  function applyTemplate(key: string) {
    if (inFlight.current || key === templateKey) return;
    const template = campaignTemplates.find(item => item.key === key);
    if (template && (subject || body) && !window.confirm("Replace the current subject and message body with this template?")) return;
    setEditor(current => ({ ...current, draft: { ...current.draft, templateKey: key,
      ...(template ? { subject: template.subject, body: template.body, channel: "email", actionType: "send_campaign" } : {}),
    } }));
    setMessage(""); setError("");
  }

  function save() {
    if (readOnly) { setMessage("Preview only — workflow changes are disabled."); return; }
    if (inFlight.current || saveUnknown) return;
    const submittedId = selectedId, submitted = normalizeAutomationDraft(draft, selectedId ? "update" : "create"), submittedSource = editor.source;
    if (!submitted.name) { setError("Workflow name is required."); return; }
    inFlight.current = true;
    startTransition(async () => {
      setMessage(""); setError("");
      const recovery = "We could not confirm whether this workflow was saved. Your entries are still here. Check the saved workflows before trying again; nothing was automatically dispatched.";
      try {
        const response = await requestWithNetworkRecovery("/api/operations/records", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity: "automation", id: submittedId || undefined, expectedRecordSignature: submittedSource ? automationRecordSignature(submittedSource) : undefined, ...submitted }),
        }, recovery);
        const json: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const failure = asRecord(json);
          if (failure.outcomeUnknown === true || response.status >= 500) setSaveUnknown(true);
          setError(typeof failure.error === "string" ? failure.error : recovery);
          return;
        }
        const receipt = readAutomationSaveReceipt(json, { id: submittedId, draft: submitted, existing: submittedSource });
        if (!receipt) { setError(recovery); setSaveUnknown(true); return; }
        const saved = automationDraftFromRecord(receipt);
        setEditor({ selectedId: receipt.id, draft: saved, baseline: automationDraftSignature(saved), source: receipt });
        setConfirmed({ record: receipt, source: data.automations });
        setMessage("Workflow configuration saved. No action or message was dispatched.");
        router.refresh();
      } finally { inFlight.current = false; }
    });
  }

  return (
    <div className={`${styles.workspace} grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_420px]`}>
      <Card id="automation-builder" className="glass-panel min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle as="h1">Automation workflow builder</CardTitle>
          <CardDescription>Prepare account-wide workflow rules and message drafts. Saving configuration does not run a workflow.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4">
          <p className="rounded-lg border bg-muted/40 p-3 text-sm">Configuration only: these workflows do not automatically send messages, charge payments, schedule work, or change records. This is shared across your account, not limited to the selected school. Other authorized operations managers in your account can view and edit it.</p>
          {dirty ? <Badge variant="outline">Unsaved changes</Badge> : null}
          <fieldset disabled={isPending} aria-busy={isPending} className="min-w-0 space-y-4">
          {data.pagination ? <RecordPaginationNav pagination={data.pagination} label="Workflows" disabled={isPending} /> : null}
          {message ? <div role="status" aria-live="polite" className="rounded-lg border bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{message}</div> : null}
          {error ? <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
          {saveUnknown ? <div className="space-y-2 text-sm"><p>Saving is paused to prevent duplicate workflows. Refresh the saved list, then choose the saved workflow to continue. Your current entries stay here until you explicitly discard them.</p><Button type="button" variant="outline" onClick={() => router.refresh()}>Refresh saved list</Button></div> : null}
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 [&>div]:min-w-0">
            <div className="space-y-1">
              <Label htmlFor="automation-saved-workflow">Saved workflow</Label>
              <Select disabled={isPending} value={selectedId || "new"} onValueChange={(value) => {
                if (value && value !== (selectedId || "new")) loadAutomation(value === "new" ? "" : value);
              }}>
                <SelectTrigger id="automation-saved-workflow" className="w-full"><SelectValue placeholder="Not configured" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New workflow</SelectItem>
                  {automations.map((automation) => (
                    <SelectItem key={automation.id} value={automation.id}>{automation.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="automation-status">Status</Label>
              <Select disabled={isPending} value={status} onValueChange={(value) => value && updateDraft("status", value)}>
                <SelectTrigger id="automation-status" className="w-full"><SelectValue placeholder="Not configured" /></SelectTrigger>
                <SelectContent>
                  {legacyOption(status, ["active","paused","draft","archived"])}
                  <SelectItem value="active">Configured</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="automation-name">Workflow Name</Label>
              <Input id="automation-name" value={name} onChange={(event) => updateDraft("name", event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="automation-trigger">Trigger</Label>
              <Select disabled={isPending} value={trigger} onValueChange={(value) => value && updateDraft("trigger", value)}>
                <SelectTrigger id="automation-trigger" className="w-full"><SelectValue placeholder="Not configured" /></SelectTrigger>
                <SelectContent>
                  {legacyOption(trigger, ["manual","new_inquiry","tour_scheduled","tour_completed","application_submitted","document_missing","invoice_overdue","review_requested","survey_response"])}
                  <SelectItem value="manual">Manual configuration</SelectItem>
                  <SelectItem value="new_inquiry">New inquiry</SelectItem>
                  <SelectItem value="tour_scheduled">Tour scheduled</SelectItem>
                  <SelectItem value="tour_completed">Tour completed</SelectItem>
                  <SelectItem value="application_submitted">Application submitted</SelectItem>
                  <SelectItem value="document_missing">Document missing</SelectItem>
                  <SelectItem value="invoice_overdue">Invoice overdue</SelectItem>
                  <SelectItem value="review_requested">Review requested</SelectItem>
                  <SelectItem value="survey_response">Survey response</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="automation-delay">Delay</Label>
              <Input id="automation-delay" value={delay} onChange={(event) => updateDraft("delay", event.target.value)} placeholder="Immediate, 2 hours, 1 day" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="automation-audience">Audience</Label>
              <Input id="automation-audience" value={audience} onChange={(event) => updateDraft("audience", event.target.value)} placeholder="Center, classroom, lead stage, family status, tag" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="automation-condition">Condition Rule</Label>
              <Textarea id="automation-condition" value={condition} onChange={(event) => updateDraft("condition", event.target.value)} placeholder="Example: Lead has completed tour and no application after 24 hours" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/40 p-3 md:col-span-2">
              <div className="min-w-0 flex-1 basis-40">
                <Label htmlFor="automation-requires-review">Require Staff Review</Label>
                <div id="automation-requires-review-help" className="text-xs text-muted-foreground">Record a review checkpoint for this configuration. Saving does not execute any action.</div>
              </div>
              <Switch id="automation-requires-review" disabled={isPending} aria-label="Require staff review" aria-describedby="automation-requires-review-help" checked={requiresReview} onCheckedChange={(value) => updateDraft("requiresReview", value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="automation-action-type">Action Type</Label>
              <Select disabled={isPending} value={actionType} onValueChange={(value) => value && updateDraft("actionType", value)}>
                <SelectTrigger id="automation-action-type" className="w-full"><SelectValue placeholder="Not configured" /></SelectTrigger>
                <SelectContent>
                  {legacyOption(actionType, ["send_campaign","create_task","notify_director","request_document","create_billing_follow_up","generate_ai_summary"])}
                  <SelectItem value="send_campaign">Send campaign</SelectItem>
                  <SelectItem value="create_task">Create task</SelectItem>
                  <SelectItem value="notify_director">Notify director</SelectItem>
                  <SelectItem value="request_document">Request document</SelectItem>
                  <SelectItem value="create_billing_follow_up">Billing follow-up</SelectItem>
                  <SelectItem value="generate_ai_summary">Generate AI summary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="automation-channel">Channel</Label>
              <Select disabled={isPending} value={channel} onValueChange={(value) => value && updateDraft("channel", value)}>
                <SelectTrigger id="automation-channel" className="w-full"><SelectValue placeholder="Not configured" /></SelectTrigger>
                <SelectContent>
                  {legacyOption(channel, ["email","sms","task","in_app","ai"])}
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="in_app">In app</SelectItem>
                  <SelectItem value="ai">AI assist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="automation-template">Template</Label>
              <Select disabled={isPending} value={templateKey || "none"} onValueChange={(value) => {
                if (!value) return;
                applyTemplate(value === "none" ? "" : value);
              }}>
                <SelectTrigger id="automation-template" className="w-full"><SelectValue placeholder="Not configured" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campaign template</SelectItem>
                  {legacyOption(templateKey, ["none", ...campaignTemplates.map(item => item.key)])}
                  {campaignTemplates.map((template) => (
                    <SelectItem key={template.key} value={template.key}>{template.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="automation-subject">Action Subject</Label>
              <Input id="automation-subject" value={subject} onChange={(event) => updateDraft("subject", event.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="automation-body">Action Body</Label>
              <Textarea id="automation-body" className="min-h-40" value={body} onChange={(event) => updateDraft("body", event.target.value)} />
            </div>
          </div>
          <Button type="button" disabled={readOnly || isPending || saveUnknown || !name} onClick={save}>
            <Save data-icon="inline-start" />
            {readOnly ? "Preview only" : isPending ? "Saving configuration…" : "Save Workflow"}
          </Button>
          <Button type="button" variant="outline" disabled={isPending || (!dirty && !saveUnknown)} onClick={() => loadAutomation(selectedId)}>Discard changes</Button>
          </fieldset>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card className="glass-panel min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle as="h2">Workflow Map</CardTitle>
            <CardDescription>Configuration preview — no automatic execution.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { icon: GitBranch, label: "Trigger", value: trigger.replaceAll("_", " ") },
              { icon: Workflow, label: "Rules", value: condition || "No condition" },
              { icon: History, label: "Delay", value: delay || "Immediate" },
              { icon: ShieldCheck, label: "Review", value: requiresReview ? "Review checkpoint configured" : "No review checkpoint configured" },
              { icon: Bot, label: "Action", value: `${actionType.replaceAll("_", " ")} via ${channel}` },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-xl border bg-background/40 p-3">
                  <div className="mb-1 flex items-center gap-2 font-medium">
                    <Icon className="size-4" />
                    {item.label}
                  </div>
                  <div className="text-muted-foreground">{item.value}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card className="glass-panel min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle as="h2">Saved workflow history</CardTitle>
            <CardDescription>Stored historical records are not proof that an action was delivered or completed.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last recorded event</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {automations.map((automation) => (
                  <TableRow key={automation.id}>
                    <TableCell>
                      <div className="font-medium">{automation.name}</div>
                      <div className="text-xs text-muted-foreground">{actionSummary(automation.action)}</div>
                    </TableCell>
                    <TableCell><Badge variant={automation.status === "active" ? "default" : "outline"}>{displayTokenLabel(automation.status)}</Badge></TableCell>
                    <TableCell>{automation.runs[0] ? `${displayTokenLabel(automation.runs[0].status)} · ${formatDate(automation.runs[0].createdAt, timeZone)}` : "No recorded events"}</TableCell>
                  </TableRow>
                ))}
                {!automations.length ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">No workflows have been set up yet.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
