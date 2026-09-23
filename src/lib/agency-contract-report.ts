export type ContractReportInput = {
  id: string; childId: string; coverageStart: Date; coverageEnd: Date;
  authorizedRateCents: number; familyCopayCents: number; unitType: string; status: string;
};

export function contractReportRange(start: string | null, end: string | null) {
  const parse = (value: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
  };
  const first = parse(start), last = parse(end);
  if (!first || !last || first > last) return null;
  const endExclusive = new Date(last);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { start: first, end: last, endExclusive };
}

/** Stored coverage is calendar dated. Never extend a contract into missing history. */
export function agencyContractReportRow(contract: ContractReportInput, range: NonNullable<ReturnType<typeof contractReportRange>>) {
  const coverageStart = contract.coverageStart.toISOString().slice(0, 10);
  const coverageEnd = contract.coverageEnd.toISOString().slice(0, 10);
  const applicableStart = [coverageStart, range.start.toISOString().slice(0, 10)].sort()[1];
  const applicableEnd = [coverageEnd, range.end.toISOString().slice(0, 10)].sort()[0];
  if (applicableStart > applicableEnd) return null;
  const supportedRate = contract.status === "active" || contract.status === "expired";
  const weeklyEquivalentCents = !supportedRate ? null
    : contract.unitType === "monthly" ? Math.round(contract.authorizedRateCents / 4)
      : contract.unitType === "weekly" ? contract.authorizedRateCents : null;
  return { ...contract, coverageStart, coverageEnd, applicableStart, applicableEnd, weeklyEquivalentCents,
    reviewReason: !supportedRate ? "Review contract status before using this rate."
      : weeklyEquivalentCents === null ? "Actual service units are needed for daily or hourly rates." : null };
}

export function contractReportCsvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
