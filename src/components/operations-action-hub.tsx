"use client";

import { useId, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const entityOptions = [
  ["family", "Family"],
  ["guardian", "Guardian"],
  ["child", "Child"],
  ["authorizedPickup", "Authorized pickup"],
  ["emergencyContact", "Emergency contact"],
  ["allergy", "Child allergy"],
  ["medicalNote", "Child medical note"],
  ["classroom", "Classroom"],
  ["staff", "Teacher profile"],
  ["staffSchedule", "Teacher schedule"],
  ["announcement", "Announcement"],
  ["campaign", "Campaign"],
  ["automation", "Automation"],
  ["form", "Form"],
  ["document", "Document"],
  ["formSubmission", "Form submission"],
  ["certification", "Certification"],
  ["invoice", "Invoice"],
  ["ledgerEntry", "Ledger adjustment"],
  ["product", "Product/Fee"],
  ["tuitionPlan", "Tuition plan"],
  ["review", "Review/Testimonial"],
] as const;

type Props = {
  title?: string;
  defaultEntity?: string;
  compact?: boolean;
  centers?: Array<{ id: string; name: string }>;
};

const centerScopedEntities = new Set(["family", "classroom", "staff", "announcement"]);

export function OperationsActionHub({ title = "Create / Edit Record", defaultEntity = "announcement", compact = false, centers = [] }: Props) {
  const formId = useId();
  const [entity, setEntity] = useState(defaultEntity);
  const [id, setId] = useState("");
  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
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
      const scopedCenterId = centerScopedEntities.has(entity) ? centerId || relatedId : undefined;
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity,
          id: id || undefined,
          name,
          body,
          familyId: entity === "document" || entity === "formSubmission" ? relatedId : undefined,
          relatedId,
          childId: ["allergy", "medicalNote"].includes(entity) ? relatedId : undefined,
          centerId: scopedCenterId,
          ageGroup: ["child", "classroom", "tuitionPlan"].includes(entity) ? type : undefined,
          billingEmail: entity === "family" ? type : undefined,
          email: ["guardian", "staff"].includes(entity) ? type : undefined,
          role: entity === "staff" ? status : undefined,
          title: entity === "staff" ? body : name,
          relation: ["guardian", "authorizedPickup", "emergencyContact"].includes(entity) ? status : undefined,
          verificationNotes: entity === "authorizedPickup" ? body : undefined,
          actionPlan: entity === "allergy" ? body : undefined,
          category: entity === "medicalNote" ? type : undefined,
          note: entity === "medicalNote" ? body : undefined,
          enrollmentStatus: entity === "child" ? status : undefined,
          capacity: entity === "classroom" ? amountDollars : undefined,
          ratioRule: entity === "classroom" ? status : undefined,
          dueDate: entity === "invoice" ? expiresAt : undefined,
          description: entity === "invoice" || entity === "ledgerEntry" ? body : undefined,
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
    <Card>
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
        <CardDescription>
          Enter an existing record reference to update it, or leave the reference blank to create a new record.
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
            <Label htmlFor={`${formId}-module`}>Module</Label>
            <Select value={entity} onValueChange={(value) => value && setEntity(value)}>
              <SelectTrigger id={`${formId}-module`} className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {entityOptions.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {centers.length > 0 && centerScopedEntities.has(entity) ? (
            <div className="space-y-1">
              <Label htmlFor={`${formId}-school`}>School</Label>
              <Select value={centerId} onValueChange={(value) => value && setCenterId(value)}>
                <SelectTrigger id={`${formId}-school`} className="h-11"><SelectValue placeholder="Choose school" /></SelectTrigger>
                <SelectContent>
                  {centers.map((center) => (
                    <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor={`${formId}-record-reference`}>Existing record reference</Label>
            <Input id={`${formId}-record-reference`} className="h-11" value={id} onChange={(event) => setId(event.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${formId}-name`}>Name or title</Label>
            <Input id={`${formId}-name`} className="h-11" value={name} onChange={(event) => setName(event.target.value)} placeholder="Record name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${formId}-related-reference`}>Related record reference</Label>
            <Input id={`${formId}-related-reference`} className="h-11" value={relatedId} onChange={(event) => setRelatedId(event.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${formId}-type`}>Type or trigger</Label>
            <Input id={`${formId}-type`} className="h-11" value={type} onChange={(event) => setType(event.target.value)} placeholder="email, policy, CPR, etc." />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${formId}-status`}>Status</Label>
            <Input id={`${formId}-status`} className="h-11" value={status} onChange={(event) => setStatus(event.target.value)} placeholder="active, draft, requested" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${formId}-amount`}>Amount or rating</Label>
            <Input id={`${formId}-amount`} className="h-11" value={amountDollars} onChange={(event) => setAmountDollars(event.target.value)} placeholder="199 or 5" inputMode="decimal" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${formId}-date`}>Expiration or send date</Label>
            <Input id={`${formId}-date`} className="h-11" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} type="date" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${formId}-details`}>Notes or details</Label>
          <Textarea id={`${formId}-details`} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Record body, notes, form fields, automation action, or response draft" />
        </div>
        <Button size="lg" disabled={isPending || !entity} aria-busy={isPending} onClick={submit}>
          <Save data-icon="inline-start" />
          {isPending ? "Saving record" : "Save record"}
        </Button>
      </CardContent>
    </Card>
  );
}
