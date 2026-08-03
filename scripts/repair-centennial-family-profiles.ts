import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cms3g2the000i6a7wdd8pa20s";
const CENTER_NAME = "Miss Honey's Learning Center - Centennial";
const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-centennial-family-profiles";
const REPAIR_SOURCE = "centennial_family_profile_repair_2026_08_03";
const AUDIT_ACTION = "operations.centennial_family_profiles.repaired";

const SOURCE_FILES = [
  {
    path: "docs/procare-exports/CO - Centennial - Miss Honeys/raw/CO - Centennial - Miss Honeys - Child All Enrollment Status.csv",
    sha256: "4a6fa859068f70fae4ae1f60ea121c869102abc7675d9696791ede4c396ef61e",
  },
  {
    path: "docs/procare-exports/CO - Centennial - Miss Honeys/raw/CO - Centennial - Miss Honeys - Account Information - source 2.csv",
    sha256: "efef8cd2067aefa049b450136c962193d14405bd9ee1ce1ff1ffc64f58bd2ab9",
  },
  {
    path: "docs/procare-exports/CO - Centennial - Miss Honeys/review/2026-07-30/02-procare-needs-account-resolution.csv",
    sha256: "db9fff5ba3623889abe7b995ca036458d0dc189952b8b16606830e536b7e60c1",
  },
] as const;

const IDS = {
  families: {
    young: "cms7gesvg01frl7042vh29tdb",
    lutes: "cmsdej7hv00006ajwxkfad94i",
    nebroNamed: "cms3lp09j02t46avw0lssevlc",
    nebroNumeric: "cms7gbsj800xql7040yt3agmw",
    lacasseNamed: "cms3loscd02q06avwqalbghmk",
    lacasseNumeric: "cms7ga7ms00orl704y4gxxdn1",
    wattonNamed: "cms3lpi3d03036avwb30pyftf",
    wattonNumeric: "cms7ge2ke01ccl704lh5c7wxv",
  },
  children: {
    youngEinarDuplicate: "cms82yysa002wla04mnuziq9r",
    canonicalEinar: "cms7g5tnd000ml7041oo8riqw",
    youngJuliaDuplicate: "cms8355ly003sla04ptssav4h",
    canonicalJulia: "cms7gcncy0121l704uod10en1",
    paulsen: "cms7get8x01fxl704em2eopk4",
    lacasseRenderedLorenzo: "cms3lot9n02qe6avwt0a0l9yc",
    lacasseNumericLorenzo: "cms7gaayo00p9l704kewnyz4g",
    lacasseRenderedLuciana: "cms3lotef02qg6avw3vxfvzwr",
    lacasseNumericLuciana: "cms7gacbd00pbl7047wye0ahm",
    leonardo: "cms7ga84800ozl704azx559ja",
    noah: "cms7ge2xx01ckl7048wmugmso",
    sadie: "cms3lpj5j030j6avwtt2ki8xe",
    lukeOrell: "cms7gc2ot00z4l704mncnywx4",
    babySlagle: "cms7gddmp0178l704hjmcssg8",
    babyBudrow: "cms7g705q005el704gia2a0hq",
    babyCarter: "cms7g76jw0068l704v5rmz0aq",
  },
  guardians: {
    nebroRenderedAlina: "cms3lp0e902t66avwycbf21wx",
    nebroRenderedDawit: "cms3lp0iz02t86avwbriddlev",
    nebroNumericAlina: "cms7gbsmo00xsl704yz652zjo",
    nebroNumericDawit: "cms7gbsq100xul7048owtwgei",
    lacasseRenderedKristina: "cms3loslv02q46avwnc4zqoif",
    lacasseRenderedDavid: "cms3losh402q26avwpqglu95z",
    lacasseNumericKristina: "cms7ga7qa00otl7046u3bqqen",
    lacasseNumericDavid: "cms7ga7x800oxl704bcwxfcd6",
    lacasseNumericDavidExtra: "cms7ga7tr00ovl704c809iut5",
    wattonRenderedHollyanne: "cms3lpi8403056avw0ma3a8b1",
    wattonRenderedGabriel: "cms3lpicu03076avw9ldrt7ae",
    wattonNumericHollyanne: "cms7ge2ns01cel704t6sk08mk",
    wattonNumericGabriel: "cms7ge2r601cgl704mekpgy0l",
  },
  billing: {
    lutes: "cmsdejbyw00146ajwidpaoekb",
    nebro: "cmsdeje3f001s6ajwnrzaomyz",
    watton: "cmsdejhuw002y6ajwtkvbjyyy",
  },
} as const;

const WITHDRAW_CHILD_IDS = [
  IDS.children.lukeOrell,
  IDS.children.babySlagle,
  IDS.children.babyBudrow,
  IDS.children.babyCarter,
] as const;

const TARGET_FAMILY_IDS = Object.values(IDS.families);
const REFERENCE_CHILD_IDS = [
  ...Object.values(IDS.children),
] as string[];

type RepairDb = Pick<
  Prisma.TransactionClient,
  | "auditLog"
  | "authorizedPickup"
  | "billingAccount"
  | "center"
  | "child"
  | "dataDeletionRequest"
  | "emergencyContact"
  | "family"
  | "formSubmission"
  | "guardian"
  | "invoice"
  | "ledgerEntry"
  | "message"
  | "payment"
  | "user"
  | "userAccessGrant"
>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function repairFields(
  values: Array<Prisma.JsonValue | null | undefined>,
  metadata: Prisma.InputJsonObject,
) {
  return {
    ...Object.assign({}, ...values.map((value) => jsonObject(value))),
    centennialFamilyProfileRepair: metadata,
  } as Prisma.InputJsonObject;
}

