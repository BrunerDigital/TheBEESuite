import "./load-env";
import { prisma } from "@/lib/prisma";
import { evaluateProcareInvitationBatchReadiness } from "@/lib/parent-invitation-readiness";

const SCHOOL_NAMES = [
  "Kid City USA - TX | Corpus Christi",
  "Miss Honey's Learning Center - CO | Centennial",
  "Kid City USA - CO | Longmont",
  "Kid City USA - FL | Holly Hill",
  "Kid City USA - FL | Jacksonville - Beach",
  "Kid City USA - FL | Jacksonville - Oakleaf",
  "Kid City USA - FL | Sarasota",
  "Kid City USA - IN | Jasper - Baden Strasse",
  "Kid City USA - IN | Newburgh - Paradise",
  "Kid City USA - IN | Petersburg",
  "Kid City USA - IN | Southpointe",
  "Kid City USA - MO | Lees Summit",
  "Kid City USA - NC | Canton",
  "Miss Honey's Learning Center - NC | Lincolnton",
  "Kid City USA - NC | Pisgah Forest",
  "Kid City USA - TX | Garland",
  "Kid City USA - TX | Granbury",
  "Kid City USA - CO | Colorado Springs - Cordera",
] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function main() {
  const centers = await prisma.center.findMany({
    select: {
      id: true,
      name: true,
      locationId: true,
      crmLocationId: true,
      procareImports: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          filename: true,
          status: true,
          createdAt: true,
          summary: true,
          rows: {
            select: {
              status: true,
              resolutionCategory: true,
              resolutionReason: true,
              resolutionEvidenceReference: true,
              resolvedBy: true,
              resolvedAt: true,
            },
          },
        },
      },
    },
  });

  const selected = centers.filter((center) => SCHOOL_NAMES.includes(
    center.name as (typeof SCHOOL_NAMES)[number],
  ));

  const report = selected.map((center) => {
    const candidates = center.procareImports.map((candidate) => ({
      candidate,
      readiness: evaluateProcareInvitationBatchReadiness(candidate),
    }));
    candidates.sort((left, right) => (
      left.readiness.blockers.length - right.readiness.blockers.length
      || right.candidate.createdAt.getTime() - left.candidate.createdAt.getTime()
    ));
    const batch = candidates[0]?.candidate ?? null;
    const summary = record(batch?.summary);
    const datasetCoverage = record(summary.datasetCoverage);
    const normalizedRows = record(datasetCoverage.normalizedRows);
    const warningCoverage = record(datasetCoverage.warningCoverage);
    const rowCounts = (batch?.rows ?? []).reduce<Record<string, number>>((counts, row) => {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
      return counts;
    }, {});
    const disposedWithoutEvidence = (batch?.rows ?? []).filter((row) => row.status === "disposed" && (
      !row.resolutionCategory
      || !row.resolutionReason
      || !row.resolutionEvidenceReference
      || !row.resolvedBy
      || !row.resolvedAt
    )).length;
    return {
      centerId: center.id,
      school: center.name,
      locationId: center.locationId,
      crmLocationId: center.crmLocationId,
      batch: batch ? {
        id: batch.id,
        filename: batch.filename,
        status: batch.status,
        createdAt: batch.createdAt.toISOString(),
        sourceType: summary.sourceType ?? null,
        sourceSha256: summary.sourceSha256 ?? null,
        sourceInventoryConfirmed: summary.sourceInventoryConfirmed === true,
        importMethod: summary.importMethod ?? null,
        reviewFingerprint: summary.reviewFingerprint ?? null,
        errors: number(summary.errors),
        unresolved: number(summary.unresolved),
        warningRows: number(summary.warningRows),
        disposed: number(summary.disposed),
        excludedUnresolvedRows: number(summary.excludedUnresolvedRows),
        normalizedRows,
        warningCoverage,
        sourceInventory: Array.isArray(datasetCoverage.sourceInventory) ? datasetCoverage.sourceInventory : [],
        rowCounts,
        disposedWithoutEvidence,
      } : null,
      candidateBatches: candidates.slice(0, 5).map(({ candidate, readiness }) => ({
        id: candidate.id,
        filename: candidate.filename,
        status: candidate.status,
        createdAt: candidate.createdAt.toISOString(),
        blockers: readiness.blockers,
      })),
    };
  });

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), schools: report }, null, 2));
}

void main().finally(() => prisma.$disconnect());
