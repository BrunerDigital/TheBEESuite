"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, MessageSquare, Paperclip, Send, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CollapsibleCard } from "@/components/workspace-preferences";
import { replySubject } from "@/lib/message-reply-routing";

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
  role?: string;
};

export type MessageSegmentOptions = {
  centers: Array<{ id: string; label: string }>;
  classrooms: Array<{ id: string; label: string; centerId: string }>;
  statuses: Array<{ value: string; label: string }>;
  tags: Array<{ value: string; label: string }>;
};

export type MessageReplyDraft = {
  replyToMessageId: string;
  targetMode: "family" | "staff";
  familyId?: string | null;
  staffId?: string | null;
  subject?: string | null;
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
  const checklistId = useId();

  return (
    <fieldset className="rounded-lg border bg-background p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <div className="max-h-36 space-y-2 overflow-auto pr-1">
        {options.length ? options.map((option) => {
          const optionId = `${checklistId}-${encodeURIComponent(option.value)}`;

          return (
            <label key={option.value} htmlFor={optionId} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
              <input
                id={optionId}
                type="checkbox"
                className="size-5 shrink-0 rounded border-input"
                checked={values.includes(option.value)}
                onChange={() => onToggle(option.value)}
              />
              <span className="leading-5">{option.label}</span>
            </label>
          );
        }) : (
          <div className="text-xs text-muted-foreground">No options available</div>
        )}
      </div>
    </fieldset>
  );
}

