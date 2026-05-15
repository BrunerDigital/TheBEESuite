"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const entityOptions = [
  ["announcement", "Announcement"],
  ["campaign", "Campaign"],
  ["automation", "Automation"],
  ["form", "Form"],
  ["document", "Document"],
  ["formSubmission", "Form submission"],
  ["certification", "Certification"],
  ["product", "Product/Fee"],
  ["tuitionPlan", "Tuition plan"],
  ["review", "Review/Testimonial"],
] as const;

type Props = {
  title?: string;
  defaultEntity?: string;
  compact?: boolean;
};

export function OperationsActionHub({ title = "Create / Edit Record", defaultEntity = "announcement", compact = false }: Props) {
  const [entity, setEntity] = useState(defaultEntity);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [relatedId, setRelatedId] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity,
          id: id || undefined,
          name,
          title: name,
          body,
          familyId: entity === "document" || entity === "formSubmission" ? relatedId : undefined,
          formId: entity === "formSubmission" ? relatedId : undefined,
          staffId: entity === "certification" ? relatedId : undefined,
          type,
          status,
          amountDollars,
          expiresAt,
          trigger: type || name,
          action: body || "create_task",
          fields: body,
          notes: body,
          rating: amountDollars || 5,
          responseDraft: body,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; mode?: string; entity?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Record could not be saved.");
        return;
      }
      setStatusMessage(`${json?.entity ?? entity} ${json?.mode ?? "saved"}.`);
      if (!id) {
        setName("");
        setBody("");
        setType("");
        setStatus("");
        setAmountDollars("");
        setExpiresAt("");
      }
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Use an existing record ID to edit, or leave it blank to create. This is the first-pass operating console for modules while dedicated editors are built out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {statusMessage ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Saved</AlertTitle>
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
        <div className={`grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
          <div className="space-y-1">
            <Label>Module</Label>
            <Select value={entity} onValueChange={(value) => value && setEntity(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {entityOptions.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Existing ID</Label>
            <Input value={id} onChange={(event) => setId(event.target.value)} placeholder="Optional edit ID" />
          </div>
          <div className="space-y-1">
            <Label>Name / Title</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Record name" />
          </div>
          <div className="space-y-1">
            <Label>Related ID</Label>
            <Input value={relatedId} onChange={(event) => setRelatedId(event.target.value)} placeholder="Family, form, or staff ID" />
          </div>
          <div className="space-y-1">
            <Label>Type / Trigger</Label>
            <Input value={type} onChange={(event) => setType(event.target.value)} placeholder="email, policy, CPR, etc." />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Input value={status} onChange={(event) => setStatus(event.target.value)} placeholder="active, draft, requested" />
          </div>
          <div className="space-y-1">
            <Label>Amount / Rating</Label>
            <Input value={amountDollars} onChange={(event) => setAmountDollars(event.target.value)} placeholder="199 or 5" inputMode="decimal" />
          </div>
          <div className="space-y-1">
            <Label>Expiration / Send Date</Label>
            <Input value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} type="date" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Body / Notes / Fields / Action</Label>
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Record body, notes, form fields, automation action, or response draft" />
        </div>
        <Button disabled={isPending || !entity} onClick={submit}>
          <Save data-icon="inline-start" />
          Save Record
        </Button>
      </CardContent>
    </Card>
  );
}
