ALTER TABLE "TuitionPlan"
ADD COLUMN "centerId" TEXT;

CREATE INDEX "TuitionPlan_centerId_ageGroup_name_idx"
ON "TuitionPlan"("centerId", "ageGroup", "name");

ALTER TABLE "TuitionPlan"
ADD CONSTRAINT "TuitionPlan_centerId_fkey"
FOREIGN KEY ("centerId") REFERENCES "Center"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing plans were global. Preserve active assignments by attaching plans
-- used by one school to that school. Plans shared by multiple schools are
-- cloned per school and the JSON assignment pointers are moved to the clone.
WITH "PlanCenters" AS (
  SELECT DISTINCT
    tp."id" AS "planId",
    f."centerId"
  FROM "TuitionPlan" tp
  JOIN "Child" c
    ON c."customFields"->>'tuitionPlanId' = tp."id"
  JOIN "Family" f
    ON f."id" = c."familyId"
  WHERE f."centerId" IS NOT NULL
),
"ScopedPlanCenters" AS (
  SELECT
    pc."planId",
    pc."centerId",
    COUNT(*) OVER (PARTITION BY pc."planId") AS "centerCount"
  FROM "PlanCenters" pc
)
UPDATE "TuitionPlan" tp
SET "centerId" = pc."centerId"
FROM "ScopedPlanCenters" pc
WHERE tp."id" = pc."planId"
  AND pc."centerCount" = 1;

-- Unassigned legacy plans retain the school recorded when the plan was
-- created. This is more reliable than plan-name guessing and preserves the
-- original location even if another school later edited a globally visible
-- record.
WITH "CreatedPlanCenters" AS (
  SELECT DISTINCT ON (a."resourceId")
    a."resourceId" AS "planId",
    a."centerId"
  FROM "AuditLog" a
  WHERE a."action" = 'operations.tuitionPlan.created'
    AND a."centerId" IS NOT NULL
  ORDER BY a."resourceId", a."createdAt" ASC
),
"MultiCenterPlans" AS (
  SELECT
    c."customFields"->>'tuitionPlanId' AS "planId"
  FROM "Child" c
  JOIN "Family" f
    ON f."id" = c."familyId"
  WHERE f."centerId" IS NOT NULL
    AND c."customFields"->>'tuitionPlanId' IS NOT NULL
  GROUP BY c."customFields"->>'tuitionPlanId'
  HAVING COUNT(DISTINCT f."centerId") > 1
)
UPDATE "TuitionPlan" tp
SET "centerId" = cpc."centerId"
FROM "CreatedPlanCenters" cpc
WHERE tp."id" = cpc."planId"
  AND tp."centerId" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "MultiCenterPlans" mcp
    WHERE mcp."planId" = tp."id"
  );

WITH "PlanCenters" AS (
  SELECT DISTINCT
    tp."id" AS "planId",
    f."centerId"
  FROM "TuitionPlan" tp
  JOIN "Child" c
    ON c."customFields"->>'tuitionPlanId' = tp."id"
  JOIN "Family" f
    ON f."id" = c."familyId"
  WHERE f."centerId" IS NOT NULL
),
"ScopedPlanCenters" AS (
  SELECT
    pc."planId",
    pc."centerId",
    COUNT(*) OVER (PARTITION BY pc."planId") AS "centerCount"
  FROM "PlanCenters" pc
),
"SharedPlans" AS (
  SELECT
    pc."planId",
    pc."centerId",
    'loc_' || SUBSTRING(MD5(pc."planId" || ':' || pc."centerId"), 1, 24) AS "newPlanId"
  FROM "ScopedPlanCenters" pc
  WHERE pc."centerCount" > 1
)
INSERT INTO "TuitionPlan" ("id", "centerId", "name", "ageGroup", "cadence", "amountCents")
SELECT
  sp."newPlanId",
  sp."centerId",
  tp."name",
  tp."ageGroup",
  tp."cadence",
  tp."amountCents"
FROM "SharedPlans" sp
JOIN "TuitionPlan" tp
  ON tp."id" = sp."planId"
ON CONFLICT ("id") DO NOTHING;

WITH "PlanCenters" AS (
  SELECT DISTINCT
    tp."id" AS "planId",
    f."centerId"
  FROM "TuitionPlan" tp
  JOIN "Child" c
    ON c."customFields"->>'tuitionPlanId' = tp."id"
  JOIN "Family" f
    ON f."id" = c."familyId"
  WHERE f."centerId" IS NOT NULL
),
"ScopedPlanCenters" AS (
  SELECT
    pc."planId",
    pc."centerId",
    COUNT(*) OVER (PARTITION BY pc."planId") AS "centerCount"
  FROM "PlanCenters" pc
),
"SharedPlans" AS (
  SELECT
    pc."planId",
    pc."centerId",
    'loc_' || SUBSTRING(MD5(pc."planId" || ':' || pc."centerId"), 1, 24) AS "newPlanId"
  FROM "ScopedPlanCenters" pc
  WHERE pc."centerCount" > 1
)
UPDATE "Child" c
SET "customFields" = JSONB_SET(c."customFields", '{tuitionPlanId}', TO_JSONB(sp."newPlanId"), true)
FROM "Family" f, "SharedPlans" sp
WHERE f."id" = c."familyId"
  AND f."centerId" = sp."centerId"
  AND c."customFields"->>'tuitionPlanId' = sp."planId";

WITH "AccountPlans" AS (
  SELECT
    ba."id" AS "billingAccountId",
    'loc_' || SUBSTRING(
      MD5((ba."customFields"->>'tuitionAutobillPlanId') || ':' || f."centerId"),
      1,
      24
    ) AS "newPlanId"
  FROM "BillingAccount" ba
  JOIN "Family" f
    ON f."id" = ba."familyId"
  WHERE f."centerId" IS NOT NULL
    AND ba."customFields"->>'tuitionAutobillPlanId' IS NOT NULL
)
UPDATE "BillingAccount" ba
SET "customFields" = JSONB_SET(ba."customFields", '{tuitionAutobillPlanId}', TO_JSONB(ap."newPlanId"), true)
FROM "AccountPlans" ap
WHERE ba."id" = ap."billingAccountId"
  AND EXISTS (
    SELECT 1
    FROM "TuitionPlan" tp
    WHERE tp."id" = ap."newPlanId"
  );
