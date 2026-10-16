import type { FteReportPrefill } from "@/components/fte-report-form";

type FteCenterDisplay = {
  id: string;
  name: string;
  crmLocationId: string | null;
  city: string | null;
  state: string | null;
  ownerGroup: { name: string; ownerType: string } | null;
};

/** An explicit client boundary: never spread a database Center into FTE props. */
export function restrictedFteCenterDisplay(center: FteCenterDisplay): FteCenterDisplay {
  return {
    id: center.id,
    name: center.name,
    crmLocationId: center.crmLocationId,
    city: center.city,
    state: center.state,
    ownerGroup: center.ownerGroup ? { name: center.ownerGroup.name, ownerType: center.ownerGroup.ownerType } : null,
  };
}

/** FTE access exposes report aggregates, not a roster or future extra fields. */
export function restrictedFtePrefill(row: FteReportPrefill): FteReportPrefill {
  return {
    centerId: row.centerId,
    licensedCapacity: row.licensedCapacity,
    enrolledCount: row.enrolledCount,
    fullTimeCount: row.fullTimeCount,
    partTimeCount: row.partTimeCount,
    twoDayCount: row.twoDayCount,
    threeDayCount: row.threeDayCount,
    fourDayCount: row.fourDayCount,
    fiveDayCount: row.fiveDayCount,
    unknownScheduleCount: row.unknownScheduleCount,
    missingScheduleChildren: [],
    infants: row.infants,
    toddlers: row.toddlers,
    twos: row.twos,
    preschool: row.preschool,
    preK: row.preK,
    schoolAge: row.schoolAge,
    accountReceivableAmount: row.accountReceivableAmount,
    accountReceivableReviewRequired: row.accountReceivableReviewRequired,
    selfPayerBillAmount: row.selfPayerBillAmount,
    subsidyBillAmount: row.subsidyBillAmount,
    totalBilledAmount: row.totalBilledAmount,
    payrollAmount: row.payrollAmount,
    payrollPercent: row.payrollPercent,
    newStarts: row.newStarts,
    withdrawals: row.withdrawals,
    preregisteredChildren: row.preregisteredChildren,
    generatedAt: row.generatedAt,
    sourceLabel: row.sourceLabel,
  };
}
