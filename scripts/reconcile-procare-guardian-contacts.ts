import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import {
  buildProcareAccountContactDataset,
  buildProcareRelationshipPersonDataset,
  missingProcareGuardianContactFields,
} from "@/lib/procare-family-relationship-reconciliation";
import { buildRenderedProcareReportRowsFromFiles } from "@/lib/procare-rendered-report-import";
import { prisma } from "@/lib/prisma";

const APPLY_FLAG = "--apply";
const CONFIRM_OPTION = "--confirm-fingerprint";
const SCHOOL_OPTION = "--school";
const SOURCE_OPTION = "--source-file";
const RELATIONSHIP_OPTION = "--relationship-file";
const REPAIR_SOURCE = "procare_guardian_contact_reconciliation_v1";
const AUDIT_ACTION = "operations.procare_guardian_contacts.reconciled";

type ReviewedSource = {
  centerId: string;
  centerName: string;
  locationId: string;
  exportDate: string;
  sourceSha: string;
  relationshipSha?: string;
  format: "flat" | "rendered";
};

const REVIEWED_SOURCES = {
  "corpus-christi": { centerId: "85f871b5-b20d-4107-b5de-91d3014a1fb0", centerName: "Kid City USA - Corpus Christi", locationId: "Kid City USA - TX | Corpus Christi", exportDate: "2026-08-04", sourceSha: "6ca58b8c3b088e7ee79797704e604cdeb331318ccb2ff206fc0b7427cabf204e", relationshipSha: "30e99c1f14308457e466277b59d08c66bdaa4ad49f58dc47443f287718df1a09", format: "flat" },
  centennial: { centerId: "cms3g2the000i6a7wdd8pa20s", centerName: "Miss Honey's Learning Center - Centennial", locationId: "Miss Honey's Learning Center - CO | Centennial", exportDate: "2026-08-04", sourceSha: "efef8cd2067aefa049b450136c962193d14405bd9ee1ce1ff1ffc64f58bd2ab9", relationshipSha: "b1d87e77f04ad45fa58e4402ce87717458630a980ad9767e16c8bdfc12f73fb1", format: "flat" },
  longmont: { centerId: "cmp4ew6f3000a6alwmz62n7w2", centerName: "Kid City USA - Longmont", locationId: "Kid City USA - CO | Longmont", exportDate: "2026-08-04", sourceSha: "322e51322134129d33a35979e7a96229e274beb87c2f89ee867c042437ea30e6", relationshipSha: "0001c7c3623000a45f6841d63f2a10d950419356f26d3e9af777c112090570ab", format: "flat" },
  "holly-hill": { centerId: "cmp4ew8u4001c6alwq674ue16", centerName: "Kid City USA - Holly Hill", locationId: "Kid City USA - FL | Holly Hill", exportDate: "2026-08-04", sourceSha: "5b4a8393f8578e8873320db54d946839c94e2980f8d3650fefbe26cdcb83f111", relationshipSha: "3a851887fc0b500304f2a87e515251030481b28021c213ab3a864554616a2c75", format: "flat" },
  "beach-blvd": { centerId: "cmp4ew8yo001e6alw32jneo3w", centerName: "Kid City USA - Beach Blvd", locationId: "Kid City USA - FL | Jacksonville - Beach", exportDate: "2026-08-04", sourceSha: "903627fdd7ae5f9944e885f134f06dd3a9b2764c8f3fd72db3b40bd5a374eda3", relationshipSha: "d3cc67c522dcbee8cb6afad8e8ade6650b7e05d55bbb949f1c8551c4ad0ea6fe", format: "flat" },
  granbury: { centerId: "cmp4ewhge00526alw7t62nwg4", centerName: "Kid City USA - Granbury", locationId: "Kid City USA - TX | Granbury", exportDate: "2026-08-04", sourceSha: "db29a8c512067d3cb5639eeebbd459655dea857a0cf058b6c442f9507b863377", relationshipSha: "dc39738a6ec77e464e0914a253292ea363e5693c1ca9670799da96d4421e06f4", format: "flat" },
  lincolnton: { centerId: "cms3g2uxn000s6a7w8xu1llok", centerName: "Miss Honey's Learning Center - Lincolnton", locationId: "Miss Honey's Learning Center - NC | Lincolnton", exportDate: "2026-08-04", sourceSha: "3a8dcb911f4e2ca8f15a96e738d9e183d2baabda67525b7498c924eead76e0c2", relationshipSha: "d996322a996a792b0499386b0612570af0af3bf6d4611c5132ce7ca6afa4a0c0", format: "flat" },
  garland: { centerId: "cmp4ewh78004y6alwu6s3bsv4", centerName: "Kid City USA - Garland", locationId: "Kid City USA - TX | Garland", exportDate: "2026-08-04", sourceSha: "8eeb9bd97945ba11326b499ef04d101838afa94e6c4efbd507aa8b8587a8cae9", relationshipSha: "9d024c2e3dd1386bead4d1d31b5f99c2cb1a305d46eb639f59ae35edb12d8b6d", format: "flat" },
  sarasota: { centerId: "cmp4ewca2002u6alw7c4lrusd", centerName: "Kid City USA - Sarasota", locationId: "Kid City USA - FL | Sarasota", exportDate: "2026-08-04", sourceSha: "75a8c80a584b029e2966197c4bdfa1646cb05ee2edc93a2c380517d97ef53b04", relationshipSha: "b2465a6e0002259b2b4f54eea24e2eb38a23b38af0072461231b48fca2d369b4", format: "flat" },
  "pisgah-forest": { centerId: "cmp4ewg8w004k6alwid0bwiur", centerName: "Kid City USA - Pisgah Forest", locationId: "Kid City USA - NC | Pisgah Forest", exportDate: "2026-08-04", sourceSha: "7c7742b0a4a360977b0d84ba85ab1a343a9eba508d5ec093afebbeadcee2b20e", relationshipSha: "e21993bbc66ca81028e7d1b15622dd43d01ea3c38dea4c8d3a962435e6a98fc1", format: "flat" },
  petersburg: { centerId: "cmp4ewf8500446alwfm6uywyl", centerName: "Kid City USA - Petersburg", locationId: "Kid City USA - IN | Petersburg", exportDate: "2026-08-04", sourceSha: "b07d8bdb377d874f742c50fb098c910a1977de41172fdf07e15184c4f169ec55", relationshipSha: "9d0701e22cb33bb931a4c8097e65669b5fc2731a7c537b382b24356748177181", format: "flat" },
  cordera: { centerId: "cmp4ew5yx00046alw8i1yf63m", centerName: "Kid City USA - Cordera (Colorado Springs)", locationId: "Kid City USA - CO | Colorado Springs - Cordera", exportDate: "2026-08-04", sourceSha: "273887ee6f390072965bdb820e7138e81194cbba7e4d297e66f110b6dcd56bac", relationshipSha: "3681a25a9d78ab41726e8745f953045b89d55cf0df3e8c81eaac1a41eb4ec550", format: "flat" },
  canton: { centerId: "cmp4ewg4a004i6alwl5c6i3w4", centerName: "Kid City USA - Canton", locationId: "Kid City USA - NC | Canton", exportDate: "2026-08-04", sourceSha: "bbf262b5a6b62534ffdcda208fd7c4d52ade7009aec36fa9bf7c2a6920c304f4", relationshipSha: "f79e737321f310dcff233e189dce1eaaeb9d15e32b98b227f8500ae63778f7e5", format: "flat" },
  "lees-summit": { centerId: "cmp4ewfzn004g6alwqbqrzcql", centerName: "Kid City USA - Lees Summit", locationId: "Kid City USA - MO | Lees Summit", exportDate: "2026-08-02", sourceSha: "7fe6fdec2104408100a8ba05af42165cbc13544786e21c58c99d45438ea35823", relationshipSha: "dc6134befe284e44df731c3ab45290b01a290aeb85d33cee7bf73d554986d9e9", format: "flat" },
  oakleaf: { centerId: "cmp4ew9h2001m6alwxssr4wr6", centerName: "Kid City USA - Oakleaf", locationId: "Kid City USA - FL | Jacksonville - Oakleaf", exportDate: "2026-08-02", sourceSha: "ea0a2df899fe77b75af65f2505a129549d77acc2b048199d2cb751e434f2caf0", relationshipSha: "0eb6d31767651303bbce4b6a89ed459bb13e63c9f67418e8928f637c544eb479", format: "rendered" },
  "jasper-baden": { centerId: "cmp4ewegp003s6alwi14wz7ao", centerName: "Kid City USA - Jasper - Baden Strasse", locationId: "Kid City USA - IN | Jasper - Baden Strasse", exportDate: "2026-08-02", sourceSha: "c86e2ee748993749950673b959f20c6a39e2d903510b408979e40fe3c624184a", relationshipSha: "4adc4e0dbbae727610f2eb541b463cbed66bb78edb41ce15aeb3aad89c03587c", format: "rendered" },
  paradise: { centerId: "cmp4ewkfu006a6alwld3k89qd", centerName: "Kid City USA - Paradise", locationId: "Kid City USA - IN | Newburgh - Paradise", exportDate: "2026-08-02", sourceSha: "f399e0069558628eb0a6b27f6b8a88d922eae45fe15eca9dc0b317e2d2f42eef", relationshipSha: "c10e94901f0e7b94ee710bc40efd79b29875af374025f1d4283ced6e0cb5394f", format: "rendered" },
  southpointe: { centerId: "cmp4ewfha00486alwwab1t4et", centerName: "Kid City USA - Southpointe", locationId: "Kid City USA - IN | Southpointe", exportDate: "2026-08-02", sourceSha: "81820d1fefb08f552c8cafb38a15b48a7f7ba20c8d584267827ddc0b0caf4a3b", format: "rendered" },
} as const satisfies Record<string, ReviewedSource>;

