"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Building2, CreditCard, ReceiptText, RadioTower, ShieldCheck, UserRoundSearch } from "lucide-react";
import type { BillingWorkbenchCenter, BillingWorkbenchFamily } from "@/components/billing-workbench";
import { StripeTerminalPayment } from "@/components/stripe-terminal-payment";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = {
  families: BillingWorkbenchFamily[];
  centers: BillingWorkbenchCenter[];
  initialFamilyId?: string;
  previewMode?: boolean;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function WorkflowStep({ number, title, detail, complete, active }: { number: number; title: string; detail: string; complete: boolean; active: boolean }) {
  return (
    <li className={cn("flex min-w-0 gap-3 rounded-2xl border p-3", active ? "border-primary/40 bg-primary/8" : "bg-background/55")}>
      <span className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl border text-sm font-bold tabular-nums",
        complete ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : active ? "border-primary/30 bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground",
      )}>
        {complete ? <BadgeCheck className="size-5" aria-hidden="true" /> : number}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}

export function DirectorPaymentTerminalWorkspace({ families, centers, initialFamilyId, previewMode = false }: Props) {
  const initialFamily = families.find((family) => family.id === initialFamilyId) ?? families[0] ?? null;
  const [familyId, setFamilyId] = useState(initialFamily?.id ?? "");
  const selectedFamily = families.find((family) => family.id === familyId) ?? null;
  const openInvoices = selectedFamily?.billingAccount?.openInvoices ?? [];
  const [paymentTarget, setPaymentTarget] = useState(openInvoices[0] ? `invoice:${openInvoices[0].id}` : "account");
  const [customAmount, setCustomAmount] = useState("");

  const selectedInvoiceId = paymentTarget.startsWith("invoice:") ? paymentTarget.slice("invoice:".length) : null;
  const selectedInvoice = openInvoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null;
  const customAmountCents = Math.max(Math.round(Number(customAmount || 0) * 100), 0);
  const amountCents = selectedInvoice?.totalCents ?? customAmountCents;
  const center = centers.find((item) => item.id === selectedFamily?.centerId) ?? null;
  const description = selectedInvoice
    ? `In-person payment for invoice ${selectedInvoice.number}`
    : `In-person account payment for ${selectedFamily?.name ?? "family"}`;
  const familyReady = Boolean(selectedFamily?.billingAccount && center);
  const amountReady = amountCents > 0;
  const terminalReady = familyReady && amountReady && center?.checkoutReadiness?.canAcceptParentPayments !== false;
  const selectedFamilyLabel = selectedFamily ? `${selectedFamily.name}${center ? ` · ${center.crmLocationId || center.name}` : ""}` : "Choose a current family";

  function changeFamily(nextFamilyId: string) {
    setFamilyId(nextFamilyId);
    const nextFamily = families.find((family) => family.id === nextFamilyId) ?? null;
    const firstInvoice = nextFamily?.billingAccount?.openInvoices?.[0] ?? null;
    setPaymentTarget(firstInvoice ? `invoice:${firstInvoice.id}` : "account");
    setCustomAmount("");
  }

  const reviewRows = [
    { label: "School", value: center?.crmLocationId || center?.name || "Not selected", icon: <Building2 className="size-4" /> },
    { label: "Family", value: selectedFamily?.name || "Not selected", icon: <UserRoundSearch className="size-4" /> },
    { label: "Apply To", value: selectedInvoice ? `Invoice ${selectedInvoice.number}` : "Family account", icon: <ReceiptText className="size-4" /> },
    { label: "Payment", value: amountReady ? money(amountCents) : "Enter amount", icon: <CreditCard className="size-4" /> },
  ];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[2rem] border border-primary/25 bg-gradient-to-br from-primary/16 via-card to-amber-500/12 p-5 shadow-2xl shadow-primary/8 sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-12 size-48 rotate-12 bg-primary/8 [clip-path:polygon(25%_6.7%,75%_6.7%,100%_50%,75%_93.3%,25%_93.3%,0%_50%)]" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge className="mb-4"><RadioTower data-icon="inline-start" />Front Desk Workspace</Badge>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">In-Person Payment Terminal</h1>
            <p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
              Choose the current family and exact balance, verify the reader total with the parent, then collect the card payment on certified Stripe hardware.
            </p>
          </div>
          <Link href="/billing-invoices" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft data-icon="inline-start" />
            Billing & Invoices
          </Link>
        </div>
      </section>

      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Payment workflow progress">
        <WorkflowStep number={1} title="Family" detail={selectedFamily ? selectedFamily.name : "Choose current family"} complete={familyReady} active={!familyReady} />
        <WorkflowStep number={2} title="Amount" detail={amountReady ? money(amountCents) : "Choose invoice or amount"} complete={amountReady} active={familyReady && !amountReady} />
        <WorkflowStep number={3} title="Reader" detail="Confirm online hardware" complete={false} active={terminalReady} />
        <WorkflowStep number={4} title="Receipt" detail="Recorded after approval" complete={false} active={false} />
      </ol>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(28rem,1.15fr)]">
        <div className="space-y-5">
          <Card className="glass-panel">
            <CardHeader>
              <h2 className="font-heading text-base font-medium leading-snug">1. Choose Family & Balance</h2>
              <CardDescription>Only currently enrolled families in your visible school scope appear here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="terminal-family">Current family</Label>
                <Select value={familyId} onValueChange={(value) => value && changeFamily(value)}>
                  <SelectTrigger id="terminal-family" aria-label="Current family"><SelectValue placeholder="Choose a current family…" /></SelectTrigger>
                  <SelectContent>
                    {families.map((family) => {
                      const familyCenter = centers.find((item) => item.id === family.centerId);
                      return <SelectItem key={family.id} value={family.id}>{family.name} · {familyCenter?.crmLocationId || familyCenter?.name || "School not set"}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>

              {selectedFamily?.billingAccount ? (
                <div className="space-y-2">
                  <Label htmlFor="terminal-payment-target">Apply payment to</Label>
                  <Select value={paymentTarget} onValueChange={(value) => value && setPaymentTarget(value)}>
                    <SelectTrigger id="terminal-payment-target" aria-label="Apply payment to"><SelectValue placeholder="Choose an invoice or account payment…" /></SelectTrigger>
                    <SelectContent>
                      {openInvoices.map((invoice) => (
                        <SelectItem key={invoice.id} value={`invoice:${invoice.id}`}>
                          Invoice {invoice.number} · {money(invoice.totalCents)}
                        </SelectItem>
                      ))}
                      <SelectItem value="account">Custom family account payment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {paymentTarget === "account" ? (
                <div className="space-y-2">
                  <Label htmlFor="terminal-custom-amount">Account payment amount</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted-foreground" aria-hidden="true">$</span>
                    <Input
                      id="terminal-custom-amount"
                      name="terminalCustomAmount"
                      type="number"
                      inputMode="decimal"
                      autoComplete="off"
                      min="0.01"
                      step="0.01"
                      value={customAmount}
                      onChange={(event) => setCustomAmount(event.target.value)}
                      placeholder="Example: 125.00…"
                      className="pl-7 tabular-nums"
                    />
                  </div>
                </div>
              ) : null}

              {!families.length ? (
                <Alert variant="destructive">
                  <AlertTitle>No Current Families Available</AlertTitle>
                  <AlertDescription>No currently enrolled family billing accounts are visible in this school scope.</AlertDescription>
                </Alert>
              ) : selectedFamily && !selectedFamily.billingAccount ? (
                <Alert variant="destructive">
                  <AlertTitle>Billing Account Required</AlertTitle>
                  <AlertDescription>Open the family record and complete billing setup before starting an in-person payment.</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <h2 className="font-heading text-base font-medium leading-snug">Payment Review</h2>
              <CardDescription>Confirm the protected context before sending anything to a reader.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {reviewRows.map((row) => (
                <div key={row.label} className="flex items-center gap-3 rounded-xl border bg-background/55 p-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">{row.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-muted-foreground">{row.label}</span>
                    <span className="block truncate font-semibold">{row.value}</span>
                  </span>
                </div>
              ))}
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>Card details stay on the certified reader and never enter BEE Suite forms.</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <StripeTerminalPayment
          key={`${selectedFamily?.id ?? "none"}-${selectedInvoice?.id ?? "account"}-${amountCents}`}
          presentation="embedded"
          centerId={center?.id ?? ""}
          billingAccountId={selectedFamily?.billingAccount?.id ?? ""}
          familyId={selectedFamily?.id ?? ""}
          invoiceId={selectedInvoice?.id ?? null}
          amountCents={amountCents}
          description={description}
          disabled={!terminalReady}
          contextLabel={selectedFamilyLabel}
          previewMode={previewMode}
        />
      </div>
    </div>
  );
}
