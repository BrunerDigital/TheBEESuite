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
    ? value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[øØ]/g, "o")
        .replace(/[łŁ]/g, "l")
        .replace(/[đĐðÐ]/g, "d")
        .replace(/[þÞ]/g, "th")
        .replace(/[æÆ]/g, "ae")
        .replace(/[œŒ]/g, "oe")
        .replace(/ß/g, "ss")
        .replace(/[ıİ]/g, "i")
        .replace(/['’]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";
}

const personNameSuffixes = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const personNameCredentials = new Set([
  "aprn", "ba", "bs", "bsn", "cpa", "dc", "dds", "dmd", "do", "dpt", "edd", "esq", "jd", "lpn", "lvn",
  "ma", "mba", "md", "ms", "msn", "np", "od", "pa", "pharmd", "phd", "rn",
]);

function canonicalPersonNameToken(value: unknown, supported: Set<string>) {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  return supported.has(normalized) ? normalized : "";
}

function stripTrailingPersonCredentials(parts: string[]) {
  const remaining = [...parts];
  while (remaining.length) {
    const trailingWords = remaining.at(-1)?.split(/\s+/).filter(Boolean) ?? [];
    const rawCredential = trailingWords.at(-1) ?? "";
    if (!canonicalPersonNameToken(rawCredential, personNameCredentials)) break;
    const separateCommaPart = remaining.length > 1 && trailingWords.length === 1;
    const uppercaseLetters = rawCredential.match(/[A-Z]/g)?.length ?? 0;
    const visiblyAttachedCredential = rawCredential.includes(".")
      || (trailingWords.length >= 3 && uppercaseLetters >= 2);
    if (!separateCommaPart && !visiblyAttachedCredential) break;
    trailingWords.pop();
    if (trailingWords.length) remaining[remaining.length - 1] = trailingWords.join(" ");
    else remaining.pop();
  }
  return remaining;
}

function normalizePersonName(value: unknown) {
  if (typeof value !== "string") return "";
  const nameParts = stripTrailingPersonCredentials(value.split(",").map((part) => part.trim()).filter(Boolean));
  if (nameParts.length < 2) {
    const words = (nameParts[0] ?? "").split(/\s+/).filter(Boolean);
    const suffix = canonicalPersonNameToken(words.at(-1), personNameSuffixes);
    return suffix
      ? normalizeText(`${words.slice(0, -1).join(" ")} ${suffix}`)
      : normalizeText(words.join(" "));
  }

  const separateSuffix = canonicalPersonNameToken(nameParts.at(-1), personNameSuffixes);
  if (nameParts.length === 2 && separateSuffix) return normalizeText(`${nameParts[0]} ${separateSuffix}`);

  const givenNameWords = (separateSuffix ? nameParts.slice(1, -1) : nameParts.slice(1))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);
  const attachedSuffix = separateSuffix ? "" : canonicalPersonNameToken(givenNameWords.at(-1), personNameSuffixes);
  if (attachedSuffix) givenNameWords.pop();
  const suffix = separateSuffix || attachedSuffix;
  return normalizeText(`${givenNameWords.join(" ")} ${nameParts[0]} ${suffix}`);
}

function personNamesMatch(left: string, right: string) {
  if (left === right) return Boolean(left);
  const leftParts = left.split(" ").filter(Boolean);
  const rightParts = right.split(" ").filter(Boolean);
  const leftSuffix = personNameSuffixes.has(leftParts.at(-1) ?? "") ? leftParts.pop() : "";
  const rightSuffix = personNameSuffixes.has(rightParts.at(-1) ?? "") ? rightParts.pop() : "";
  if (leftSuffix !== rightSuffix) return false;
  if (leftParts.length < 2 || rightParts.length < 2) return false;
  if (leftParts[0] !== rightParts[0] || leftParts.at(-1) !== rightParts.at(-1)) return false;

  const leftMiddle = leftParts.slice(1, -1);
  const rightMiddle = rightParts.slice(1, -1);
  if (Math.abs(leftMiddle.length - rightMiddle.length) > 2) return false;
  const middlePartsMatch = (leftPart: string, rightPart: string) => leftPart === rightPart
    || (leftPart.length === 1 && rightPart.startsWith(leftPart))
    || (rightPart.length === 1 && leftPart.startsWith(rightPart));
  if (leftMiddle.length === rightMiddle.length) {
    return leftMiddle.every((part, index) => middlePartsMatch(part, rightMiddle[index]));
  }

  const [shorterMiddle, longerMiddle] = leftMiddle.length < rightMiddle.length
    ? [leftMiddle, rightMiddle]
    : [rightMiddle, leftMiddle];
  if (!shorterMiddle.length) return true;
  let longerIndex = 0;
  return shorterMiddle.every((part) => {
    while (longerIndex < longerMiddle.length && !middlePartsMatch(part, longerMiddle[longerIndex])) longerIndex += 1;
    if (longerIndex >= longerMiddle.length) return false;
    longerIndex += 1;
    return true;
  });
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
  const sameName = personNamesMatch(leftName, rightName);
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
  const sameName = personNamesMatch(leftName, rightName);
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
