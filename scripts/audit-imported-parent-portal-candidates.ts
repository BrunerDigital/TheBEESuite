import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import { evaluateParentInvitationReadiness } from "@/lib/parent-invitation-readiness";
import { parentPortalAccessDisabled } from "@/lib/parent-portal-logins";
import { isActiveProcareEnrollmentStatus } from "@/lib/procare-import-fields";
import { prisma } from "@/lib/prisma";
import { getSupabaseAuthConfig } from "@/lib/supabase-auth";

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function email(value: string | null | undefined) {
  return clean(value).toLowerCase();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function phoneReady(value: string | null | undefined) {
  return clean(value).replace(/\D/g, "").length >= 4;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function valueAt(value: unknown, ...keys: string[]) {
  let current: unknown = value;
  for (const key of keys) current = record(current)[key];
  return typeof current === "string" ? current : "";
}

async function authEmails() {
  const { url, key } = getSupabaseAuthConfig("service");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = new Set<string>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) if (user.email) result.add(email(user.email));
    if (data.users.length < 1000) break;
  }
  return result;
}

async function main() {
  const [centers, families, users, allGuardians, auth, batches] = await Promise.all([
    prisma.center.findMany({
      where: { status: "active" },
      select: { id: true, name: true, crmLocationId: true, organization: { select: { tenantId: true } } },
      orderBy: { crmLocationId: "asc" },
    }),
    prisma.family.findMany({
      where: { centerId: { not: null }, sourceSystem: "procare" },
      select: {
        id: true,
        name: true,
        centerId: true,
        sourceSystem: true,
        externalId: true,
        customFields: true,
        children: { select: { id: true, enrollmentStatus: true, sourceSystem: true, externalId: true, customFields: true } },
        guardians: {
          select: {
            id: true,
            userId: true,
            fullName: true,
            email: true,
            phone: true,
            isBillingContact: true,
            sourceSystem: true,
            externalId: true,
            customFields: true,
          },
        },
        pickups: { select: { id: true, sourceSystem: true, externalId: true } },
      },
    }),
    prisma.user.findMany({
      select: { id: true, email: true, tenantId: true, role: true, isActive: true, mustResetPassword: true },
    }),
    prisma.guardian.findMany({
      where: { email: { not: null } },
      select: {
        id: true,
        familyId: true,
        email: true,
        phone: true,
        fullName: true,
        sourceSystem: true,
        externalId: true,
        family: { select: { centerId: true } },
      },
    }),
    authEmails(),
    prisma.procareImportBatch.findMany({
      select: { id: true, centerId: true, status: true, filename: true, summary: true, _count: { select: { rows: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const userByEmail = new Map(users.map((user) => [email(user.email), user]));
  const guardiansByEmail = Map.groupBy(allGuardians, (guardian) => email(guardian.email));
  const batchesByCenter = Map.groupBy(batches, (batch) => batch.centerId);
  const familyIds = families.map((family) => family.id);
  const linkedBatches = await prisma.procareImportBatch.findMany({
    where: { rows: { some: { createdFamilyId: { in: familyIds } } } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      summary: true,
      rows: {
        where: { createdFamilyId: { in: familyIds } },
        select: { createdFamilyId: true },
      },
    },
  });
  const latestBatchByFamilyId = new Map<string, (typeof linkedBatches)[number]>();
  for (const batch of linkedBatches) {
    for (const row of batch.rows) {
      if (row.createdFamilyId && !latestBatchByFamilyId.has(row.createdFamilyId)) latestBatchByFamilyId.set(row.createdFamilyId, batch);
    }
  }

  const schoolRows = centers
    .filter((center) => center.crmLocationId !== "Kid City USA - TX | Tyler" && !`${center.name} ${center.crmLocationId}`.toLowerCase().includes("demo"))
    .map((center) => {
      const currentFamilies = families.filter((family) => (
        family.centerId === center.id
        && family.children.some((child) => isActiveProcareEnrollmentStatus(child.enrollmentStatus))
      ));
      const candidates = currentFamilies.flatMap((family) => {
        const pickupIds = new Set(family.pickups
          .filter((pickup) => pickup.sourceSystem === "procare" && clean(pickup.externalId))
          .map((pickup) => clean(pickup.externalId)));
        return family.guardians.flatMap((guardian) => {
          const normalizedEmail = email(guardian.email);
          const payer = guardian.isBillingContact;
          const pickup = guardian.sourceSystem === "procare"
            && clean(guardian.externalId)
            && pickupIds.has(clean(guardian.externalId));
          if ((!payer && !pickup) || !validEmail(normalizedEmail)) return [];
          const reasons: string[] = [];
          if (!phoneReady(guardian.phone)) reasons.push("phone");
          if (guardian.sourceSystem !== "procare" || !clean(guardian.externalId)) reasons.push("guardian_provenance");
          if (family.sourceSystem !== "procare" || !clean(family.externalId)) reasons.push("family_provenance");
          if (family.children.filter((child) => isActiveProcareEnrollmentStatus(child.enrollmentStatus)).some((child) => child.sourceSystem !== "procare" || !clean(child.externalId))) reasons.push("child_provenance");
          if (parentPortalAccessDisabled(guardian.customFields)) reasons.push("portal_disabled");
          const matching = guardiansByEmail.get(normalizedEmail) ?? [];
          if (matching.some((item) => item.family.centerId !== center.id)) reasons.push("cross_center_email");
          if (matching.some((item) => item.id !== guardian.id && item.fullName.trim().toLowerCase() !== guardian.fullName.trim().toLowerCase() && (!item.externalId || item.externalId !== guardian.externalId))) reasons.push("identity_conflict");
          const user = userByEmail.get(normalizedEmail);
          if (user && user.tenantId !== center.organization.tenantId) reasons.push("tenant_collision");
          if (user && user.role !== UserRole.PARENT_GUARDIAN) reasons.push("role_collision");
          if (user && !user.isActive) reasons.push("inactive_user");
          if (user && !auth.has(normalizedEmail)) reasons.push("auth_missing");
          if (auth.has(normalizedEmail) && !user) reasons.push("auth_orphan");
          if (guardian.userId && guardian.userId !== user?.id) reasons.push("user_link_collision");
          const linkedBatch = latestBatchByFamilyId.get(family.id);
          const readiness = evaluateParentInvitationReadiness({
            guardian: {
              id: guardian.id,
              familyId: family.id,
              fullName: guardian.fullName,
              email: guardian.email,
              phone: guardian.phone,
              sourceSystem: guardian.sourceSystem,
              externalId: guardian.externalId,
            },
            family: {
              id: family.id,
              centerId: family.centerId,
              sourceSystem: family.sourceSystem,
              externalId: family.externalId,
              children: family.children.map((child) => ({
                id: child.id,
                fullName: child.id,
                enrollmentStatus: child.enrollmentStatus,
                sourceSystem: child.sourceSystem,
                externalId: child.externalId,
              })),
            },
            matchingEmailGuardians: matching.map((item) => ({
              id: item.id,
              familyId: item.familyId,
              fullName: item.fullName,
              email: item.email,
              phone: item.phone,
              sourceSystem: item.sourceSystem,
              externalId: item.externalId,
            })),
            relevantImportBatch: linkedBatch ? { id: linkedBatch.id, status: linkedBatch.status, summary: linkedBatch.summary } : null,
          });
          for (const blocker of readiness.blockers) reasons.push(`readiness:${blocker}`);
          return [{ guardianId: guardian.id, familyId: family.id, email: normalizedEmail, payer, pickup, linked: guardian.userId === user?.id, reasons: [...new Set(reasons)] }];
        });
      });
      const relevantBatches = (batchesByCenter.get(center.id) ?? []).slice(0, 4).map((batch) => ({
        id: batch.id,
        status: batch.status,
        filename: batch.filename,
        rows: batch._count.rows,
        source: valueAt(batch.summary, "source"),
        sourceType: valueAt(batch.summary, "sourceType"),
        importMethod: valueAt(batch.summary, "importMethod"),
        errors: Number(record(batch.summary).errors ?? 0),
        unresolved: Number(record(batch.summary).unresolved ?? 0),
        warningRows: Number(record(batch.summary).warningRows ?? 0),
        disposed: Number(record(batch.summary).disposed ?? 0),
        sourceInventoryConfirmed: record(batch.summary).sourceInventoryConfirmed === true,
      }));
      const provenance = new Map<string, number>();
      for (const family of currentFamilies) {
        const fields = record(family.customFields);
        const key = [
          valueAt(fields, "source") || "no_source",
          valueAt(fields, "procareImportBatchId") || valueAt(fields, "importBatchId") || "no_batch",
        ].join(" | ");
        provenance.set(key, (provenance.get(key) ?? 0) + 1);
      }
      const reasonCounts = new Map<string, number>();
      for (const candidate of candidates) for (const reason of new Set(candidate.reasons)) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      return {
        school: center.crmLocationId ?? center.name,
        centerId: center.id,
        importedCurrentFamilies: currentFamilies.length,
        importedCurrentChildren: currentFamilies.reduce((sum, family) => sum + family.children.filter((child) => isActiveProcareEnrollmentStatus(child.enrollmentStatus)).length, 0),
        candidatePeople: candidates.length,
        payerCandidates: candidates.filter((candidate) => candidate.payer).length,
        pickupCandidates: candidates.filter((candidate) => candidate.pickup).length,
        payerAndPickupCandidates: candidates.filter((candidate) => candidate.payer && candidate.pickup).length,
        alreadyLinked: candidates.filter((candidate) => candidate.linked).length,
        linkedReady: candidates.filter((candidate) => candidate.linked && candidate.reasons.length === 0).length,
        linkedBlocked: candidates.filter((candidate) => candidate.linked && candidate.reasons.length > 0).length,
        safeUnlinked: candidates.filter((candidate) => !candidate.linked && candidate.reasons.length === 0).length,
        blockedUnlinked: candidates.filter((candidate) => !candidate.linked && candidate.reasons.length > 0).length,
        blockers: Object.fromEntries([...reasonCounts].sort((left, right) => right[1] - left[1])),
        familyProvenance: Object.fromEntries([...provenance].sort((left, right) => right[1] - left[1])),
        recentBatches: relevantBatches,
      };
    })
    .filter((row) => row.importedCurrentFamilies || row.recentBatches.length);
  const compact = process.argv.includes("--compact");
  console.log(JSON.stringify({
    schools: compact ? schoolRows.map((row) => ({
      school: row.school,
      candidatePeople: row.candidatePeople,
      alreadyLinked: row.alreadyLinked,
      linkedReady: row.linkedReady,
      linkedBlocked: row.linkedBlocked,
      safeUnlinked: row.safeUnlinked,
      blockedUnlinked: row.blockedUnlinked,
      blockers: row.blockers,
    })) : schoolRows,
    totals: {
      importedCurrentFamilies: schoolRows.reduce((sum, row) => sum + row.importedCurrentFamilies, 0),
      candidatePeople: schoolRows.reduce((sum, row) => sum + row.candidatePeople, 0),
      alreadyLinked: schoolRows.reduce((sum, row) => sum + row.alreadyLinked, 0),
      safeUnlinked: schoolRows.reduce((sum, row) => sum + row.safeUnlinked, 0),
      blockedUnlinked: schoolRows.reduce((sum, row) => sum + row.blockedUnlinked, 0),
    },
  }, null, 2));
}

void main().finally(() => prisma.$disconnect());
