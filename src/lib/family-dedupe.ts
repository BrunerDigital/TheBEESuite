export type FamilyDedupeGuardian = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type FamilyDedupeChild = {
  fullName?: string | null;
  dateOfBirth?: Date | string | null;
};

export type FamilyDedupeRecord = {
  id: string;
  centerId?: string | null;
  name?: string | null;
  billingEmail?: string | null;
  address?: string | null;
  guardians?: FamilyDedupeGuardian[];
  children?: FamilyDedupeChild[];
};

export type FamilyDuplicateCandidate = {
  familyId: string;
  candidateId: string;
  confidence: "high" | "medium" | "low";
  score: number;
  reasons: string[];
};

export type ChildDedupeRecord = FamilyDedupeChild & {
  id: string;
  familyId?: string | null;
  familyName?: string | null;
  centerId?: string | null;
  preferredName?: string | null;
  ageGroup?: string | null;
};

export type GuardianDedupeRecord = FamilyDedupeGuardian & {
  id: string;
  familyId?: string | null;
  familyName?: string | null;
  centerId?: string | null;
  relation?: string | null;
};

export type MemberDuplicateCandidate = {
  recordId: string;
  candidateId: string;
  confidence: "high" | "medium" | "low";
  score: number;
  reasons: string[];
};

function normalizeText(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    : "";
}

