"use client";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Copy, Plus, Save, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type FormBuilderField = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  parentVisible: boolean;
  staffOnly: boolean;
  helpText: string;
  options: string;
};

type ExistingForm = {
  id: string;
  name: string;
  type: string;
  status: string;
  schema: unknown;
  _count?: { submissions: number };
};

type Props = {
  forms: ExistingForm[];
};

const fieldTypes = ["text", "textarea", "email", "phone", "date", "select", "checkbox", "signature", "file"] as const;

const templateFields: Record<string, Array<Omit<FormBuilderField, "id">>> = {
  enrollment: [
    { key: "child_full_name", label: "Child full name", type: "text", required: true, parentVisible: true, staffOnly: false, helpText: "", options: "" },
    { key: "date_of_birth", label: "Date of birth", type: "date", required: true, parentVisible: true, staffOnly: false, helpText: "", options: "" },
    { key: "guardian_email", label: "Guardian email", type: "email", required: true, parentVisible: true, staffOnly: false, helpText: "", options: "" },
    { key: "authorized_pickups", label: "Authorized pickups", type: "textarea", required: true, parentVisible: true, staffOnly: false, helpText: "One person per line.", options: "" },
    { key: "parent_signature", label: "Parent signature", type: "signature", required: true, parentVisible: true, staffOnly: false, helpText: "", options: "" },
  ],
  medical: [
    { key: "allergies", label: "Allergies", type: "textarea", required: false, parentVisible: true, staffOnly: false, helpText: "Include severity and action notes.", options: "" },
    { key: "medications", label: "Medications", type: "textarea", required: false, parentVisible: true, staffOnly: false, helpText: "", options: "" },
    { key: "physician_phone", label: "Physician phone", type: "phone", required: false, parentVisible: true, staffOnly: false, helpText: "", options: "" },
    { key: "director_review_note", label: "Director review note", type: "textarea", required: false, parentVisible: false, staffOnly: true, helpText: "", options: "" },
  ],
  staff: [
    { key: "staff_full_name", label: "Staff full name", type: "text", required: true, parentVisible: false, staffOnly: true, helpText: "", options: "" },
    { key: "position", label: "Position", type: "select", required: true, parentVisible: false, staffOnly: true, helpText: "", options: "Lead teacher, Assistant teacher, Floater, Director" },
    { key: "background_check_file", label: "Background check file", type: "file", required: true, parentVisible: false, staffOnly: true, helpText: "", options: "" },
    { key: "staff_signature", label: "Staff signature", type: "signature", required: true, parentVisible: false, staffOnly: true, helpText: "", options: "" },
  ],
};

function draftId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `field-${Date.now()}-${Math.random()}`;
}

function slugKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function fieldsFromSchema(schema: unknown): FormBuilderField[] {
  const source =
    schema && typeof schema === "object" && !Array.isArray(schema) && Array.isArray((schema as Record<string, unknown>).fields)
      ? (schema as { fields: unknown[] }).fields
      : [];

  return source
    .map((field) => {
      if (typeof field === "string") {
        return {
          id: draftId(),
          key: slugKey(field),
          label: field,
          type: "text",
          required: false,
          parentVisible: true,
          staffOnly: false,
          helpText: "",
          options: "",
        };
      }
      if (!field || typeof field !== "object") return null;
      const row = field as Record<string, unknown>;
      return {
        id: draftId(),
        key: typeof row.key === "string" ? row.key : slugKey(String(row.label ?? "")),
        label: typeof row.label === "string" ? row.label : "Untitled field",
        type: typeof row.type === "string" ? row.type : "text",
        required: Boolean(row.required),
        parentVisible: Boolean(row.parentVisible),
        staffOnly: Boolean(row.staffOnly),
        helpText: typeof row.helpText === "string" ? row.helpText : "",
        options: Array.isArray(row.options) ? row.options.join(", ") : typeof row.options === "string" ? row.options : "",
      };
    })
    .filter((field): field is FormBuilderField => Boolean(field));
}

function emptyField(): FormBuilderField {
  return {
    id: draftId(),
    key: "",
    label: "",
    type: "text",
    required: false,
    parentVisible: true,
    staffOnly: false,
    helpText: "",
    options: "",
  };
}

