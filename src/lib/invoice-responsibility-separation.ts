type ResponsibilitySeparation = {
  status: "separated";
  originalInvoiceTotalCents: number;
  familyResponsibilityCents: number;
  agencyResponsibilityCents: number;
  agencyName: string;
  authorizationNumber: string | null;
  coverageStart: string | null;
  coverageEnd: string | null;
  separatedAt: string;
  separatedByUserId: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cents(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function invoiceResponsibilitySeparation(customFields: unknown): ResponsibilitySeparation | null {
  const fields = record(record(customFields).responsibilitySeparation);
  const originalInvoiceTotalCents = cents(fields.originalInvoiceTotalCents);
  const familyResponsibilityCents = cents(fields.familyResponsibilityCents);
  const agencyResponsibilityCents = cents(fields.agencyResponsibilityCents);
  const agencyName = text(fields.agencyName);
  const separatedAt = text(fields.separatedAt);
  const separatedByUserId = text(fields.separatedByUserId);
  if (
    fields.status !== "separated"
    || originalInvoiceTotalCents === null
    || familyResponsibilityCents === null
    || agencyResponsibilityCents === null
    || agencyResponsibilityCents <= 0
    || familyResponsibilityCents + agencyResponsibilityCents !== originalInvoiceTotalCents
    || !agencyName
    || !separatedAt
    || !separatedByUserId
  ) return null;

  return {
    status: "separated",
    originalInvoiceTotalCents,
    familyResponsibilityCents,
    agencyResponsibilityCents,
    agencyName,
    authorizationNumber: text(fields.authorizationNumber) || null,
    coverageStart: text(fields.coverageStart) || null,
    coverageEnd: text(fields.coverageEnd) || null,
    separatedAt,
    separatedByUserId,
  };
}

export function responsibilitySeparationError(input: {
  invoiceTotalCents: number;
  accountBalanceCents: number;
  itemTotalCents: number;
  familyResponsibilityCents: number;
  agencyResponsibilityCents: number;
  agencyName: string;
}) {
  if (!Number.isInteger(input.invoiceTotalCents) || input.invoiceTotalCents <= 0) {
    return "Invoice total must be greater than zero.";
  }
  if (!Number.isInteger(input.familyResponsibilityCents) || input.familyResponsibilityCents < 0) {
    return "Family responsibility must be zero or greater.";
  }
  if (!Number.isInteger(input.agencyResponsibilityCents) || input.agencyResponsibilityCents <= 0) {
    return "Agency responsibility must be greater than zero.";
  }
  if (!input.agencyName.trim()) return "Agency payer is required.";
  if (input.familyResponsibilityCents + input.agencyResponsibilityCents !== input.invoiceTotalCents) {
    return "Family and agency responsibility must exactly equal the current invoice total.";
  }
  if (input.itemTotalCents !== input.invoiceTotalCents) {
    return "Invoice items do not match the invoice total. Review the invoice before separating responsibility.";
  }
  if (input.accountBalanceCents < input.agencyResponsibilityCents) {
    return "The account balance is lower than the agency portion. Review existing credits or payments before separating responsibility.";
  }
  return null;
}

export function responsibilitySeparatedBillingAmounts(input: {
  invoiceTotalCents: number;
  customFields: unknown;
}) {
  const separation = invoiceResponsibilitySeparation(input.customFields);
  if (!separation) return null;
  return {
    familyResponsibilityCents: separation.familyResponsibilityCents,
    agencyResponsibilityCents: separation.agencyResponsibilityCents,
    totalResponsibilityCents: separation.originalInvoiceTotalCents,
  };
}

export function allOpenInvoicesResponsibilitySeparated(invoices: Array<{
  status: string;
  totalCents: number;
  customFields: unknown;
}>) {
  const relevantInvoices = invoices.filter((invoice) => {
    if (productResponsibilityReviewExempt(record(invoice.customFields))) return false;
    if (invoice.status === "OPEN" && invoice.totalCents > 0) return true;
    const separation = invoiceResponsibilitySeparation(invoice.customFields);
    if (invoice.status === "PAID" && separation) return true;
    return invoice.status === "VOID" && separation?.familyResponsibilityCents === 0;
  });
  return relevantInvoices.length > 0
    && relevantInvoices.every((invoice) => (
      invoiceResponsibilityReviewExempt(invoice.customFields, invoice.totalCents)
      || invoiceResponsibilitySeparation(invoice.customFields) !== null
    ));
}

export function invoiceResponsibilityReviewExempt(customFields: unknown, currentInvoiceTotalCents?: number) {
  const fields = record(customFields);
  return productResponsibilityReviewExempt(fields)
    || confirmedNetFamilyTuitionInvoice(fields, currentInvoiceTotalCents);
}

function productResponsibilityReviewExempt(fields: Record<string, unknown>) {
  return text(fields.checkoutPurpose) === "product_purchase"
    || text(fields.receiptKind) === "product"
    || text(fields.chargeSource) === "product";
}

const FAMILY_ONLY_TUITION_MARKER = /\b(?:co-?pay|parent responsibility|family responsibility)\b/i;

function confirmedNetFamilyTuitionInvoice(fields: Record<string, unknown>, currentInvoiceTotalCents?: number) {
  if (text(fields.chargeSource) !== "tuitionPlan") return false;
  if (!Number.isInteger(currentInvoiceTotalCents) || (currentInvoiceTotalCents ?? -1) < 0) return false;
  const grossTuitionCents = cents(fields.grossTuitionCents);
  const netTuitionCents = cents(fields.netTuitionCents);
  const tuitionCreditsTotalCents = cents(fields.tuitionCreditsTotalCents);
  if (grossTuitionCents === null || netTuitionCents === null || tuitionCreditsTotalCents === null) return false;
  if (Math.max(0, grossTuitionCents - tuitionCreditsTotalCents) !== netTuitionCents) return false;
  if (netTuitionCents !== currentInvoiceTotalCents) return false;

  const hasAgencyCredit = Array.isArray(fields.tuitionCredits) && fields.tuitionCredits.some((value) => {
    const credit = record(value);
    return text(credit.category) === "agency_discount" && (cents(credit.amountCents) ?? 0) > 0;
  });

  return hasAgencyCredit
    || FAMILY_ONLY_TUITION_MARKER.test(text(fields.tuitionPlanName));
}
