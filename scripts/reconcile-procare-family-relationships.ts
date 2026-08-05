import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import {
  buildProcareRelationshipDataset,
  missingProcareGuardianContactFields,
  normalizedDate,
  procareRelationshipGuardian,
  type ProcareAccountSource,
  type ProcareChildRelationshipSource,
  type ProcareSourcePerson,
} from "@/lib/procare-family-relationship-reconciliation";
import { normalizeProcareEnrollmentStatus } from "@/lib/procare-import-fields";
import { prisma } from "@/lib/prisma";

const APPLY_FLAG = "--apply";
const CONFIRM_OPTION = "--confirm-fingerprint";
const SCHOOL_OPTION = "--school";
const REPAIR_SOURCE = "procare_family_relationship_reconciliation_v2";
const AUDIT_ACTION = "operations.procare_family_relationships.reconciled";

type ReviewedSource = {
  centerId: string;
  centerName: string;
  locationId: string;
  exportDate: string;
  accountSha: string;
  relationshipSha: string;
};

const REVIEWED_SOURCES = {
  "corpus-christi": {
    centerId: "85f871b5-b20d-4107-b5de-91d3014a1fb0",
    centerName: "Kid City USA - Corpus Christi",
    locationId: "Kid City USA - TX | Corpus Christi",
    exportDate: "2026-08-04",
    accountSha: "6ca58b8c3b088e7ee79797704e604cdeb331318ccb2ff206fc0b7427cabf204e",
    relationshipSha: "30e99c1f14308457e466277b59d08c66bdaa4ad49f58dc47443f287718df1a09",
  },
  centennial: {
    centerId: "cms3g2the000i6a7wdd8pa20s",
    centerName: "Miss Honey's Learning Center - Centennial",
    locationId: "Miss Honey's Learning Center - CO | Centennial",
    exportDate: "2026-08-04",
    accountSha: "efef8cd2067aefa049b450136c962193d14405bd9ee1ce1ff1ffc64f58bd2ab9",
    relationshipSha: "b1d87e77f04ad45fa58e4402ce87717458630a980ad9767e16c8bdfc12f73fb1",
  },
  longmont: {
    centerId: "cmp4ew6f3000a6alwmz62n7w2",
    centerName: "Kid City USA - Longmont",
    locationId: "Kid City USA - CO | Longmont",
    exportDate: "2026-08-04",
    accountSha: "322e51322134129d33a35979e7a96229e274beb87c2f89ee867c042437ea30e6",
    relationshipSha: "0001c7c3623000a45f6841d63f2a10d950419356f26d3e9af777c112090570ab",
  },
  "holly-hill": {
    centerId: "cmp4ew8u4001c6alwq674ue16",
    centerName: "Kid City USA - Holly Hill",
    locationId: "Kid City USA - FL | Holly Hill",
    exportDate: "2026-08-04",
    accountSha: "5b4a8393f8578e8873320db54d946839c94e2980f8d3650fefbe26cdcb83f111",
    relationshipSha: "3a851887fc0b500304f2a87e515251030481b28021c213ab3a864554616a2c75",
  },
  "beach-blvd": {
    centerId: "cmp4ew8yo001e6alw32jneo3w",
    centerName: "Kid City USA - Beach Blvd",
    locationId: "Kid City USA - FL | Jacksonville - Beach",
    exportDate: "2026-08-04",
    accountSha: "903627fdd7ae5f9944e885f134f06dd3a9b2764c8f3fd72db3b40bd5a374eda3",
    relationshipSha: "d3cc67c522dcbee8cb6afad8e8ade6650b7e05d55bbb949f1c8551c4ad0ea6fe",
  },
  granbury: {
    centerId: "cmp4ewhge00526alw7t62nwg4",
    centerName: "Kid City USA - Granbury",
    locationId: "Kid City USA - TX | Granbury",
    exportDate: "2026-08-04",
    accountSha: "db29a8c512067d3cb5639eeebbd459655dea857a0cf058b6c442f9507b863377",
    relationshipSha: "dc39738a6ec77e464e0914a253292ea363e5693c1ca9670799da96d4421e06f4",
  },
  lincolnton: {
    centerId: "cms3g2uxn000s6a7w8xu1llok",
    centerName: "Miss Honey's Learning Center - Lincolnton",
    locationId: "Miss Honey's Learning Center - NC | Lincolnton",
    exportDate: "2026-08-04",
    accountSha: "3a8dcb911f4e2ca8f15a96e738d9e183d2baabda67525b7498c924eead76e0c2",
    relationshipSha: "d996322a996a792b0499386b0612570af0af3bf6d4611c5132ce7ca6afa4a0c0",
  },
  garland: {
    centerId: "cmp4ewh78004y6alwu6s3bsv4",
    centerName: "Kid City USA - Garland",
    locationId: "Kid City USA - TX | Garland",
    exportDate: "2026-08-04",
    accountSha: "8eeb9bd97945ba11326b499ef04d101838afa94e6c4efbd507aa8b8587a8cae9",
    relationshipSha: "9d024c2e3dd1386bead4d1d31b5f99c2cb1a305d46eb639f59ae35edb12d8b6d",
  },
  sarasota: {
    centerId: "cmp4ewca2002u6alw7c4lrusd",
    centerName: "Kid City USA - Sarasota",
    locationId: "Kid City USA - FL | Sarasota",
    exportDate: "2026-08-04",
    accountSha: "75a8c80a584b029e2966197c4bdfa1646cb05ee2edc93a2c380517d97ef53b04",
    relationshipSha: "b2465a6e0002259b2b4f54eea24e2eb38a23b38af0072461231b48fca2d369b4",
  },
  "pisgah-forest": {
    centerId: "cmp4ewg8w004k6alwid0bwiur",
    centerName: "Kid City USA - Pisgah Forest",
    locationId: "Kid City USA - NC | Pisgah Forest",
    exportDate: "2026-08-04",
    accountSha: "7c7742b0a4a360977b0d84ba85ab1a343a9eba508d5ec093afebbeadcee2b20e",
    relationshipSha: "e21993bbc66ca81028e7d1b15622dd43d01ea3c38dea4c8d3a962435e6a98fc1",
  },
  petersburg: {
    centerId: "cmp4ewf8500446alwfm6uywyl",
    centerName: "Kid City USA - Petersburg",
    locationId: "Kid City USA - IN | Petersburg",
    exportDate: "2026-08-04",
    accountSha: "b07d8bdb377d874f742c50fb098c910a1977de41172fdf07e15184c4f169ec55",
    relationshipSha: "9d0701e22cb33bb931a4c8097e65669b5fc2731a7c537b382b24356748177181",
  },
  cordera: {
    centerId: "cmp4ew5yx00046alw8i1yf63m",
    centerName: "Kid City USA - Cordera (Colorado Springs)",
    locationId: "Kid City USA - CO | Colorado Springs - Cordera",
    exportDate: "2026-08-04",
    accountSha: "273887ee6f390072965bdb820e7138e81194cbba7e4d297e66f110b6dcd56bac",
    relationshipSha: "3681a25a9d78ab41726e8745f953045b89d55cf0df3e8c81eaac1a41eb4ec550",
  },
  canton: {
    centerId: "cmp4ewg4a004i6alwl5c6i3w4",
    centerName: "Kid City USA - Canton",
    locationId: "Kid City USA - NC | Canton",
    exportDate: "2026-08-04",
    accountSha: "bbf262b5a6b62534ffdcda208fd7c4d52ade7009aec36fa9bf7c2a6920c304f4",
    relationshipSha: "f79e737321f310dcff233e189dce1eaaeb9d15e32b98b227f8500ae63778f7e5",
  },
} as const satisfies Record<string, ReviewedSource>;

