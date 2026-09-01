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
  principalAmountCents?: number | null;
  processingRecoveryCents?: number | null;
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

export type BillingInvoiceDocument = {
  number: string;
  status: string;
  dueDate: Date | string;
  totalCents: number;
  childName: string | null;
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
  items: Array<{ description: string; amountCents: number }>;
  documentTitle?: string;
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
  return school?.ein ?? "Not provided";
}

function displayLabel(value: string) {
  const normalized = value.replaceAll("_", " ").toLowerCase();
  return normalized ? `${normalized[0].toUpperCase()}${normalized.slice(1)}` : "";
}

function paymentTypeLabel(provider: string) {
  if (provider === "stripe") return "Online payment";
  if (provider === "stripe_terminal") return "In-person card payment";
  if (provider === "manual_cash") return "Cash payment";
  if (provider === "manual_check") return "Check payment";
  if (provider === "manual_payroll_deduction") return "Payroll deduction";
  return "Other payment";
}

export function LedgerPrintButton({ entries, schools }: { entries: BillingLedgerPrintEntry[]; schools: BillingReceiptSchool[] }) {
  const timeZone = useSchoolTimeZone();
  const { active, generatedAt, print } = usePrintableReport();
  const familyName = entries[0]?.billingAccount.family.name.trim();
  const reportTitle = familyName ? `${familyName} Ledger Report` : "Family Ledger Report";
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
      <PrintableReport active={active} label={`Printable ${reportTitle}`}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>{reportTitle}</h1>
          <div>Generated: {formatPrintDateTime(generatedAt, timeZone)}</div>
          <div>School: {singleSchool ? schoolLabel(singleSchool) : "Multiple schools"}</div>
          <div>School EIN: {singleSchool ? schoolEinLabel(singleSchool) : "See each row"}</div>
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
                  <td>{displayLabel(entry.type)}</td>
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

export function PaymentReceiptPrintButton({
  payment,
  schools,
  schoolTimeZone,
  buttonLabel = "Receipt",
}: {
  payment: BillingPaymentReceipt;
  schools: BillingReceiptSchool[];
  schoolTimeZone?: string;
  buttonLabel?: string;
}) {
  const contextTimeZone = useSchoolTimeZone(payment.billingAccount.family.centerId);
  const timeZone = schoolTimeZone ?? contextTimeZone;
  const { active, generatedAt, print } = usePrintableReport();
  const school = schoolForCenterId(schools, payment.billingAccount.family.centerId);
  const paid = payment.status === "PAID";

  return (
    <>
      <ReportPrintStyles />
      <Button type="button" variant="outline" size="sm" onClick={print} disabled={!paid}>
        <Printer data-icon="inline-start" />
        {buttonLabel}
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
            {payment.processingRecoveryCents && payment.processingRecoveryCents > 0 ? (
              <>
                <tr>
                  <th>Family account payment</th>
                  <td>{money(payment.principalAmountCents ?? payment.amountCents)}</td>
                </tr>
                <tr>
                  <th>Processing recovery</th>
                  <td>{money(payment.processingRecoveryCents)}</td>
                </tr>
              </>
            ) : null}
            <tr>
              <th>Status</th>
              <td>{displayLabel(payment.status)}</td>
            </tr>
            <tr>
              <th>Applied to</th>
              <td>{payment.paymentReferenceLabel}</td>
            </tr>
            <tr>
              <th>Invoice reference</th>
              <td>{payment.invoiceNumber ?? "Not linked"}</td>
            </tr>
            <tr>
              <th>Payment type</th>
              <td>{paymentTypeLabel(payment.provider)}</td>
            </tr>
            <tr>
              <th>Payment reference</th>
              <td>{payment.externalIdPlaceholder ?? payment.id}</td>
            </tr>
          </tbody>
        </table>
      </PrintableReport>
    </>
  );
}

export function InvoicePrintButton({
  invoice,
  familyName,
  schoolName,
  schoolEin,
  buttonLabel = "Invoice",
}: {
  invoice: BillingInvoiceDocument;
  familyName: string;
  schoolName: string | null;
  schoolEin: string | null;
  buttonLabel?: string;
}) {
  const timeZone = useSchoolTimeZone();
  const { active, generatedAt, print } = usePrintableReport();

  return (
    <>
      <ReportPrintStyles />
      <Button type="button" variant="outline" size="sm" onClick={print}>
        <Printer data-icon="inline-start" />
        {buttonLabel}
      </Button>
      <PrintableReport active={active} label={`Printable invoice ${invoice.number}`}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>{invoice.documentTitle ?? "Tuition Invoice"}</h1>
          <div>Invoice: {invoice.number}</div>
          <div>Generated: {formatPrintDateTime(generatedAt, timeZone)}</div>
          <div>School: {schoolName ?? "School not assigned"}</div>
          <div>School EIN: {schoolEin ?? "Not provided"}</div>
        </header>
        <table>
          <tbody>
            <tr><th>Family</th><td>{familyName}</td></tr>
            <tr><th>Child</th><td>{invoice.childName ?? "Family account charge"}</td></tr>
            <tr><th>Service period</th><td>{invoice.servicePeriodStart && invoice.servicePeriodEnd ? `${invoice.servicePeriodStart} – ${invoice.servicePeriodEnd}` : "Not specified"}</td></tr>
            <tr><th>Due date</th><td>{formatDate(invoice.dueDate, timeZone)}</td></tr>
            <tr><th>Status</th><td>{displayLabel(invoice.status)}</td></tr>
          </tbody>
        </table>
        <table style={{ marginTop: 20 }}>
          <thead><tr><th>Description</th><th>Amount</th></tr></thead>
          <tbody>
            {invoice.items.map((item, index) => <tr key={`${item.description}-${index}`}><td>{item.description}</td><td>{money(item.amountCents)}</td></tr>)}
            <tr><th>Total</th><th>{money(invoice.totalCents)}</th></tr>
          </tbody>
        </table>
      </PrintableReport>
    </>
  );
}