function normalizePersonName(value: unknown) {
  if (typeof value !== "string") return "";
  const nameParts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (nameParts.length < 2) return normalizeText(value);

  const suffixes = new Set(["jr", "sr", "ii", "iii", "iv", "v", "esq", "phd", "md", "dds", "dmd", "do"]);
  const trailingPart = normalizeText(nameParts.at(-1)).replace(/\s+/g, "");
  const hasSuffix = suffixes.has(trailingPart);
  if (nameParts.length === 2 && hasSuffix) return normalizeText(`${nameParts[0]} ${trailingPart}`);

  const givenNames = hasSuffix ? nameParts.slice(1, -1) : nameParts.slice(1);
  return normalizeText(`${givenNames.join(" ")} ${nameParts[0]} ${hasSuffix ? trailingPart : ""}`);
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePhone(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(-10) : "";
}

function normalizedDate(value: unknown) {
  if (!value) return "";
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function childKey(child: FamilyDedupeChild) {
  const name = normalizeText(child.fullName);
  const dateOfBirth = normalizedDate(child.dateOfBirth);
  return name && dateOfBirth ? `${name}|${dateOfBirth}` : "";
}

function hasIntersection(left: string[], right: string[]) {
  const rightSet = new Set(right.filter(Boolean));
  return left.some((value) => value && rightSet.has(value));
}

function confidenceForScore(score: number) {
  return score >= 70 ? "high" as const : score >= 50 ? "medium" as const : "low" as const;
}

export function scoreFamilyDuplicate(left: FamilyDedupeRecord, right: FamilyDedupeRecord): FamilyDuplicateCandidate | null {
  if (left.id === right.id) return null;
  if (left.centerId && right.centerId && left.centerId !== right.centerId) return null;

  const reasons: string[] = [];
  let score = 0;

  const leftBillingEmail = normalizeEmail(left.billingEmail);
  const rightBillingEmail = normalizeEmail(right.billingEmail);
  if (leftBillingEmail && leftBillingEmail === rightBillingEmail) {
    score += 45;
    reasons.push("same billing email");
  }

  const leftGuardianEmails = (left.guardians ?? []).map((guardian) => normalizeEmail(guardian.email));
  const rightGuardianEmails = (right.guardians ?? []).map((guardian) => normalizeEmail(guardian.email));
  if (hasIntersection(leftGuardianEmails, rightGuardianEmails)) {
    score += 40;
    reasons.push("matching guardian email");
  }

  const leftGuardianPhones = (left.guardians ?? []).map((guardian) => normalizePhone(guardian.phone));
  const rightGuardianPhones = (right.guardians ?? []).map((guardian) => normalizePhone(guardian.phone));
  if (hasIntersection(leftGuardianPhones, rightGuardianPhones)) {
    score += 25;
    reasons.push("matching guardian phone");
  }

  const leftChildren = (left.children ?? []).map(childKey);
  const rightChildren = (right.children ?? []).map(childKey);
  if (hasIntersection(leftChildren, rightChildren)) {
    score += 35;
    reasons.push("matching child name and date of birth");
  }

  const leftName = normalizeText(left.name);
  const rightName = normalizeText(right.name);
  if (leftName && leftName === rightName) {
    score += 20;
    reasons.push("same family name");
  }

  const leftAddress = normalizeText(left.address);
  const rightAddress = normalizeText(right.address);
  if (leftAddress && leftAddress === rightAddress) {
    score += 15;
    reasons.push("same address");
  }

  if (score < 25) return null;

  return {
    familyId: left.id,
    candidateId: right.id,
    confidence: confidenceForScore(score),
    score,
    reasons,
  };
}

export function findFamilyDuplicateCandidates(families: FamilyDedupeRecord[], familyId: string) {
  const family = families.find((item) => item.id === familyId);
  if (!family) return [];
  return families
    .map((candidate) => scoreFamilyDuplicate(family, candidate))
    .filter((candidate): candidate is FamilyDuplicateCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score || left.candidateId.localeCompare(right.candidateId));
}

export function scoreChildDuplicate(left: ChildDedupeRecord, right: ChildDedupeRecord): MemberDuplicateCandidate | null {
  if (left.id === right.id) return null;
  if (left.centerId && right.centerId && left.centerId !== right.centerId) return null;

  const reasons: string[] = [];
  let score = 0;
  const leftName = normalizePersonName(left.fullName);
  const rightName = normalizePersonName(right.fullName);
  const sameName = Boolean(leftName && leftName === rightName);
  const leftPreferredName = normalizeText(left.preferredName);
  const rightPreferredName = normalizeText(right.preferredName);
  const leftDateOfBirth = normalizedDate(left.dateOfBirth);
  const rightDateOfBirth = normalizedDate(right.dateOfBirth);

  if (sameName && leftDateOfBirth && leftDateOfBirth === rightDateOfBirth) {
    score += 70;
    reasons.push("same child name and date of birth");
  } else {
    if (sameName) {
      score += 35;
      reasons.push("same child name");
    }
    if (leftDateOfBirth && leftDateOfBirth === rightDateOfBirth) {
      score += 25;
      reasons.push("same date of birth");
    }
  }

  // Shared birth dates, classrooms, and preferred names are common for siblings
  // and placeholder ProCare records. A matching child name is the minimum safe
  // identity signal before showing a merge candidate.
  if (!sameName) return null;

  if (leftPreferredName && leftPreferredName === rightPreferredName) {
    score += 10;
    reasons.push("same preferred name");
  }

  if (left.familyId && right.familyId && left.familyId === right.familyId) {
    score += 10;
    reasons.push("same family account");
  }

  const leftAgeGroup = normalizeText(left.ageGroup);
  const rightAgeGroup = normalizeText(right.ageGroup);
  if (leftAgeGroup && leftAgeGroup === rightAgeGroup) {
    score += 5;
    reasons.push("same age group");
  }

  if (score < 35) return null;

  return {
    recordId: left.id,
    candidateId: right.id,
    confidence: confidenceForScore(score),
    score,
    reasons,
  };
}

export function findChildDuplicateCandidates(children: ChildDedupeRecord[], childId: string) {
  const child = children.find((item) => item.id === childId);
  if (!child) return [];
  return children
    .map((candidate) => scoreChildDuplicate(child, candidate))
    .filter((candidate): candidate is MemberDuplicateCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score || left.candidateId.localeCompare(right.candidateId));
}

export function scoreGuardianDuplicate(left: GuardianDedupeRecord, right: GuardianDedupeRecord): MemberDuplicateCandidate | null {
  if (left.id === right.id) return null;
  if (left.centerId && right.centerId && left.centerId !== right.centerId) return null;

  const reasons: string[] = [];
  let score = 0;
  const leftEmail = normalizeEmail(left.email);
  const rightEmail = normalizeEmail(right.email);
  if (leftEmail && leftEmail === rightEmail) {
    score += 60;
    reasons.push("same guardian email");
  }

  const leftPhone = normalizePhone(left.phone);
  const rightPhone = normalizePhone(right.phone);
  if (leftPhone && leftPhone === rightPhone) {
    score += 40;
    reasons.push("same guardian phone");
  }

  const leftName = normalizePersonName(left.fullName);
  const rightName = normalizePersonName(right.fullName);
  const sameName = Boolean(leftName && leftName === rightName);
  const sameEmail = Boolean(leftEmail && leftEmail === rightEmail);
  if (!sameEmail && !sameName) return null;
  if (sameName) {
    score += 30;
    reasons.push("same guardian name");
  }

  if (left.familyId && right.familyId && left.familyId === right.familyId) {
    score += 10;
    reasons.push("same family account");
  }

  const leftRelation = normalizeText(left.relation);
  const rightRelation = normalizeText(right.relation);
  if (leftRelation && leftRelation === rightRelation) {
    score += 5;
    reasons.push("same relation");
  }

  if (score < 35) return null;

  return {
    recordId: left.id,
    candidateId: right.id,
    confidence: confidenceForScore(score),
    score,
    reasons,
  };
}

export function findGuardianDuplicateCandidates(guardians: GuardianDedupeRecord[], guardianId: string) {
  const guardian = guardians.find((item) => item.id === guardianId);
  if (!guardian) return [];
  return guardians
    .map((candidate) => scoreGuardianDuplicate(guardian, candidate))
    .filter((candidate): candidate is MemberDuplicateCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score || left.candidateId.localeCompare(right.candidateId));
}
