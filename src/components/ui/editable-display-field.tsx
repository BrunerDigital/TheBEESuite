"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  emptyLabel?: string;
  multiline?: boolean;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "tel" | "url";
  onChange: (value: string) => void;
  className?: string;
};

export function EditableDisplayField({ id, label, value, placeholder, emptyLabel = "Not provided", multiline = false, inputMode = "text", onChange, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [valueBeforeEditing, setValueBeforeEditing] = useState(value);
  function beginEditing() {
    setValueBeforeEditing(value);
    setDraft(value);
    setEditing(true);
  }
  function updateDraft(nextValue: string) {
    setDraft(nextValue);
    onChange(nextValue);
  }
  function cancel() {
    setDraft(valueBeforeEditing);
    onChange(valueBeforeEditing);
    setEditing(false);
  }
  function finish() { onChange(draft); setEditing(false); }
  if (editing) return (
    <div className={cn("space-y-2 rounded-lg border border-primary/35 bg-card p-3", className)}>
      <div className="flex items-center justify-between gap-3"><Label htmlFor={id}>{label}</Label><div className="flex gap-1"><Button type="button" size="icon-sm" variant="ghost" aria-label={`Cancel editing ${label}`} onClick={cancel}><X /></Button><Button type="button" size="icon-sm" aria-label={`Finish editing ${label}`} onClick={finish}><Check /></Button></div></div>
      {multiline ? <Textarea id={id} value={draft} onChange={(event) => updateDraft(event.target.value)} placeholder={placeholder} className="min-h-32" autoFocus /> : <Input id={id} inputMode={inputMode} value={draft} onChange={(event) => updateDraft(event.target.value)} placeholder={placeholder} autoFocus onKeyDown={(event) => { if (event.key === "Enter") finish(); if (event.key === "Escape") cancel(); }} />}
    </div>
  );
  return (
    <button type="button" onClick={beginEditing} className={cn("group relative w-full overflow-hidden rounded-lg border border-border bg-card p-4 text-left hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} aria-label={`Edit ${label}`}>
      <span className="block text-sm font-medium text-muted-foreground">{label}</span>
      <span className={cn("mt-2 block whitespace-pre-wrap text-sm leading-6", value ? "font-medium text-foreground" : "italic text-muted-foreground")}>{value || emptyLabel}</span>
      <span className="absolute right-3 top-3 grid size-7 place-items-center rounded-md border bg-background text-muted-foreground group-hover:text-primary" aria-hidden="true"><Pencil className="size-3.5" /></span>
    </button>
  );
}

export function DisplayValue({ label, value, detail, className }: { label: string; value: string; detail?: string; className?: string }) {
  return <div className={cn("rounded-lg border border-border bg-card p-4", className)}><div className="text-sm font-medium text-muted-foreground">{label}</div><div className="mt-2 text-base font-semibold text-foreground">{value}</div>{detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}</div>;
}
