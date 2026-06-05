export type ProcareDuplicateEntity = "family" | "child" | "guardian";

export type ProcareDuplicateConfidence = "high" | "medium" | "low";

export type ProcareDuplicateImportRecord = {
  entity: ProcareDuplicateEntity;
  externalId?: string | null;
  familyName?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  dateOfBirth?: Date | string | null;
  childName?: string | null;
  guardianName?: string | null;
  relation?: string | null;
};

export type ProcareDuplicateCandidateRecord = {
  entity: ProcareDuplicateEntity;
  recordId: string;
  label: string;
  externalId?: string | null;
  familyName?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  dateOfBirth?: Date | string | null;
  childNames?: Array<string | null | undefined>;
  childDatesOfBirth?: Array<Date | string | null | undefined>;
  guardianNames?: Array<string | null | undefined>;
  guardianEmails?: Array<string | null | undefined>;
  guardianPhones?: Array<string | null | undefined>;
  relation?: string | null;
};

export type ProcareDuplicateCandidate = {
  entity: ProcareDuplicateEntity;
  recordId: string;
  label: string;
  confidence: ProcareDuplicateConfidence;
  score: number;
  reasons: string[];
};

export type ProcareDuplicateMatch = {
  rowNumber: number;
  entity: ProcareDuplicateEntity;
  importLabel: string;
  candidates: ProcareDuplicateCandidate[];
  recommendedRecordId: string | null;
  resolution: "auto_match" | "needs_review" | "create_new";
};

export function normalizeProcareDuplicateText(value: unknown) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

export function normalizeProcareDuplicateEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeProcareDuplicatePhone(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(-10) : "";
}

export function normalizeProcareDuplicateDate(value: unknown) {
  if (!value) return "";
  const date = new Date(value as Date | string);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function hasIntersection(left: string[], right: string[]) {
  const rightSet = new Set(right.filter(Boolean));
  return left.some((value) => value && rightSet.has(value));
}

function confidenceForScore(score: number): ProcareDuplicateConfidence {
  return score >= 75 ? "high" : score >= 50 ? "medium" : "low";
}

function candidateThreshold(entity: ProcareDuplicateEntity) {
  return entity === "family" ? 25 : 30;
}

export function scoreProcareDuplicateCandidate(
  input: ProcareDuplicateImportRecord,
  candidate: ProcareDuplicateCandidateRecord,
): ProcareDuplicateCandidate | null {
  if (input.entity !== candidate.entity) return null;

  const reasons: string[] = [];
  let score = 0;
  const inputExternalId = normalizeProcareDuplicateText(input.externalId);
  const candidateExternalId = normalizeProcareDuplicateText(candidate.externalId);
  if (inputExternalId && candidateExternalId && inputExternalId === candidateExternalId) {
    score += 90;
    reasons.push("same ProCare ID");
  }

  const inputEmail = normalizeProcareDuplicateEmail(input.email);
  const candidateEmail = normalizeProcareDuplicateEmail(candidate.email);
  if (inputEmail && candidateEmail && inputEmail === candidateEmail) {
    score += input.entity === "family" ? 45 : 55;
    reasons.push(input.entity === "family" ? "same billing email" : "same email");
  }

  const inputPhone = normalizeProcareDuplicatePhone(input.phone);
  const candidatePhone = normalizeProcareDuplicatePhone(candidate.phone);
  if (inputPhone && candidatePhone && inputPhone === candidatePhone) {
    score += input.entity === "guardian" ? 35 : 25;
    reasons.push("same phone");
  }

  const inputName = normalizeProcareDuplicateText(input.name);
  const candidateName = normalizeProcareDuplicateText(candidate.name);
  if (inputName && candidateName && inputName === candidateName) {
    score += input.entity === "family" ? 20 : 35;
    reasons.push(input.entity === "family" ? "same family name" : "same name");
  }

  const inputFamilyName = normalizeProcareDuplicateText(input.familyName);
  const candidateFamilyName = normalizeProcareDuplicateText(candidate.familyName);
  if (inputFamilyName && candidateFamilyName && inputFamilyName === candidateFamilyName) {
    score += input.entity === "family" ? 20 : 15;
    reasons.push("same family");
  }

  const inputAddress = normalizeProcareDuplicateText(input.address);
  const candidateAddress = normalizeProcareDuplicateText(candidate.address);
  if (inputAddress && candidateAddress && inputAddress === candidateAddress) {
    score += 15;
    reasons.push("same address");
  }

  const inputDate = normalizeProcareDuplicateDate(input.dateOfBirth);
  const candidateDate = normalizeProcareDuplicateDate(candidate.dateOfBirth);
  if (inputDate && candidateDate && inputDate === candidateDate) {
    score += input.entity === "child" ? 30 : 10;
    reasons.push("same date of birth");
  }

  const childName = normalizeProcareDuplicateText(input.childName);
  if (childName && hasIntersection([childName], (candidate.childNames ?? []).map(normalizeProcareDuplicateText))) {
    score += input.entity === "family" ? 25 : 10;
    reasons.push("matching child name");
  }

  if (inputDate && hasIntersection([inputDate], (candidate.childDatesOfBirth ?? []).map(normalizeProcareDuplicateDate))) {
    score += 15;
    reasons.push("matching child date of birth");
  }

  const guardianName = normalizeProcareDuplicateText(input.guardianName);
  if (guardianName && hasIntersection([guardianName], (candidate.guardianNames ?? []).map(normalizeProcareDuplicateText))) {
    score += input.entity === "family" ? 20 : 10;
    reasons.push("matching guardian name");
  }

  if (inputEmail && hasIntersection([inputEmail], (candidate.guardianEmails ?? []).map(normalizeProcareDuplicateEmail))) {
    score += 40;
    reasons.push("matching guardian email");
  }

  if (inputPhone && hasIntersection([inputPhone], (candidate.guardianPhones ?? []).map(normalizeProcareDuplicatePhone))) {
    score += 25;
    reasons.push("matching guardian phone");
  }

  const inputRelation = normalizeProcareDuplicateText(input.relation);
  const candidateRelation = normalizeProcareDuplicateText(candidate.relation);
  if (input.entity === "guardian" && inputRelation && candidateRelation && inputRelation === candidateRelation) {
    score += 5;
    reasons.push("same relation");
  }

  if (score < candidateThreshold(input.entity)) return null;

  return {
    entity: candidate.entity,
    recordId: candidate.recordId,
    label: candidate.label,
    confidence: confidenceForScore(score),
    score,
    reasons,
  };
}

export function buildProcareDuplicateMatch({
  rowNumber,
  entity,
  importLabel,
  candidates,
}: {
  rowNumber: number;
  entity: ProcareDuplicateEntity;
  importLabel: string;
  candidates: ProcareDuplicateCandidate[];
}): ProcareDuplicateMatch {
  const sortedCandidates = [...candidates].sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
  const highConfidenceCandidates = sortedCandidates.filter((candidate) => candidate.confidence === "high");
  const recommendedRecordId = highConfidenceCandidates.length === 1 ? highConfidenceCandidates[0].recordId : null;
  return {
    rowNumber,
    entity,
    importLabel,
    candidates: sortedCandidates,
    recommendedRecordId,
    resolution: !sortedCandidates.length ? "create_new" : recommendedRecordId ? "auto_match" : "needs_review",
  };
}
