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
}>, ...assignmentEvidence: unknown[]) {
  const relevantInvoices = invoices.filter((invoice) => {
    if (productResponsibilityReviewExempt(record(invoice.customFields))) return false;
    if (invoice.status === "OPEN" && invoice.totalCents > 0) return true;
    const separation = invoiceResponsibilitySeparation(invoice.customFields);
    if (invoice.status === "PAID" && separation) return true;
    return invoice.status === "VOID" && separation?.familyResponsibilityCents === 0;
  });
  return relevantInvoices.length > 0
    && relevantInvoices.every((invoice) => (
      invoiceResponsibilityReviewExempt(invoice.customFields, invoice.totalCents, ...assignmentEvidence)
      || invoiceResponsibilitySeparation(invoice.customFields) !== null
    ));
}

export function invoiceResponsibilityReviewExempt(customFields: unknown, currentInvoiceTotalCents?: number, ...assignmentEvidence: unknown[]) {
  const fields = record(customFields);
  return productResponsibilityReviewExempt(fields)
    || confirmedNetFamilyTuitionInvoice(fields, currentInvoiceTotalCents)
    || confirmedFamilyOnlyTuitionAssignment(fields, currentInvoiceTotalCents, assignmentEvidence);
}

function productResponsibilityReviewExempt(fields: Record<string, unknown>) {
  return text(fields.checkoutPurpose) === "product_purchase"
    || text(fields.receiptKind) === "product"
    || text(fields.chargeSource) === "product";
}

const FAMILY_ONLY_TUITION_MARKER = /\b(?:co-?pay|parent (?:responsibility|fee)|family responsibility)\b/i;
const NO_PARENT_FEE_MARKER = /\bno parent fee\b/i;

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

  const tuitionPlanName = text(fields.tuitionPlanName);
  return hasAgencyCredit
    || (
      FAMILY_ONLY_TUITION_MARKER.test(tuitionPlanName)
      && !NO_PARENT_FEE_MARKER.test(tuitionPlanName)
    );
}

function confirmedFamilyOnlyTuitionAssignment(fields: Record<string, unknown>, currentInvoiceTotalCents: number | undefined, evidence: unknown[]) {
  if (text(fields.chargeSource) !== "tuitionPlan") return false;
  if (!Number.isInteger(currentInvoiceTotalCents) || (currentInvoiceTotalCents ?? -1) < 0) return false;
  const invoiceChildIds = [
    text(fields.childId),
    ...(Array.isArray(fields.childIds) ? fields.childIds.map(text) : []),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  const invoicePlanId = text(fields.sourceId);
  const invoiceWeekCount = Number.isInteger(fields.invoiceWeekCount) && Number(fields.invoiceWeekCount) > 0
    ? Number(fields.invoiceWeekCount)
    : 1;
  if (!invoiceChildIds.length || !invoicePlanId) return false;

  const assignmentAmounts = (value: unknown): number[] => {
    if (Array.isArray(value)) return value.flatMap(assignmentAmounts);
    if (!value || typeof value !== "object") return [];
    const assignment = record(value);
    const billingEvidenceApplies = assignment.tuitionBillingEnabled === true
      || (
        assignment.tuitionBillingEnabled === false
        && text(assignment.tuitionBillingDisabledReason) === "enrollment_closed"
      );
    const ownAmount = (
      text(assignment.tuitionFundingType).toLowerCase() === "family"
      && billingEvidenceApplies
      && text(assignment.tuitionPlanId) === invoicePlanId
    ) ? cents(assignment.tuitionNetAmountCents) : null;
    return [
      ...(ownAmount === null ? [] : [ownAmount]),
      ...Object.values(assignment).flatMap(assignmentAmounts),
    ];
  };

  let possibleWeeklyTotals = new Set([0]);
  for (const childId of invoiceChildIds) {
    const matchingEvidence = evidence.find((value) => {
      const evidenceId = text(record(value).id);
      const childMatches = invoiceChildIds.length > 1 ? evidenceId === childId : (!evidenceId || evidenceId === childId);
      return childMatches && assignmentAmounts(value).length > 0;
    });
    if (!matchingEvidence) return false;
    const amounts = new Set(assignmentAmounts(matchingEvidence));
    possibleWeeklyTotals = new Set(
      [...possibleWeeklyTotals].flatMap((total) => [...amounts].map((amount) => total + amount)),
    );
  }
  return [...possibleWeeklyTotals].some((total) => total * invoiceWeekCount === currentInvoiceTotalCents);
}