type ReviewedSchoolKey = keyof typeof REVIEWED_SOURCES;
type SourceContact = { accountId: string; accountKey: string; personId: string; fullName: string; email: string; phone: string; relation: string };
type GuardianState = Awaited<ReturnType<typeof readState>>["families"][number]["guardians"][number];
type PlanItem = { guardianId: string; familyId: string; data: { email?: string; phone?: string; relation?: string }; expectedStateHash: string; evidence: "person_id" | "account_and_name" };

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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizedName(value: string) {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).sort().join("\0");
}

function normalizedId(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizedPhone(value: string | null | undefined) {
  return value?.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "") ?? "";
}

function increment(counts: Record<string, number>, key: string, amount = 1) {
  counts[key] = (counts[key] ?? 0) + amount;
}

function guardianStateHash(guardian: GuardianState) {
  return sha256(stableJson(guardian));
}

function flatContacts(buffer: Buffer, relationshipBuffer?: Buffer) {
  const dataset = buildProcareAccountContactDataset(buffer);
  const relationshipPeople = new Map<string, Array<{ fullName: string; email: string; phone: string; relation: string }>>();
  if (relationshipBuffer) {
    const relationships = buildProcareRelationshipPersonDataset(relationshipBuffer);
    for (const contact of relationships.people) relationshipPeople.set(contact.personId, [...(relationshipPeople.get(contact.personId) ?? []), contact]);
  }
  let conflictingContacts = 0;
  let conflictingRelations = 0;
  const contacts: SourceContact[] = [];
  for (const account of dataset.accounts.values()) {
    for (const payer of account.payers) {
      const rows = [payer, ...(relationshipPeople.get(payer.personId) ?? [])];
      const names = [...new Map(rows.map((row) => [normalizedName(row.fullName), row.fullName])).values()];
      const emails = [...new Set(rows.map((row) => row.email.trim().toLowerCase()).filter(Boolean))];
      const phoneByDigits = new Map<string, string>();
      for (const row of rows) if (normalizedPhone(row.phone)) phoneByDigits.set(normalizedPhone(row.phone), row.phone.trim());
      const phones = [...phoneByDigits.values()];
      const relations = [...new Set(rows.map((row) => row.relation.trim()).filter((relation) => relation && !/^unknown$/i.test(relation)))];
      if (names.length !== 1 || emails.length > 1 || phones.length > 1) { conflictingContacts += 1; continue; }
      if (relations.length > 1) conflictingRelations += 1;
      contacts.push({ accountId: account.accountId, accountKey: account.accountKey, personId: payer.personId, fullName: names[0], email: emails[0] ?? "", phone: phones[0] ?? "", relation: relations.length === 1 ? relations[0] : "" });
    }
  }
  return { contacts, inventory: { ...dataset.inventory, format: "flat", relationshipPeople: relationshipPeople.size, conflictingContacts, conflictingRelations } };
}

