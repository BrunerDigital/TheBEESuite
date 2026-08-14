"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Play, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AutopayResult = {
  invoiceId: string;
  invoiceNumber: string;
  familyName: string;
  centerName: string | null;
  amountCents: number;
  status: "would_charge" | "paid" | "processing" | "failed" | "skipped";
  reason: string | null;
  paymentId: string | null;
  stripePaymentIntentId: string | null;
};

type AutopaySummary = {
  ok?: boolean;
  error?: string;
  dryRun?: boolean;
  scanned?: number;
  eligible?: number;
  wouldCharge?: number;
  paid?: number;
  processing?: number;
  failed?: number;
  skipped?: number;
  totalCents?: number;
  hasMore?: boolean;
  results?: AutopayResult[];
};

function money(cents: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents ?? 0) / 100);
}

function statusVariant(status: AutopayResult["status"]): "default" | "outline" | "destructive" | "secondary" {
  if (status === "paid" || status === "processing") return "default";
  if (status === "failed") return "destructive";
  if (status === "skipped") return "secondary";
  return "outline";
}

function statusLabel(status: AutopayResult["status"]) {
  if (status === "would_charge") return "Eligible";
  if (status === "paid") return "Paid";
  if (status === "processing") return "Processing";
  if (status === "failed") return "Failed";
  return "Skipped";
}

export function PaymentAutopayActions() {
  const [isPending, startTransition] = useTransition();
  const [summary, setSummary] = useState<AutopaySummary | null>(null);
  const [error, setError] = useState("");

  function runAutopay(dryRun: boolean) {
    if (!dryRun) {
      const eligible = summary?.results?.filter((result) => result.status === "would_charge") ?? [];
      if (!summary?.dryRun || !eligible.length) {
        setError("Review eligible family balances before processing autopay.");
        return;
      }
      const confirmed = window.confirm(`Process autopay for ${eligible.length} enabled ${eligible.length === 1 ? "family balance" : "family balances"} totaling ${money(summary.totalCents)}? Account credit is applied first; only the remaining reviewed amounts are submitted to the authorized payment methods.`);
      if (!confirmed) return;
    }

    startTransition(async () => {
      setError("");
      const response = await fetch("/api/billing/autopay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun,
          limit: 100,
          reviewedInvoices: dryRun
            ? undefined
            : summary?.results?.filter((result) => result.status === "would_charge").map((result) => ({
                invoiceId: result.invoiceId,
                amountCents: result.amountCents,
              })),
        }),
      });
      const json = await response.json().catch(() => null) as AutopaySummary | null;
      if (!response.ok || !json?.ok) {
        setError(json?.error || "Autopay could not be processed.");
        return;
      }
      setSummary(json);
    });
  }

  const visibleResults = summary?.results ?? [];
  const readyToProcess = Boolean(summary?.dryRun && summary.wouldCharge);

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle as="h2">Autopay invoices</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              Review eligible due invoices before processing them. Account credit is applied first; any remaining balance is charged to each family&apos;s authorized autopay payment method.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={isPending} onClick={() => runAutopay(true)} variant="outline">
              <Search data-icon="inline-start" />
              Review due invoices
            </Button>
            <Button disabled={isPending || !readyToProcess} onClick={() => runAutopay(false)}>
              <Play data-icon="inline-start" />
              Process all reviewed balances
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Autopay not completed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {summary ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>{summary.dryRun ? "Review complete" : "Autopay results"}</AlertTitle>
            <AlertDescription>
              Reviewed {summary.scanned ?? 0} invoices. {summary.dryRun ? summary.wouldCharge ?? 0 : (summary.paid ?? 0) + (summary.processing ?? 0)} {summary.dryRun ? "eligible" : "processed"} for {money(summary.totalCents)}. {summary.paid ?? 0} paid; {summary.processing ?? 0} processing; {summary.skipped ?? 0} skipped; {summary.failed ?? 0} failed.
            </AlertDescription>
          </Alert>
        ) : null}
        {summary?.hasMore ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Review is larger than one safe batch</AlertTitle>
            <AlertDescription>More than 100 due invoices were found. Process the reviewed batch, then review again for the remaining balances.</AlertDescription>
          </Alert>
        ) : null}
        {visibleResults.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Family</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleResults.map((result) => (
                <TableRow key={result.invoiceId}>
                  <TableCell className="font-medium">{result.familyName}</TableCell>
                  <TableCell>{result.invoiceNumber}</TableCell>
                  <TableCell>{result.centerName ?? "Not linked"}</TableCell>
                  <TableCell>{money(result.amountCents)}</TableCell>
                  <TableCell><Badge variant={statusVariant(result.status)}>{statusLabel(result.status)}</Badge></TableCell>
                  <TableCell className="max-w-sm text-xs text-muted-foreground">
                    {result.reason ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}
