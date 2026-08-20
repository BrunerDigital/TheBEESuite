import { Prisma } from "@prisma/client";

export function closeEnrollmentAndDisableTuitionSql(input: {
  childIds: string[];
  enrollmentStatus: string;
  classroomId: string | null;
  updatedAt: Date;
  updatedBy: string;
}) {
  if (!input.childIds.length) throw new Error("At least one child is required for enrollment closeout.");
  const updatedAt = input.updatedAt.toISOString();
  return Prisma.sql`
    UPDATE "Child"
    SET
      "enrollmentStatus" = ${input.enrollmentStatus},
      "classroomId" = ${input.classroomId},
      "customFields" = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(COALESCE("customFields", '{}'::jsonb), '{tuitionBillingEnabled}', 'false'::jsonb, true),
            '{tuitionBillingUpdatedAt}', to_jsonb(${updatedAt}::text), true
          ),
          '{tuitionBillingUpdatedBy}', to_jsonb(${input.updatedBy}::text), true
        ),
        '{tuitionBillingDisabledReason}', '"enrollment_closed"'::jsonb, true
      ),
      "updatedAt" = ${input.updatedAt}
    WHERE "id" IN (${Prisma.join(input.childIds)})
  `;
}