export function MessageReplyPanel({
  familyOptions,
  templates,
  mergeFields,
  staffOptions,
  segmentOptions,
  currentRole,
  replyDraft,
  variant = "full",
  composerId = "message-composer",
  defaultCollapsed = false,
}: {
  familyOptions: MessageFamilyOption[];
  templates: MessageTemplateOption[];
  mergeFields: MessageMergeFieldOption[];
  staffOptions: MessageStaffOption[];
  segmentOptions: MessageSegmentOptions;
  currentRole: string;
  replyDraft?: MessageReplyDraft | null;
  variant?: "full" | "conversation";
  composerId?: string;
  defaultCollapsed?: boolean;
}) {
  const router = useRouter();
  const instanceId = useId();
  const fieldId = (name: string) => `${composerId}-${instanceId}-${name}`;
  const templateOptions = templates.length ? templates : [];
  const initialTargetMode = replyDraft?.targetMode ?? (familyOptions[0]?.id ? "family" : "staff");
  const [familyId, setFamilyId] = useState(
    replyDraft?.targetMode === "family" && replyDraft.familyId ? replyDraft.familyId : familyOptions[0]?.id ?? "",
  );
  const [targetMode, setTargetMode] = useState<"family" | "broadcast" | "staff">(initialTargetMode);
  const [segmentCenterIds, setSegmentCenterIds] = useState<string[]>([]);
  const [segmentClassroomIds, setSegmentClassroomIds] = useState<string[]>([]);
  const [segmentStatuses, setSegmentStatuses] = useState<string[]>([]);
  const [segmentTags, setSegmentTags] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState(templateOptions[0]?.id ?? "");
  const [priority, setPriority] = useState("normal");
  const [aiPurpose, setAiPurpose] = useState("reply");
  const [assignedToId, setAssignedToId] = useState(
    replyDraft?.targetMode === "staff" && replyDraft.staffId ? replyDraft.staffId : "unassigned",
  );
  const [subject, setSubject] = useState(
    replyDraft?.replyToMessageId ? replySubject(replyDraft.subject) : templateOptions[0]?.subject ?? "Follow-up from the school",
  );
  const [message, setMessage] = useState(replyDraft?.replyToMessageId ? "" : templateOptions[0]?.body ?? "");
  const [suggestions, setSuggestions] = useState<Array<{ subject: string; body: string; label: string }>>([]);
  const [guardrailNote, setGuardrailNote] = useState("");
  const [isSuggesting, startSuggestionTransition] = useTransition();
  const [sendEmailCopy, setSendEmailCopy] = useState(true);
  const [sendSmsCopy, setSendSmsCopy] = useState(false);
  const [sendPushCopy, setSendPushCopy] = useState(true);
  const [replyToMessageId, setReplyToMessageId] = useState(replyDraft?.replyToMessageId ?? "");
  const [replyingToLabel, setReplyingToLabel] = useState(
    replyDraft?.replyToMessageId
      ? replyDraft.targetMode === "staff"
        ? "Replying in staff thread"
        : "Replying in family thread"
      : "",
  );
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentInputKey, setAttachmentInputKey] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const canUseBroadcast = ["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER", "CENTER_DIRECTOR", "ASSISTANT_DIRECTOR"].includes(currentRole);
  const canUseStaffTarget = currentRole === "TEACHER" || canUseBroadcast;
  const staffRecipientOptions = useMemo(() => {
    if (!canUseStaffTarget) return [];
    const directorRoles = new Set(["CENTER_DIRECTOR", "ASSISTANT_DIRECTOR"]);
    return staffOptions.filter((staff) => {
      if (currentRole === "TEACHER") return directorRoles.has(staff.role ?? "");
      return staff.role === "TEACHER";
    });
  }, [canUseStaffTarget, currentRole, staffOptions]);

  const selectedFamily = useMemo(
    () => familyOptions.find((family) => family.id === familyId) ?? null,
    [familyId, familyOptions],
  );
  const selectedStaffRecipient = useMemo(
    () => staffRecipientOptions.find((staff) => staff.id === assignedToId) ?? null,
    [assignedToId, staffRecipientOptions],
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

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`;
  }

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

  function addAttachments(files: FileList | null) {
    const selected = Array.from(files ?? []).filter((file) => file.size > 0);
    if (!selected.length) return;
    setAttachmentFiles((current) => {
      const next = [...current, ...selected].slice(0, 5);
      if (current.length + selected.length > 5) {
        setErrorMessage("Attach up to 5 files per message.");
      }
      return next;
    });
  }

  function removeAttachment(index: number) {
    setAttachmentFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function buildMessageRequestBody(shouldSendSmsCopy: boolean) {
    return {
      familyId: targetMode === "family" ? familyId : null,
      targetMode,
      broadcastSegment: targetMode === "broadcast" ? selectedSegment : null,
      replyToMessageId: replyToMessageId || null,
      subject,
      message,
      priority,
      templateId,
      assignedToId: assignedToId === "unassigned" ? null : assignedToId,
      channel: targetMode === "broadcast" ? "broadcast" : targetMode === "staff" ? "staff" : "portal_reply",
      sendEmailCopy: targetMode === "staff" ? false : sendEmailCopy,
      sendSmsCopy: targetMode === "staff" ? false : shouldSendSmsCopy,
      sendPushCopy,
    };
  }

  function buildMessageFormData(shouldSendSmsCopy: boolean) {
    const requestBody = buildMessageRequestBody(shouldSendSmsCopy);
    const formData = new FormData();
    for (const [key, value] of Object.entries(requestBody)) {
      if (value === null || value === undefined) continue;
      formData.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
    for (const file of attachmentFiles) {
      formData.append("attachments", file);
    }
    return formData;
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
    if ((targetMode === "family" && !familyId) || (targetMode === "staff" && !selectedStaffRecipient) || (!message.trim() && !attachmentFiles.length)) return;
    const shouldSendSmsCopy = sendSmsCopy && canSendSmsCopy;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const requestBody = buildMessageRequestBody(shouldSendSmsCopy);
      const response = await fetch("/api/communications/messages", {
        method: "POST",
        ...(attachmentFiles.length
          ? { body: buildMessageFormData(shouldSendSmsCopy) }
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) }),
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
      const pushDetail = sendPushCopy ? ` ${json?.push?.attempted ?? 0} in-app notifications queued.` : "";
      setStatusMessage(targetMode === "staff"
        ? `Message sent to ${selectedStaffRecipient?.name ?? "the staff member"}.${pushDetail}`
        : targetMode === "broadcast"
        ? `Broadcast sent to ${json?.recipientCount ?? targetFamilyCount} families.${smsDetail}${pushDetail}`
        : `Message sent to ${selectedFamily?.name ?? "the family"}.${smsDetail}${pushDetail}`);
      setMessage("");
      setReplyToMessageId("");
      setReplyingToLabel("");
      setAttachmentFiles([]);
      setAttachmentInputKey((current) => current + 1);
      setSuggestions([]);
      setGuardrailNote("");
      router.refresh();
    });
  }

  const canSubmit = targetMode === "broadcast"
    ? targetFamilyCount > 0 && Boolean(message.trim() || attachmentFiles.length)
    : targetMode === "staff"
      ? Boolean(selectedStaffRecipient && (message.trim() || attachmentFiles.length))
      : Boolean(familyId && (message.trim() || attachmentFiles.length));

  if (variant === "conversation") {
    return (
      <section id={composerId} className="scroll-mt-28 border-t bg-transparent p-3 sm:p-4" aria-label={`Reply to ${selectedFamily?.name ?? "family"}`}>
        <div className="mx-auto max-w-4xl space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Reply to {selectedFamily?.name ?? "family"}</div>
              <div className="text-xs text-muted-foreground">Your reply stays in this family conversation.</div>
            </div>
            <Badge variant="outline">School reply</Badge>
          </div>
          <div aria-live="polite" aria-atomic="true">
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
          </div>
          <Label htmlFor={fieldId("message")} className="sr-only">Message</Label>
          <Textarea
            id={fieldId("message")}
            name="message-body"
            autoComplete="off"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="min-h-24 resize-y bg-background"
            placeholder={`Message ${selectedFamily?.name ?? "this family"}`}
          />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={fieldId("attachments")} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Paperclip aria-hidden="true" className="size-3.5" />
                Add photos or files
              </Label>
              <Input
                key={attachmentInputKey}
                id={fieldId("attachments")}
                name="message-attachments"
                className="h-11"
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={(event) => addAttachments(event.target.files)}
              />
            </div>
            <Button size="lg" disabled={isPending || !canSubmit} aria-busy={isPending} onClick={submit}>
              <Send data-icon="inline-start" />
              {isPending ? "Sending" : "Send reply"}
            </Button>
          </div>
          {attachmentFiles.length ? (
            <div className="flex flex-wrap gap-2">
              {attachmentFiles.map((file, index) => (
                <span key={`${file.name}-${file.size}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-md border bg-background px-2.5 py-1 text-xs">
                  <span className="truncate">{file.name || "attachment"}</span>
                  <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    onClick={() => removeAttachment(index)}
                    aria-label={`Remove attachment ${index + 1}: ${file.name || "unnamed file"}`}
                    title={`Remove attachment ${index + 1}: ${file.name || "unnamed file"}`}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-2 gap-y-2 text-xs text-muted-foreground">
            <label htmlFor={fieldId("email-copy")} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 focus-within:ring-2 focus-within:ring-ring/50">
              <input
                id={fieldId("email-copy")}
                type="checkbox"
                className="size-5 shrink-0 rounded border-input"
                checked={sendEmailCopy}
                onChange={(event) => setSendEmailCopy(event.target.checked)}
              />
              Email copy
            </label>
            {canSendSmsCopy ? (
              <label htmlFor={fieldId("sms-copy")} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 focus-within:ring-2 focus-within:ring-ring/50">
                <input
                  id={fieldId("sms-copy")}
                  type="checkbox"
                  className="size-5 shrink-0 rounded border-input"
                  checked={sendSmsCopy}
                  onChange={(event) => setSendSmsCopy(event.target.checked)}
                />
                SMS copy ({smsRecipientCount})
              </label>
            ) : null}
            <label htmlFor={fieldId("in-app-copy")} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 focus-within:ring-2 focus-within:ring-ring/50">
              <input
                id={fieldId("in-app-copy")}
                type="checkbox"
                className="size-5 shrink-0 rounded border-input"
                checked={sendPushCopy}
                onChange={(event) => setSendPushCopy(event.target.checked)}
              />
              In-app notification
            </label>
          </div>
        </div>
      </section>
    );
  }

  return (
    <CollapsibleCard
      id={composerId}
      title="Write a message"
      description="Family, classroom, broadcast, and director/teacher messages are stored in scoped threads."
      collapsedSummary={replyDraft ? "Reply ready to complete" : "Open a focused composer"}
      contentClassName="space-y-4"
      defaultCollapsed={defaultCollapsed && !replyDraft}
    >
      <div aria-busy={isPending || isSuggesting} className="contents">
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
        {replyToMessageId ? (
          <Alert>
            <MessageSquare className="size-4" />
            <AlertTitle>{replyingToLabel || "Replying in thread"}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>This message will stay attached to the selected Bee Suite conversation.</span>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => {
                  setReplyToMessageId("");
                  setReplyingToLabel("");
                }}
              >
                <X data-icon="inline-start" aria-hidden="true" />
                Cancel reply
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {familyOptions.length || staffRecipientOptions.length ? (
          <>
            <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.8fr)]">
              <div className="space-y-1">
                <Label htmlFor={fieldId("target")}>Target</Label>
                <Select value={targetMode} onValueChange={(value) => setTargetMode(value === "broadcast" ? "broadcast" : value === "staff" ? "staff" : "family")}>
                  <SelectTrigger id={fieldId("target")} className="h-11 w-full" aria-describedby={fieldId("target-description")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {familyOptions.length ? <SelectItem value="family">Single family</SelectItem> : null}
                    {canUseBroadcast ? <SelectItem value="broadcast">Broadcast segment</SelectItem> : null}
                    {staffRecipientOptions.length ? <SelectItem value="staff">Staff member</SelectItem> : null}
                  </SelectContent>
                </Select>
                <div id={fieldId("target-description")} className="text-xs text-muted-foreground">
                  {targetMode === "staff" ? "Director/teacher thread" : `${targetFamilyCount} recipient family${targetFamilyCount === 1 ? "" : "ies"}`}
                </div>
              </div>
              {targetMode === "family" ? (
                <div className="space-y-1">
                  <Label htmlFor={fieldId("family")}>Family</Label>
                  <Select value={familyId} onValueChange={(value) => value && setFamilyId(value)}>
                    <SelectTrigger id={fieldId("family")} className="h-11 w-full" aria-describedby={fieldId("family-description")}><SelectValue placeholder="Choose family" /></SelectTrigger>
                    <SelectContent>
                      {familyOptions.map((family) => (
                        <SelectItem key={family.id} value={family.id}>
                          {family.name}{family.centerLabel ? ` - ${family.centerLabel}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div id={fieldId("family-description")} className="text-xs text-muted-foreground">{selectedFamily?.billingEmail ?? "No billing email on file"}</div>
                </div>
              ) : targetMode === "broadcast" ? (
                <div className="space-y-1">
                  <div className="text-sm font-medium">Broadcast recipients</div>
                  <div className="flex min-h-11 items-center rounded-md border bg-background px-3 py-2 text-sm">
                    {targetFamilyCount} matching families
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label htmlFor={fieldId("staff-recipient")}>Staff recipient</Label>
                  <Select value={assignedToId} onValueChange={(value) => value && setAssignedToId(value)}>
                    <SelectTrigger id={fieldId("staff-recipient")} className="h-11 w-full" aria-describedby={fieldId("staff-recipient-description")}><SelectValue placeholder="Choose staff" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Choose staff</SelectItem>
                      {staffRecipientOptions.map((staff) => (
                        <SelectItem key={staff.id} value={staff.id}>
                          {staff.name}{staff.role ? ` - ${staff.role.replaceAll("_", " ").toLowerCase()}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div id={fieldId("staff-recipient-description")} className="text-xs text-muted-foreground">{selectedStaffRecipient?.email ?? "In-app staff thread"}</div>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor={fieldId("template")}>Template</Label>
                <Select value={templateId} onValueChange={(value) => value && applyTemplate(value)}>
                  <SelectTrigger id={fieldId("template")} className="h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {templateOptions.map((template) => (
                      <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={fieldId("priority")}>Priority</Label>
                <Select value={priority} onValueChange={(value) => value && setPriority(value)}>
                  <SelectTrigger id={fieldId("priority")} className="h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {targetMode !== "staff" ? (
                <div className="space-y-1">
                  <Label htmlFor={fieldId("assigned-staff")}>Assigned staff</Label>
                  <Select value={assignedToId} onValueChange={(value) => value && setAssignedToId(value)}>
                    <SelectTrigger id={fieldId("assigned-staff")} className="h-11 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {staffOptions.map((staff) => (
                        <SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-sm font-medium">Delivery</div>
                  <div className="flex min-h-11 items-center rounded-md border bg-background px-3 py-2 text-sm">In-app staff thread</div>
                </div>
              )}
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
              <Label htmlFor={fieldId("subject")}>Subject</Label>
              <Input id={fieldId("subject")} name="message-subject" autoComplete="off" className="h-11" value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={fieldId("message")}>Message</Label>
              <Textarea id={fieldId("message")} name="message-body" autoComplete="off" value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-28" />
            </div>
            <div className="space-y-2 rounded-lg border bg-background p-3">
              <Label htmlFor={fieldId("attachments")} className="flex items-center gap-2">
                <Paperclip aria-hidden="true" className="size-4" />
                Attach photos or files
              </Label>
              <Input
                key={attachmentInputKey}
                id={fieldId("attachments")}
                name="message-attachments"
                className="h-11"
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={(event) => addAttachments(event.target.files)}
              />
              {attachmentFiles.length ? (
                <div className="flex flex-wrap gap-2">
                  {attachmentFiles.map((file, index) => (
                    <span key={`${file.name}-${file.size}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-md border bg-card px-2 py-1 text-xs">
                      <span className="truncate">{file.name || "attachment"}</span>
                      <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        onClick={() => removeAttachment(index)}
                        aria-label={`Remove attachment ${index + 1}: ${file.name || "unnamed file"}`}
                        title={`Remove attachment ${index + 1}: ${file.name || "unnamed file"}`}
                      >
                        <X aria-hidden="true" className="size-4" />
                      </Button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {mergeFields.map((field) => (
                <Button
                  key={field.token}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  aria-label={`Insert ${field.label} merge field`}
                  onClick={() => insertMergeField(field.token)}
                >
                  {field.label}
                </Button>
              ))}
            </div>
            <div className="rounded-lg border bg-background p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,0.6fr)_auto]">
                <div className="space-y-1">
                  <Label htmlFor={fieldId("draft-purpose")}>Reply draft purpose</Label>
                  <Select value={aiPurpose} onValueChange={(value) => value && setAiPurpose(value)}>
                    <SelectTrigger id={fieldId("draft-purpose")} className="h-11 w-full"><SelectValue /></SelectTrigger>
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
                  <Button size="lg" type="button" variant="outline" disabled={isSuggesting || targetMode === "staff" || (targetMode === "family" && !familyId)} aria-busy={isSuggesting} onClick={requestSuggestions}>
                    {isSuggesting ? "Drafting" : "Suggest replies"}
                  </Button>
                </div>
              </div>
              {suggestions.length ? (
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion.label}-${index}`}
                      type="button"
                      className="min-h-11 rounded-md border bg-card p-3 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      aria-label={`Use reply suggestion ${index + 1}: ${suggestion.label}`}
                      onClick={() => {
                        setSubject(suggestion.subject || subject);
                        setMessage(suggestion.body);
                      }}
                    >
                      <div className="mb-1 font-medium">{suggestion.label}</div>
                      <div className="line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground">{suggestion.body}</div>
                    </button>
                  ))}
                </div>
              ) : null}
              {guardrailNote ? <div className="mt-3 text-xs leading-5 text-muted-foreground">{guardrailNote}</div> : null}
            </div>
            {targetMode !== "staff" ? (
              <>
                <label htmlFor={fieldId("email-copy")} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
                  <input
                    id={fieldId("email-copy")}
                    type="checkbox"
                    className="size-5 shrink-0 rounded border-input"
                    checked={sendEmailCopy}
                    onChange={(event) => setSendEmailCopy(event.target.checked)}
                  />
                  Email a copy to family contacts
                </label>
                <label htmlFor={fieldId("sms-copy")} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
                  <input
                    id={fieldId("sms-copy")}
                    type="checkbox"
                    className="size-5 shrink-0 rounded border-input"
                    checked={sendSmsCopy && canSendSmsCopy}
                    disabled={!canSendSmsCopy}
                    onChange={(event) => setSendSmsCopy(event.target.checked)}
                  />
                  Text a copy to SMS-preferred guardians ({smsRecipientCount})
                </label>
              </>
            ) : null}
            <label htmlFor={fieldId("in-app-copy")} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
              <input
                id={fieldId("in-app-copy")}
                type="checkbox"
                className="size-5 shrink-0 rounded border-input"
                checked={sendPushCopy}
                onChange={(event) => setSendPushCopy(event.target.checked)}
              />
              Queue in-app notifications for linked portal users
            </label>
            <Button size="lg" disabled={isPending || !canSubmit} aria-busy={isPending} onClick={submit}>
              <Send data-icon="inline-start" />
              {isPending ? "Sending" : targetMode === "broadcast" ? "Send broadcast" : "Send reply"}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No families are available for messaging yet.</p>
        )}
      </div>
    </CollapsibleCard>
  );
}
