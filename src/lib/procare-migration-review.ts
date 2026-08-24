import { isCurrentlyEnrolledChildRecord } from "@/lib/enrollment-status";
import { normalizeProcareEnrollmentStatusWithEndDate } from "@/lib/procare-import-fields";

export type ProcareMigrationReviewRow = {
  rowNumber: number;
  accountId: string;
  childId: string;
  familyName: string;
  childName: string;
  enrollmentStatus: string;
  classroom: string;
  childScope: "current" | "historical" | "needs_review";
  familyScope: "current" | "historical" | "needs_review";
  hidden: boolean;
  relationshipCount: number;
  relationshipsReady: boolean;
  openingBalancePresent: boolean;
  openingBalanceCents: number | null;
  openingBalanceIncluded: boolean;
  openingBalanceStatus: "included_current_outstanding" | "excluded_historical" | "needs_review";
  weeklyTuitionCents: number | null;
  weeklyTuitionReady: boolean;
  blockers: string[];
};

function normalized(value: string) {
  return value.replace(/^\ufeff/, "").trim().toLowerCase().replace(/#/g, " number ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function first(record: Record<string, string>, aliases: string[]) {
  const wanted = new Set(aliases.map(normalized));
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(normalized(key)) && value.trim()) return value.trim();
  }
  return "";
}

function checked(value: string) {
  return /^(checked|yes|y|true|1|x)$/i.test(value.trim());
}

function cents(value: string): { present: boolean; valid: boolean; cents: number | null } {
  const input = value.trim();
  if (!input) return { present: false, valid: false, cents: null };
  const negative = /^\(.*\)$/.test(input);
  const normalizedValue = input.replace(/[,$()\s]/g, "");
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(normalizedValue)) return { present: true, valid: false, cents: null };
  const parsed = Math.round(Number(normalizedValue) * 100) * (negative ? -1 : 1);
  return Number.isSafeInteger(parsed)
    ? { present: true, valid: true, cents: parsed }
    : { present: true, valid: false, cents: null };
}

function moneyFromRecord(record: Record<string, string>, centAliases: string[], currencyAliases: string[]) {
  const centsValue = first(record, centAliases);
  if (centsValue) {
    if (!/^[+-]?\d+$/.test(centsValue)) return { present: true, valid: false, cents: null };
    const parsed = Number(centsValue);
    return Number.isSafeInteger(parsed)
      ? { present: true, valid: true, cents: parsed }
      : { present: true, valid: false, cents: null };
  }
  return cents(first(record, currencyAliases));
}

function relationshipCount(record: Record<string, string>) {
  const encoded = first(record, ["procare relationship records"]);
  if (encoded) {
    try {
      const relationships = JSON.parse(encoded) as Array<{ guardian?: boolean; emergency?: boolean; authorizedPickup?: boolean; personId?: string; externalId?: string }>;
      if (Array.isArray(relationships)) return relationships.filter((item) => (
        (item.guardian || item.emergency || item.authorizedPickup) && (item.personId || item.externalId)
      )).length;
    } catch {
      return 0;
    }
  }
  return [
    first(record, ["guardian id", "payer id", "primary payer id", "parent id"]),
    first(record, ["secondary guardian id", "secondary payer id", "secondary parent id"]),
  ].filter(Boolean).length;
}

