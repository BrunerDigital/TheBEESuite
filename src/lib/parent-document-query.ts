import type { Prisma, PrismaClient } from "@prisma/client";
import { PARENT_DOCUMENT_ACTION_STATUSES, parentDocumentPagePlan } from "./parent-document-state";
import { currentlyEnrolledChildWhere } from "./enrollment-status";

const documentSelect = { id: true, name: true, type: true, status: true, expiresAt: true, storageKey: true } satisfies Prisma.DocumentSelect;
const requiredOrder = [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }, { id: "desc" }] satisfies Prisma.DocumentOrderByWithRelationInput[];
const historyOrder = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.DocumentOrderByWithRelationInput[];

/** A family owner link cannot authorize a child assigned to another tenant. */
export function parentCurrentChildScope(tenantId: string): Prisma.ChildWhereInput {
  return { ...currentlyEnrolledChildWhere(), classroom: { center: { organization: { tenantId } } } };
}

/** The caller has already proved this family and current-child set for the actor. */
export function parentDocumentScope(familyId: string, childIds: readonly string[]): Prisma.DocumentWhereInput {
  return { AND: [
    { OR: [{ familyId }, { familyId: null, childId: { in: [...childIds] } }] },
    // A record with both owners must agree; a family link cannot expose another
    // family's child or an inactive child omitted from the current portal scope.
    { OR: [{ childId: null }, { child: { id: { in: [...childIds] }, familyId, ...currentlyEnrolledChildWhere() } }] },
  ] };
}

export async function readParentDocumentPage(
  document: Pick<PrismaClient["document"], "count" | "findMany" | "findFirst">,
  input: { familyId: string; childIds: readonly string[]; enabled: boolean; requestedPage?: unknown; requestedDocumentId?: string },
) {
  const where = input.enabled ? parentDocumentScope(input.familyId, input.childIds) : { id: { in: [] } };
  const requiredWhere: Prisma.DocumentWhereInput = { AND: [where, { status: { in: [...PARENT_DOCUMENT_ACTION_STATUSES] } }] };
  const historyWhere: Prisma.DocumentWhereInput = { AND: [where, { status: { notIn: [...PARENT_DOCUMENT_ACTION_STATUSES] } }] };
  const [total, actionRequired] = await Promise.all([document.count({ where: { AND: [where] } }), document.count({ where: requiredWhere })]);
  const plan = parentDocumentPagePlan(input.requestedPage, actionRequired, total);
  const [required, history, firstRequired, linkedDocument] = await Promise.all([
    plan.actionTake ? document.findMany({ where: requiredWhere, orderBy: requiredOrder, skip: plan.actionSkip, take: plan.actionTake, select: documentSelect }) : [],
    plan.historyTake ? document.findMany({ where: historyWhere, orderBy: historyOrder, skip: plan.historySkip, take: plan.historyTake, select: documentSelect }) : [],
    actionRequired ? document.findFirst({ where: requiredWhere, orderBy: requiredOrder, select: { id: true, name: true, status: true } }) : null,
    input.requestedDocumentId ? document.findFirst({ where: { AND: [where, { id: input.requestedDocumentId }] }, select: documentSelect }) : null,
  ]);
  return {
    documents: [...required, ...history], pagination: plan.pagination,
    summary: { total, actionRequired, firstRequired }, linkedDocument,
    requestedDocumentId: input.requestedDocumentId,
    requestedDocumentUnavailable: Boolean(input.requestedDocumentId && !linkedDocument),
  };
}