type ReviewedSchoolKey = keyof typeof REVIEWED_SOURCES;

type FamilyState = Awaited<ReturnType<typeof readState>>["families"][number];
type ChildState = FamilyState["children"][number];

type DesiredPerson = {
  externalId: string;
  fullName: string;
  email: string;
  phone: string;
  relation: string;
  billingContact: boolean;
  sourceChildIds: string[];
};

type PlanAccount = {
  accountId: string;
  familyId: string;
  sourceChildIds: string[];
  childUpdates: Array<{ id: string; externalId: string; moveFamily: boolean; changeExternalId: boolean }>;
  familyUpdate: { id: string; externalId: string } | null;
  guardianCreates: Prisma.GuardianUncheckedCreateInput[];
  guardianUpdates: Array<{ id: string; data: Prisma.GuardianUncheckedUpdateInput }>;
  guardianDeletes: string[];
  emergencyCreates: Prisma.EmergencyContactUncheckedCreateInput[];
  emergencyUpdates: Array<{ id: string; data: Prisma.EmergencyContactUncheckedUpdateInput }>;
  emergencyDeletes: string[];
  pickupCreates: Prisma.AuthorizedPickupUncheckedCreateInput[];
  pickupUpdates: Array<{ id: string; data: Prisma.AuthorizedPickupUncheckedUpdateInput }>;
  pickupDeletes: string[];
  held: Record<string, number>;
  expectedFamilyStateHash: string;
};

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() ?? "" : "";
}

