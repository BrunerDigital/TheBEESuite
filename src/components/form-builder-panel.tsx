"use client";

import { useMemo, useState, useTransition } from "react";
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

  function loadForm(value: string | null) {
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
    setType(template === "staff" ? "staff_onboarding" : template);
    setFields(templateFields[template].map((field) => ({ ...field, id: draftId() })));
  }

  function updateField(id: string, patch: Partial<FormBuilderField>) {
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
    startTransition(async () => {
      setMessage("");
      setError("");
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

      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "form",
          id: formId || undefined,
          name,
          type,
          status,
          fields: JSON.stringify(normalizedFields),
        }),
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
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Form Builder</CardTitle>
            <CardDescription>Build enrollment, medical, permission, staff, and policy forms with field-level visibility and signature requirements.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => applyTemplate("enrollment")}>
              <Copy data-icon="inline-start" />
              Enrollment
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyTemplate("medical")}>Medical</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyTemplate("staff")}>Staff</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
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
            <Label>Load existing form</Label>
            <Select value={selectedId} onValueChange={loadForm}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Label>Status</Label>
            <Select value={status} onValueChange={(value) => value && setStatus(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Submissions</Label>
            <div className="flex h-8 items-center rounded-lg border bg-background px-2 text-sm">
              {selectedForm?._count?.submissions ?? 0}
            </div>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Form name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enrollment packet" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Form type</Label>
            <Input value={type} onChange={(event) => setType(event.target.value)} placeholder="enrollment, medical, policy" />
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
              {fields.map((field) => (
                <TableRow key={field.id}>
                  <TableCell>
                    <Input value={field.label} onChange={(event) => updateField(field.id, { label: event.target.value })} placeholder="Field label" />
                  </TableCell>
                  <TableCell>
                    <Input value={field.key} onChange={(event) => updateField(field.id, { key: slugKey(event.target.value) })} placeholder="field_key" />
                  </TableCell>
                  <TableCell>
                    <Select value={field.type} onValueChange={(value) => value && updateField(field.id, { type: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {fieldTypes.map((fieldType) => (
                          <SelectItem key={fieldType} value={fieldType}>{fieldType}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={field.type === "select" ? field.options : field.helpText}
                      onChange={(event) => updateField(field.id, field.type === "select" ? { options: event.target.value } : { helpText: event.target.value })}
                      placeholder={field.type === "select" ? "Comma-separated options" : "Optional help text"}
                    />
                  </TableCell>
                  <TableCell><Switch checked={field.required} onCheckedChange={(checked) => updateField(field.id, { required: checked })} /></TableCell>
                  <TableCell><Switch checked={field.parentVisible} onCheckedChange={(checked) => updateField(field.id, { parentVisible: checked })} /></TableCell>
                  <TableCell><Switch checked={field.staffOnly} onCheckedChange={(checked) => updateField(field.id, { staffOnly: checked })} /></TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))}
                      disabled={fields.length === 1}
                    >
                      <Trash2 />
                      <span className="sr-only">Remove field</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
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
            <Button type="button" variant="outline" onClick={() => setFields((current) => [...current, emptyField()])}>
              <Plus data-icon="inline-start" />
              Add Field
            </Button>
            <Button type="button" onClick={save} disabled={isPending}>
              <Save data-icon="inline-start" />
              {isPending ? "Saving..." : "Save Form"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