function renderedContacts(buffer: Buffer, sourceName: string, relationshipBuffer?: Buffer) {
  const entries = new Map([[sourceName, buffer]]);
  if (relationshipBuffer) entries.set("reviewed-child-relationships.csv", relationshipBuffer);
  const dataset = buildRenderedProcareReportRowsFromFiles(entries);
  invariant(dataset, "The reviewed rendered Account Information report was not recognized.");
  const grouped = new Map<string, Array<{ accountId: string; fullName: string; email: string; phone: string; relation?: string }>>();
  for (const row of dataset.records) {
    const accountId = row["account id"]?.trim() ?? "";
    const fullName = row["guardian name"]?.trim() ?? "";
    const add = (item: { accountId: string; fullName: string; email: string; phone: string; relation?: string }) => {
      if (!item.accountId || !item.fullName) return;
      const key = `${normalizedId(item.accountId)}\0${normalizedName(item.fullName)}`;
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    };
    add({ accountId, fullName, email: row["guardian email"]?.trim().toLowerCase() ?? "", phone: row["guardian phone"]?.trim() ?? "" });
    try {
      const relationships = JSON.parse(row["procare relationship records"] ?? "[]") as Array<{ name?: string; email?: string; phone?: string; relation?: string; guardian?: boolean }>;
      for (const relationship of relationships.filter((item) => item.guardian)) add({ accountId, fullName: relationship.name?.trim() ?? "", email: relationship.email?.trim().toLowerCase() ?? "", phone: relationship.phone?.trim() ?? "", relation: relationship.relation?.trim() ?? "" });
    } catch { /* malformed optional relationship evidence is ignored */ }
  }
  const contacts: SourceContact[] = [];
  let conflictingContacts = 0;
  let conflictingRelations = 0;
  for (const rows of grouped.values()) {
    const accountIds = [...new Set(rows.map((row) => row.accountId))];
    const names = [...new Map(rows.map((row) => [normalizedName(row.fullName), row.fullName])).values()];
    const emails = [...new Set(rows.map((row) => row.email).filter(Boolean))];
    const phones = [...new Set(rows.map((row) => row.phone).filter(Boolean))];
    const relations = [...new Set(rows.map((row) => row.relation?.trim() ?? "").filter(Boolean))];
    if (accountIds.length !== 1 || names.length !== 1 || emails.length > 1 || phones.length > 1) { conflictingContacts += 1; continue; }
    if (relations.length > 1) conflictingRelations += 1;
    contacts.push({ accountId: accountIds[0], accountKey: accountIds[0], personId: "", fullName: names[0], email: emails[0] ?? "", phone: phones[0] ?? "", relation: relations.length === 1 ? relations[0] : "" });
  }
  return { contacts, inventory: { format: "rendered", records: dataset.records.length, accounts: new Set(contacts.map((contact) => normalizedId(contact.accountId))).size, payers: contacts.length, conflictingContacts, conflictingRelations } };
}

