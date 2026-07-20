import type { Prisma } from "@prisma/client";

export const NO_VISIBLE_CENTER_ID = "__no_visible_centers__";

export function visibleCenterIdFilter(centerIds: readonly string[]) {
  return { in: centerIds.length ? [...centerIds] : [NO_VISIBLE_CENTER_ID] };
}

export function visibleChildWhere(centerIds: readonly string[]): Prisma.ChildWhereInput {
  const centerId = visibleCenterIdFilter(centerIds);
  return {
    OR: [
      { classroom: { is: { centerId } } },
      { family: { is: { centerId } } },
    ],
  };
}

export function visibleFamilyWhere(centerIds: readonly string[]): Prisma.FamilyWhereInput {
  return { centerId: visibleCenterIdFilter(centerIds) };
}

export function visibleEnrollmentWhere(centerIds: readonly string[]): Prisma.EnrollmentWhereInput {
  return { child: { is: { family: { is: visibleFamilyWhere(centerIds) } } } };
}

export function visibleBillingAccountWhere(centerIds: readonly string[]): Prisma.BillingAccountWhereInput {
  return { family: { is: visibleFamilyWhere(centerIds) } };
}

export function visibleInvoiceWhere(centerIds: readonly string[]): Prisma.InvoiceWhereInput {
  return { billingAccount: { is: visibleBillingAccountWhere(centerIds) } };
}

export function visiblePaymentWhere(centerIds: readonly string[]): Prisma.PaymentWhereInput {
  return { billingAccount: { is: visibleBillingAccountWhere(centerIds) } };
}

export function visibleClassroomWhere(centerIds: readonly string[]): Prisma.ClassroomWhereInput {
  return { centerId: visibleCenterIdFilter(centerIds) };
}

export function visibleAttendanceWhere(centerIds: readonly string[]): Prisma.AttendanceRecordWhereInput {
  return { classroom: { is: visibleClassroomWhere(centerIds) } };
}

export function visibleCheckLogWhere(centerIds: readonly string[]): Prisma.CheckInOutLogWhereInput {
  return { centerId: visibleCenterIdFilter(centerIds) };
}

export function visibleIncidentWhere(centerIds: readonly string[]): Prisma.IncidentReportWhereInput {
  const centerId = visibleCenterIdFilter(centerIds);
  return {
    OR: [
      { classroom: { is: { centerId } } },
      { child: { family: { is: { centerId } } } },
    ],
  };
}

export function visibleFormSubmissionWhere(
  centerIds: readonly string[],
  formType?: string,
): Prisma.FormSubmissionWhereInput {
  const visibleIds = centerIds.length ? centerIds : [NO_VISIBLE_CENTER_ID];
  return {
    ...(formType ? { form: { type: formType } } : {}),
    OR: visibleIds.map((centerId) => ({ data: { path: ["centerId"], equals: centerId } })),
  };
}

export function visibleOrGlobalCenterWhere(centerIds: readonly string[]) {
  return {
    OR: [
      { centerId: null },
      { centerId: visibleCenterIdFilter(centerIds) },
    ],
  };
}

export function requestedVisibleCenterIds(centerIds: readonly string[], requestedCenterId?: string | null) {
  if (!requestedCenterId || requestedCenterId === "all") return [...centerIds];
  return centerIds.includes(requestedCenterId) ? [requestedCenterId] : [];
}
