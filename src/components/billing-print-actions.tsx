"use client";

import { Printer } from "lucide-react";
import { formatPrintDateTime, PrintableReport, ReportPrintStyles, usePrintableReport } from "@/components/printable-report";
import { Button } from "@/components/ui/button";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedDateTime } from "@/lib/zoned-date-time";

export type BillingReceiptSchool = {
  id: string;
  name: string;
  ein: string | null;
};

export type BillingLedgerPrintEntry = {
  id: string;
  type: string;
  description: string;
  amountCents: number;
  balanceAfterCents: number | null;
  effectiveAt: Date | string;
  billingAccount: {
    family: {
      name: string;
      billingEmail: string | null;
      centerId: string | null;
    };
  };
};

export type BillingPaymentReceipt = {
  id: string;
  amountCents: number;
  status: string;
  provider: string;
  externalIdPlaceholder: string | null;
  paidAt: Date | string | null;
  invoiceNumber: string | null;
  paymentReferenceLabel: string;
  billingAccount: {
    family: {
      name: string;
      billingEmail: string | null;
      centerId: string | null;
    };
  };
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(value: Date | string | null | undefined, timeZone: string) {
  return formatZonedDateTime(value, timeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function schoolForCenterId(schools: BillingReceiptSchool[], centerId: string | null | undefined) {
  return schools.find((school) => school.id === centerId) ?? null;
}

function schoolLabel(school: BillingReceiptSchool | null) {
  return school?.name ?? "School not assigned";
}

function schoolEinLabel(school: BillingReceiptSchool | null) {
  return school?.ein ?? "EIN not saved";
}

export function LedgerPrintButton({ entries, schools }: { entries: BillingLedgerPrintEntry[]; schools: BillingReceiptSchool[] }) {
  const timeZone = useSchoolTimeZone();
  const { active, generatedAt, print } = usePrintableReport();
  const totalCharges = entries.filter((entry) => entry.amountCents > 0).reduce((sum, entry) => sum + entry.amountCents, 0);
  const totalCredits = entries.filter((entry) => entry.amountCents < 0).reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0);
  const singleSchool = schools.length === 1 ? schools[0] : null;

  return (
    <>
      <ReportPrintStyles />
      <Button type="button" variant="outline" size="sm" onClick={print} disabled={!entries.length}>
        <Printer data-icon="inline-start" />
        Print ledger
      </Button>
      <PrintableReport active={active} label="Printable customer ledger report">
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Customer Ledger Report</h1>
          <div>Generated: {formatPrintDateTime(generatedAt, timeZone)}</div>
          <div>School: {singleSchool ? schoolLabel(singleSchool) : "Multiple schools"}</div>
          <div>School EIN: {singleSchool ? schoolEinLabel(singleSchool) : "Shown by ledger row"}</div>
          <div>Total charges: {money(totalCharges)}</div>
          <div>Total credits/payments: {money(totalCredits)}</div>
        </header>
        <table>
          <thead>
            <tr>
              {!singleSchool ? <th>School</th> : null}
              {!singleSchool ? <th>EIN</th> : null}
              <th>Date</th>
              <th>Family</th>
              <th>Type</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const school = schoolForCenterId(schools, entry.billingAccount.family.centerId);
              return (
                <tr key={entry.id}>
                  {!singleSchool ? <td>{schoolLabel(school)}</td> : null}
                  {!singleSchool ? <td>{schoolEinLabel(school)}</td> : null}
                  <td>{formatDate(entry.effectiveAt, timeZone)}</td>
                  <td>
                    <div>{entry.billingAccount.family.name}</div>
                    <div>{entry.billingAccount.family.billingEmail ?? "No billing email"}</div>
                  </td>
                  <td>{entry.type}</td>
                  <td>{entry.description}</td>
                  <td>{money(entry.amountCents)}</td>
                  <td>{entry.balanceAfterCents === null ? "Not set" : money(entry.balanceAfterCents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </PrintableReport>
    </>
  );
}

export function PaymentReceiptPrintButton({ payment, schools }: { payment: BillingPaymentReceipt; schools: BillingReceiptSchool[] }) {
  const timeZone = useSchoolTimeZone();
  const { active, generatedAt, print } = usePrintableReport();
  const school = schoolForCenterId(schools, payment.billingAccount.family.centerId);
  const paid = payment.status === "PAID";

  return (
    <>
      <ReportPrintStyles />
      <Button type="button" variant="outline" size="sm" onClick={print} disabled={!paid}>
        <Printer data-icon="inline-start" />
        Receipt
      </Button>
      <PrintableReport active={active} label="Printable customer payment receipt">
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Customer Payment Receipt</h1>
          <div>Generated: {formatPrintDateTime(generatedAt, timeZone)}</div>
          <div>School: {schoolLabel(school)}</div>
          <div>School EIN: {schoolEinLabel(school)}</div>
        </header>
        <table>
          <tbody>
            <tr>
              <th>Family</th>
              <td>
                <div>{payment.billingAccount.family.name}</div>
                <div>{payment.billingAccount.family.billingEmail ?? "No billing email"}</div>
              </td>
            </tr>
            <tr>
              <th>Payment date</th>
              <td>{formatPrintDateTime(payment.paidAt, timeZone)}</td>
            </tr>
            <tr>
              <th>Amount paid</th>
              <td>{money(payment.amountCents)}</td>
            </tr>
            <tr>
              <th>Status</th>
              <td>{payment.status}</td>
            </tr>
            <tr>
              <th>Reference</th>
              <td>{payment.paymentReferenceLabel}</td>
            </tr>
            <tr>
              <th>Invoice</th>
              <td>{payment.invoiceNumber ?? "Not linked"}</td>
            </tr>
            <tr>
              <th>Provider</th>
              <td>{payment.provider}</td>
            </tr>
            <tr>
              <th>Payment ID</th>
              <td>{payment.externalIdPlaceholder ?? payment.id}</td>
            </tr>
          </tbody>
        </table>
      </PrintableReport>
    </>
  );
}