async function readState(centerId: string) {
  const [center, families] = await Promise.all([
    prisma.center.findUnique({ where: { id: centerId }, select: { id: true, name: true, locationId: true, status: true, organization: { select: { tenantId: true } } } }),
    prisma.family.findMany({
      where: { centerId },
      select: {
        id: true, centerId: true, sourceSystem: true, externalId: true,
        guardians: { select: { id: true, familyId: true, fullName: true, email: true, phone: true, relation: true, sourceSystem: true, externalId: true }, orderBy: { id: "asc" } },
      },
      orderBy: { id: "asc" },
    }),
  ]);
  return { center, families };
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

async function buildPlan(input: { schoolKey: ReviewedSchoolKey; reviewed: ReviewedSource; sourceBuffer: Buffer; relationshipBuffer?: Buffer; sourceName: string }) {
  const parsed = input.reviewed.format === "flat" ? flatContacts(input.sourceBuffer, input.relationshipBuffer) : renderedContacts(input.sourceBuffer, input.sourceName, input.relationshipBuffer);
  const state = await readState(input.reviewed.centerId);
  invariant(state.center, "The reviewed center was not found.");
  invariant(state.center.name === input.reviewed.centerName, `Center name mismatch: expected ${input.reviewed.centerName}.`);
  invariant(state.center.locationId === input.reviewed.locationId, `Center location mismatch: expected ${input.reviewed.locationId}.`);
  invariant(state.center.status === "active", "The reviewed center is not active.");

  const familyBySourceId = new Map<string, typeof state.families>();
  for (const family of state.families.filter((row) => row.sourceSystem === "procare" && row.externalId)) {
    const key = normalizedId(family.externalId);
    familyBySourceId.set(key, [...(familyBySourceId.get(key) ?? []), family]);
  }

  const held: Record<string, number> = {};
  const proposedPlan: PlanItem[] = [];
  for (const contact of parsed.contacts) {
    if (!contact.email && !contact.phone && !contact.relation) { increment(held, "source_contact_has_no_email_phone_or_relation"); continue; }
    const familyCandidates = [...new Map([
      ...(familyBySourceId.get(normalizedId(contact.accountId)) ?? []),
      ...(contact.accountKey ? familyBySourceId.get(normalizedId(contact.accountKey)) ?? [] : []),
    ].map((family) => [family.id, family])).values()];
    if (familyCandidates.length !== 1) { increment(held, familyCandidates.length ? "source_account_matches_multiple_families" : "source_account_not_found_in_production"); continue; }
    const family = familyCandidates[0];
    let evidence: PlanItem["evidence"] = "person_id";
    let candidates = contact.personId ? family.guardians.filter((guardian) => normalizedId(guardian.externalId) === normalizedId(contact.personId)) : [];
    if (!candidates.length && input.reviewed.format === "rendered") {
      evidence = "account_and_name";
      candidates = family.guardians.filter((guardian) => guardian.sourceSystem === "procare" && normalizedName(guardian.fullName) === normalizedName(contact.fullName));
    }
    if (candidates.length !== 1) { increment(held, candidates.length ? "source_contact_matches_multiple_guardians" : "source_guardian_not_found_in_family"); continue; }
    const guardian = candidates[0];
    if (normalizedName(guardian.fullName) !== normalizedName(contact.fullName)) { increment(held, "source_person_id_name_conflict"); continue; }
    const data: PlanItem["data"] = missingProcareGuardianContactFields(contact, guardian);
    const currentRelation = guardian.relation.trim();
    const sourceRelation = contact.relation.trim();
    if (
      (!currentRelation || /^(unknown|guardian)$/i.test(currentRelation))
      && sourceRelation
      && !/^(unknown|guardian)$/i.test(sourceRelation)
      && currentRelation.toLowerCase() !== sourceRelation.toLowerCase()
    ) data.relation = sourceRelation;
    if (!Object.keys(data).length) { increment(held, "guardian_contact_already_complete_or_source_blank"); continue; }
    if (data.phone && guardian.phone?.trim()) { increment(held, "existing_phone_preserved"); delete data.phone; }
    if (data.email && guardian.email?.trim()) { increment(held, "existing_email_preserved"); delete data.email; }
    if (!Object.keys(data).length) continue;
    proposedPlan.push({ guardianId: guardian.id, familyId: family.id, data, expectedStateHash: guardianStateHash(guardian), evidence });
  }

  const plan: PlanItem[] = [];
  for (const items of Map.groupBy(proposedPlan, (item) => item.guardianId).values()) {
    if (items.length === 1) { plan.push(items[0]); continue; }
    if (items.every((item) => stableJson(item.data) === stableJson(items[0].data) && item.familyId === items[0].familyId)) {
      plan.push(items[0]);
      increment(held, "duplicate_source_contact_same_update_deduplicated", items.length - 1);
    } else increment(held, "guardian_targeted_by_conflicting_source_contacts", items.length);
  }
  const mappedContacts = plan.length;

  const updateFields: Record<string, number> = {};
  const evidence: Record<string, number> = {};
  for (const item of plan) {
    for (const field of Object.keys(item.data)) increment(updateFields, `guardian.${field}`);
    increment(evidence, item.evidence);
  }
  const fingerprint = sha256(stableJson({
    schoolKey: input.schoolKey,
    center: state.center,
    exportDate: input.reviewed.exportDate,
    sourceSha: input.reviewed.sourceSha,
    relationshipSha: input.reviewed.relationshipSha ?? null,
    sourceInventory: parsed.inventory,
    held,
    plan: plan.slice().sort((left, right) => left.guardianId.localeCompare(right.guardianId)),
  }));
  return {
    state,
    plan,
    fingerprint,
    summary: {
      centerId: input.reviewed.centerId,
      centerName: input.reviewed.centerName,
      schoolKey: input.schoolKey,
      source: parsed.inventory,
      production: { families: state.families.length, guardians: state.families.reduce((total, family) => total + family.guardians.length, 0) },
      mappedContacts,
      held,
      operations: { guardianUpdates: plan.length },
      updateFields,
      evidence,
      totalOperations: plan.length,
      fingerprint,
    },
  };
}

async function applyPlan(input: Awaited<ReturnType<typeof buildPlan>>) {
  const center = input.state.center!;
  for (const item of input.plan) {
    await prisma.$transaction(async (tx) => {
      const freshCenter = await tx.center.findUnique({ where: { id: center.id }, select: { name: true, locationId: true, status: true } });
      invariant(freshCenter && freshCenter.name === center.name && freshCenter.locationId === center.locationId && freshCenter.status === "active", "The reviewed center identity or status changed after preview.");
      const freshGuardian = await tx.guardian.findUnique({ where: { id: item.guardianId }, select: { id: true, familyId: true, fullName: true, email: true, phone: true, relation: true, sourceSystem: true, externalId: true } });
      invariant(freshGuardian && freshGuardian.familyId === item.familyId && guardianStateHash(freshGuardian) === item.expectedStateHash, `Guardian ${item.guardianId} changed after preview; no update was applied.`);
      await tx.guardian.update({ where: { id: item.guardianId }, data: item.data });
      await tx.auditLog.create({
        data: {
          tenantId: center.organization.tenantId,
          centerId: center.id,
          action: AUDIT_ACTION,
          resource: "Guardian",
          resourceId: item.guardianId,
          metadata: { source: REPAIR_SOURCE, fingerprint: input.fingerprint, evidence: item.evidence, fields: Object.keys(item.data).sort() },
        },
      });
    }, { timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

async function main() {
  const requestedSchool = requiredOption(SCHOOL_OPTION);
  invariant(requestedSchool in REVIEWED_SOURCES, `Unknown reviewed school key ${requestedSchool}.`);
  const schoolKey = requestedSchool as ReviewedSchoolKey;
  const reviewed: ReviewedSource = REVIEWED_SOURCES[schoolKey];
  const sourcePath = path.resolve(requiredOption(SOURCE_OPTION));
  const sourceBuffer = readFileSync(sourcePath);
  invariant(sha256(sourceBuffer) === reviewed.sourceSha, `Source SHA-256 does not match the reviewed ${schoolKey} export.`);
  const relationshipBuffer = reviewed.relationshipSha ? readFileSync(path.resolve(requiredOption(RELATIONSHIP_OPTION))) : undefined;
  if (relationshipBuffer) invariant(sha256(relationshipBuffer) === reviewed.relationshipSha, `Relationship SHA-256 does not match the reviewed ${schoolKey} export.`);

  const before = await boundary(reviewed.centerId);
  const preview = await buildPlan({ schoolKey, reviewed, sourceBuffer, relationshipBuffer, sourceName: path.basename(sourcePath) });
  if (!process.argv.includes(APPLY_FLAG)) {
    console.log(JSON.stringify({ dryRun: true, ...preview.summary, boundary: before }, null, 2));
    return;
  }
  invariant(requiredOption(CONFIRM_OPTION).toLowerCase() === preview.fingerprint, "The confirmed fingerprint does not match the current production plan.");
  await applyPlan(preview);
  const after = await boundary(reviewed.centerId);
  const verification = await buildPlan({ schoolKey, reviewed, sourceBuffer, relationshipBuffer, sourceName: path.basename(sourcePath) });
  invariant(verification.summary.totalOperations === 0, `Post-apply verification still plans ${verification.summary.totalOperations} repeatable updates.`);
  invariant(stableJson(before) === stableJson(after), "A protected billing, messaging, invitation, access, login, or PIN boundary changed during contact reconciliation.");
  console.log(JSON.stringify({
    dryRun: false,
    appliedFingerprint: preview.fingerprint,
    applied: preview.summary.operations,
    updateFields: preview.summary.updateFields,
    held: preview.summary.held,
    postApplyOperations: verification.summary.totalOperations,
    boundary: after,
    protectedBoundaryObservedChange: false,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
