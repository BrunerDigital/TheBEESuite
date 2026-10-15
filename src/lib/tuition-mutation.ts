import { Prisma } from "@prisma/client";
import { canAccessCenter, type CurrentUser } from "@/lib/auth";
import { canSaveTuitionPlanAmount, normalizeBillingCadence, tuitionPlanRecordChanged } from "@/lib/billing-workflows";
import { prisma } from "@/lib/prisma";
import { tuitionPlanIsArchived } from "@/lib/tuition-plan-archive";

export class TuitionMutationError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "TuitionMutationError";
    this.status = status;
    this.code = code;
  }
}

export function tuitionMutationFailure(status: number, error: string, code?: string): never {
  // Throw rather than returning a response: returning from an interactive
  // transaction would commit a rate already written before assignment validation.
  throw new TuitionMutationError(status, error, code);
}

export async function runTuitionMutation<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(run, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      const meta = error && typeof error === "object" && "meta" in error ? error.meta : null;
      // Raw FOR UPDATE statements can expose the PostgreSQL SQLSTATE through
      // P2010 rather than Prisma's normal transaction-conflict code P2034.
      const rawConflict = code === "P2010" && meta && typeof meta === "object" && "code" in meta
        && ["40001", "40P01", "55P03"].includes(String(meta.code));
      if (code !== "P2034" && !rawConflict) throw error;
      if (attempt >= 2) {
        throw new TuitionMutationError(409, "Tuition changed while saving. Refresh and review the current rate and assignment before trying again.", "TUITION_SAVE_CONFLICT");
      }
      // PostgreSQL serialization/deadlock failures roll back the whole attempt.
      // Retry every read and validation, never just the final write.
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function lockTuitionCenter(tx: Prisma.TransactionClient, user: CurrentUser, centerId: string) {
  if (!centerId) tuitionMutationFailure(400, "School is required for every tuition plan.");
  if (!canAccessCenter(user, centerId)) tuitionMutationFailure(403, "You do not have access to this school's tuition plans.");
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Center" WHERE "id" = ${centerId} FOR UPDATE`);
  const center = await tx.center.findFirst({
    where: { id: centerId, organization: { tenantId: user.tenantId } },
    select: { customFields: true },
  });
  if (!center) tuitionMutationFailure(404, "School not found for this tenant.");
  return center;
}

/** The caller owns the transaction and writes the audit using the same tx. */
export async function saveTuitionPlanInTransaction(
  tx: Prisma.TransactionClient,
  user: CurrentUser,
  body: Record<string, unknown>,
  options: { versionAssigned?: boolean; requiredCenterId?: string } = {},
) {
  const id = clean(body.id);
  const centerId = clean(body.centerId);
  if (options.requiredCenterId && centerId !== options.requiredCenterId) {
    tuitionMutationFailure(403, "Tuition plan belongs to a different school.");
  }
  const center = await lockTuitionCenter(tx, user, centerId);
  if (id) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TuitionPlan" WHERE "id" = ${id} FOR UPDATE`);
  const existing = id ? await tx.tuitionPlan.findUnique({ where: { id } }) : null;
  if (id && !existing) tuitionMutationFailure(404, "Tuition plan not found.");
  if (existing?.centerId && existing.centerId !== centerId) tuitionMutationFailure(403, "Tuition plan belongs to a different school.");
  if (id && tuitionPlanIsArchived(center.customFields, id)) tuitionMutationFailure(409, "Restore this archived rate before editing it.");
  const amount = Number(body.amountCents || Number(body.amountDollars) * 100);
  const requestedCadence = clean(body.cadence);
  const data = {
    centerId,
    name: clean(body.name),
    ageGroup: clean(body.ageGroup) || "Preschool",
    cadence: requestedCadence ? normalizeBillingCadence(requestedCadence) : "weekly",
    amountCents: Number.isFinite(amount) ? Math.round(amount) : 0,
  };
  if (!data.name || !canSaveTuitionPlanAmount(data.amountCents, body.zeroDollarVoucher === true)) {
    tuitionMutationFailure(400, "Plan name and a positive amount are required unless this is explicitly marked as a $0 CCDF or voucher rate.");
  }
  let rateVersionCreated = false;
  if (existing && tuitionPlanRecordChanged(existing, data)) {
    const assignedChild = await tx.child.findFirst({
      where: { family: { centerId }, customFields: { path: ["tuitionPlanId"], equals: id } },
      select: { id: true },
    });
    if (assignedChild) {
      if (!options.versionAssigned) tuitionMutationFailure(409,
        "This rate is already assigned to a child. Create a new rate so previously saved child rates remain unchanged.",
        "TUITION_PLAN_ASSIGNED_CREATE_NEW");
      rateVersionCreated = true;
    }
  }
  const rateMode = id && !rateVersionCreated ? "updated" as const : "created" as const;
  const record = rateMode === "updated"
    ? await tx.tuitionPlan.update({ where: { id }, data })
    : await tx.tuitionPlan.create({ data });
  return { record, rateMode, rateVersionCreated };
}
