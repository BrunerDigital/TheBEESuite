"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Bot, CheckCircle2, Send, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type MessageFamilyOption = {
  id: string;
  name: string;
  billingEmail: string | null;
  centerId?: string | null;
  centerLabel: string | null;
  classroomIds?: string[];
  statuses?: string[];
  tags?: string[];
  smsRecipientCount?: number;
};

export type MessageTemplateOption = {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  channel: string;
  mergeFields: string[];
};

export type MessageMergeFieldOption = {
  token: string;
  label: string;
};

export type MessageStaffOption = {
  id: string;
  name: string;
  email: string;
};

export type MessageSegmentOptions = {
  centers: Array<{ id: string; label: string }>;
  classrooms: Array<{ id: string; label: string; centerId: string }>;
  statuses: Array<{ value: string; label: string }>;
  tags: Array<{ value: string; label: string }>;
};

function SegmentChecklist({
  title,
  options,
  values,
  onToggle,
}: {
  title: string;
  options: Array<{ value: string; label: string }>;
  values: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-background/40 p-3">
      <div className="mb-2 text-sm font-medium">{title}</div>
      <div className="max-h-36 space-y-2 overflow-auto pr-1">
        {options.length ? options.map((option) => (
          <label key={option.value} className="flex items-start gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-input"
              checked={values.includes(option.value)}
              onChange={() => onToggle(option.value)}
            />
            <span className="leading-5">{option.label}</span>
          </label>
        )) : (
          <div className="text-xs text-muted-foreground">No options available</div>
        )}
      </div>
    </div>
  );
}

