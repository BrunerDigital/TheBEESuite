-- Repair the child parent-scope guard installed by the agency reconciliation
-- controls. PostgreSQL derives the first UNION column name as "centerId";
-- the previous function referenced scope.center_id and therefore failed before
-- it could enforce the intended tenant/school integrity checks.
CREATE OR REPLACE FUNCTION public.protect_agency_child_parent_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    affected_center_ids TEXT[];
    family_center_id TEXT;
    classroom_center_id TEXT;
BEGIN
    IF NEW."familyId" IS NOT DISTINCT FROM OLD."familyId"
       AND NEW."classroomId" IS NOT DISTINCT FROM OLD."classroomId" THEN
        RETURN NEW;
    END IF;

    SELECT ARRAY_AGG(DISTINCT scope.center_id ORDER BY scope.center_id)
    INTO affected_center_ids
    FROM (
        SELECT family."centerId" AS center_id
        FROM public."Family" family
        WHERE family.id IN (OLD."familyId", NEW."familyId")
        UNION ALL
        SELECT classroom."centerId" AS center_id
        FROM public."Classroom" classroom
        WHERE classroom.id IN (OLD."classroomId", NEW."classroomId")
        UNION ALL
        SELECT subsidy_authorization."centerId" AS center_id
        FROM public."SubsidyAuthorization" subsidy_authorization
        WHERE subsidy_authorization."childId" = OLD.id
        UNION ALL
        SELECT claim."centerId" AS center_id
        FROM public."SubsidyClaimLine" line
        JOIN public."SubsidyClaim" claim ON claim.id = line."claimId"
        WHERE line."childId" = OLD.id
    ) scope
    WHERE scope.center_id IS NOT NULL;
    PERFORM public.lock_agency_financial_centers(affected_center_ids);

    SELECT family."centerId" INTO family_center_id
    FROM public."Family" family
    WHERE family.id = NEW."familyId";

    IF NEW."classroomId" IS NOT NULL THEN
        SELECT classroom."centerId" INTO classroom_center_id
        FROM public."Classroom" classroom
        WHERE classroom.id = NEW."classroomId";
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public."SubsidyAuthorization" subsidy_authorization
        WHERE subsidy_authorization."childId" = OLD.id
          AND (
              subsidy_authorization."familyId" IS DISTINCT FROM NEW."familyId"
              OR subsidy_authorization."centerId" IS DISTINCT FROM family_center_id
              OR (NEW."classroomId" IS NOT NULL AND subsidy_authorization."centerId" IS DISTINCT FROM classroom_center_id)
          )
    ) OR EXISTS (
        SELECT 1
        FROM public."SubsidyClaimLine" line
        JOIN public."SubsidyClaim" claim ON claim.id = line."claimId"
        WHERE line."childId" = OLD.id
          AND (
              claim."centerId" IS DISTINCT FROM family_center_id
              OR (NEW."classroomId" IS NOT NULL AND claim."centerId" IS DISTINCT FROM classroom_center_id)
          )
    ) THEN
        RAISE EXCEPTION 'A child update conflicts with agency authorization or claim history';
    END IF;
    RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.protect_agency_child_parent_scope() FROM PUBLIC, anon, authenticated;
