"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FamilyOption = { id: string; name: string; billingEmail?: string | null };

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
  const sortedFamilies = useMemo(
    () => families.toSorted((left, right) => left.name.localeCompare(right.name)),
    [families],
  );

  return (
    <div className="min-w-0 space-y-2">
      <Select disabled={disabled || !families.length} value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id}><SelectValue placeholder="Choose family" /></SelectTrigger>
        <SelectContent className="max-h-[min(18rem,var(--available-height))]">
          {sortedFamilies.map((family) => (
            <SelectItem key={family.id} value={family.id}>
              {family.name}{family.billingEmail ? ` · ${family.billingEmail}` : ""}
            </SelectItem>
          ))}
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
            {sortedFamilies.map((family) => (
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
                  {family.billingEmail ? <span className="block break-all text-xs text-muted-foreground">{family.billingEmail}</span> : null}
                </span>
                {value === family.id ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {!families.length ? <p className="text-sm text-muted-foreground">No families in this account group.</p> : null}
    </div>
  );
}
