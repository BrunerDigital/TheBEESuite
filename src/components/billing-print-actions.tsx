"use client";

import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Printer } from "lucide-react";
import { formatPrintDateTime, PrintableReport, ReportPrintStyles, usePrintableReport } from "@/components/printable-report";
import { Button } from "@/components/ui/button";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedDateTime } from "@/lib/zoned-date-time";
import { formatInvoiceDueDate } from "@/lib/invoice-due-date";

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

function BillingPrintPreview({ buttonLabel, title, disabled, children, historyNotice = true }: { buttonLabel: string; title: string; disabled: boolean; historyNotice?: boolean; children: (generatedAt: Date) => ReactNode }) {
  const { active, generatedAt, print, error, cancelPrint } = usePrintableReport();
  const [open, setOpen] = useState(false);
  const [printRequested, setPrintRequested] = useState(false);
  const report = <>{children(generatedAt ?? new Date())}{historyNotice ? <p className="mt-4 text-sm">Loaded activity for the selected date range. Confirm full-year coverage before using this report as an annual statement.</p> : null}</>;
  function close() { setOpen(false); cancelPrint(); }
  return <>
    <ReportPrintStyles />
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => { setOpen(true); setPrintRequested(false); }}><Printer data-icon="inline-start" />{buttonLabel}</Button>
    <Dialog open={open} onOpenChange={value => { if (value) setOpen(true); else close(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{title} preview</DialogTitle><DialogDescription>Review the family and school before printing or saving a PDF.</DialogDescription></DialogHeader>
        <div className="billing-statement-preview overflow-x-auto rounded-lg border bg-background p-4 [&_table]:min-w-[30rem]">{report}</div>
        {printRequested ? <p role="status">Print requested. If no dialog appears, use your browser&apos;s Print command or try another browser.</p> : null}
        {error ? <p role="alert" className="text-destructive">{error}</p> : null}
        <DialogFooter><Button type="button" variant="outline" onClick={close}>Close preview</Button><Button type="button" onClick={() => { setPrintRequested(true); print(); }}>Print / Save PDF</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <PrintableReport active={active} label={`Printable ${title}`}>{report}</PrintableReport>
  </>;
}

export function LedgerPrintButton({ entries, schools, startDate = "", endDate = "" }: { entries: BillingLedgerPrintEntry[]; schools: BillingReceiptSchool[]; startDate?: string; endDate?: string }) {
  const timeZone = useSchoolTimeZone(entries[0]?.billingAccount.family.centerId);
  const familyName = entries[0]?.billingAccount.family.name.trim();
  const reportTitle = familyName ? `${familyName} Ledger Report` : "Family Ledger Report";
  const totalCharges = entries.filter((entry) => entry.amountCents > 0).reduce((sum, entry) => sum + entry.amountCents, 0);
  const totalCredits = entries.filter((entry) => entry.amountCents < 0).reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0);
  const singleSchool = schoolForCenterId(schools, entries[0]?.billingAccount.family.centerId);

  return (
    <BillingPrintPreview title={reportTitle} buttonLabel="Preview ledger" disabled={!entries.length}>
      {generatedAt => <>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>{reportTitle}</h1>
          <div>Reporting period: {startDate || "Earliest loaded activity"} through {endDate || "Latest loaded activity"}</div>
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
      </>}
    </BillingPrintPreview>
  );
}

export function CustomerStatementPrintButton({
  entries, schools, familyName, centerId, currentBalanceCents, startDate = "", endDate = "", familyReference, disabled = false,
}: {
  entries: BillingLedgerPrintEntry[];
  schools: BillingReceiptSchool[];
  familyName: string | null;
  centerId: string | null;
  currentBalanceCents: number | null;
  startDate?: string;
  endDate?: string;
  familyReference?: string;
  disabled?: boolean;
}) {
  const timeZone = useSchoolTimeZone(centerId);
  const { active, generatedAt, print, error, cancelPrint } = usePrintableReport();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [printRequested, setPrintRequested] = useState(false);
  const school = schoolForCenterId(schools, centerId);
  const period = `${startDate || "Earliest loaded activity"} through ${endDate || "Latest loaded activity"}`;
  const document = <>
    <header className="mb-5 space-y-1">
      <h2 className="text-xl font-semibold">Customer statement</h2>
      <div>Family: {familyName || "Not selected"}</div>
      {familyReference ? <div className="break-all text-xs">Account: {familyReference}</div> : null}
      <div>School: {schoolLabel(school)}</div>
      <div>School EIN: {schoolEinLabel(school)}</div>
      <div>Reporting period: {period}</div>
      <div>Generated: {formatPrintDateTime(generatedAt ?? new Date(), timeZone)}</div>
      <div>Current posted balance: {currentBalanceCents === null ? "Not available" : money(currentBalanceCents)}</div>
      <p className="text-sm">Current balance reflects today&apos;s posted account, including any agency responsibility. It is not the closing balance for this reporting period or a verified collectible amount.</p>
      <p className="text-sm">Loaded activity only. Confirm full-year history before using this report as an annual statement.</p>
    </header>
    <table className="w-full text-sm">
      <thead><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Description</th><th className="p-2 text-right">Charge</th><th className="p-2 text-right">Payment / credit</th></tr></thead>
      <tbody>{entries.map(entry => <tr key={entry.id} className="border-t">
        <td className="p-2 align-top">{formatDate(entry.effectiveAt, timeZone)}</td><td className="break-words p-2 align-top">{entry.description}</td>
        <td className="p-2 text-right align-top">{entry.amountCents > 0 ? money(entry.amountCents) : ""}</td>
        <td className="p-2 text-right align-top">{entry.amountCents < 0 ? money(Math.abs(entry.amountCents)) : ""}</td>
      </tr>)}</tbody>
    </table>
    {!entries.length ? <p className="mt-3">No charge or payment activity in the selected date range.</p> : null}
  </>;

  return <>
    <ReportPrintStyles />
    <Button type="button" variant="outline" size="sm" onClick={() => { setPreviewOpen(true); setPrintRequested(false); }} disabled={disabled || !familyName}>
      <Printer data-icon="inline-start" />Preview customer statement
    </Button>
    <Dialog open={previewOpen} onOpenChange={open => { setPreviewOpen(open); if (!open) cancelPrint(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Statement preview</DialogTitle><DialogDescription>Review the family, school and reporting period before printing or saving a PDF.</DialogDescription></DialogHeader>
        <div className="billing-statement-preview overflow-x-auto rounded-lg border bg-background p-4" aria-label="Customer statement preview">{document}</div>
        {printRequested ? <p role="status" className="text-sm text-muted-foreground">Print requested. If no dialog appears, use your browser&apos;s Print command or try another browser. You can keep reviewing this preview.</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter><Button type="button" variant="outline" onClick={() => { setPreviewOpen(false); cancelPrint(); }}>Close preview</Button><Button type="button" onClick={() => { setPrintRequested(true); print(); }}><Printer data-icon="inline-start" />Print / Save PDF</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <PrintableReport active={active} label="Printable standard customer statement">{document}</PrintableReport>
  </>;
}

export function ChargeCreditSummaryPrintButton({ entries, schools, startDate = "", endDate = "" }: { entries: BillingLedgerPrintEntry[]; schools: BillingReceiptSchool[]; startDate?: string; endDate?: string }) {
  const timeZone = useSchoolTimeZone(entries[0]?.billingAccount.family.centerId);
  const familyName = entries[0]?.billingAccount.family.name.trim();
  const school = entries.length
    ? schoolForCenterId(schools, entries[0].billingAccount.family.centerId)
    : schools.length === 1 ? schools[0] : null;
  const totalCharges = entries.reduce((sum, entry) => sum + Math.max(entry.amountCents, 0), 0);
  const totalCredits = entries.reduce((sum, entry) => sum + Math.abs(Math.min(entry.amountCents, 0)), 0);
  const grouped = Array.from(entries.reduce((groups, entry) => {
    const label = displayLabel(entry.type);
    const current = groups.get(label) ?? { charges: 0, credits: 0 };
    if (entry.amountCents > 0) current.charges += entry.amountCents;
    if (entry.amountCents < 0) current.credits += Math.abs(entry.amountCents);
    groups.set(label, current);
    return groups;
  }, new Map<string, { charges: number; credits: number }>())).sort(([left], [right]) => left.localeCompare(right));

  return (
    <BillingPrintPreview title="Charge / credit summary" buttonLabel="Preview charge / credit summary" disabled={!entries.length}>
      {generatedAt => <>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Charge / Credit Summary</h1>
          <div>Family: {familyName || "Not selected"}</div>
          <div>School: {schoolLabel(school)}</div>
          <div>School EIN: {schoolEinLabel(school)}</div>
          <div>Reporting period: {startDate || "Earliest loaded activity"} through {endDate || "Latest loaded activity"}</div>
          <div>Generated: {formatPrintDateTime(generatedAt, timeZone)}</div>
        </header>
        <table>
          <thead><tr><th>Activity type</th><th>Charges</th><th>Payments / credits</th></tr></thead>
          <tbody>
            {grouped.map(([label, totals]) => <tr key={label}><td>{label}</td><td>{money(totals.charges)}</td><td>{money(totals.credits)}</td></tr>)}
            <tr><th>Total</th><th>{money(totalCharges)}</th><th>{money(totalCredits)}</th></tr>
            <tr><th>Net activity</th><th colSpan={2}>{money(totalCharges - totalCredits)}</th></tr>
          </tbody>
        </table>
      </>}
    </BillingPrintPreview>
  );
}

export function PaymentReceiptPrintButton({
  payment,
  schools,
  schoolTimeZone,
  buttonLabel = "Receipt",
  preview = false,
}: {
  payment: BillingPaymentReceipt;
  schools: BillingReceiptSchool[];
  schoolTimeZone?: string;
  buttonLabel?: string;
  preview?: boolean;
}) {
  const contextTimeZone = useSchoolTimeZone(payment.billingAccount.family.centerId);
  const timeZone = schoolTimeZone ?? contextTimeZone;
  const { active, generatedAt, print } = usePrintableReport();
  const school = schoolForCenterId(schools, payment.billingAccount.family.centerId);
  const paid = payment.status === "PAID";

  const receipt = (generatedAt: Date | null) => <>
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
  </>;

  if (preview) return <BillingPrintPreview title="Payment receipt" buttonLabel={buttonLabel} disabled={!paid} historyNotice={false}>{receipt}</BillingPrintPreview>;

  return (
    <>
      <ReportPrintStyles />
      <Button type="button" variant="outline" size="sm" onClick={print} disabled={!paid}>
        <Printer data-icon="inline-start" />
        {buttonLabel}
      </Button>
      <PrintableReport active={active} label="Printable customer payment receipt">
        {receipt(generatedAt)}
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
            <tr><th>Due date</th><td>{formatInvoiceDueDate(invoice.dueDate)}</td></tr>
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