function date(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function sameIds(actual: string[], expected: readonly string[]) {
  return actual.slice().sort().join("\u0000") === expected.slice().sort().join("\u0000");
}

async function readState(db: RepairDb) {
  const [center, families, children, classrooms, pendingChildren, auditCount, duplicateFormSubmissions, boundaryRows] = await Promise.all([
    db.center.findUnique({
      where: { id: CENTER_ID },
      select: { id: true, name: true, status: true, organization: { select: { tenantId: true } } },
    }),
    db.family.findMany({
      where: { id: { in: TARGET_FAMILY_IDS } },
      select: {
        id: true,
        centerId: true,
        name: true,
        address: true,
        billingEmail: true,
        notes: true,
        custodyNotes: true,
        sourceSystem: true,
        externalId: true,
        customFields: true,
        children: {
          select: {
            id: true,
            familyId: true,
            classroomId: true,
            fullName: true,
            preferredName: true,
            dateOfBirth: true,
            ageGroup: true,
            enrollmentStatus: true,
            startDate: true,
            schedule: true,
            photoVideoPermission: true,
            fieldTripPermission: true,
            napNotes: true,
            feedingNotes: true,
            pottyNotes: true,
            developmentalNotes: true,
            sourceSystem: true,
            externalId: true,
            customFields: true,
            liveLocation: { select: { id: true } },
            _count: {
              select: {
                medicalNotes: true,
                allergies: true,
                enrollments: true,
                attendance: true,
                checkLogs: true,
                dailyReports: true,
                incidents: true,
                documents: true,
                media: true,
                medicationLogs: true,
                locationTransitions: true,
              },
            },
          },
          orderBy: { id: "asc" },
        },
        guardians: {
          select: {
            id: true,
            familyId: true,
            userId: true,
            fullName: true,
            email: true,
            phone: true,
            employer: true,
            relation: true,
            preferredCommunication: true,
            isBillingContact: true,
            checkInPinHash: true,
            checkInPinSetAt: true,
            checkInPinSetById: true,
            sourceSystem: true,
            externalId: true,
            customFields: true,
            _count: { select: { checkLogs: true, dataDeletionRequests: true } },
          },
          orderBy: { id: "asc" },
        },
        pickups: { select: { id: true }, orderBy: { id: "asc" } },
        emergencyContacts: { select: { id: true }, orderBy: { id: "asc" } },
        billingAccount: {
          select: {
            id: true,
            balanceCents: true,
            _count: { select: { invoices: true, payments: true, ledgerEntries: true } },
          },
        },
        _count: {
          select: {
            messages: true,
            documents: true,
            notesList: true,
            surveyResponses: true,
            dataDeletionRequests: true,
            refundRequests: true,
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    db.child.findMany({
      where: { id: { in: REFERENCE_CHILD_IDS } },
      select: {
        id: true,
        familyId: true,
        classroomId: true,
        fullName: true,
        dateOfBirth: true,
        ageGroup: true,
        enrollmentStatus: true,
        startDate: true,
        sourceSystem: true,
        externalId: true,
        customFields: true,
        liveLocation: { select: { id: true } },
        _count: {
          select: {
            medicalNotes: true,
            allergies: true,
            enrollments: true,
            attendance: true,
            checkLogs: true,
            dailyReports: true,
            incidents: true,
            documents: true,
            media: true,
            medicationLogs: true,
            locationTransitions: true,
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    db.center.findUnique({
      where: { id: CENTER_ID },
      select: { classrooms: { where: { externalId: { in: ["1678", "1680", "1681", "1683"] } }, select: { id: true, name: true, externalId: true } } },
    }),
    db.child.findMany({
      where: { family: { centerId: CENTER_ID }, enrollmentStatus: "pending" },
      select: { id: true, fullName: true, externalId: true, familyId: true },
      orderBy: { id: "asc" },
    }),
    db.auditLog.count({ where: { centerId: CENTER_ID, action: AUDIT_ACTION } }),
    db.formSubmission.count({ where: { familyId: { in: [IDS.families.nebroNumeric, IDS.families.lacasseNumeric, IDS.families.wattonNumeric] } } }),
    Promise.all([
      db.family.count(),
      db.family.count({ where: { centerId: CENTER_ID } }),
      db.child.count(),
      db.child.count({ where: { family: { centerId: CENTER_ID } } }),
      db.guardian.count(),
      db.authorizedPickup.count(),
      db.emergencyContact.count(),
      db.billingAccount.count(),
      db.invoice.count(),
      db.payment.count(),
      db.ledgerEntry.count(),
      db.message.count(),
      db.user.count(),
      db.userAccessGrant.count(),
      db.auditLog.count({ where: { centerId: CENTER_ID } }),
    ]),
  ]);

  const [
    familiesTotal,
    centerFamilies,
    childrenTotal,
    centerChildren,
    guardiansTotal,
    pickupsTotal,
    emergencyContactsTotal,
    billingAccountsTotal,
    invoicesTotal,
    paymentsTotal,
    ledgerEntriesTotal,
    messagesTotal,
    usersTotal,
    accessGrantsTotal,
    centerAuditLogs,
  ] = boundaryRows;

  return {
    center,
    families,
    children,
    classrooms: classrooms?.classrooms ?? [],
    pendingChildren,
    auditCount,
    duplicateFormSubmissions,
    boundary: {
      familiesTotal,
      centerFamilies,
      childrenTotal,
      centerChildren,
      guardiansTotal,
      pickupsTotal,
      emergencyContactsTotal,
      billingAccountsTotal,
      invoicesTotal,
      paymentsTotal,
      ledgerEntriesTotal,
      messagesTotal,
      usersTotal,
      accessGrantsTotal,
      centerAuditLogs,
    },
  };
}

type State = Awaited<ReturnType<typeof readState>>;

function family(state: State, id: string) {
  const row = state.families.find((item) => item.id === id);
  invariant(row, `Family ${id} is missing.`);
  return row;
}

function child(state: State, id: string) {
  const row = state.children.find((item) => item.id === id)
    ?? state.families.flatMap((item) => item.children).find((item) => item.id === id);
  invariant(row, `Child ${id} is missing.`);
  return row;
}

function guardian(state: State, id: string) {
  const row = state.families.flatMap((item) => item.guardians).find((item) => item.id === id);
  invariant(row, `Guardian ${id} is missing.`);
  return row;
}

function room(state: State, externalId: string, expectedName: string) {
  const row = state.classrooms.find((item) => item.externalId === externalId);
  invariant(row?.name === expectedName, `Expected ${expectedName} classroom ${externalId}.`);
  return row;
}

function assertDisposableChild(row: ReturnType<typeof child>) {
  invariant(!row.liveLocation, `${row.fullName} has a live-location record.`);
  invariant(Object.values(row._count).every((count) => count === 0), `${row.fullName} has dependent history and cannot be removed.`);
}

function assertDisposableGuardian(row: ReturnType<typeof guardian>) {
  invariant(row._count.checkLogs === 0, `${row.fullName} has check-in/out history.`);
  invariant(row._count.dataDeletionRequests === 0, `${row.fullName} has a data-deletion request.`);
}

function assertArchiveSafe(row: ReturnType<typeof family>) {
  invariant(Object.values(row._count).every((count) => count === 0), `${row.name} has family history that was not included in the merge plan.`);
}

function assertShared(state: State) {
  invariant(state.center?.name === CENTER_NAME, `Expected ${CENTER_NAME}.`);
  invariant(state.center.status === "active", `${CENTER_NAME} is not active.`);
  invariant(state.families.length === TARGET_FAMILY_IDS.length, "A guarded Centennial family is missing.");
  room(state, "1678", "Caterpillars");
  room(state, "1680", "Fireflies");
  room(state, "1681", "Ladybugs");
  room(state, "1683", "Dragonflies");
  invariant(state.duplicateFormSubmissions === 0, "A duplicate family has a form submission that needs separate review.");
}

function assertPreRepair(state: State) {
  assertShared(state);
  invariant(state.auditCount === 0, "A prior Centennial family-profile repair audit already exists.");

  const young = family(state, IDS.families.young);
  invariant(young.centerId === CENTER_ID && young.name === "Young Household", "The Young family no longer matches preflight.");
  invariant(sameIds(young.children.map((item) => item.id), [IDS.children.youngEinarDuplicate, IDS.children.youngJuliaDuplicate, IDS.children.paulsen]), "The Young child list changed after review.");
  invariant(child(state, IDS.children.paulsen).enrollmentStatus === "enrolled", "Paulsen Young is no longer enrolled.");
  for (const id of [IDS.children.youngEinarDuplicate, IDS.children.youngJuliaDuplicate]) {
    const duplicate = child(state, id);
    invariant(duplicate.enrollmentStatus === "withdrawn", `${duplicate.fullName} is no longer withdrawn.`);
    assertDisposableChild(duplicate);
  }
  invariant(child(state, IDS.children.canonicalEinar).familyId !== IDS.families.young, "The canonical Einar Adame record is not separate from Young.");
  invariant(child(state, IDS.children.canonicalJulia).familyId !== IDS.families.young, "The canonical Julia Pilkington record is not separate from Young.");

  const lutes = family(state, IDS.families.lutes);
  invariant(lutes.centerId === CENTER_ID && lutes.children.length === 0 && lutes.guardians.length === 0, "The Lutes shell changed after review.");
  invariant(lutes.billingAccount?.id === IDS.billing.lutes && lutes.billingAccount.balanceCents === 45_200, "The Lutes balance changed after review.");

  const nebroNamed = family(state, IDS.families.nebroNamed);
  const nebroNumeric = family(state, IDS.families.nebroNumeric);
  invariant(nebroNamed.centerId === CENTER_ID && nebroNamed.children.length === 0 && nebroNamed.billingAccount === null, "The named Nebro profile changed after review.");
  invariant(nebroNumeric.centerId === CENTER_ID && sameIds(nebroNumeric.children.map((item) => item.externalId ?? ""), ["37739", "37740"]), "The numeric Nebro household changed after review.");
  invariant(nebroNumeric.billingAccount?.id === IDS.billing.nebro && nebroNumeric.billingAccount.balanceCents === 10_100, "The Nebro balance changed after review.");
  assertArchiveSafe(nebroNumeric);

  const lacasseNamed = family(state, IDS.families.lacasseNamed);
  const lacasseNumeric = family(state, IDS.families.lacasseNumeric);
  invariant(lacasseNamed.centerId === CENTER_ID && sameIds(lacasseNamed.children.map((item) => item.id), [IDS.children.lacasseRenderedLorenzo, IDS.children.lacasseRenderedLuciana]), "The named Lacasse profile changed after review.");
  invariant(lacasseNumeric.centerId === CENTER_ID && sameIds(lacasseNumeric.children.map((item) => item.id), [IDS.children.leonardo, IDS.children.lacasseNumericLorenzo, IDS.children.lacasseNumericLuciana]), "The numeric Lacasse household changed after review.");
  invariant(lacasseNamed.billingAccount === null && lacasseNumeric.billingAccount === null, "A Lacasse billing account needs separate review.");
  assertArchiveSafe(lacasseNumeric);
  for (const id of [IDS.children.lacasseNumericLorenzo, IDS.children.lacasseNumericLuciana]) assertDisposableChild(child(state, id));

  const wattonNamed = family(state, IDS.families.wattonNamed);
  const wattonNumeric = family(state, IDS.families.wattonNumeric);
  invariant(wattonNamed.centerId === CENTER_ID && sameIds(wattonNamed.children.map((item) => item.id), [IDS.children.sadie]), "The named Watton profile changed after review.");
  invariant(wattonNumeric.centerId === CENTER_ID && sameIds(wattonNumeric.children.map((item) => item.id), [IDS.children.noah]), "The numeric Watton household changed after review.");
  invariant(wattonNumeric.billingAccount?.id === IDS.billing.watton && wattonNumeric.billingAccount.balanceCents === 46_400, "The Watton balance changed after review.");
  assertArchiveSafe(wattonNumeric);

  for (const id of [
    IDS.guardians.nebroRenderedAlina,
    IDS.guardians.nebroRenderedDawit,
    IDS.guardians.lacasseNumericKristina,
    IDS.guardians.lacasseNumericDavid,
    IDS.guardians.lacasseNumericDavidExtra,
    IDS.guardians.wattonRenderedHollyanne,
    IDS.guardians.wattonRenderedGabriel,
  ]) assertDisposableGuardian(guardian(state, id));

  invariant(guardian(state, IDS.guardians.nebroRenderedAlina).userId === guardian(state, IDS.guardians.nebroNumericAlina).userId, "Alina Gebre's linked user differs across duplicate guardians.");
  invariant(guardian(state, IDS.guardians.nebroRenderedDawit).userId === guardian(state, IDS.guardians.nebroNumericDawit).userId, "Dawit Nebro's linked user differs across duplicate guardians.");
  invariant(guardian(state, IDS.guardians.wattonRenderedHollyanne).userId === guardian(state, IDS.guardians.wattonNumericHollyanne).userId, "Hollyanne Watton's linked user differs across duplicate guardians.");
  invariant(guardian(state, IDS.guardians.wattonRenderedGabriel).userId === guardian(state, IDS.guardians.wattonNumericGabriel).userId, "Gabriel Watton's linked user differs across duplicate guardians.");
  invariant(guardian(state, IDS.guardians.lacasseRenderedKristina).userId === guardian(state, IDS.guardians.lacasseNumericKristina).userId, "Kristina Ferreira's linked user differs across duplicate guardians.");

  const expectedWithdrawStatuses = new Map([
    [IDS.children.lukeOrell, "enrolled"],
    [IDS.children.babySlagle, "enrolled"],
    [IDS.children.babyBudrow, "pending"],
    [IDS.children.babyCarter, "pending"],
  ]);
  for (const [id, status] of expectedWithdrawStatuses) {
    invariant(child(state, id).enrollmentStatus === status, `Withdrawal target ${id} changed after review.`);
  }
  invariant(child(state, IDS.children.noah).enrollmentStatus === "pending", "Noah Watton is no longer pending.");
  invariant(child(state, IDS.children.leonardo).enrollmentStatus === "enrolled", "Leonardo Lacasse no longer matches the pre-repair import defect.");
  invariant(sameIds(state.pendingChildren.map((item) => item.externalId ?? ""), ["39980", "38643", "46749", "49676", "48888"]), "The Centennial pending-child list changed after review.");
}

function assertPostRepair(state: State, before?: State) {
  assertShared(state);
  invariant(state.auditCount === 1, "Expected one Centennial family-profile repair audit.");

  const young = family(state, IDS.families.young);
  invariant(young.centerId === CENTER_ID && sameIds(young.children.map((item) => item.id), [IDS.children.paulsen]), "Young Family does not contain only Paulsen.");

  const lutes = family(state, IDS.families.lutes);
  invariant(lutes.centerId === CENTER_ID && lutes.name === "Lutes Family", "Lutes Family is not active at Centennial.");
  invariant(sameIds(lutes.children.map((item) => item.externalId ?? ""), ["37721", "37722"]), "Lutes Family does not contain Asher and Waylon.");
  invariant(lutes.children.every((item) => item.enrollmentStatus === "enrolled"), "A Lutes child is not enrolled.");
  invariant(lutes.guardians.length === 1 && lutes.guardians[0].fullName === "Li Lutes" && lutes.guardians[0].relation === "Mother", "Li Lutes is not the Lutes guardian.");
  invariant(lutes.billingAccount?.id === IDS.billing.lutes && lutes.billingAccount.balanceCents === 45_200, "The Lutes balance was not preserved.");

  const nebroNamed = family(state, IDS.families.nebroNamed);
  const nebroNumeric = family(state, IDS.families.nebroNumeric);
  invariant(nebroNamed.centerId === CENTER_ID && nebroNamed.name === "Nebro Family" && nebroNamed.externalId === "34268", "Nebro Family was not consolidated.");
  invariant(sameIds(nebroNamed.children.map((item) => item.externalId ?? ""), ["37739", "37740"]), "Nebro Family children are incomplete.");
  invariant(nebroNamed.guardians.some((item) => item.fullName === "Alina Gebre" && item.relation === "Mother"), "Alina Gebre is not on Nebro Family.");
  invariant(nebroNamed.billingAccount?.id === IDS.billing.nebro && nebroNamed.billingAccount.balanceCents === 10_100, "The Nebro balance was not preserved.");
  invariant(nebroNumeric.centerId === null && nebroNumeric.children.length === 0 && nebroNumeric.guardians.length === 0 && nebroNumeric.billingAccount === null, "The duplicate Nebro household remains active.");

  const lacasseNamed = family(state, IDS.families.lacasseNamed);
  const lacasseNumeric = family(state, IDS.families.lacasseNumeric);
  invariant(lacasseNamed.centerId === CENTER_ID && lacasseNamed.name === "Lacasse Family" && lacasseNamed.externalId === "34250", "Lacasse Family was not consolidated.");
  invariant(sameIds(lacasseNamed.children.map((item) => item.externalId ?? ""), ["37716", "37717"]), "Lacasse Family does not contain only Lorenzo and Luciana.");
  invariant(lacasseNamed.children.every((item) => item.enrollmentStatus === "enrolled"), "A current Lacasse child is not enrolled.");
  invariant(lacasseNamed.guardians.some((item) => item.fullName === "Kristina Ferreira" && item.relation === "Mother"), "Kristina Ferreira is not on Lacasse Family.");
  invariant(lacasseNumeric.centerId === null && sameIds(lacasseNumeric.children.map((item) => item.id), [IDS.children.leonardo]), "The archived Lacasse household is not limited to Leonardo.");
  invariant(lacasseNumeric.children[0].enrollmentStatus === "withdrawn" && lacasseNumeric.children[0].classroomId === null, "Leonardo Lacasse was not retired from the current roster.");
  invariant(lacasseNumeric.guardians.length === 0, "Duplicate Lacasse guardians remain linked to the archived household.");

  const wattonNamed = family(state, IDS.families.wattonNamed);
  const wattonNumeric = family(state, IDS.families.wattonNumeric);
  invariant(wattonNamed.centerId === CENTER_ID && wattonNamed.externalId === "40327", "Hollyanne Watton Family was not consolidated.");
  invariant(sameIds(wattonNamed.children.map((item) => item.externalId ?? ""), ["46748", "46749"]), "The Watton children are incomplete.");
  invariant(wattonNamed.children.every((item) => item.enrollmentStatus === "enrolled"), "A Watton child is not enrolled.");
  invariant(wattonNamed.billingAccount?.id === IDS.billing.watton && wattonNamed.billingAccount.balanceCents === 46_400, "The Watton balance was not preserved.");
  invariant(wattonNumeric.centerId === null && wattonNumeric.children.length === 0 && wattonNumeric.guardians.length === 0 && wattonNumeric.billingAccount === null, "The duplicate Watton household remains active.");

  for (const id of WITHDRAW_CHILD_IDS) {
    const row = child(state, id);
    invariant(row.enrollmentStatus === "withdrawn" && row.classroomId === null, `${row.fullName} was not withdrawn and unassigned.`);
  }
  invariant(sameIds(state.pendingChildren.map((item) => item.externalId ?? ""), ["49676", "48888"]), "Only Averly Wisdom and Callen Gnacinski should remain pending.");

  if (!before) return;
  invariant(state.boundary.familiesTotal === before.boundary.familiesTotal, "Family rows changed unexpectedly.");
  invariant(state.boundary.centerFamilies === before.boundary.centerFamilies - 3, "Expected three duplicate family profiles to be archived.");
  invariant(state.boundary.childrenTotal === before.boundary.childrenTotal - 2, "Child inventory changed outside the reviewed duplicate/create plan.");
  invariant(state.boundary.centerChildren === before.boundary.centerChildren - 3, "Centennial child visibility changed outside the reviewed plan.");
  invariant(state.boundary.guardiansTotal === before.boundary.guardiansTotal - 6, "Guardian inventory changed outside the reviewed merge plan.");
  invariant(state.boundary.pickupsTotal === before.boundary.pickupsTotal, "Pickup inventory changed during family consolidation.");
  invariant(state.boundary.emergencyContactsTotal === before.boundary.emergencyContactsTotal, "Emergency-contact inventory changed during family consolidation.");
  for (const key of ["billingAccountsTotal", "invoicesTotal", "paymentsTotal", "ledgerEntriesTotal", "messagesTotal", "usersTotal", "accessGrantsTotal"] as const) {
    invariant(state.boundary[key] === before.boundary[key], `${key} changed unexpectedly.`);
  }
  invariant(state.boundary.centerAuditLogs === before.boundary.centerAuditLogs + 1, "Expected one new Centennial audit log.");
}

async function mergeGuardian(input: {
  tx: Prisma.TransactionClient;
  keepId: string;
  removeId: string;
  familyId: string;
  fullName: string;
  relation?: string;
  externalId?: string;
  repairedAt: string;
}) {
  const [keep, remove] = await Promise.all([
    input.tx.guardian.findUnique({ where: { id: input.keepId } }),
    input.tx.guardian.findUnique({ where: { id: input.removeId } }),
  ]);
  invariant(keep && remove, "A guarded duplicate guardian disappeared during repair.");
  invariant(!keep.userId || !remove.userId || keep.userId === remove.userId, `Guardian user links differ for ${input.fullName}.`);

  await Promise.all([
    input.tx.checkInOutLog.updateMany({ where: { guardianId: input.removeId }, data: { guardianId: input.keepId } }),
    input.tx.dataDeletionRequest.updateMany({ where: { guardianId: input.removeId }, data: { guardianId: input.keepId, familyId: input.familyId } }),
  ]);
  await input.tx.guardian.update({
    where: { id: input.keepId },
    data: {
      familyId: input.familyId,
      userId: keep.userId ?? remove.userId,
      fullName: input.fullName,
      email: keep.email ?? remove.email,
      phone: keep.phone ?? remove.phone,
      employer: keep.employer ?? remove.employer,
      relation: input.relation ?? keep.relation,
      preferredCommunication: keep.preferredCommunication ?? remove.preferredCommunication,
      isBillingContact: keep.isBillingContact || remove.isBillingContact,
      checkInPinHash: keep.checkInPinHash ?? remove.checkInPinHash,
      checkInPinSetAt: keep.checkInPinSetAt ?? remove.checkInPinSetAt,
      checkInPinSetById: keep.checkInPinSetById ?? remove.checkInPinSetById,
      sourceSystem: "procare",
      externalId: input.externalId ?? keep.externalId,
      customFields: repairFields([remove.customFields, keep.customFields], {
        source: REPAIR_SOURCE,
        mergedGuardianId: input.removeId,
        repairedAt: input.repairedAt,
      }),
    },
  });
  await input.tx.guardian.delete({ where: { id: input.removeId } });
}

function publicSummary(state: State) {
  return {
    center: CENTER_NAME,
    youngChildren: family(state, IDS.families.young).children.map((item) => item.fullName),
    lutes: family(state, IDS.families.lutes).children.map((item) => item.fullName),
    nebro: family(state, IDS.families.nebroNamed).children.map((item) => item.fullName),
    lacasse: family(state, IDS.families.lacasseNamed).children.map((item) => item.fullName),
    watton: family(state, IDS.families.wattonNamed).children.map((item) => ({ name: item.fullName, status: item.enrollmentStatus })),
    withdrawalTargets: WITHDRAW_CHILD_IDS.map((id) => ({ name: child(state, id).fullName, status: child(state, id).enrollmentStatus })),
    pendingChildren: state.pendingChildren.map((item) => item.fullName),
    balancesPreservedCents: {
      lutes: family(state, IDS.families.lutes).billingAccount?.balanceCents ?? null,
      nebro: family(state, IDS.families.nebroNamed).billingAccount?.balanceCents ?? family(state, IDS.families.nebroNumeric).billingAccount?.balanceCents ?? null,
      watton: family(state, IDS.families.wattonNamed).billingAccount?.balanceCents ?? family(state, IDS.families.wattonNumeric).billingAccount?.balanceCents ?? null,
    },
  };
}

async function main() {
  for (const source of SOURCE_FILES) {
    invariant(sha256(source.path) === source.sha256, `Source file changed after review: ${source.path}`);
  }

  const apply = process.argv.includes(APPLY_FLAG);
  const confirmed = process.argv.includes(CONFIRM_FLAG);
  const initial = await readState(prisma);

  if (initial.auditCount === 1) {
    assertPostRepair(initial);
    console.log(JSON.stringify({ ok: true, applied: false, alreadyRepaired: true, state: publicSummary(initial) }, null, 2));
    return;
  }

  assertPreRepair(initial);
  if (!apply) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      wouldRemoveYoungDuplicateChildren: 2,
      wouldCreateLutesGuardian: 1,
      wouldCreateLutesChildren: 2,
      wouldConsolidateFamilyProfiles: ["Nebro", "Lacasse", "Watton"],
      wouldWithdrawChildren: 5,
      wouldEnrollNoahWatton: true,
      pendingChildrenIntentionallyRetained: ["Averly Wisdom", "Callen Gnacinski"],
      billingBalancesChanged: false,
      paymentsChanged: false,
      invoicesChanged: false,
      identitiesChanged: false,
      authChanged: false,
      invitationsChanged: false,
      messagesChanged: false,
      state: publicSummary(initial),
    }, null, 2));
    return;
  }
  invariant(confirmed, `Apply mode requires ${CONFIRM_FLAG}.`);

  const result = await prisma.$transaction(async (tx) => {
    const before = await readState(tx);
    assertPreRepair(before);
    const repairedAt = new Date().toISOString();
    const ladybugs = room(before, "1681", "Ladybugs");
    const dragonflies = room(before, "1683", "Dragonflies");
    const fireflies = room(before, "1680", "Fireflies");

    const removedYoung = await tx.child.deleteMany({
      where: { id: { in: [IDS.children.youngEinarDuplicate, IDS.children.youngJuliaDuplicate] }, familyId: IDS.families.young },
    });
    invariant(removedYoung.count === 2, `Expected to remove two erroneous Young children; removed ${removedYoung.count}.`);

    const lutesBefore = family(before, IDS.families.lutes);
    await tx.family.update({
      where: { id: IDS.families.lutes },
      data: {
        name: "Lutes Family",
        customFields: repairFields([lutesBefore.customFields], {
          source: REPAIR_SOURCE,
          procareAccountId: "34254",
          accountResolution: "Li Lutes",
          repairedAt,
        }),
      },
    });
    await tx.guardian.create({
      data: {
        familyId: IDS.families.lutes,
        fullName: "Li Lutes",
        relation: "Mother",
        sourceSystem: "procare",
        externalId: "210701",
        customFields: { source: REPAIR_SOURCE, procareAccountId: "34254", repairedAt },
      },
    });
    await tx.child.createMany({
      data: [
        {
          familyId: IDS.families.lutes,
          classroomId: ladybugs.id,
          fullName: "Asher Lutes",
          dateOfBirth: date("2024-03-03"),
          ageGroup: ladybugs.name,
          enrollmentStatus: "enrolled",
          startDate: date("2025-02-23"),
          sourceSystem: "procare",
          externalId: "37721",
          customFields: { source: REPAIR_SOURCE, procarePersonId: "210703", sourceReportStatus: "Enrolled", repairedAt },
        },
        {
          familyId: IDS.families.lutes,
          classroomId: dragonflies.id,
          fullName: "Waylon Lutes",
          dateOfBirth: date("2020-12-01"),
          ageGroup: dragonflies.name,
          enrollmentStatus: "enrolled",
          startDate: date("2025-02-23"),
          sourceSystem: "procare",
          externalId: "37722",
          customFields: { source: REPAIR_SOURCE, procarePersonId: "210704", sourceReportStatus: "Enrolled", repairedAt },
        },
      ],
    });

    const nebroNamed = family(before, IDS.families.nebroNamed);
    const nebroNumeric = family(before, IDS.families.nebroNumeric);
    await mergeGuardian({ tx, keepId: IDS.guardians.nebroNumericAlina, removeId: IDS.guardians.nebroRenderedAlina, familyId: IDS.families.nebroNamed, fullName: "Alina Gebre", relation: "Mother", externalId: "210749", repairedAt });
    await mergeGuardian({ tx, keepId: IDS.guardians.nebroNumericDawit, removeId: IDS.guardians.nebroRenderedDawit, familyId: IDS.families.nebroNamed, fullName: "Dawit Nebro", externalId: "210750", repairedAt });
    await Promise.all([
      tx.authorizedPickup.updateMany({ where: { familyId: IDS.families.nebroNumeric }, data: { familyId: IDS.families.nebroNamed } }),
      tx.emergencyContact.updateMany({ where: { familyId: IDS.families.nebroNumeric }, data: { familyId: IDS.families.nebroNamed } }),
      tx.child.updateMany({ where: { familyId: IDS.families.nebroNumeric }, data: { familyId: IDS.families.nebroNamed } }),
      tx.billingAccount.update({ where: { id: IDS.billing.nebro }, data: { familyId: IDS.families.nebroNamed } }),
    ]);
    await tx.family.update({
      where: { id: IDS.families.nebroNamed },
      data: {
        name: "Nebro Family",
        externalId: "34268",
        address: nebroNamed.address ?? nebroNumeric.address,
        billingEmail: nebroNamed.billingEmail ?? nebroNumeric.billingEmail,
        customFields: repairFields([nebroNumeric.customFields, nebroNamed.customFields], { source: REPAIR_SOURCE, mergedFamilyId: IDS.families.nebroNumeric, procareAccountKey: "NEBRO", repairedAt }),
      },
    });
    await tx.family.update({
      where: { id: IDS.families.nebroNumeric },
      data: { centerId: null, name: "[Merged] Gebre Household", externalId: "merged:34268", customFields: repairFields([nebroNumeric.customFields], { source: REPAIR_SOURCE, mergedIntoFamilyId: IDS.families.nebroNamed, repairedAt }) },
    });

    const lacasseNamed = family(before, IDS.families.lacasseNamed);
    const lacasseNumeric = family(before, IDS.families.lacasseNumeric);
    const numericLorenzo = child(before, IDS.children.lacasseNumericLorenzo);
    const numericLuciana = child(before, IDS.children.lacasseNumericLuciana);
    const renderedLorenzo = child(before, IDS.children.lacasseRenderedLorenzo);
    const renderedLuciana = child(before, IDS.children.lacasseRenderedLuciana);
    await tx.child.update({
      where: { id: IDS.children.lacasseRenderedLorenzo },
      data: { dateOfBirth: date("2021-10-05"), classroomId: dragonflies.id, ageGroup: dragonflies.name, enrollmentStatus: "enrolled", startDate: numericLorenzo.startDate, sourceSystem: "procare", externalId: "37716", customFields: repairFields([numericLorenzo.customFields, renderedLorenzo.customFields], { source: REPAIR_SOURCE, mergedChildId: IDS.children.lacasseNumericLorenzo, repairedAt }) },
    });
    await tx.child.update({
      where: { id: IDS.children.lacasseRenderedLuciana },
      data: { dateOfBirth: date("2023-07-21"), classroomId: fireflies.id, ageGroup: fireflies.name, enrollmentStatus: "enrolled", startDate: numericLuciana.startDate, sourceSystem: "procare", externalId: "37717", customFields: repairFields([numericLuciana.customFields, renderedLuciana.customFields], { source: REPAIR_SOURCE, mergedChildId: IDS.children.lacasseNumericLuciana, repairedAt }) },
    });
    const removedLacasseChildren = await tx.child.deleteMany({ where: { id: { in: [IDS.children.lacasseNumericLorenzo, IDS.children.lacasseNumericLuciana] }, familyId: IDS.families.lacasseNumeric } });
    invariant(removedLacasseChildren.count === 2, "Expected to remove two duplicate Lacasse child rows.");
    const leonardoBefore = child(before, IDS.children.leonardo);
    await tx.child.update({ where: { id: IDS.children.leonardo }, data: { enrollmentStatus: "withdrawn", classroomId: null, customFields: repairFields([leonardoBefore.customFields], { source: REPAIR_SOURCE, sourceReportStatus: "Withdrawn", repairedAt }) } });
    await mergeGuardian({ tx, keepId: IDS.guardians.lacasseRenderedKristina, removeId: IDS.guardians.lacasseNumericKristina, familyId: IDS.families.lacasseNamed, fullName: "Kristina Ferreira", relation: "Mother", externalId: "210688", repairedAt });
    await mergeGuardian({ tx, keepId: IDS.guardians.lacasseRenderedDavid, removeId: IDS.guardians.lacasseNumericDavid, familyId: IDS.families.lacasseNamed, fullName: "David Lacasse", externalId: "210687", repairedAt });
    await mergeGuardian({ tx, keepId: IDS.guardians.lacasseRenderedDavid, removeId: IDS.guardians.lacasseNumericDavidExtra, familyId: IDS.families.lacasseNamed, fullName: "David Lacasse", externalId: "210687", repairedAt });
    await Promise.all([
      tx.authorizedPickup.updateMany({ where: { familyId: IDS.families.lacasseNumeric }, data: { familyId: IDS.families.lacasseNamed } }),
      tx.emergencyContact.updateMany({ where: { familyId: IDS.families.lacasseNumeric }, data: { familyId: IDS.families.lacasseNamed } }),
    ]);
    await tx.family.update({ where: { id: IDS.families.lacasseNamed }, data: { name: "Lacasse Family", externalId: "34250", address: lacasseNamed.address ?? lacasseNumeric.address, billingEmail: lacasseNamed.billingEmail ?? lacasseNumeric.billingEmail, customFields: repairFields([lacasseNumeric.customFields, lacasseNamed.customFields], { source: REPAIR_SOURCE, mergedFamilyId: IDS.families.lacasseNumeric, procareAccountKey: "LACASSE", repairedAt }) } });
    await tx.family.update({ where: { id: IDS.families.lacasseNumeric }, data: { centerId: null, name: "[Archived] Leonardo Lacasse", externalId: "archived:34250:37715", customFields: repairFields([lacasseNumeric.customFields], { source: REPAIR_SOURCE, mergedIntoFamilyId: IDS.families.lacasseNamed, retainedWithdrawnChildId: IDS.children.leonardo, repairedAt }) } });

    const wattonNamed = family(before, IDS.families.wattonNamed);
    const wattonNumeric = family(before, IDS.families.wattonNumeric);
    const sadieBefore = child(before, IDS.children.sadie);
    const noahBefore = child(before, IDS.children.noah);
    await tx.child.update({ where: { id: IDS.children.sadie }, data: { dateOfBirth: date("2023-07-19"), classroomId: fireflies.id, ageGroup: fireflies.name, enrollmentStatus: "enrolled", sourceSystem: "procare", externalId: "46748", customFields: repairFields([sadieBefore.customFields], { source: REPAIR_SOURCE, sourceReportStatus: "Enrolled", repairedAt }) } });
    await tx.child.update({ where: { id: IDS.children.noah }, data: { familyId: IDS.families.wattonNamed, classroomId: dragonflies.id, ageGroup: dragonflies.name, enrollmentStatus: "enrolled", customFields: repairFields([noahBefore.customFields], { source: REPAIR_SOURCE, sourceReportStatus: "Enrolled", repairedAt }) } });
    await mergeGuardian({ tx, keepId: IDS.guardians.wattonNumericHollyanne, removeId: IDS.guardians.wattonRenderedHollyanne, familyId: IDS.families.wattonNamed, fullName: "Hollyanne Watton", externalId: "233354", repairedAt });
    await mergeGuardian({ tx, keepId: IDS.guardians.wattonNumericGabriel, removeId: IDS.guardians.wattonRenderedGabriel, familyId: IDS.families.wattonNamed, fullName: "Gabriel Watton", externalId: "233355", repairedAt });
    await Promise.all([
      tx.authorizedPickup.updateMany({ where: { familyId: IDS.families.wattonNumeric }, data: { familyId: IDS.families.wattonNamed } }),
      tx.emergencyContact.updateMany({ where: { familyId: IDS.families.wattonNumeric }, data: { familyId: IDS.families.wattonNamed } }),
      tx.billingAccount.update({ where: { id: IDS.billing.watton }, data: { familyId: IDS.families.wattonNamed } }),
    ]);
    await tx.family.update({ where: { id: IDS.families.wattonNamed }, data: { externalId: "40327", address: wattonNamed.address ?? wattonNumeric.address, billingEmail: wattonNamed.billingEmail ?? wattonNumeric.billingEmail, customFields: repairFields([wattonNumeric.customFields, wattonNamed.customFields], { source: REPAIR_SOURCE, mergedFamilyId: IDS.families.wattonNumeric, procareAccountKey: "WATTON", repairedAt }) } });
    await tx.family.update({ where: { id: IDS.families.wattonNumeric }, data: { centerId: null, name: "[Merged] Watton Household", externalId: "merged:40327", customFields: repairFields([wattonNumeric.customFields], { source: REPAIR_SOURCE, mergedIntoFamilyId: IDS.families.wattonNamed, repairedAt }) } });

    let withdrawn = 0;
    for (const id of WITHDRAW_CHILD_IDS) {
      const beforeChild = child(before, id);
      const updated = await tx.child.updateMany({
        where: { id, family: { centerId: CENTER_ID } },
        data: { enrollmentStatus: "withdrawn", classroomId: null, customFields: repairFields([beforeChild.customFields], { source: REPAIR_SOURCE, sourceReportStatus: "Withdrawn", repairedAt }) },
      });
      invariant(updated.count === 1, `Expected to withdraw ${beforeChild.fullName}.`);
      withdrawn += updated.count;
    }

    await tx.auditLog.create({
      data: {
        tenantId: before.center!.organization.tenantId,
        centerId: CENTER_ID,
        action: AUDIT_ACTION,
        resource: "Center",
        resourceId: CENTER_ID,
        metadata: {
          source: REPAIR_SOURCE,
          authorization: "user_requested_centennial_family_profile_and_enrollment_repair",
          sourceFiles: SOURCE_FILES.map((item) => ({ path: item.path, sha256: item.sha256 })),
          youngDuplicateChildrenRemoved: removedYoung.count,
          lutesGuardianCreated: 1,
          lutesChildrenCreated: 2,
          consolidatedFamilies: ["Nebro", "Lacasse", "Watton"],
          lacasseDuplicateChildrenRemoved: removedLacasseChildren.count,
          sourceBackedWithdrawals: withdrawn + 1,
          noahWattonEnrolled: true,
          sadieWattonEnrolledFromSource: true,
          pendingChildrenIntentionallyRetained: ["Averly Wisdom", "Callen Gnacinski"],
          billingBalancesChanged: false,
          paymentsChanged: false,
          invoicesChanged: false,
          authChanged: false,
          invitationsChanged: false,
          messagesChanged: false,
          repairedAt,
        },
      },
    });

    const after = await readState(tx);
    assertPostRepair(after, before);
    return {
      removedYoungChildren: removedYoung.count,
      createdLutesChildren: 2,
      consolidatedFamilies: 3,
      removedDuplicateLacasseChildren: removedLacasseChildren.count,
      withdrawnChildren: withdrawn + 1,
      pendingChildrenRetained: 2,
    };
  }, { maxWait: 10_000, timeout: 180_000 });

  const finalState = await readState(prisma);
  assertPostRepair(finalState);
  console.log(JSON.stringify({ ok: true, applied: true, result, state: publicSummary(finalState) }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
