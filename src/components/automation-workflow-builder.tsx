"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
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
import { campaignTemplates } from "@/lib/marketing-workflows";

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

function jsonSummary(value: unknown) {
  const record = asRecord(value);
  const entries = Object.entries(record)
    .filter(([, item]) => item !== null && item !== undefined && item !== "")
    .slice(0, 3)
    .map(([key, item]) => `${key}: ${String(item)}`);
  return entries.length ? entries.join(" · ") : "None";
}

export function AutomationWorkflowBuilder({ data }: { data: AutomationWorkflowBuilderData }) {
  const timeZone = useSchoolTimeZone();
  const router = useRouter();
  const firstAutomation = data.automations[0] ?? null;
  const firstCondition = asRecord(firstAutomation?.condition);
  const firstAction = asRecord(firstAutomation?.action);
  const [selectedId, setSelectedId] = useState(firstAutomation?.id ?? "");
  const [name, setName] = useState(firstAutomation?.name ?? "Tour follow-up workflow");
  const [trigger, setTrigger] = useState(firstAutomation?.trigger ?? "tour_completed");
  const [audience, setAudience] = useState(stringValue(firstCondition.audience, "Families with completed tours"));
  const [condition, setCondition] = useState(stringValue(firstCondition.rule, "Lead stage is tour completed and no application submitted"));
  const [requiresReview, setRequiresReview] = useState(firstCondition.requiresReview !== false);
  const [delay, setDelay] = useState(firstAutomation?.delay ?? "1 day");
  const [actionType, setActionType] = useState(stringValue(firstAction.type, "send_campaign"));
  const [channel, setChannel] = useState(stringValue(firstAction.channel, "email"));
  const [templateKey, setTemplateKey] = useState(stringValue(firstAction.templateKey, "tour_follow_up"));
  const [subject, setSubject] = useState(stringValue(firstAction.subject, campaignTemplates.find((template) => template.key === "tour_follow_up")?.subject ?? ""));
  const [body, setBody] = useState(stringValue(firstAction.body, campaignTemplates.find((template) => template.key === "tour_follow_up")?.body ?? ""));
  const [status, setStatus] = useState(firstAutomation?.status ?? "active");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function loadAutomation(automation: AutomationRow) {
    const automationCondition = asRecord(automation.condition);
    const automationAction = asRecord(automation.action);
    setSelectedId(automation.id);
    setName(automation.name);
    setTrigger(automation.trigger);
    setAudience(stringValue(automationCondition.audience));
    setCondition(stringValue(automationCondition.rule));
    setRequiresReview(automationCondition.requiresReview !== false);
    setDelay(automation.delay ?? "");
    setActionType(stringValue(automationAction.type, "send_campaign"));
    setChannel(stringValue(automationAction.channel, "email"));
    setTemplateKey(stringValue(automationAction.templateKey));
    setSubject(stringValue(automationAction.subject));
    setBody(stringValue(automationAction.body));
    setStatus(automation.status);
    setMessage("");
    setError("");
  }

  function applyTemplate(key: string) {
    const template = campaignTemplates.find((item) => item.key === key);
    setTemplateKey(key);
    if (!template) return;
    setSubject(template.subject);
    setBody(template.body);
    setChannel("email");
    setActionType("send_campaign");
  }

  function save() {
    startTransition(async () => {
      setMessage("");
      setError("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "automation",
          id: selectedId || undefined,
          name,
          trigger,
          audience,
          condition,
          requiresReview,
          actionType,
          channel,
          templateKey,
          subject,
          body,
          delay,
          status,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; record?: { id?: string } } | null;
      if (!response.ok) {
        setError(json?.error || "Automation could not be saved.");
        return;
      }
      if (json?.record?.id) setSelectedId(json.record.id);
      setMessage("Workflow saved.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Automation Workflow Builder</CardTitle>
          <CardDescription>Configure trigger, rules, delay, review gate, and action payloads for school operations workflows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? <div className="rounded-lg border bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{message}</div> : null}
          {error ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Saved Workflow</Label>
              <Select value={selectedId || "new"} onValueChange={(value) => {
                if (value === "new") {
                  setSelectedId("");
                  return;
                }
                const automation = data.automations.find((item) => item.id === value);
                if (automation) loadAutomation(automation);
              }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New workflow</SelectItem>
                  {data.automations.map((automation) => (
                    <SelectItem key={automation.id} value={automation.id}>{automation.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => value && setStatus(value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Workflow Name</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Trigger</Label>
              <Select value={trigger} onValueChange={(value) => value && setTrigger(value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
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
              <Label>Delay</Label>
              <Input value={delay} onChange={(event) => setDelay(event.target.value)} placeholder="Immediate, 2 hours, 1 day" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Audience</Label>
              <Input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Center, classroom, lead stage, family status, tag" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Condition Rule</Label>
              <Textarea value={condition} onChange={(event) => setCondition(event.target.value)} placeholder="Example: Lead has completed tour and no application after 24 hours" />
            </div>
            <div className="flex items-center justify-between rounded-xl border bg-background/40 p-3 md:col-span-2">
              <div>
                <Label>Require Staff Review</Label>
                <div className="text-xs text-muted-foreground">Use this for billing, compliance, enrollment decisions, and AI-assisted messaging.</div>
              </div>
              <Switch checked={requiresReview} onCheckedChange={setRequiresReview} />
            </div>
            <div className="space-y-1">
              <Label>Action Type</Label>
              <Select value={actionType} onValueChange={(value) => value && setActionType(value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
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
              <Label>Channel</Label>
              <Select value={channel} onValueChange={(value) => value && setChannel(value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="in_app">In app</SelectItem>
                  <SelectItem value="ai">AI assist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Template</Label>
              <Select value={templateKey || "none"} onValueChange={(value) => {
                if (!value) return;
                applyTemplate(value === "none" ? "" : value);
              }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campaign template</SelectItem>
                  {campaignTemplates.map((template) => (
                    <SelectItem key={template.key} value={template.key}>{template.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Action Subject</Label>
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Action Body</Label>
              <Textarea className="min-h-40" value={body} onChange={(event) => setBody(event.target.value)} />
            </div>
          </div>
          <Button disabled={isPending || !name} onClick={save}>
            <Save data-icon="inline-start" />
            Save Workflow
          </Button>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Workflow Map</CardTitle>
            <CardDescription>Current automation logic before activation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { icon: GitBranch, label: "Trigger", value: trigger.replaceAll("_", " ") },
              { icon: Workflow, label: "Rules", value: condition || "No condition" },
              { icon: History, label: "Delay", value: delay || "Immediate" },
              { icon: ShieldCheck, label: "Review", value: requiresReview ? "Staff approval required" : "Auto-run allowed" },
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
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Recent Runs</CardTitle>
            <CardDescription>Execution snapshots for saved workflows.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Run</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.automations.map((automation) => (
                  <TableRow key={automation.id}>
                    <TableCell>
                      <div className="font-medium">{automation.name}</div>
                      <div className="text-xs text-muted-foreground">{jsonSummary(automation.action)}</div>
                    </TableCell>
                    <TableCell><Badge variant={automation.status === "active" ? "default" : "outline"}>{automation.status}</Badge></TableCell>
                    <TableCell>{automation.runs[0] ? `${automation.runs[0].status} · ${formatDate(automation.runs[0].createdAt, timeZone)}` : "No runs"}</TableCell>
                  </TableRow>
                ))}
                {!data.automations.length ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">No tenant workflows have been configured yet.</TableCell>
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
