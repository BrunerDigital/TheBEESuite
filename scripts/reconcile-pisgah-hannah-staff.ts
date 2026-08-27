import "./load-env";

import { createHash, randomBytes } from "node:crypto";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  supabaseAuthUserExistsByEmail,
  upsertSupabaseAuthUserWithPassword,
} from "@/lib/supabase-auth";

const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-fingerprint";

const EXPECTED = {
  centerId: "cmp4ewg8w004k6alwid0bwiur",
  centerName: "Kid City USA - Pisgah Forest",
  parentUserId: "cms84h5yu006alf04wyp419g5",
  parentEmail: "hannahlane1794@gmail.com",
  staffEmail: "hannahlane1974@gmail.com",
  staffName: "Hannah Barnett",
  title: "Assistant Teacher/Floater",
  employmentStartDate: "2026-08-24",
  evidenceThreadId: "1a03559611f22e0d",
  evidenceMessageId: "1a03e698dd69682f",
} as const;

const SOURCE = "pisgah_director_email_confirmation_2026_08_26";
const EXTERNAL_ID = `gmail:${EXPECTED.evidenceMessageId}:hannah-staff`;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function record(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

async function loadDatabaseState(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const [center, parentUser, staffUser, staffByEvidence] = await Promise.all([
    db.center.findUnique({
      where: { id: EXPECTED.centerId },
      select: {
        id: true,
        name: true,
        organizationId: true,
        organization: { select: { tenantId: true } },
      },
    }),
    db.user.findUnique({
      where: { id: EXPECTED.parentUserId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        sessionVersion: true,
        guardians: {
          where: { family: { centerId: EXPECTED.centerId } },
          select: { id: true, familyId: true },
        },
      },
    }),
    db.user.findUnique({
      where: { email: EXPECTED.staffEmail },
      select: {
        id: true,
        tenantId: true,
        organizationId: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        customFields: true,
        staffProfile: {
          select: {
            id: true,
            centerId: true,
            classroomId: true,
            title: true,
            sourceSystem: true,
            externalId: true,
            customFields: true,
          },
        },
        accessGrants: {
          where: {
            centerId: EXPECTED.centerId,
            role: UserRole.TEACHER,
            scopeType: "CENTER",
          },
          select: {
            id: true,
            tenantId: true,
            organizationId: true,
            centerId: true,
            role: true,
            scopeType: true,
            isActive: true,
            permissions: true,
          },
          orderBy: { id: "asc" },
        },
      },
    }),
    db.staffProfile.findFirst({
      where: { centerId: EXPECTED.centerId, sourceSystem: SOURCE, externalId: EXTERNAL_ID },
      select: { id: true, userId: true },
    }),
  ]);

  invariant(center?.name === EXPECTED.centerName, "Pisgah Forest center identity changed.");
  invariant(center.organizationId, "Pisgah Forest is missing its organization scope.");
  invariant(
    parentUser?.email === EXPECTED.parentEmail
      && parentUser.role === UserRole.PARENT_GUARDIAN
      && parentUser.isActive
      && parentUser.guardians.length === 1,
    "Hannah's existing parent identity or Pisgah family association changed.",
  );
  invariant(String(EXPECTED.staffEmail) !== String(EXPECTED.parentEmail), "Staff and parent emails must remain distinct.");
  invariant(!staffByEvidence || staffByEvidence.userId === staffUser?.id, "The email evidence is already linked to another staff identity.");

  return { center, parentUser, staffUser, staffByEvidence };
}

function reviewedState(state: Awaited<ReturnType<typeof loadDatabaseState>>, authExists: boolean) {
  return {
    center: state.center,
    parentUser: state.parentUser,
    staffUser: state.staffUser,
    staffByEvidence: state.staffByEvidence,
    staffAuthExists: authExists,
  };
}

function exactStaffState(state: Awaited<ReturnType<typeof loadDatabaseState>>) {
  const user = state.staffUser;
  if (!user?.staffProfile || user.accessGrants.length !== 1) return false;
  const userFields = record(user.customFields);
  const profileFields = record(user.staffProfile.customFields);
  const grant = user.accessGrants[0];
  return user.tenantId === state.center.organization.tenantId
    && user.organizationId === state.center.organizationId
    && user.name === EXPECTED.staffName
    && user.role === UserRole.TEACHER
    && user.isActive
    && user.staffProfile.centerId === EXPECTED.centerId
    && user.staffProfile.classroomId === null
    && user.staffProfile.title === EXPECTED.title
    && user.staffProfile.sourceSystem === SOURCE
    && user.staffProfile.externalId === EXTERNAL_ID
    && userFields.linkedParentUserId === EXPECTED.parentUserId
    && profileFields.staffContactEmail === EXPECTED.staffEmail
    && profileFields.employmentStatus === "active"
    && profileFields.employmentStartDate === EXPECTED.employmentStartDate
    && profileFields.assignment === "all_classrooms_floater_unassigned"
    && grant.tenantId === state.center.organization.tenantId
    && grant.organizationId === state.center.organizationId
    && grant.centerId === EXPECTED.centerId
    && grant.role === UserRole.TEACHER
    && grant.scopeType === "CENTER"
    && grant.isActive;
}

async function main() {
  const before = await loadDatabaseState();
  const authExists = await supabaseAuthUserExistsByEmail(EXPECTED.staffEmail);
  const reviewed = reviewedState(before, authExists);
  const planFingerprint = fingerprint(reviewed);
  const alreadyApplied = exactStaffState(before) && authExists;

  if (!process.argv.includes(APPLY_FLAG)) {
    console.log(JSON.stringify({
      mode: "preview",
      alreadyApplied,
      planFingerprint,
      reviewed,
      planned: {
        createDistinctStaffUser: before.staffUser ? false : true,
        createStaffProfile: before.staffUser?.staffProfile ? false : true,
        createCenterGrant: before.staffUser?.accessGrants.length ? false : true,
        provisionStaffAuth: !authExists,
        parentIdentityChanged: false,
        familyAssociationChanged: false,
        tuitionChanged: false,
        billingChanged: false,
        invitationSent: false,
      },
    }, null, 2));
    return;
  }

  invariant(option(CONFIRM_FLAG) === planFingerprint, `Pass ${CONFIRM_FLAG} ${planFingerprint} after reviewing the current preview.`);
  invariant(!before.staffUser || exactStaffState(before), "The supplied staff email is already used by a different or incompatible app identity.");
  invariant(!authExists || exactStaffState(before), "The supplied staff email already exists in Supabase Auth without the exact reviewed app identity.");

  if (!exactStaffState(before)) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Center" WHERE "id" = ${EXPECTED.centerId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${EXPECTED.parentUserId} FOR UPDATE`;
      const current = await loadDatabaseState(tx);
      invariant(
        fingerprint(reviewedState(current, authExists)) === planFingerprint,
        "Production state changed after preview; no Pisgah staff record was created.",
      );

      const now = new Date().toISOString();
      const staffUser = await tx.user.create({
        data: {
          tenantId: current.center.organization.tenantId,
          organizationId: current.center.organizationId,
          email: EXPECTED.staffEmail,
          name: EXPECTED.staffName,
          role: UserRole.TEACHER,
          isActive: true,
          mustResetPassword: false,
          customFields: {
            source: SOURCE,
            staffContactEmail: EXPECTED.staffEmail,
            linkedParentUserId: EXPECTED.parentUserId,
            separateParentIdentityPreserved: true,
            evidenceThreadId: EXPECTED.evidenceThreadId,
            evidenceMessageId: EXPECTED.evidenceMessageId,
            createdAt: now,
          },
        },
        select: { id: true },
      });

      const staffProfile = await tx.staffProfile.create({
        data: {
          userId: staffUser.id,
          centerId: EXPECTED.centerId,
          classroomId: null,
          title: EXPECTED.title,
          backgroundCheckStatus: "pending",
          sourceSystem: SOURCE,
          externalId: EXTERNAL_ID,
          customFields: {
            staffContactEmail: EXPECTED.staffEmail,
            employmentStatus: "active",
            employmentStartDate: EXPECTED.employmentStartDate,
            assignment: "all_classrooms_floater_unassigned",
            linkedParentUserId: EXPECTED.parentUserId,
            separateParentIdentityPreserved: true,
            evidenceThreadId: EXPECTED.evidenceThreadId,
            evidenceMessageId: EXPECTED.evidenceMessageId,
          },
        },
        select: { id: true },
      });

      const grant = await tx.userAccessGrant.create({
        data: {
          userId: staffUser.id,
          tenantId: current.center.organization.tenantId,
          organizationId: current.center.organizationId,
          centerId: EXPECTED.centerId,
          role: UserRole.TEACHER,
          scopeType: "CENTER",
          isActive: true,
          startsAt: new Date(`${EXPECTED.employmentStartDate}T04:00:00.000Z`),
          permissions: {
            createdFromDirectorEmailConfirmation: true,
            evidenceMessageId: EXPECTED.evidenceMessageId,
          },
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          tenantId: current.center.organization.tenantId,
          centerId: EXPECTED.centerId,
          action: "operations.staff.created_from_director_confirmation",
          resource: "StaffProfile",
          resourceId: staffProfile.id,
          metadata: {
            staffUserId: staffUser.id,
            grantId: grant.id,
            staffEmail: EXPECTED.staffEmail,
            title: EXPECTED.title,
            employmentStartDate: EXPECTED.employmentStartDate,
            classroomId: null,
            assignment: "all_classrooms_floater_unassigned",
            linkedParentUserId: EXPECTED.parentUserId,
            parentIdentityChanged: false,
            parentFamilyAssociationChanged: false,
            invitationSent: false,
            evidenceThreadId: EXPECTED.evidenceThreadId,
            evidenceMessageId: EXPECTED.evidenceMessageId,
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  }

  if (!authExists) {
    const auth = await upsertSupabaseAuthUserWithPassword({
      email: EXPECTED.staffEmail,
      name: EXPECTED.staffName,
      password: randomBytes(32).toString("base64url"),
      role: UserRole.TEACHER,
      source: SOURCE,
      updateExistingPassword: false,
    });
    invariant(auth.ok && auth.created, "The distinct Hannah staff authentication identity was not created exactly once.");
  }

  const after = await loadDatabaseState();
  const afterAuthExists = await supabaseAuthUserExistsByEmail(EXPECTED.staffEmail);
  invariant(exactStaffState(after) && afterAuthExists, "Hannah's distinct staff identity did not reach the verified target state.");
  invariant(
    after.parentUser.email === before.parentUser.email
      && after.parentUser.isActive === before.parentUser.isActive
      && after.parentUser.sessionVersion === before.parentUser.sessionVersion
      && JSON.stringify(after.parentUser.guardians) === JSON.stringify(before.parentUser.guardians),
    "Hannah's existing parent identity or family association changed.",
  );

  console.log(JSON.stringify({
    mode: alreadyApplied ? "already_applied" : "applied",
    staffUserId: after.staffUser?.id,
    staffProfileId: after.staffUser?.staffProfile?.id,
    centerGrantId: after.staffUser?.accessGrants[0]?.id,
    staffEmail: EXPECTED.staffEmail,
    title: EXPECTED.title,
    employmentStartDate: EXPECTED.employmentStartDate,
    classroomId: null,
    authProvisioned: afterAuthExists,
    parentUserId: after.parentUser.id,
    parentEmail: after.parentUser.email,
    parentIdentityChanged: false,
    familyAssociationChanged: false,
    tuitionChanged: false,
    billingChanged: false,
    invitationSent: false,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
