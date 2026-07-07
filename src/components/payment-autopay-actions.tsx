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

export function PaymentAutopayActions() {
  const [isPending, startTransition] = useTransition();
  const [summary, setSummary] = useState<AutopaySummary | null>(null);
  const [error, setError] = useState("");

  function runAutopay(dryRun: boolean) {
    if (!dryRun) {
      const confirmed = window.confirm("Run live autopay for eligible due invoices with saved payment methods?");
      if (!confirmed) return;
    }

    startTransition(async () => {
      setError("");
      const response = await fetch("/api/billing/autopay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, limit: 50 }),
      });
      const json = await response.json().catch(() => null) as AutopaySummary | null;
      if (!response.ok || !json?.ok) {
        setError(json?.error || "Autopay could not be processed.");
        return;
      }
      setSummary(json);
    });
  }

  const visibleResults = summary?.results?.slice(0, 12) ?? [];

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Autopay Collection</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              Preview or submit due open invoices for families with enabled autopay and a saved payment method.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={isPending} onClick={() => runAutopay(true)} variant="outline">
              <Search data-icon="inline-start" />
              Preview Due
            </Button>
            <Button disabled={isPending} onClick={() => runAutopay(false)}>
              <Play data-icon="inline-start" />
              Run Autopay
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {summary ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>{summary.dryRun ? "Autopay preview ready" : "Autopay submitted"}</AlertTitle>
            <AlertDescription>
              Scanned {summary.scanned ?? 0} invoice(s). {summary.dryRun ? summary.wouldCharge ?? 0 : (summary.paid ?? 0) + (summary.processing ?? 0)} eligible for {money(summary.totalCents)}. {summary.paid ?? 0} paid. {summary.processing ?? 0} processing. {summary.skipped ?? 0} skipped. {summary.failed ?? 0} failed.
            </AlertDescription>
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
                  <TableCell><Badge variant={statusVariant(result.status)}>{result.status.replaceAll("_", " ")}</Badge></TableCell>
                  <TableCell className="max-w-sm text-xs text-muted-foreground">
                    {result.reason ?? result.stripePaymentIntentId ?? result.paymentId ?? ""}
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