function requiredOption(name: string) {
  const found = option(name);
  if (!found) throw new Error(`Missing required option ${name}.`);
  return found;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function familyStateHash(family: FamilyState) {
  return sha256(stableJson(family));
}

function sameJson(left: unknown, right: unknown) {
  return stableJson(left) === stableJson(right);
}

function metadata(input: {
  accountSha: string;
  relationshipSha: string;
  accountId: string;
  sourceChildIds: string[];
}) {
  return {
    version: 1,
    source: REPAIR_SOURCE,
    accountSha256: input.accountSha,
    relationshipSha256: input.relationshipSha,
    accountId: input.accountId,
    sourceChildIds: [...input.sourceChildIds].sort(),
  } satisfies Prisma.InputJsonObject;
}

function mergedFields(
  current: Prisma.JsonValue | null | undefined,
  repairMetadata: Prisma.InputJsonObject,
) {
  return {
    ...jsonObject(current),
    procareFamilyRelationshipReconciliation: repairMetadata,
  } as Prisma.InputJsonObject;
}

function increment(counts: Record<string, number>, key: string, amount = 1) {
  counts[key] = (counts[key] ?? 0) + amount;
}

function normalizedRelation(value: string) {
  return value.trim().toLowerCase() === "unknown" ? "" : value.trim();
}

function normalizedPhone(value: string | null | undefined) {
  return clean(value).replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

function normalizedIdentityName(value: string) {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).sort().join("\0");
}

const RELATIONSHIP_ACTIVE_STATUSES = new Set([
  "enrolled",
  "pending",
  "waitlisted",
  "tour_scheduled",
  "summer_break",
  "drop_in",
]);

function relationshipStatusInScope(value: string | null | undefined) {
  return Boolean(clean(value)) && RELATIONSHIP_ACTIVE_STATUSES.has(normalizeProcareEnrollmentStatus(clean(value), ""));
}

function productionRelationshipInScope(child: Pick<ChildState, "enrollmentStatus" | "classroomId">) {
  return Boolean(child.classroomId) || relationshipStatusInScope(child.enrollmentStatus);
}

function chooseContact(rows: ProcareSourcePerson[], payer?: ProcareSourcePerson): DesiredPerson | null {
  const all = payer ? [payer, ...rows] : rows;
  const personId = all.map((item) => item.personId).find(Boolean) ?? "";
  if (!personId) return null;
  const names = [...new Map(all.filter((item) => item.fullName).map((item) => [normalizedIdentityName(item.fullName), item.fullName])).values()];
  const emails = [...new Set(all.map((item) => item.email.toLowerCase()).filter(Boolean))];
  const phones = [...new Set(all.map((item) => item.phone).filter(Boolean))];
  const relations = [...new Set(rows.map((item) => normalizedRelation(item.relation)).filter(Boolean))];
  if (names.length > 1 || emails.length > 1 || phones.length > 1 || relations.length > 1) return null;
  return {
    externalId: personId,
    fullName: names[0] ?? personId,
    email: emails[0] ?? "",
    phone: phones[0] ?? "",
    relation: relations[0] ?? "",
    billingContact: Boolean(payer),
    sourceChildIds: [],
  };
}

function desiredRelationships(account: ProcareAccountSource, children: ProcareChildRelationshipSource[]) {
  const guardians = new Map<string, DesiredPerson>();
  const emergencies = new Map<string, DesiredPerson>();
  const pickups = new Map<string, DesiredPerson>();
  const conflict = {
    guardian: new Set<string>(),
    emergency: new Set<string>(),
    pickup: new Set<string>(),
    identity: new Set<string>(),
  };
  const payerById = new Map(account.payers.map((payer) => [payer.personId, payer]));
  const contactIds = new Set(children.flatMap((child) => child.contacts.map((contact) => contact.personId)));

  for (const payer of account.payers) {
    const rows = children.flatMap((child) => child.contacts.filter((contact) => contact.personId === payer.personId));
    const desired = chooseContact(rows, payer);
    if (!desired) {
      conflict.identity.add(payer.personId);
      conflict.guardian.add(payer.personId);
      continue;
    }
    desired.billingContact = true;
    desired.sourceChildIds = children.map((child) => child.childId).sort();
    guardians.set(payer.personId, desired);
  }

  for (const personId of contactIds) {
    const rows = children.flatMap((child) => child.contacts.filter((contact) => contact.personId === personId));
    const desired = chooseContact(rows, payerById.get(personId));
    if (!desired) {
      conflict.identity.add(personId);
      conflict.guardian.add(personId);
      conflict.emergency.add(personId);
      conflict.pickup.add(personId);
      continue;
    }
    desired.sourceChildIds = children
      .filter((child) => child.contacts.some((contact) => contact.personId === personId))
      .map((child) => child.childId)
      .sort();
    const states = children.map((child) => {
      const contacts = child.contacts.filter((contact) => contact.personId === personId);
      return {
        guardian: contacts.some(procareRelationshipGuardian),
        emergency: contacts.some((contact) => contact.emergency),
        pickup: contacts.some((contact) => contact.authorizedPickup),
      };
    });
    const place = (key: "guardian" | "emergency" | "pickup", target: Map<string, DesiredPerson>) => {
      const checked = states.filter((state) => state[key]).length;
      if (checked === states.length) target.set(personId, { ...desired, billingContact: payerById.has(personId) });
      else if (checked > 0) conflict[key].add(personId);
    };
    if (!payerById.has(personId)) place("guardian", guardians);
    place("emergency", emergencies);
    place("pickup", pickups);
  }
  return { guardians, emergencies, pickups, conflict };
}

const familyStateSelect = {
  id: true,
  centerId: true,
  externalId: true,
  sourceSystem: true,
  customFields: true,
  children: {
    select: {
      id: true,
      familyId: true,
      fullName: true,
      dateOfBirth: true,
      enrollmentStatus: true,
      classroomId: true,
      externalId: true,
      sourceSystem: true,
      customFields: true,
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
      relation: true,
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
  emergencyContacts: {
    select: { id: true, familyId: true, fullName: true, phone: true, relation: true, sourceSystem: true, externalId: true, customFields: true },
    orderBy: { id: "asc" },
  },
  pickups: {
    select: { id: true, familyId: true, fullName: true, phone: true, relation: true, verificationNotes: true, sourceSystem: true, externalId: true, customFields: true },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.FamilySelect;

async function readState(centerId: string) {
  const [center, families, setupTokens] = await Promise.all([
    prisma.center.findUnique({
      where: { id: centerId },
      select: { id: true, name: true, locationId: true, status: true, organization: { select: { tenantId: true } } },
    }),
    prisma.family.findMany({
      where: { centerId },
      select: familyStateSelect,
      orderBy: { id: "asc" },
    }),
    prisma.parentPortalSetupToken.findMany({ where: { centerId }, select: { guardianId: true }, orderBy: { guardianId: "asc" } }),
  ]);
  return { center, families, setupTokenGuardianIds: setupTokens.map((token) => token.guardianId) };
}

async function boundary(centerId: string) {
  const [billingAccounts, invoices, payments, ledgerEntries, messages, setupTokens, deliveries, accessGrants, linkedGuardians, pinnedGuardians] = await Promise.all([
    prisma.billingAccount.count({ where: { family: { centerId } } }),
    prisma.invoice.count({ where: { billingAccount: { family: { centerId } } } }),
    prisma.payment.count({ where: { billingAccount: { family: { centerId } } } }),
    prisma.ledgerEntry.count({ where: { billingAccount: { family: { centerId } } } }),
    prisma.message.count({ where: { family: { centerId } } }),
    prisma.parentPortalSetupToken.count({ where: { centerId } }),
    prisma.integrationDelivery.count({ where: { centerId } }),
    prisma.userAccessGrant.count({ where: { centerId } }),
    prisma.guardian.count({ where: { family: { centerId }, userId: { not: null } } }),
    prisma.guardian.count({ where: { family: { centerId }, checkInPinHash: { not: null } } }),
  ]);
  return { billingAccounts, invoices, payments, ledgerEntries, messages, setupTokens, deliveries, accessGrants, linkedGuardians, pinnedGuardians };
}

function countOperations(plan: PlanAccount[]) {
  const keys = ["childUpdates", "familyUpdates", "guardianCreates", "guardianUpdates", "guardianDeletes", "emergencyCreates", "emergencyUpdates", "emergencyDeletes", "pickupCreates", "pickupUpdates", "pickupDeletes"] as const;
  const collectionKeys = ["guardianCreates", "guardianUpdates", "guardianDeletes", "emergencyCreates", "emergencyUpdates", "emergencyDeletes", "pickupCreates", "pickupUpdates", "pickupDeletes"] as const;
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<typeof keys[number], number>;
  for (const account of plan) {
    counts.childUpdates += account.childUpdates.length;
    counts.familyUpdates += account.familyUpdate ? 1 : 0;
    for (const key of collectionKeys) counts[key] += account[key].length;
  }
  return counts;
}

function nonemptyOperations(counts: ReturnType<typeof countOperations>) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

async function buildPlan(input: {
  schoolKey: ReviewedSchoolKey;
  centerId: string;
  centerName: string;
  locationId: string;
  exportDate: string;
  accountBuffer: Buffer;
  relationshipBuffer: Buffer;
  accountSha: string;
  relationshipSha: string;
}) {
  const dataset = buildProcareRelationshipDataset(input.accountBuffer, input.relationshipBuffer);
  const state = await readState(input.centerId);
  invariant(state.center, "The requested center was not found.");
  invariant(state.center.name === input.centerName, `Center name mismatch: expected ${input.centerName}.`);
  invariant(state.center.locationId === input.locationId, `Center location mismatch: expected ${input.locationId}.`);
  invariant(state.center.status === "active", "The requested center is not active.");
  const familiesById = new Map(state.families.map((family) => [family.id, family]));
  const setupTokenGuardianIds = new Set(state.setupTokenGuardianIds);
  const children = state.families.flatMap((family) => family.children);
  const sourceCanMutate = dataset.schema.authoritativeForLiveReconciliation;
  const activeSourceChildren = [...dataset.children.values()].filter((child) => relationshipStatusInScope(child.enrollmentStatus));
  const sourceByNameDob = new Map<string, ProcareChildRelationshipSource[]>();
  for (const child of activeSourceChildren) {
    if (!child.dateOfBirth) continue;
    const key = `${normalizedIdentityName(child.fullName)}\0${normalizedDate(child.dateOfBirth)}`;
    sourceByNameDob.set(key, [...(sourceByNameDob.get(key) ?? []), child]);
  }

  const matchByDbId = new Map<string, { child: ChildState; source: ProcareChildRelationshipSource; method: string }>();
  const held: Record<string, number> = {};
  if (!sourceCanMutate) increment(held, "source_report_shape_incomplete_for_live_reconciliation", dataset.children.size);
  for (const child of sourceCanMutate ? children : []) {
    const productionAppearsCurrent = productionRelationshipInScope(child);
    if (child.sourceSystem !== "procare") {
      if (productionAppearsCurrent) increment(held, "production_current_child_without_procare_provenance");
      continue;
    }
    let source = child.externalId ? dataset.children.get(child.externalId) : undefined;
    let method = source ? "external_id" : "";
    if (source && !relationshipStatusInScope(source.enrollmentStatus)) {
      if (productionAppearsCurrent) increment(held, "production_current_child_source_status_not_active");
      continue;
    }
    if (source) {
      const nameMatches = normalizedIdentityName(child.fullName) === normalizedIdentityName(source.fullName);
      const dobMatches = Boolean(source.dateOfBirth) && normalizedDate(child.dateOfBirth) === normalizedDate(source.dateOfBirth);
      if (!nameMatches || !dobMatches) {
        increment(held, "external_id_identity_corroboration_failed");
        continue;
      }
    }
    if (!source) {
      const key = `${normalizedIdentityName(child.fullName)}\0${normalizedDate(child.dateOfBirth)}`;
      const candidates = sourceByNameDob.get(key) ?? [];
      if (candidates.length === 1) {
        source = candidates[0];
        method = "name_and_dob";
      } else if (candidates.length > 1) {
        const currentFamily = familiesById.get(child.familyId);
        const currentFamilyExternalId = currentFamily?.sourceSystem === "procare"
          ? clean(currentFamily.externalId).toLowerCase()
          : "";
        const narrowed = candidates.filter((candidate) => {
          const accountId = candidate.accountResolution.accountId;
          if (!accountId) return false;
          const account = dataset.accounts.get(accountId);
          return accountId.toLowerCase() === currentFamilyExternalId
            || Boolean(account?.accountKey && account.accountKey.toLowerCase() === currentFamilyExternalId);
        });
        if (narrowed.length === 1) {
          source = narrowed[0];
          method = "name_dob_and_family_account_key";
        } else increment(held, "production_child_match_ambiguous");
      }
    }
    if (!source) {
      if (productionAppearsCurrent) increment(held, "production_current_child_not_in_active_source");
      continue;
    }
    matchByDbId.set(child.id, { child, source, method });
  }
  const dbMatchesBySourceId = new Map<string, string[]>();
  for (const [dbId, match] of matchByDbId) {
    dbMatchesBySourceId.set(match.source.childId, [...(dbMatchesBySourceId.get(match.source.childId) ?? []), dbId]);
  }
  for (const dbIds of dbMatchesBySourceId.values()) {
    if (dbIds.length < 2) continue;
    increment(held, "source_child_matches_multiple_production_children", dbIds.length);
    for (const dbId of dbIds) matchByDbId.delete(dbId);
  }

  const matchesByAccount = new Map<string, Array<{ child: ChildState; source: ProcareChildRelationshipSource; method: string }>>();
  for (const match of matchByDbId.values()) {
    const resolution = match.source.accountResolution;
    if (resolution.status !== "resolved" || !resolution.accountId) {
      increment(held, `source_${resolution.status}_${resolution.tier}`);
      continue;
    }
    matchesByAccount.set(resolution.accountId, [...(matchesByAccount.get(resolution.accountId) ?? []), match]);
  }

  const activeResolvedSourceIdsByAccount = new Map<string, Set<string>>();
  const unsafeActiveCandidateAccountIds = new Set<string>();
  for (const source of activeSourceChildren) {
    const resolution = source.accountResolution;
    if (resolution.status !== "resolved" || !resolution.accountId) {
      increment(held, `active_source_${resolution.status}_${resolution.tier}`);
      for (const candidate of [
        ...resolution.directAccountIds,
        ...resolution.payerUnionAccountIds,
        ...resolution.payerIntersectionAccountIds,
      ]) unsafeActiveCandidateAccountIds.add(candidate);
      continue;
    }
    activeResolvedSourceIdsByAccount.set(
      resolution.accountId,
      new Set([...(activeResolvedSourceIdsByAccount.get(resolution.accountId) ?? []), source.childId]),
    );
  }

  const resolvedAccountsByCurrentFamily = new Map<string, Set<string>>();
  for (const [accountId, matches] of matchesByAccount) {
    for (const match of matches) {
      resolvedAccountsByCurrentFamily.set(match.child.familyId, new Set([...(resolvedAccountsByCurrentFamily.get(match.child.familyId) ?? []), accountId]));
    }
  }

  const proposedTargets = new Map<string, FamilyState>();
  for (const [accountId, matches] of matchesByAccount) {
    const account = dataset.accounts.get(accountId);
    invariant(account, `Resolved account ${accountId} is missing from Account Information.`);
    if (unsafeActiveCandidateAccountIds.has(accountId)) {
      increment(held, "account_touched_by_ambiguous_active_source_child");
      continue;
    }
    const current = [...new Set(matches.map((match) => match.child.familyId))].map((id) => familiesById.get(id)!).filter(Boolean);
    if (current.length !== 1) {
      increment(held, current.length > 1 ? "child_family_move_or_merge_requires_separate_review" : "family_target_ambiguous");
      continue;
    }
    const target = current[0];
    if (target.sourceSystem !== "procare") {
      increment(held, "family_without_procare_provenance");
      continue;
    }
    const familyExternalId = clean(target.externalId).toLowerCase();
    const matchesReviewedAccount = familyExternalId === accountId.toLowerCase()
      || Boolean(account.accountKey && familyExternalId === account.accountKey.toLowerCase());
    if (!matchesReviewedAccount) {
      increment(held, "family_account_provenance_mismatch");
      continue;
    }
    const expectedSourceIds = activeResolvedSourceIdsByAccount.get(accountId) ?? new Set<string>();
    const matchedSourceIds = new Set(matches.map((match) => match.source.childId));
    if (expectedSourceIds.size !== matchedSourceIds.size || [...expectedSourceIds].some((id) => !matchedSourceIds.has(id))) {
      increment(held, "account_missing_active_source_child_in_production");
      continue;
    }
    const targetAccountSet = resolvedAccountsByCurrentFamily.get(target.id) ?? new Set<string>();
    if ([...targetAccountSet].some((candidate) => candidate !== accountId)) {
      increment(held, "family_contains_multiple_source_accounts");
      continue;
    }
    const unmatchedTargetChildren = target.children.filter((child) => {
      if (!productionRelationshipInScope(child)) return false;
      const match = matchByDbId.get(child.id);
      return !match || match.source.accountResolution.accountId !== accountId;
    });
    if (unmatchedTargetChildren.length) {
      increment(held, "family_contains_unmatched_or_held_children");
      continue;
    }
    proposedTargets.set(accountId, target);
  }

  const targetAccountsByFamily = new Map<string, string[]>();
  for (const [accountId, family] of proposedTargets) {
    targetAccountsByFamily.set(family.id, [...(targetAccountsByFamily.get(family.id) ?? []), accountId]);
  }
  for (const [familyId, accountIds] of targetAccountsByFamily) {
    if (accountIds.length < 2) continue;
    increment(held, "one_family_targeted_by_multiple_accounts", accountIds.length);
    for (const accountId of accountIds) proposedTargets.delete(accountId);
    void familyId;
  }

  const plan: PlanAccount[] = [];
  for (const [accountId, target] of proposedTargets) {
    const matches = matchesByAccount.get(accountId) ?? [];
    const account = dataset.accounts.get(accountId)!;
    const sourceChildren = matches.map((match) => match.source).sort((left, right) => left.childId.localeCompare(right.childId));
    const sourceChildIds = sourceChildren.map((child) => child.childId);
    const desired = desiredRelationships(account, sourceChildren);
    const accountHeld: Record<string, number> = {};
    for (const [key, ids] of Object.entries(desired.conflict)) {
      if (ids.size) accountHeld[`child_scoped_${key}_conflict`] = ids.size;
    }
    if (Object.keys(accountHeld).length) {
      increment(held, "account_held_for_child_scoped_relationship_conflict");
      for (const [key, value] of Object.entries(accountHeld)) increment(held, key, value);
      continue;
    }
    const childUpdates: PlanAccount["childUpdates"] = [];
    const familyUpdate: PlanAccount["familyUpdate"] = null;

    const guardianCreates: Prisma.GuardianUncheckedCreateInput[] = [];
    const guardianUpdates: Array<{ id: string; data: Prisma.GuardianUncheckedUpdateInput }> = [];
    const guardianDeletes: string[] = [];
    const emergencyCreates: Prisma.EmergencyContactUncheckedCreateInput[] = [];
    const emergencyUpdates: Array<{ id: string; data: Prisma.EmergencyContactUncheckedUpdateInput }> = [];
    const emergencyDeletes: string[] = [];
    const pickupCreates: Prisma.AuthorizedPickupUncheckedCreateInput[] = [];
    const pickupUpdates: Array<{ id: string; data: Prisma.AuthorizedPickupUncheckedUpdateInput }> = [];
    const pickupDeletes: string[] = [];

    const procareByExternal = <T extends { sourceSystem: string | null; externalId: string | null }>(rows: T[]) => {
      const result = new Map<string, T[]>();
      for (const row of rows.filter((item) => item.sourceSystem === "procare" && item.externalId)) {
        result.set(row.externalId!, [...(result.get(row.externalId!) ?? []), row]);
      }
      return result;
    };

    const existingGuardians = procareByExternal(target.guardians);
    const usedGuardianIds = new Set<string>();
    for (const [externalId, person] of desired.guardians) {
      let existing = existingGuardians.get(externalId) ?? [];
      let contactEnrichmentOnly = false;
      if (!existing.length) {
        const sameName = target.guardians.filter((candidate) => (
          !usedGuardianIds.has(candidate.id)
          && normalizedIdentityName(candidate.fullName) === normalizedIdentityName(person.fullName)
        ));
        existing = sameName.filter((candidate) => (
          Boolean(person.email && candidate.email && candidate.email.toLowerCase() === person.email.toLowerCase())
          || Boolean(normalizedPhone(person.phone) && normalizedPhone(candidate.phone) === normalizedPhone(person.phone))
        ));
        if (!existing.length && sameName.length) {
          increment(accountHeld, "guardian_name_only_match_requires_review");
          continue;
        }
        contactEnrichmentOnly = existing[0]?.sourceSystem !== "procare";
      }
      if (existing.length > 1) { increment(accountHeld, "duplicate_guardian_external_id"); continue; }
      const current = existing[0];
      if (current && normalizedIdentityName(current.fullName) !== normalizedIdentityName(person.fullName)) {
        increment(accountHeld, "guardian_external_id_name_conflict");
        continue;
      }
      const personMetadata = metadata({ accountSha: input.accountSha, relationshipSha: input.relationshipSha, accountId, sourceChildIds: person.sourceChildIds });
      if (!current) {
        guardianCreates.push({
          familyId: target.id, fullName: person.fullName, email: person.email || null, phone: person.phone || null,
          relation: person.relation || "Guardian", preferredCommunication: person.email ? "email" : person.phone ? "phone" : null,
          isBillingContact: person.billingContact, sourceSystem: "procare", externalId,
          customFields: mergedFields(null, personMetadata),
        });
        continue;
      }
      usedGuardianIds.add(current.id);
      const data: Prisma.GuardianUncheckedUpdateInput = {};
      Object.assign(data, missingProcareGuardianContactFields(person, current));
      if (contactEnrichmentOnly) {
        if (Object.keys(data).length) guardianUpdates.push({ id: current.id, data });
        continue;
      }
      const relation = person.relation || current.relation || "Guardian";
      if (current.relation !== relation) data.relation = relation;
      if (current.isBillingContact !== person.billingContact) data.isBillingContact = person.billingContact;
      if (current.externalId !== externalId) data.externalId = externalId;
      if (current.sourceSystem !== "procare") data.sourceSystem = "procare";
      if (Object.keys(data).length) guardianUpdates.push({ id: current.id, data });
    }
    for (const row of target.guardians.filter((item) => item.sourceSystem === "procare")) {
      if (usedGuardianIds.has(row.id)) continue;
      if (!row.externalId) { increment(accountHeld, "guardian_without_external_id_preserved"); continue; }
      if (desired.guardians.has(row.externalId)) continue;
      increment(accountHeld, row.userId || setupTokenGuardianIds.has(row.id) || row.checkInPinHash || row.checkInPinSetAt || row.checkInPinSetById || row._count.checkLogs || row._count.dataDeletionRequests
        ? "linked_or_pin_stale_guardian_preserved"
        : "stale_guardian_preserved_without_reconciliation_provenance");
    }

    const existingEmergencies = procareByExternal(target.emergencyContacts);
    const usedEmergencyIds = new Set<string>();
    for (const [externalId, person] of desired.emergencies) {
      let existing = existingEmergencies.get(externalId) ?? [];
      if (!existing.length) {
        const sameName = target.emergencyContacts.filter((candidate) => (
          candidate.sourceSystem === "procare"
          && !usedEmergencyIds.has(candidate.id)
          && normalizedIdentityName(candidate.fullName) === normalizedIdentityName(person.fullName)
        ));
        existing = sameName.filter((candidate) => Boolean(
          normalizedPhone(person.phone) && normalizedPhone(candidate.phone) === normalizedPhone(person.phone),
        ));
        if (!existing.length && sameName.length) {
          increment(accountHeld, "emergency_name_only_match_requires_review");
          continue;
        }
        const protectedMatch = target.emergencyContacts.some((candidate) => (
          candidate.sourceSystem !== "procare"
          && normalizedIdentityName(candidate.fullName) === normalizedIdentityName(person.fullName)
          && Boolean(normalizedPhone(person.phone) && normalizedPhone(candidate.phone) === normalizedPhone(person.phone))
        ));
        if (protectedMatch) {
          increment(accountHeld, "non_procare_emergency_identity_match_preserved");
          continue;
        }
      }
      if (existing.length > 1) { increment(accountHeld, "duplicate_emergency_external_id"); continue; }
      const current = existing[0];
      if (current && normalizedIdentityName(current.fullName) !== normalizedIdentityName(person.fullName)) {
        increment(accountHeld, "emergency_external_id_name_conflict");
        continue;
      }
      const personMetadata = metadata({ accountSha: input.accountSha, relationshipSha: input.relationshipSha, accountId, sourceChildIds: person.sourceChildIds });
      if (!current) {
        emergencyCreates.push({ familyId: target.id, fullName: person.fullName, phone: person.phone || "Not imported", relation: person.relation || "Emergency Contact", sourceSystem: "procare", externalId, customFields: mergedFields(null, personMetadata) });
        continue;
      }
      usedEmergencyIds.add(current.id);
      const data: Prisma.EmergencyContactUncheckedUpdateInput = {};
      const relation = person.relation || current.relation || "Emergency Contact";
      if (current.relation !== relation) data.relation = relation;
      if (current.externalId !== externalId) data.externalId = externalId;
      if (current.sourceSystem !== "procare") data.sourceSystem = "procare";
      if (Object.keys(data).length) emergencyUpdates.push({ id: current.id, data });
    }
    for (const row of target.emergencyContacts.filter((item) => item.sourceSystem === "procare")) {
      if (usedEmergencyIds.has(row.id)) continue;
      if (!row.externalId) { increment(accountHeld, "emergency_without_external_id_preserved"); continue; }
      if (desired.emergencies.has(row.externalId)) continue;
      increment(accountHeld, "stale_emergency_preserved_without_reconciliation_provenance");
    }

    const existingPickups = procareByExternal(target.pickups);
    const usedPickupIds = new Set<string>();
    for (const [externalId, person] of desired.pickups) {
      let existing = existingPickups.get(externalId) ?? [];
      if (!existing.length) {
        const sameName = target.pickups.filter((candidate) => (
          candidate.sourceSystem === "procare"
          && !usedPickupIds.has(candidate.id)
          && normalizedIdentityName(candidate.fullName) === normalizedIdentityName(person.fullName)
        ));
        existing = sameName.filter((candidate) => Boolean(
          normalizedPhone(person.phone) && normalizedPhone(candidate.phone) === normalizedPhone(person.phone),
        ));
        if (!existing.length && sameName.length) {
          increment(accountHeld, "pickup_name_only_match_requires_review");
          continue;
        }
        const protectedMatch = target.pickups.some((candidate) => (
          candidate.sourceSystem !== "procare"
          && normalizedIdentityName(candidate.fullName) === normalizedIdentityName(person.fullName)
          && Boolean(normalizedPhone(person.phone) && normalizedPhone(candidate.phone) === normalizedPhone(person.phone))
        ));
        if (protectedMatch) {
          increment(accountHeld, "non_procare_pickup_identity_match_preserved");
          continue;
        }
      }
      if (existing.length > 1) { increment(accountHeld, "duplicate_pickup_external_id"); continue; }
      const current = existing[0];
      if (current && normalizedIdentityName(current.fullName) !== normalizedIdentityName(person.fullName)) {
        increment(accountHeld, "pickup_external_id_name_conflict");
        continue;
      }
      const personMetadata = metadata({ accountSha: input.accountSha, relationshipSha: input.relationshipSha, accountId, sourceChildIds: person.sourceChildIds });
      if (!current) {
        pickupCreates.push({ familyId: target.id, fullName: person.fullName, phone: person.phone || null, relation: person.relation || null, verificationNotes: "Imported from ProCare; director should verify identity requirements.", sourceSystem: "procare", externalId, customFields: mergedFields(null, personMetadata) });
        continue;
      }
      usedPickupIds.add(current.id);
      const data: Prisma.AuthorizedPickupUncheckedUpdateInput = {};
      if (person.relation && current.relation !== person.relation) data.relation = person.relation;
      if (current.externalId !== externalId) data.externalId = externalId;
      if (current.sourceSystem !== "procare") data.sourceSystem = "procare";
      if (Object.keys(data).length) pickupUpdates.push({ id: current.id, data });
    }
    for (const row of target.pickups.filter((item) => item.sourceSystem === "procare")) {
      if (usedPickupIds.has(row.id)) continue;
      if (!row.externalId) { increment(accountHeld, "pickup_without_external_id_preserved"); continue; }
      if (desired.pickups.has(row.externalId)) continue;
      increment(accountHeld, "stale_pickup_preserved_without_reconciliation_provenance");
    }

    if (Object.keys(accountHeld).length) {
      increment(held, "account_held_for_unsafe_existing_relationship_state");
      for (const [key, value] of Object.entries(accountHeld)) increment(held, key, value);
      continue;
    }
    plan.push({
      accountId, familyId: target.id, sourceChildIds, childUpdates, familyUpdate,
      guardianCreates, guardianUpdates, guardianDeletes,
      emergencyCreates, emergencyUpdates, emergencyDeletes,
      pickupCreates, pickupUpdates, pickupDeletes,
      held: accountHeld,
      expectedFamilyStateHash: familyStateHash(target),
    });
  }

  const tiers: Record<string, number> = {};
  for (const child of dataset.children.values()) increment(tiers, child.accountResolution.tier);
  const matchedMethods: Record<string, number> = {};
  for (const match of matchByDbId.values()) increment(matchedMethods, match.method);
  const planHeld: Record<string, number> = {};
  for (const account of plan) for (const [key, value] of Object.entries(account.held)) increment(planHeld, key, value);
  const operations = countOperations(plan);
  const updateFields: Record<string, number> = {};
  const updateValues: Record<string, number> = {};
  for (const account of plan) {
    if (account.familyUpdate) increment(updateValues, "family.externalId");
    for (const update of account.childUpdates) {
      if (update.moveFamily) increment(updateValues, "child.familyId");
      if (update.changeExternalId) increment(updateValues, "child.externalId");
    }
    for (const update of account.guardianUpdates) {
      for (const key of Object.keys(update.data)) increment(updateFields, `guardian.${key}`);
      if (typeof update.data.isBillingContact === "boolean") increment(updateValues, `guardian.isBillingContact.${update.data.isBillingContact}`);
    }
    for (const update of account.emergencyUpdates) for (const key of Object.keys(update.data)) increment(updateFields, `emergency.${key}`);
    for (const update of account.pickupUpdates) for (const key of Object.keys(update.data)) increment(updateFields, `pickup.${key}`);
  }
  const fingerprintPayload = plan.slice().sort((left, right) => left.accountId.localeCompare(right.accountId));
  const stateFingerprintPayload = {
    center: state.center,
    setupTokenGuardianIds: state.setupTokenGuardianIds,
    families: state.families.map((family) => ({ id: family.id, stateHash: familyStateHash(family) })),
  };
  const fingerprint = sha256(stableJson({
    schoolKey: input.schoolKey,
    centerId: input.centerId,
    centerName: input.centerName,
    locationId: input.locationId,
    exportDate: input.exportDate,
    accountSha: input.accountSha,
    relationshipSha: input.relationshipSha,
    schema: dataset.schema,
    integrity: dataset.integrity,
    held,
    state: stateFingerprintPayload,
    plan: fingerprintPayload,
  }));
  return {
    dataset,
    state,
    plan,
    fingerprint,
    summary: {
      centerId: input.centerId,
      centerName: input.centerName,
      schoolKey: input.schoolKey,
      source: { ...dataset.inventory, schema: dataset.schema, integrity: dataset.integrity, activeChildren: activeSourceChildren.length },
      sourceResolutionTiers: tiers,
      production: { families: state.families.length, children: children.length, matchedChildren: matchByDbId.size, matchedMethods },
      eligibleAccounts: plan.length,
      held: { ...held, ...Object.fromEntries(Object.entries(planHeld).map(([key, value]) => [key, (held[key] ?? 0) + value])) },
      operations,
      updateFields,
      updateValues,
      totalOperations: nonemptyOperations(operations),
      fingerprint,
    },
  };
}

async function applyPlan(input: Awaited<ReturnType<typeof buildPlan>>) {
  const tenantId = input.state.center!.organization.tenantId;
  for (const account of input.plan) {
    const operations = countOperations([account]);
    if (!nonemptyOperations(operations)) continue;
    await prisma.$transaction(async (tx) => {
      invariant(!account.childUpdates.length && !account.familyUpdate, "Child/family identity mutations require a separate reviewed repair.");
      invariant(!account.guardianDeletes.length && !account.emergencyDeletes.length && !account.pickupDeletes.length, "Relationship deletions require record-level reconciliation provenance.");
      const freshCenter = await tx.center.findUnique({ where: { id: input.state.center!.id }, select: { name: true, locationId: true, status: true } });
      invariant(freshCenter
        && freshCenter.name === input.state.center!.name
        && freshCenter.locationId === input.state.center!.locationId
        && freshCenter.status === "active", "The reviewed center identity or active status changed after preview.");
      const freshFamily = await tx.family.findUnique({ where: { id: account.familyId }, select: familyStateSelect });
      invariant(freshFamily && familyStateHash(freshFamily) === account.expectedFamilyStateHash, `Family ${account.familyId} changed after preview; no operations were applied for this account.`);
      for (const item of account.guardianCreates) await tx.guardian.create({ data: item });
      for (const item of account.guardianUpdates) await tx.guardian.update({ where: { id: item.id }, data: item.data });
      for (const item of account.emergencyCreates) await tx.emergencyContact.create({ data: item });
      for (const item of account.emergencyUpdates) await tx.emergencyContact.update({ where: { id: item.id }, data: item.data });
      for (const item of account.pickupCreates) await tx.authorizedPickup.create({ data: item });
      for (const item of account.pickupUpdates) await tx.authorizedPickup.update({ where: { id: item.id }, data: item.data });
      await tx.auditLog.create({
        data: {
          tenantId,
          centerId: input.state.center!.id,
          action: AUDIT_ACTION,
          resource: "Family",
          resourceId: account.familyId,
          metadata: {
            source: REPAIR_SOURCE,
            sourceAccountId: account.accountId,
            sourceChildIds: account.sourceChildIds,
            fingerprint: input.fingerprint,
            operations,
          },
        },
      });
    }, {
      timeout: 30_000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
}

async function main() {
  const accountPath = path.resolve(requiredOption("--account-file"));
  const relationshipPath = path.resolve(requiredOption("--relationship-file"));
  const requestedSchool = requiredOption(SCHOOL_OPTION);
  invariant(requestedSchool in REVIEWED_SOURCES, `Unknown reviewed school key ${requestedSchool}.`);
  const schoolKey = requestedSchool as ReviewedSchoolKey;
  const reviewedSource = REVIEWED_SOURCES[schoolKey];
  const accountBuffer = readFileSync(accountPath);
  const relationshipBuffer = readFileSync(relationshipPath);
  const accountSha = sha256(accountBuffer);
  const relationshipSha = sha256(relationshipBuffer);
  invariant(accountSha === reviewedSource.accountSha, `Account Information SHA-256 does not match the reviewed ${schoolKey} source.`);
  invariant(relationshipSha === reviewedSource.relationshipSha, `Child Relationships SHA-256 does not match the reviewed ${schoolKey} source.`);

  const before = await boundary(reviewedSource.centerId);
  const buildInput = {
    schoolKey,
    centerId: reviewedSource.centerId,
    centerName: reviewedSource.centerName,
    locationId: reviewedSource.locationId,
    exportDate: reviewedSource.exportDate,
    accountBuffer,
    relationshipBuffer,
    accountSha,
    relationshipSha,
  };
  const preview = await buildPlan(buildInput);
  if (!process.argv.includes(APPLY_FLAG)) {
    console.log(JSON.stringify({ dryRun: true, ...preview.summary, boundary: before }, null, 2));
    return;
  }
  const confirmed = requiredOption(CONFIRM_OPTION).toLowerCase();
  invariant(confirmed === preview.fingerprint, "The confirmed fingerprint does not match the current production plan.");
  await applyPlan(preview);
  const after = await boundary(reviewedSource.centerId);
  const verification = await buildPlan(buildInput);
  invariant(verification.summary.totalOperations === 0, `Post-apply verification still plans ${verification.summary.totalOperations} repeatable operations.`);
  console.log(JSON.stringify({
    dryRun: false,
    appliedFingerprint: preview.fingerprint,
    applied: preview.summary.operations,
    eligibleAccounts: preview.summary.eligibleAccounts,
    held: preview.summary.held,
    postApplyOperations: verification.summary.totalOperations,
    boundary: after,
    protectedBoundaryObservedChange: !sameJson(before, after),
  }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