export function buildProcareMigrationReviewRow(record: Record<string, string>, rowNumber: number): ProcareMigrationReviewRow | null {
  const accountId = first(record, ["account id", "account key", "account number", "family id", "procare account id"]);
  const childId = first(record, ["child id", "child key", "student id", "procare child id"]);
  const childName = first(record, ["child name", "child full name", "student name"]);
  if (!accountId && !childId && !childName) return null;

  const statusValue = first(record, ["child status", "enrollment status", "student status", "status"]);
  const endDate = first(record, ["end date", "withdrawal date", "termination date"]);
  const enrollmentStatus = normalizeProcareEnrollmentStatusWithEndDate(statusValue, endDate);
  const classroom = first(record, ["classroom", "classroom name", "primary classroom", "room", "assigned classroom"]);
  const current = isCurrentlyEnrolledChildRecord({ enrollmentStatus, classroomId: classroom });
  const historical = ["withdrawn", "graduated", "inactive", "not_enrolled", "unenrolled", "terminated"].includes(enrollmentStatus);
  const familyScope = current ? "current" : historical ? "historical" : "needs_review";
  const hidden = checked(first(record, ["is hidden", "hidden"]));
  const relationships = relationshipCount(record);
  const relationshipsReady = relationships > 0;
  const balance = moneyFromRecord(record, ["confirmed opening balance cents", "source opening balance cents", "bee balance cents"], ["balance", "account balance", "ledger balance", "amount due"]);
  const openingBalanceIncluded = current && !hidden && balance.valid;
  const openingBalanceStatus = openingBalanceIncluded
    ? "included_current_outstanding"
    : historical || hidden
      ? "excluded_historical"
      : "needs_review";

  const tuition = moneyFromRecord(record, ["weekly tuition cents", "confirmed weekly tuition cents", "source weekly tuition cents"], ["weekly rate", "tuition rate", "charge amount"]);
  const cadence = first(record, ["source cadence", "confirmed tuition cadence", "cadence", "billing period", "frequency"]);
  const description = first(record, ["source description", "tuition description", "source tuition evidence", "tuition plan", "description"]);
  const effectiveDate = first(record, ["source effective date", "tuition effective week", "effective week", "effective date", "status start date"]);
  const weeklyTuitionReady = !current || Boolean(tuition.valid && (tuition.cents ?? 0) > 0 && /^weekly$/i.test(cadence) && description && effectiveDate);
  const blockers: string[] = [];
  if (!accountId) blockers.push("Add the stable family Account ID.");
  if (!childId) blockers.push("Add the stable Child ID.");
  if (current && !classroom) blockers.push("Assign the enrolled child to a classroom.");
  if (current && !relationshipsReady) blockers.push("Link at least one source-backed guardian relationship with a stable Person ID.");
  if (current && hidden) blockers.push("The source marks this current family hidden; correct the lifecycle or hidden status before import.");
  if (current && !balance.present) blockers.push("Provide and confirm the signed opening balance, including an explicit zero.");
  else if (current && !balance.valid) blockers.push("Correct the opening balance to a valid signed currency amount.");
  if (current && !tuition.valid) blockers.push("Provide one positive child-level weekly tuition amount.");
  if (current && !/^weekly$/i.test(cadence)) blockers.push("Confirm weekly tuition cadence.");
  if (current && !description) blockers.push("Provide the tuition description or plan evidence.");
  if (current && !effectiveDate) blockers.push("Provide the tuition effective date or ISO effective week.");
  if (familyScope === "needs_review") blockers.push("Confirm whether this child is current or historical before importing balances or tuition.");

  return {
    rowNumber,
    accountId,
    childId,
    familyName: first(record, ["family name", "account name", "household"]),
    childName,
    enrollmentStatus,
    classroom,
    childScope: familyScope,
    familyScope,
    hidden,
    relationshipCount: relationships,
    relationshipsReady,
    openingBalancePresent: balance.present,
    openingBalanceCents: balance.cents,
    openingBalanceIncluded,
    openingBalanceStatus,
    weeklyTuitionCents: tuition.cents,
    weeklyTuitionReady,
    blockers,
  };
}

export function finalizeProcareMigrationReview(rows: ProcareMigrationReviewRow[]) {
  const currentAccountIds = new Set(rows.filter((row) => row.childScope === "current").map((row) => row.accountId).filter(Boolean));
  return rows.map((row): ProcareMigrationReviewRow => {
    if (!row.accountId || !currentAccountIds.has(row.accountId)) return row;
    const openingBalanceIncluded = !row.hidden && row.openingBalanceCents !== null;
    return {
      ...row,
      familyScope: "current",
      openingBalanceIncluded,
      openingBalanceStatus: openingBalanceIncluded ? "included_current_outstanding" : "needs_review",
    };
  });
}

export function summarizeProcareMigrationReview(rows: ProcareMigrationReviewRow[]) {
  const currentAccounts = new Set(rows.filter((row) => row.familyScope === "current").map((row) => row.accountId).filter(Boolean));
  const historicalAccounts = new Set(rows.filter((row) => row.familyScope === "historical").map((row) => row.accountId).filter(Boolean));
  const includedBalances = new Map<string, number>();
  const excludedBalances = new Map<string, number>();
  for (const row of rows) {
    if (!row.accountId || row.openingBalanceCents === null) continue;
    if (row.openingBalanceIncluded) includedBalances.set(row.accountId, row.openingBalanceCents);
    else if (row.openingBalanceStatus === "excluded_historical") excludedBalances.set(row.accountId, row.openingBalanceCents);
  }
  return {
    currentFamilyAccounts: currentAccounts.size,
    historicalFamilyAccounts: historicalAccounts.size,
    relationshipsReadyChildren: rows.filter((row) => row.childScope === "current" && row.relationshipsReady).length,
    weeklyTuitionReadyChildren: rows.filter((row) => row.childScope === "current" && row.weeklyTuitionReady).length,
    currentChildren: rows.filter((row) => row.childScope === "current").length,
    includedCurrentBalanceCents: [...includedBalances.values()].reduce((sum, value) => sum + value, 0),
    excludedHistoricalBalanceCents: [...excludedBalances.values()].reduce((sum, value) => sum + value, 0),
    blockedRows: rows.filter((row) => row.blockers.length > 0).length,
  };
}
