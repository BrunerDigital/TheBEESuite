"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { billingFamilySecondaryLabel } from "@/lib/billing-workspace-context";

type FamilyOption = { id: string; name: string; billingEmail?: string | null; children?: Array<{ fullName: string }> };

/** The caller supplies the authorized school/account group and owns selection guards. */
export function BillingFamilyPicker({
  id,
  families,
  value,
  disabled = false,
  onValueChange,
}: {
  id: string;
  families: FamilyOption[];
  value: string;
  disabled?: boolean;
  onValueChange: (value: string | null) => void;
}) {
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const sortedFamilies = useMemo(
    () => families.toSorted((left, right) => left.name.localeCompare(right.name)),
    [families],
  );
  const matchingFamilies = sortedFamilies.filter(family => `${family.name} ${billingFamilySecondaryLabel(family)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selectedFamily = families.find(family => family.id === value);

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={`${id}-filter`} className="sr-only">Find a family in this category</Label>
      <Input id={`${id}-filter`} type="search" disabled={disabled} value={query} onChange={event => setQuery(event.target.value)} placeholder="Find family, child or email" />
      <Select disabled={disabled || !families.length} value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id}><SelectValue placeholder="Choose family">{selectedFamily ? `${selectedFamily.name} · ${billingFamilySecondaryLabel(selectedFamily)}` : undefined}</SelectValue></SelectTrigger>
        <SelectContent className="max-h-[min(18rem,var(--available-height))]">
          {matchingFamilies.map((family) => (
            <SelectItem key={family.id} value={family.id}>
              {family.name} · {billingFamilySecondaryLabel(family)}
            </SelectItem>
          ))}
          {!matchingFamilies.length ? <SelectItem value="__no-matches" disabled>No matching families. Clear your search.</SelectItem> : null}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between"
        disabled={disabled || !families.length}
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? "Hide family list" : "Browse family list"} ({families.length})
        {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
      </Button>
      <div id={listId} hidden={!expanded}>
        {expanded ? (
          <div role="group" aria-label="Browse billing families" className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border bg-background/60 p-1">
            {matchingFamilies.map((family) => (
              <button
                key={family.id}
                type="button"
                disabled={disabled}
                aria-pressed={value === family.id}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-pressed:bg-primary/10 disabled:opacity-50"
                onClick={() => onValueChange(family.id)}
              >
                <span className="min-w-0 break-words">
                  <span className="block font-medium">{family.name}</span>
                  <span className="block break-words text-xs text-muted-foreground">{billingFamilySecondaryLabel(family)}</span>
                </span>
                {value === family.id ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
              </button>
            ))}
            {!matchingFamilies.length ? <p className="p-3 text-sm text-muted-foreground">No matching families. Try a child&apos;s name, an email, or clear your search.</p> : null}
          </div>
        ) : null}
      </div>
      {!families.length ? <p className="text-sm text-muted-foreground">No families in this account group.</p> : null}
      {query ? <p role="status" className="text-xs text-muted-foreground">{matchingFamilies.length} matching of {families.length} families. The selected account stays unchanged until you choose another family.</p> : null}
    </div>
  );
}