export function FormBuilderPanel({ forms }: Props) {
  const router = useRouter();
  const controlPrefix = useId();
  const controlIds = {
    existingForm: `${controlPrefix}-existing-form`,
    status: `${controlPrefix}-status`,
    submissions: `${controlPrefix}-submissions`,
    name: `${controlPrefix}-name`,
    type: `${controlPrefix}-type`,
  };
  const [selectedId, setSelectedId] = useState("new");
  const selectedForm = useMemo(() => forms.find((form) => form.id === selectedId) ?? null, [forms, selectedId]);
  const [formId, setFormId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("enrollment");
  const [status, setStatus] = useState("active");
  const [fields, setFields] = useState<FormBuilderField[]>([emptyField()]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const controlsLocked = isSaving || isPending;

  function loadForm(value: string | null) {
    if (savingRef.current) return;
    const id = value ?? "new";
    setSelectedId(id);
    setMessage("");
    setError("");
    if (id === "new") {
      setFormId("");
      setName("");
      setType("enrollment");
      setStatus("active");
      setFields([emptyField()]);
      return;
    }
    const form = forms.find((item) => item.id === id);
    if (!form) return;
    setFormId(form.id);
    setName(form.name);
    setType(form.type);
    setStatus(form.status);
    const loaded = fieldsFromSchema(form.schema);
    setFields(loaded.length ? loaded : [emptyField()]);
  }

  function applyTemplate(template: keyof typeof templateFields) {
    if (savingRef.current) return;
    setType(template === "staff" ? "staff_onboarding" : template);
    setFields(templateFields[template].map((field) => ({ ...field, id: draftId() })));
  }

  function updateField(id: string, patch: Partial<FormBuilderField>) {
    if (savingRef.current) return;
    setFields((current) =>
      current.map((field) => {
        if (field.id !== id) return field;
        const next = { ...field, ...patch };
        if (patch.label !== undefined && !field.key) {
          next.key = slugKey(patch.label);
        }
        return next;
      }),
    );
  }

  function save() {
    if (savingRef.current) return;
    const targetFormId = formId;
    const normalizedFields = fields
      .map((field) => ({
        key: field.key || slugKey(field.label),
        label: field.label.trim(),
        type: field.type,
        required: field.required,
        parentVisible: field.parentVisible,
        staffOnly: field.staffOnly,
        helpText: field.helpText.trim() || null,
        options: field.options.split(",").map((option) => option.trim()).filter(Boolean),
      }))
      .filter((field) => field.key && field.label);

    if (!name.trim()) {
      setError("Form name is required.");
      return;
    }
    if (!normalizedFields.length) {
      setError("Add at least one field before saving the form.");
      return;
    }

    // A save always operates on the draft that was visible when Save was pressed.
    // Locking all draft mutations until it settles prevents a delayed response from
    // retargeting the editor and mixing two forms' fields.
    savingRef.current = true;
    setIsSaving(true);
    setMessage("");
    setError("");
    const request = {
      entity: "form",
      id: targetFormId || undefined,
      name,
      type,
      status,
      fields: JSON.stringify(normalizedFields),
    };

    startTransition(async () => {
      try {
        const response = await fetch("/api/operations/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        const json = await response.json().catch(() => null) as { error?: string; record?: { id?: string }; mode?: string } | null;
        if (!response.ok) {
          setError(json?.error || "Form could not be saved.");
          return;
        }
        if (json?.record?.id) {
          setFormId(json.record.id);
          setSelectedId(json.record.id);
        }
        setMessage(`Form ${json?.mode ?? "saved"}.`);
        router.refresh();
      } catch {
        setError("Form could not be saved. Check your connection and try again.");
      } finally {
        savingRef.current = false;
        setIsSaving(false);
      }
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle as="h2">Form Builder</CardTitle>
            <CardDescription>Build enrollment, medical, permission, staff, and policy forms with field-level visibility and signature requirements.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => applyTemplate("enrollment")} disabled={controlsLocked}>
              <Copy data-icon="inline-start" />
              Enrollment
            </Button>
            <Button type="button" variant="outline" onClick={() => applyTemplate("medical")} disabled={controlsLocked}>Medical</Button>
            <Button type="button" variant="outline" onClick={() => applyTemplate("staff")} disabled={controlsLocked}>Staff</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5" aria-busy={controlsLocked}>
        {message ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor={controlIds.existingForm}>Load existing form</Label>
            <Select value={selectedId} onValueChange={loadForm} disabled={controlsLocked}>
              <SelectTrigger id={controlIds.existingForm}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New form</SelectItem>
                {forms.map((form) => (
                  <SelectItem key={form.id} value={form.id}>
                    {form.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={controlIds.status}>Status</Label>
            <Select value={status} onValueChange={(value) => value && !savingRef.current && setStatus(value)} disabled={controlsLocked}>
              <SelectTrigger id={controlIds.status}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={controlIds.submissions}>Submissions</Label>
            <output id={controlIds.submissions} className="flex min-h-10 items-center rounded-lg border bg-background px-3 text-sm">
              {selectedForm?._count?.submissions ?? 0}
            </output>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor={controlIds.name}>Form name</Label>
            <Input id={controlIds.name} value={name} onChange={(event) => !savingRef.current && setName(event.target.value)} placeholder="Enrollment packet" disabled={controlsLocked} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor={controlIds.type}>Form type</Label>
            <Input id={controlIds.type} value={type} onChange={(event) => !savingRef.current && setType(event.target.value)} placeholder="enrollment, medical, policy" disabled={controlsLocked} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-44">Label</TableHead>
                <TableHead className="min-w-36">Key</TableHead>
                <TableHead className="min-w-32">Type</TableHead>
                <TableHead className="min-w-44">Help / Options</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Staff only</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => {
                const fieldName = field.label.trim() || `Field ${index + 1}`;
                const fieldPrefix = `${controlPrefix}-field-${field.id}`;
                return (
                  <TableRow key={field.id}>
                    <TableCell>
                      <Label className="sr-only" htmlFor={`${fieldPrefix}-label`}>{fieldName} label</Label>
                      <Input id={`${fieldPrefix}-label`} value={field.label} onChange={(event) => updateField(field.id, { label: event.target.value })} placeholder="Field label" disabled={controlsLocked} />
                    </TableCell>
                    <TableCell>
                      <Label className="sr-only" htmlFor={`${fieldPrefix}-key`}>{fieldName} key</Label>
                      <Input id={`${fieldPrefix}-key`} value={field.key} onChange={(event) => updateField(field.id, { key: slugKey(event.target.value) })} placeholder="field_key" disabled={controlsLocked} />
                    </TableCell>
                    <TableCell>
                      <Label className="sr-only" htmlFor={`${fieldPrefix}-type`}>{fieldName} type</Label>
                      <Select value={field.type} onValueChange={(value) => value && updateField(field.id, { type: value })} disabled={controlsLocked}>
                        <SelectTrigger id={`${fieldPrefix}-type`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {fieldTypes.map((fieldType) => (
                            <SelectItem key={fieldType} value={fieldType}>{fieldType}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Label className="sr-only" htmlFor={`${fieldPrefix}-help`}>{field.type === "select" ? `${fieldName} options` : `${fieldName} help text`}</Label>
                      <Input
                        id={`${fieldPrefix}-help`}
                        value={field.type === "select" ? field.options : field.helpText}
                        onChange={(event) => updateField(field.id, field.type === "select" ? { options: event.target.value } : { helpText: event.target.value })}
                        placeholder={field.type === "select" ? "Comma-separated options" : "Optional help text"}
                        disabled={controlsLocked}
                      />
                    </TableCell>
                    <TableCell><Switch id={`${fieldPrefix}-required`} aria-label={`${fieldName}: required`} checked={field.required} onCheckedChange={(checked) => updateField(field.id, { required: checked })} disabled={controlsLocked} /></TableCell>
                    <TableCell><Switch id={`${fieldPrefix}-parent-visible`} aria-label={`${fieldName}: visible to parents`} checked={field.parentVisible} onCheckedChange={(checked) => updateField(field.id, { parentVisible: checked })} disabled={controlsLocked} /></TableCell>
                    <TableCell><Switch id={`${fieldPrefix}-staff-only`} aria-label={`${fieldName}: staff only`} checked={field.staffOnly} onCheckedChange={(checked) => updateField(field.id, { staffOnly: checked })} disabled={controlsLocked} /></TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => !savingRef.current && setFields((current) => current.filter((item) => item.id !== field.id))}
                        disabled={controlsLocked || fields.length === 1}
                        aria-label={`Remove ${fieldName}`}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{fields.filter((field) => field.required).length} required</Badge>
            <Badge variant="outline">{fields.filter((field) => field.type === "signature").length} signature fields</Badge>
            <Badge variant="outline">{fields.filter((field) => field.staffOnly).length} staff-only fields</Badge>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => !savingRef.current && setFields((current) => [...current, emptyField()])} disabled={controlsLocked}>
              <Plus data-icon="inline-start" />
              Add Field
            </Button>
            <Button type="button" onClick={save} disabled={controlsLocked} aria-busy={controlsLocked}>
              <Save data-icon="inline-start" />
              {controlsLocked ? "Saving..." : "Save Form"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
