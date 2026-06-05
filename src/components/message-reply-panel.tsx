"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Send } from "lucide-react";
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
  centerLabel: string | null;
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

export function MessageReplyPanel({
  familyOptions,
  templates,
  mergeFields,
  staffOptions,
}: {
  familyOptions: MessageFamilyOption[];
  templates: MessageTemplateOption[];
  mergeFields: MessageMergeFieldOption[];
  staffOptions: MessageStaffOption[];
}) {
  const router = useRouter();
  const templateOptions = templates.length ? templates : [];
  const [familyId, setFamilyId] = useState(familyOptions[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(templateOptions[0]?.id ?? "");
  const [priority, setPriority] = useState("normal");
  const [assignedToId, setAssignedToId] = useState("unassigned");
  const [subject, setSubject] = useState(templateOptions[0]?.subject ?? "Follow-up from the school");
  const [message, setMessage] = useState(templateOptions[0]?.body ?? "");
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

  function submit() {
    if (!familyId || !message.trim()) return;
    const shouldSendSmsCopy = sendSmsCopy && Boolean(selectedFamily?.smsRecipientCount);
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/communications/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          subject,
          message,
          priority,
          templateId,
          assignedToId: assignedToId === "unassigned" ? null : assignedToId,
          channel: "portal_reply",
          sendEmailCopy,
          sendSmsCopy: shouldSendSmsCopy,
          sendPushCopy,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; sms?: { attempted: number; sent: number; error?: string | null }; push?: { attempted: number } } | null;
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
      setStatusMessage(`Message sent to ${selectedFamily?.name ?? "the family"}.${smsDetail}${pushDetail}`);
      setMessage("");
      router.refresh();
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Reply to Family</CardTitle>
        <CardDescription>Office and classroom replies are stored on the family timeline.</CardDescription>
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
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.8fr)]">
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
                checked={sendSmsCopy}
                disabled={!selectedFamily?.smsRecipientCount}
                onChange={(event) => setSendSmsCopy(event.target.checked)}
              />
              Text a copy to SMS-preferred guardians ({selectedFamily?.smsRecipientCount ?? 0})
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
            <Button disabled={isPending || !familyId || !message.trim()} onClick={submit}>
              <Send data-icon="inline-start" />
              Send Reply
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No family records are available in this message scope yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
