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
UPDATE "BillingAccount" ba
SET "customFields" = JSONB_SET(ba."customFields", '{tuitionAutobillPlanId}', TO_JSONB(sp."newPlanId"), true)
FROM "Family" f, "SharedPlans" sp
WHERE f."id" = ba."familyId"
  AND f."centerId" = sp."centerId"
  AND ba."customFields"->>'tuitionAutobillPlanId' = sp."planId";
