"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LedgerPrintButton, type BillingReceiptSchool } from "@/components/billing-print-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { filterFamilyLedgerEntries } from "@/lib/family-ledger";
import { formatZonedDateTime } from "@/lib/zoned-date-time";

export type FamilyLedgerEntry = {
  id: string;
  type: string;
  description: string;
  amountCents: number;
  balanceAfterCents: number | null;
  effectiveAt: Date | string;
  invoiceId?: string | null;
  paymentId?: string | null;
  billingAccount: {
    family: {
      id: string;
      name: string;
      billingEmail: string | null;
      centerId: string | null;
    };
  };
};

type FamilyOption = {
  id: string;
  name: string;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function ledgerTypeLabel(value: string) {
  const normalized = value.replaceAll("_", " ").toLowerCase();
  return normalized ? `${normalized[0].toUpperCase()}${normalized.slice(1)}` : "";
}

export function FamilyLedgerCard({
  entries,
  families,
  schools,
  initialFamilyId = "",
  readOnly = false,
}: {
  entries: FamilyLedgerEntry[];
  families: FamilyOption[];
  schools: BillingReceiptSchool[];
  initialFamilyId?: string;
  readOnly?: boolean;
}) {
  const timeZone = useSchoolTimeZone();
  const validInitialFamilyId = families.some((family) => family.id === initialFamilyId)
    ? initialFamilyId
    : "";
  const [familyId, setFamilyId] = useState(validInitialFamilyId);
  const selectedFamily = families.find((family) => family.id === familyId) ?? null;
  const visibleEntries = useMemo(
    () => filterFamilyLedgerEntries(entries, familyId),
    [entries, familyId],
  );
  const printableEntries = useMemo(
    () => visibleEntries.map((entry) => ({
      ...entry,
      effectiveAt: new Date(entry.effectiveAt).toISOString(),
    })),
    [visibleEntries],
  );

  return (
    <Card id="family-ledger" className="glass-panel scroll-mt-24">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
        <CardTitle as="h2">Family Ledger</CardTitle>
          <CardDescription>
            Select one family to see only that family&apos;s tuition, credits, payments, and adjustments.
          </CardDescription>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:w-auto">
          <div className="grid min-w-0 flex-1 gap-1.5 sm:min-w-72">
            <Label htmlFor="family-ledger-family">Family</Label>
            <Select value={familyId} onValueChange={(value) => setFamilyId(value ?? "")}>
              <SelectTrigger id="family-ledger-family" className="w-full">
                <SelectValue placeholder="Choose a family" />
              </SelectTrigger>
              <SelectContent>
                {families.map((family) => (
                  <SelectItem key={family.id} value={family.id}>
                    {family.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <LedgerPrintButton entries={printableEntries} schools={schools} />
        </div>
      </CardHeader>
      <CardContent>
        {selectedFamily ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <div>
              <div className="font-medium">{selectedFamily.name}</div>
              <div className="text-xs text-muted-foreground">
                {visibleEntries.length} ledger entr{visibleEntries.length === 1 ? "y" : "ies"}
              </div>
            </div>
            {!readOnly ? (
              <Link
                href={`/family-detail?familyId=${encodeURIComponent(selectedFamily.id)}#family-editor`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ArrowRight data-icon="inline-start" />
                Family profile
              </Link>
            ) : null}
          </div>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleEntries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  {formatZonedDateTime(entry.effectiveAt, timeZone, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </TableCell>
                <TableCell><Badge variant="outline">{ledgerTypeLabel(entry.type)}</Badge></TableCell>
                <TableCell>{entry.description}</TableCell>
                <TableCell>{money(entry.amountCents)}</TableCell>
                <TableCell>{entry.balanceAfterCents === null ? "Not set" : money(entry.balanceAfterCents)}</TableCell>
              </TableRow>
            ))}
            {!familyId ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Choose a family above to view its ledger.
                </TableCell>
              </TableRow>
            ) : null}
            {familyId && !visibleEntries.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No ledger entries have been created for this family.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
