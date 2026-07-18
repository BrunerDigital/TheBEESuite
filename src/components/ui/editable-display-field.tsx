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
  function cancel() { setDraft(value); setEditing(false); }
  function finish() { onChange(draft); setEditing(false); }
  if (editing) return (
    <div className={cn("space-y-2 rounded-xl border border-primary/35 bg-background/75 p-3 shadow-lg shadow-black/10", className)}>
      <div className="flex items-center justify-between gap-3"><Label htmlFor={id}>{label}</Label><div className="flex gap-1"><Button type="button" size="icon-sm" variant="ghost" aria-label={`Cancel editing ${label}`} onClick={cancel}><X /></Button><Button type="button" size="icon-sm" aria-label={`Finish editing ${label}`} onClick={finish}><Check /></Button></div></div>
      {multiline ? <Textarea id={id} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} className="min-h-32" autoFocus /> : <Input id={id} inputMode={inputMode} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} autoFocus onKeyDown={(event) => { if (event.key === "Enter") finish(); if (event.key === "Escape") cancel(); }} />}
    </div>
  );
  return (
    <button type="button" onClick={() => { setDraft(value); setEditing(true); }} className={cn("group relative w-full overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-background/80 to-background/35 p-4 text-left transition hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} aria-label={`Edit ${label}`}>
      <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span className={cn("mt-2 block whitespace-pre-wrap text-sm leading-6", value ? "font-medium text-foreground" : "italic text-muted-foreground")}>{value || emptyLabel}</span>
      <span className="absolute right-3 top-3 grid size-6 place-items-center rounded-full border border-primary/30 bg-primary/10 text-primary transition group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground"><span className="size-1.5 rounded-full bg-current group-hover:hidden" /><Pencil className="hidden size-3 group-hover:block" /></span>
    </button>
  );
}

export function DisplayValue({ label, value, detail, className }: { label: string; value: string; detail?: string; className?: string }) {
  return <div className={cn("rounded-xl border border-border/50 bg-gradient-to-br from-background/75 to-background/30 p-4", className)}><div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div><div className="mt-2 text-base font-semibold text-foreground">{value}</div>{detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}</div>;
}
