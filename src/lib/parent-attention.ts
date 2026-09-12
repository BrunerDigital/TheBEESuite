import type { Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "./enrollment-status";

export const parentInvoiceSelect = {
  id: true, number: true, status: true, dueDate: true, totalCents: true, customFields: true,
  items: { orderBy: { id: "asc" }, select: { description: true, amountCents: true } },
} satisfies Prisma.InvoiceSelect;
export const parentIncidentSelect = {
  id: true, occurredAt: true, type: true, description: true, actionTaken: true, parentAcknowledgedAt: true,
  child: { select: { fullName: true } },
} satisfies Prisma.IncidentReportSelect;
export const parentInvoiceOrder = [{ dueDate: "asc" }, { createdAt: "desc" }, { id: "desc" }] satisfies Prisma.InvoiceOrderByWithRelationInput[];
export const parentIncidentOrder = [{ occurredAt: "desc" }, { id: "desc" }] satisfies Prisma.IncidentReportOrderByWithRelationInput[];

export function parentAttentionScope(input: { familyId: string; childIds: string[]; currentFamily: boolean }) {
  // Existing invoices remain available for an authorized payment-continuity
  // family. Classroom incidents do not; every child link must still agree.
  const invoice: Prisma.InvoiceWhereInput = { billingAccount: { is: { familyId: input.familyId } } };
  const incident: Prisma.IncidentReportWhereInput = input.currentFamily && input.childIds.length ? {
    AND: [{ childId: { in: input.childIds } }, { child: { is: { familyId: input.familyId, ...currentlyEnrolledChildWhere() } } }],
  } : { id: { in: [] } };
  return { invoice, incident, openInvoice: { AND: [invoice, { status: "OPEN" }] } satisfies Prisma.InvoiceWhereInput,
    unacknowledgedIncident: { AND: [incident, { parentAcknowledgedAt: null }] } satisfies Prisma.IncidentReportWhereInput };
}

/** Keep the counted next action actually reachable in the bounded loaded list. */
export function prioritizeParentAttentionRecords<T extends { id: string }>(rows: T[], first: T | null): T[] {
  return (first ? [first, ...rows.filter((row) => row.id !== first.id)] : rows).slice(0, 20);
}

export function remainingParentIncidentCount<T extends { id: string; parentAcknowledgedAt: unknown }>(total: number, rows: T[], acknowledgedIds: ReadonlySet<string>) {
  // Refreshed props already include confirmed acknowledgments. Subtract only
  // optimistic confirmations not yet reflected in that server snapshot.
  return Math.max(0, total - rows.filter((row) => !row.parentAcknowledgedAt && acknowledgedIds.has(row.id)).length);
}