export function MessageReplyPanel({
  familyOptions,
  templates,
  mergeFields,
  staffOptions,
  segmentOptions,
}: {
  familyOptions: MessageFamilyOption[];
  templates: MessageTemplateOption[];
  mergeFields: MessageMergeFieldOption[];
  staffOptions: MessageStaffOption[];
  segmentOptions: MessageSegmentOptions;
}) {
  const router = useRouter();
  const templateOptions = templates.length ? templates : [];
  const [familyId, setFamilyId] = useState(familyOptions[0]?.id ?? "");
  const [targetMode, setTargetMode] = useState<"family" | "broadcast">("family");
  const [segmentCenterIds, setSegmentCenterIds] = useState<string[]>([]);
  const [segmentClassroomIds, setSegmentClassroomIds] = useState<string[]>([]);
  const [segmentStatuses, setSegmentStatuses] = useState<string[]>([]);
  const [segmentTags, setSegmentTags] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState(templateOptions[0]?.id ?? "");
  const [priority, setPriority] = useState("normal");
  const [aiPurpose, setAiPurpose] = useState("reply");
  const [assignedToId, setAssignedToId] = useState("unassigned");
  const [subject, setSubject] = useState(templateOptions[0]?.subject ?? "Follow-up from the school");
  const [message, setMessage] = useState(templateOptions[0]?.body ?? "");
  const [suggestions, setSuggestions] = useState<Array<{ subject: string; body: string; label: string }>>([]);
  const [guardrailNote, setGuardrailNote] = useState("");
  const [isSuggesting, startSuggestionTransition] = useTransition();
  const [sendEmailCopy, setSendEmailCopy] = useState(true);
  const [sendSmsCopy, setSendSmsCopy] = useState(false);
  const [sendPushCopy, setSendPushCopy] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedFamily = useMemo(
    () => familyOptions.find((family) => family.id === familyId) ?? null,
    [familyId, familyOptions],
  );
  const selectedSegment = useMemo(() => ({
    centerIds: segmentCenterIds,
    classroomIds: segmentClassroomIds,
    statuses: segmentStatuses,
    tags: segmentTags,
  }), [segmentCenterIds, segmentClassroomIds, segmentStatuses, segmentTags]);
  const broadcastFamilies = useMemo(() => {
    if (targetMode !== "broadcast") return [];
    return familyOptions.filter((family) => {
      if (selectedSegment.centerIds.length && (!family.centerId || !selectedSegment.centerIds.includes(family.centerId))) return false;
      if (selectedSegment.classroomIds.length && !family.classroomIds?.some((id) => selectedSegment.classroomIds.includes(id))) return false;
      if (selectedSegment.statuses.length && !family.statuses?.some((status) => selectedSegment.statuses.includes(status))) return false;
      if (selectedSegment.tags.length && !family.tags?.some((tag) => selectedSegment.tags.includes(tag))) return false;
      return true;
    });
  }, [familyOptions, selectedSegment, targetMode]);
  const targetFamilyCount = targetMode === "broadcast" ? broadcastFamilies.length : selectedFamily ? 1 : 0;
  const selectedFamilySmsRecipientCount = selectedFamily?.smsRecipientCount ?? 0;
  const broadcastSmsRecipientCount = useMemo(
    () => broadcastFamilies.reduce((count, family) => count + (family.smsRecipientCount ?? 0), 0),
    [broadcastFamilies],
  );
  const smsRecipientCount = targetMode === "broadcast" ? broadcastSmsRecipientCount : selectedFamilySmsRecipientCount;
  const canSendSmsCopy = smsRecipientCount > 0;

  function applyTemplate(nextTemplateId: string) {
    const template = templateOptions.find((item) => item.id === nextTemplateId) ?? templateOptions[0];
    if (!template) return;
    setTemplateId(template.id);
    setSubject(template.subject);
    setMessage(template.body);
  }

  function insertMergeField(token: string) {
    setMessage((current) => `${current}${current.endsWith(" ") || current.endsWith("\n") || !current ? "" : " "}{{${token}}}`);
  }

  function toggleSelection(value: string, values: string[], setValues: (next: string[]) => void) {
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  function requestSuggestions() {
    startSuggestionTransition(async () => {
      setErrorMessage("");
      setSuggestions([]);
      setGuardrailNote("");
      const response = await fetch("/api/communications/messages/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: targetMode === "family" ? familyId : null,
          targetMode,
          broadcastSegment: selectedSegment,
          templateId,
          subject,
          message,
          purpose: aiPurpose,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; guardrailNote?: string; suggestions?: Array<{ subject: string; body: string; label: string }> } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "AI suggestions could not be generated.");
        return;
      }
      setSuggestions(json?.suggestions ?? []);
      setGuardrailNote(json?.guardrailNote ?? "");
    });
  }

  function submit() {
    if ((targetMode === "family" && !familyId) || !message.trim()) return;
    const shouldSendSmsCopy = sendSmsCopy && canSendSmsCopy;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/communications/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: targetMode === "family" ? familyId : null,
          targetMode,
          broadcastSegment: targetMode === "broadcast" ? selectedSegment : null,
          subject,
          message,
          priority,
          templateId,
          assignedToId: assignedToId === "unassigned" ? null : assignedToId,
          channel: targetMode === "broadcast" ? "broadcast" : "portal_reply",
          sendEmailCopy,
          sendSmsCopy: shouldSendSmsCopy,
          sendPushCopy,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; recipientCount?: number; messageCount?: number; sms?: { attempted: number; sent: number; error?: string | null }; push?: { attempted: number } } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Message could not be sent.");
        return;
      }
      const smsDetail = shouldSendSmsCopy
        ? json?.sms?.attempted
          ? ` ${json.sms.sent}/${json.sms.attempted} SMS copies sent or queued.`
          : ` ${json?.sms?.error ?? "No SMS copy was sent."}`
        : "";
      const pushDetail = sendPushCopy ? ` ${json?.push?.attempted ?? 0} push/in-app notifications queued.` : "";
      setStatusMessage(targetMode === "broadcast"
        ? `Broadcast sent to ${json?.recipientCount ?? targetFamilyCount} families.${smsDetail}${pushDetail}`
        : `Message sent to ${selectedFamily?.name ?? "the family"}.${smsDetail}${pushDetail}`);
      setMessage("");
      setSuggestions([]);
      setGuardrailNote("");
      router.refresh();
    });
  }

  const canSubmit = targetMode === "broadcast"
    ? targetFamilyCount > 0 && Boolean(message.trim())
    : Boolean(familyId && message.trim());

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Message Composer</CardTitle>
        <CardDescription>Office, classroom, and broadcast messages are stored on each family timeline.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {statusMessage ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Sent</AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        ) : null}
        {errorMessage ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        {familyOptions.length ? (
          <>
            <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.8fr)]">
              <div className="space-y-1">
                <Label>Target</Label>
                <Select value={targetMode} onValueChange={(value) => setTargetMode(value === "broadcast" ? "broadcast" : "family")}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="family">Single family</SelectItem>
                    <SelectItem value="broadcast">Broadcast segment</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">{targetFamilyCount} recipient family{targetFamilyCount === 1 ? "" : "ies"}</div>
              </div>
              {targetMode === "family" ? (
                <div className="space-y-1">
                  <Label>Family</Label>
                  <Select value={familyId} onValueChange={(value) => value && setFamilyId(value)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Choose family" /></SelectTrigger>
                    <SelectContent>
                      {familyOptions.map((family) => (
                        <SelectItem key={family.id} value={family.id}>
                          {family.name}{family.centerLabel ? ` - ${family.centerLabel}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">{selectedFamily?.billingEmail ?? "No billing email on file"}</div>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>Broadcast recipients</Label>
                  <div className="rounded-md border bg-background/40 px-3 py-2 text-sm">
                    {targetFamilyCount} matching families
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label>Template</Label>
                <Select value={templateId} onValueChange={(value) => value && applyTemplate(value)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {templateOptions.map((template) => (
                      <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(value) => value && setPriority(value)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Assigned staff</Label>
                <Select value={assignedToId} onValueChange={(value) => value && setAssignedToId(value)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {staffOptions.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {targetMode === "broadcast" ? (
              <div className="grid gap-3 md:grid-cols-4">
                <SegmentChecklist title="Centers" options={segmentOptions.centers.map((center) => ({ value: center.id, label: center.label }))} values={segmentCenterIds} onToggle={(value) => toggleSelection(value, segmentCenterIds, setSegmentCenterIds)} />
                <SegmentChecklist title="Classrooms" options={segmentOptions.classrooms.map((classroom) => ({ value: classroom.id, label: classroom.label }))} values={segmentClassroomIds} onToggle={(value) => toggleSelection(value, segmentClassroomIds, setSegmentClassroomIds)} />
                <SegmentChecklist title="Statuses" options={segmentOptions.statuses} values={segmentStatuses} onToggle={(value) => toggleSelection(value, segmentStatuses, setSegmentStatuses)} />
                <SegmentChecklist title="Tags" options={segmentOptions.tags} values={segmentTags} onToggle={(value) => toggleSelection(value, segmentTags, setSegmentTags)} />
              </div>
            ) : null}
            <div className="space-y-1">
              <Label>Subject</Label>
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Message</Label>
              <Textarea value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-28" />
            </div>
            <div className="flex flex-wrap gap-2">
              {mergeFields.map((field) => (
                <Button key={field.token} type="button" variant="outline" size="sm" onClick={() => insertMergeField(field.token)}>
                  {field.label}
                </Button>
              ))}
            </div>
            <div className="rounded-lg border bg-background/40 p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,0.6fr)_auto]">
                <div className="space-y-1">
                  <Label>AI reply purpose</Label>
                  <Select value={aiPurpose} onValueChange={(value) => value && setAiPurpose(value)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reply">General reply</SelectItem>
                      <SelectItem value="documents">Documents</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                      <SelectItem value="classroom">Classroom</SelectItem>
                      <SelectItem value="attendance">Attendance</SelectItem>
                      <SelectItem value="broadcast">Broadcast</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button type="button" variant="outline" disabled={isSuggesting || (targetMode === "family" && !familyId)} onClick={requestSuggestions}>
                    <Sparkles data-icon="inline-start" />
                    {isSuggesting ? "Drafting" : "Suggest replies"}
                  </Button>
                </div>
              </div>
              {suggestions.length ? (
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.label}
                      type="button"
                      className="rounded-md border bg-card/70 p-3 text-left text-sm transition-colors hover:bg-accent"
                      onClick={() => {
                        setSubject(suggestion.subject || subject);
                        setMessage(suggestion.body);
                      }}
                    >
                      <div className="mb-1 flex items-center gap-2 font-medium">
                        <Bot className="size-4" />
                        {suggestion.label}
                      </div>
                      <div className="line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground">{suggestion.body}</div>
                    </button>
                  ))}
                </div>
              ) : null}
              {guardrailNote ? <div className="mt-3 text-xs leading-5 text-muted-foreground">{guardrailNote}</div> : null}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={sendEmailCopy}
                onChange={(event) => setSendEmailCopy(event.target.checked)}
              />
              Email a copy to family contacts
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={sendSmsCopy && canSendSmsCopy}
                disabled={!canSendSmsCopy}
                onChange={(event) => setSendSmsCopy(event.target.checked)}
              />
              Text a copy to SMS-preferred guardians ({smsRecipientCount})
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={sendPushCopy}
                onChange={(event) => setSendPushCopy(event.target.checked)}
              />
              Queue push/in-app notifications for linked portal users
            </label>
            <Button disabled={isPending || !canSubmit} onClick={submit}>
              <Send data-icon="inline-start" />
              {targetMode === "broadcast" ? "Send Broadcast" : "Send Reply"}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No family records are available in this message scope yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
