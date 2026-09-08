"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  ChargeCreditSummaryPrintButton,
  CustomerStatementPrintButton,
  LedgerPrintButton,
  type BillingReceiptSchool,
} from "@/components/billing-print-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSchoolTimeZoneResolver } from "@/components/school-time-zone-context";
import { filterFamilyLedgerEntries, filterLedgerEntriesByDateRange, standardCustomerStatementEntries } from "@/lib/family-ledger";
import { formatZonedDateTime, zonedDateKey } from "@/lib/zoned-date-time";

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
  centerId: string | null;
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
  accounts,
  families,
  schools,
  initialFamilyId = "",
  readOnly = false,
}: {
  entries: FamilyLedgerEntry[];
  accounts: Array<{
    familyId: string;
    familyName: string;
    billingEmail: string | null;
    centerId: string | null;
    balanceCents: number;
  }>;
  families: FamilyOption[];
  schools: BillingReceiptSchool[];
  initialFamilyId?: string;
  readOnly?: boolean;
}) {
  const resolveSchoolTimeZone = useSchoolTimeZoneResolver();
  const validInitialFamilyId = families.some((family) => family.id === initialFamilyId)
    ? initialFamilyId
    : "";
  const [familyId, setFamilyId] = useState(validInitialFamilyId);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const selectedFamily = families.find((family) => family.id === familyId) ?? null;
  const selectedAccount = accounts.find((account) => account.familyId === familyId) ?? null;
  const visibleEntries = useMemo(
    () => filterFamilyLedgerEntries(entries, familyId),
    [entries, familyId],
  );
  const selectedCenterId = selectedAccount?.centerId
    ?? visibleEntries[0]?.billingAccount.family.centerId
    ?? selectedFamily?.centerId
    ?? null;
  const timeZone = resolveSchoolTimeZone(selectedCenterId);
  const rangedEntries = useMemo(
    () => filterLedgerEntriesByDateRange(visibleEntries, startDate, endDate, (value) => zonedDateKey(value, timeZone)),
    [visibleEntries, startDate, endDate, timeZone],
  );
  const printableEntries = useMemo(
    () => rangedEntries.map((entry) => ({
      ...entry,
      effectiveAt: new Date(entry.effectiveAt).toISOString(),
    })),
    [rangedEntries],
  );
  const currentBalanceCents = selectedAccount?.balanceCents ?? null;
  const customerStatementEntries = useMemo(
    () => filterLedgerEntriesByDateRange(
      standardCustomerStatementEntries(visibleEntries),
      startDate,
      endDate,
      (value) => zonedDateKey(value, timeZone),
    ).map((entry) => ({
      ...entry,
      effectiveAt: new Date(entry.effectiveAt).toISOString(),
    })),
    [visibleEntries, startDate, endDate, timeZone],
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
        <div className="flex w-full flex-col gap-3 lg:w-auto">
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="family-ledger-start-date">From</Label>
              <Input id="family-ledger-start-date" type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="family-ledger-end-date">Through</Label>
              <Input id="family-ledger-end-date" type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <CustomerStatementPrintButton
              entries={customerStatementEntries}
              schools={schools}
              familyName={selectedAccount?.familyName ?? selectedFamily?.name ?? null}
              centerId={selectedCenterId}
              currentBalanceCents={currentBalanceCents}
            />
            <ChargeCreditSummaryPrintButton entries={printableEntries} schools={schools} />
            <LedgerPrintButton entries={printableEntries} schools={schools} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {selectedFamily ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <div>
              <div className="font-medium">{selectedFamily.name}</div>
              <div className="text-xs text-muted-foreground">
                {rangedEntries.length} ledger entr{rangedEntries.length === 1 ? "y" : "ies"} in the selected date range
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
            {rangedEntries.map((entry) => (
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
            {familyId && !rangedEntries.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No ledger entries match this family and date range.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
