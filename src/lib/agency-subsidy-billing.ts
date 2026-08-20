export const SUBSIDY_CLAIM_STATUSES = [
  "draft", "ready", "submitted", "approved", "partially_paid", "paid", "denied", "void",
] as const;

export type AgencyRequirement = {
  key: string;
  label: string;
  type: string;
  required: boolean;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeStateCode(value: unknown) {
  const state = clean(value).toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : "";
}

export function normalizeAgencyRequirements(value: unknown): AgencyRequirement[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const label = clean(row.label);
    const type = clean(row.type) || "supporting_document";
    const key = (clean(row.key) || `${type}:${label}`).toLowerCase().replace(/[^a-z0-9:_-]+/g, "-");
    if (!key || !label || seen.has(key)) return [];
    seen.add(key);
    return [{ key, label, type, required: row.required !== false }];
  });
}

export function agencyProgramSetupBlockers(input: {
  providerNumber?: string | null;
  vendorNumber?: string | null;
  submissionMethod?: string | null;
  portalUrl?: string | null;
  paymentInstructions?: string | null;
}) {
  const blockers: string[] = [];
  const submissionMethod = clean(input.submissionMethod);
  if (!clean(input.providerNumber) && !clean(input.vendorNumber)) blockers.push("Add the school-specific provider or vendor number.");
  if (!submissionMethod) blockers.push("Choose the agency submission method.");
  if (submissionMethod === "agency_portal" && !clean(input.portalUrl)) blockers.push("Add the official agency portal URL.");
  if (!clean(input.paymentInstructions)) blockers.push("Document the verified direct-deposit or payment-vendor setup.");
  return blockers;
}

export function agencyProgramStatus(input: Parameters<typeof agencyProgramSetupBlockers>[0]) {
  return agencyProgramSetupBlockers(input).length ? "setup_required" : "active";
}

export function claimAmountCents(input: { serviceUnits: number; rateCents: number }) {
  if (!Number.isFinite(input.serviceUnits) || input.serviceUnits <= 0) return 0;
  if (!Number.isInteger(input.rateCents) || input.rateCents <= 0) return 0;
  return Math.round(input.serviceUnits * input.rateCents);
}

export function subsidyClaimNumber(input: { stateCode: string; centerId: string; now?: Date; suffix: string }) {
  const now = input.now ?? new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const state = normalizeStateCode(input.stateCode) || "NA";
  const center = clean(input.centerId).replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase() || "CENTER";
  const suffix = clean(input.suffix).replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase();
  return `SUB-${state}-${center}-${date}-${suffix}`;
}

export function claimSubmissionBlockers(input: {
  providerNumber?: string | null;
  vendorNumber?: string | null;
  submissionMethod?: string | null;
  portalUrl?: string | null;
  paymentInstructions?: string | null;
  documents: Array<{ name: string; status: string }>;
}) {
  const blockers = agencyProgramSetupBlockers(input);
  for (const document of input.documents) {
    if (document.status !== "received" && document.status !== "verified" && document.status !== "not_applicable") {
      blockers.push(`Complete required item: ${document.name}.`);
    }
  }
  return blockers;
}

export function nextRemittanceStatus(input: { claimedCents: number; approvedCents?: number | null; paidCents: number }) {
  const payable = input.approvedCents ?? input.claimedCents;
  if (input.paidCents <= 0) return input.approvedCents === null || input.approvedCents === undefined ? "submitted" : "approved";
  return input.paidCents >= payable ? "paid" : "partially_paid";
}
