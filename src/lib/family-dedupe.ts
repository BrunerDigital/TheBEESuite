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
        .replace(/[ßẞ]/g, "ss")
        .replace(/[ıİ]/g, "i")
        .replace(/['’ʼ]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
    : "";
}

function normalizeTextVariants(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  if (typeof value === "string") {
    const spacedApostrophe = normalizeText(value.replace(/\b([odl])['’ʼ](?=\p{L})/giu, "$1 "));
    if (spacedApostrophe) variants.add(spacedApostrophe);
  }
  return [...variants];
}

const personNameSuffixes = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const personNameSuffixAliases = new Map([
  ["junior", "jr"],
  ["senior", "sr"],
  ["second", "ii"],
  ["third", "iii"],
  ["fourth", "iv"],
  ["fifth", "v"],
]);
const personNameHonorifics = new Set(["dr", "fr", "miss", "mr", "mrs", "ms", "mx", "prof", "rev"]);
const personNameSurnameParticles = new Set([
  "al", "bin", "da", "de", "del", "della", "der", "di", "dos", "du", "la", "le", "los", "saint", "st", "van", "von",
]);
const personNameCredentials = new Set([
  "aprn", "ba", "bs", "bsn", "cpa", "dc", "dds", "dmd", "do", "dpt", "edd", "esq", "jd", "lpn", "lvn",
  "ma", "mba", "md", "ms", "msn", "np", "od", "pa", "pharmd", "phd", "rn",
]);
// These short credential tokens are also established surnames. Treat them as
// credentials only when a comma or punctuation makes that intent explicit.
const personNameCredentialLikeSurnames = new Set(["ba", "do", "ma", "pa"]);

function canonicalPersonNameToken(value: unknown, supported: Set<string>) {
  const compact = normalizeText(value).replace(/\s+/g, "");
  const normalized = supported === personNameSuffixes
    ? personNameSuffixAliases.get(compact) ?? compact
    : compact;
  return supported.has(normalized) ? normalized : "";
}

function normalizePersonNameText(value: unknown) {
  const words = normalizeText(value).split(" ").filter(Boolean);
  const hadHonorific = personNameHonorifics.has(words[0] ?? "");
  if (hadHonorific) words.shift();
  if (hadHonorific && words.length < 2) return "";
  return words.join(" ");
}

function stripTrailingPersonCredentials(parts: string[]) {
  const remaining = [...parts];
  while (remaining.length) {
    const trailingWords = remaining.at(-1)?.split(/\s+/).filter(Boolean) ?? [];
    const rawCredential = trailingWords.at(-1) ?? "";
    if (!canonicalPersonNameToken(rawCredential, personNameCredentials)) break;
    const firstPartWords = remaining[0]?.split(/\s+/).filter(Boolean).length ?? 0;
    const credentialToken = canonicalPersonNameToken(rawCredential, personNameCredentials);
    const groupedCommaCredentials = remaining.length > 1
      && trailingWords.length > 1
      && trailingWords.every((word) => Boolean(canonicalPersonNameToken(word, personNameCredentials)));
    const separateCommaPart = groupedCommaCredentials || (trailingWords.length === 1
      && (remaining.length > 2 || firstPartWords >= 2));
    const visiblyAttachedCredential = rawCredential.includes(".")
      || (trailingWords.length >= 3
        && !personNameCredentialLikeSurnames.has(credentialToken));
    if (!separateCommaPart && !visiblyAttachedCredential) break;
    trailingWords.pop();
    if (trailingWords.length) remaining[remaining.length - 1] = trailingWords.join(" ");
    else remaining.pop();
  }
  return remaining;
}

function stripAttachedPersonCredentials(words: string[]) {
  const remaining = [...words];
  while (remaining.length >= 2) {
    const rawCredential = remaining.at(-1) ?? "";
    const credentialToken = canonicalPersonNameToken(rawCredential, personNameCredentials);
    const credentialLetters = rawCredential.replace(/[^A-Za-z]/g, "");
    const explicitCredential = rawCredential.includes(".")
      || (credentialLetters.length >= 2 && credentialLetters === credentialLetters.toUpperCase());
    if (!credentialToken
      || (personNameCredentialLikeSurnames.has(credentialToken) && !explicitCredential)) break;
    remaining.pop();
  }
  return remaining;
}

function credentialsRemoved(words: string[], stripCredentials: boolean) {
  return stripCredentials ? stripAttachedPersonCredentials(words) : [...words];
}

function normalizePersonName(value: unknown, options: { stripCredentials?: boolean } = {}) {
  if (typeof value !== "string") return "";
  const stripCredentials = options.stripCredentials ?? true;
  const rawNameParts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const finalCommaSuffix = rawNameParts.length > 1
    ? canonicalPersonNameToken(rawNameParts.at(-1), personNameSuffixes)
    : "";
  if (finalCommaSuffix) rawNameParts.pop();
  const nameParts = stripCredentials ? stripTrailingPersonCredentials(rawNameParts) : rawNameParts;
  if (finalCommaSuffix) {
    if (nameParts.length === 1) {
      const fullNameWords = credentialsRemoved(nameParts[0].split(/\s+/).filter(Boolean), stripCredentials);
      return normalizePersonNameText(`${fullNameWords.join(" ")} ${finalCommaSuffix}`);
    }
    const givenNameWords = credentialsRemoved(
      nameParts.slice(1).join(" ").split(/\s+/).filter(Boolean),
      stripCredentials,
    );
    return normalizePersonNameText(`${givenNameWords.join(" ")} ${nameParts[0]} ${finalCommaSuffix}`);
  }
  if (nameParts.length < 2) {
    const words = (nameParts[0] ?? "").split(/\s+/).filter(Boolean);
    const suffix = canonicalPersonNameToken(words.at(-1), personNameSuffixes);
    if (suffix) words.pop();
    const credentialFreeWords = (stripCredentials ? stripTrailingPersonCredentials([words.join(" ")]) : [words.join(" ")])
      .join(" ")
      .split(/\s+/)
      .filter(Boolean);
    return suffix
      ? normalizePersonNameText(`${credentialFreeWords.join(" ")} ${suffix}`)
      : normalizePersonNameText(credentialFreeWords.join(" "));
  }

  const firstPartWords = nameParts[0]?.split(/\s+/).filter(Boolean).length ?? 0;
  const surnameFollowingSuffix = nameParts.length > 2
    ? canonicalPersonNameToken(nameParts[1], personNameSuffixes)
    : "";
  if (surnameFollowingSuffix) {
    const givenNameWords = credentialsRemoved(
      nameParts.slice(2).join(" ").split(/\s+/).filter(Boolean),
      stripCredentials,
    );
    return normalizePersonNameText(`${givenNameWords.join(" ")} ${nameParts[0]} ${surnameFollowingSuffix}`);
  }
  const trailingSuffix = canonicalPersonNameToken(nameParts.at(-1), personNameSuffixes);
  const dottedVInitial = trailingSuffix === "v" && /\.\s*$/.test(nameParts.at(-1) ?? "");
  const separateSuffix = nameParts.length === 2 && (firstPartWords < 2 || dottedVInitial)
    ? ""
    : trailingSuffix;
  if (nameParts.length === 2 && separateSuffix) return normalizePersonNameText(`${nameParts[0]} ${separateSuffix}`);

  const rawGivenNameWords = (separateSuffix ? nameParts.slice(1, -1) : nameParts.slice(1))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);
  const attachedSuffix = separateSuffix || rawGivenNameWords.length < 2
    ? ""
    : canonicalPersonNameToken(rawGivenNameWords.at(-1), personNameSuffixes);
  if (attachedSuffix) rawGivenNameWords.pop();
  const givenNameWords = credentialsRemoved(rawGivenNameWords, stripCredentials);
  const suffix = separateSuffix || attachedSuffix;
  return normalizePersonNameText(`${givenNameWords.join(" ")} ${nameParts[0]} ${suffix}`);
}

function normalizePersonNameVariants(value: unknown, options: { stripCredentials?: boolean } = {}) {
  const stripCredentials = options.stripCredentials ?? true;
  const normalized = normalizePersonName(value, { stripCredentials });
  if (!normalized) return [];
  const variants = new Set(normalizeTextVariants(normalized));

  if (typeof value === "string") {
    const spacedApostropheName = value.replace(/\b([odl])['’ʼ](?=\p{L})/giu, "$1 ");
    if (spacedApostropheName !== value) {
      normalizeTextVariants(normalizePersonName(spacedApostropheName, { stripCredentials }))
        .forEach((variant) => variants.add(variant));
    }
    const joinedHyphenName = value.replace(/([\p{L}\p{N}])[-\u2010-\u2015](?=[\p{L}\p{N}])/gu, "$1");
    if (joinedHyphenName !== value) {
      normalizeTextVariants(normalizePersonName(joinedHyphenName, { stripCredentials }))
        .forEach((variant) => variants.add(variant));
    }
    const rawParts = value.split(",").map((part) => part.trim()).filter(Boolean);
    const firstPartWords = normalizeText(rawParts[0]).split(/\s+/).filter(Boolean).length;
    const trailingSuffix = canonicalPersonNameToken(rawParts.at(-1), personNameSuffixes);
    const rawTrailingWords = (rawParts.at(-1) ?? "").split(/\s+/).filter(Boolean);
    const rawTrailingToken = canonicalPersonNameToken(rawParts.at(-1), personNameCredentials);
    const surnameTrailingSuffix = canonicalPersonNameToken(
      rawParts[0]?.split(/\s+/).filter(Boolean).at(-1),
      personNameSuffixes,
    );
    const compoundSurnameWordCount = firstPartWords - (surnameTrailingSuffix ? 1 : 0);
    const compoundNameParts = stripCredentials ? stripTrailingPersonCredentials(rawParts) : rawParts;
    const commaCompoundSurname = compoundNameParts.length === 2
      && compoundSurnameWordCount >= 2
      && !canonicalPersonNameToken(compoundNameParts.at(-1), personNameSuffixes);
    if (commaCompoundSurname) {
      const rawSurnameWords = compoundNameParts[0].split(/\s+/).filter(Boolean);
      if (surnameTrailingSuffix) rawSurnameWords.pop();
      const surname = normalizeText(rawSurnameWords.join(" ")).replace(/\s+/g, "");
      const rawGivenNameWords = compoundNameParts[1].split(/\s+/).filter(Boolean);
      const attachedSuffix = canonicalPersonNameToken(rawGivenNameWords.at(-1), personNameSuffixes);
      if (attachedSuffix) rawGivenNameWords.pop();
      const givenNameWords = credentialsRemoved(rawGivenNameWords, stripCredentials);
      const givenNames = normalizePersonNameText(givenNameWords.join(" "));
      normalizeTextVariants(`${givenNames} ${surname} ${surnameTrailingSuffix || attachedSuffix}`)
        .forEach((variant) => variants.add(variant));
    }
    if (rawParts.length === 2 && surnameTrailingSuffix && compoundSurnameWordCount === 1) {
      const rawSurnameWords = rawParts[0].split(/\s+/).filter(Boolean);
      rawSurnameWords.pop();
      const surname = normalizeText(rawSurnameWords.join(" "));
      const rawGivenNameWords = rawParts[1].split(/\s+/).filter(Boolean);
      const attachedSuffix = canonicalPersonNameToken(rawGivenNameWords.at(-1), personNameSuffixes);
      if (attachedSuffix) rawGivenNameWords.pop();
      const givenNameWords = credentialsRemoved(rawGivenNameWords, stripCredentials);
      normalizeTextVariants(`${givenNameWords.join(" ")} ${surname} ${surnameTrailingSuffix}`)
        .forEach((variant) => variants.add(variant));
    }
    const ambiguousCredentialLikeGivenName = rawParts.length === 2
      && compoundSurnameWordCount >= 2
      && rawTrailingWords.length === 1
      && personNameCredentialLikeSurnames.has(rawTrailingToken);
    if (ambiguousCredentialLikeGivenName) {
      const surname = normalizeText(rawParts[0]).replace(/\s+/g, "");
      normalizeTextVariants(`${rawParts[1]} ${surname}`).forEach((variant) => variants.add(variant));
    }
    if (rawParts.length >= 3 && trailingSuffix && firstPartWords >= 2) {
      const surname = normalizeText(rawParts[0]).replace(/\s+/g, "");
      const givenNameWords = credentialsRemoved(
        rawParts.slice(1, -1).join(" ").split(/\s+/).filter(Boolean),
        stripCredentials,
      );
      normalizeTextVariants(`${givenNameWords.join(" ")} ${surname} ${trailingSuffix}`)
        .forEach((variant) => variants.add(variant));
    }
    const infixSuffix = rawParts.length >= 3
      ? canonicalPersonNameToken(rawParts[1], personNameSuffixes)
      : "";
    if (infixSuffix && firstPartWords >= 2) {
      const surname = normalizeText(rawParts[0]).replace(/\s+/g, "");
      const givenNameWords = credentialsRemoved(
        rawParts.slice(2).join(" ").split(/\s+/).filter(Boolean),
        stripCredentials,
      );
      normalizeTextVariants(`${givenNameWords.join(" ")} ${surname} ${infixSuffix}`)
        .forEach((variant) => variants.add(variant));
    }
    if (rawParts.length === 2 && trailingSuffix === "v") {
      variants.add(normalizePersonNameText(`${trailingSuffix} ${rawParts[0]}`));
    }
    if (rawParts.length === 2) {
      const rawGivenNameWords = rawParts[1].split(/\s+/).filter(Boolean);
      const rawFinalGivenNameWord = rawGivenNameWords.at(-1) ?? "";
      const dottedVInitial = canonicalPersonNameToken(rawFinalGivenNameWord, personNameSuffixes) === "v"
        && /\.\s*$/.test(rawFinalGivenNameWord);
      if (rawGivenNameWords.length >= 2 && dottedVInitial) {
        rawGivenNameWords.pop();
        const dottedGivenNameWords = credentialsRemoved(rawGivenNameWords, stripCredentials);
        dottedGivenNameWords.push(rawFinalGivenNameWord);
        const dottedSurnameWords = rawParts[0].split(/\s+/).filter(Boolean);
        const dottedSurnameSuffix = canonicalPersonNameToken(dottedSurnameWords.at(-1), personNameSuffixes);
        if (dottedSurnameSuffix) dottedSurnameWords.pop();
        const dottedSurname = normalizeText(dottedSurnameWords.join(" "));
        const canonicalDottedSurname = compoundSurnameWordCount >= 2
          ? dottedSurname.replace(/\s+/g, "")
          : dottedSurname;
        variants.add(normalizePersonNameText(
          `${dottedGivenNameWords.join(" ")} ${canonicalDottedSurname} ${dottedSurnameSuffix}`,
        ));
      }
    }
  }

  return [...variants].filter(Boolean);
}

function personNamesMatch(left: string, right: string) {
  if (left === right) return Boolean(left);
  const leftParts = left.split(" ").filter(Boolean);
  const rightParts = right.split(" ").filter(Boolean);
  const leftSuffix = personNameSuffixes.has(leftParts.at(-1) ?? "") ? leftParts.pop() : "";
  const rightSuffix = personNameSuffixes.has(rightParts.at(-1) ?? "") ? rightParts.pop() : "";
  if (leftSuffix !== rightSuffix) return false;
  if (leftParts.length < 2 || rightParts.length < 2) return false;
  const namePartsMatch = (leftPart: string, rightPart: string) => leftPart === rightPart
    || (leftPart.length === 1 && rightPart.startsWith(leftPart))
    || (rightPart.length === 1 && leftPart.startsWith(rightPart));
  if (!namePartsMatch(leftParts[0], rightParts[0]) || leftParts.at(-1) !== rightParts.at(-1)) return false;

  const leftMiddle = leftParts.slice(1, -1);
  const rightMiddle = rightParts.slice(1, -1);
  if (leftMiddle.length === rightMiddle.length) {
    return leftMiddle.every((part, index) => namePartsMatch(part, rightMiddle[index]));
  }

  const trailingSurnameParticles = (parts: string[]) => {
    let index = parts.length;
    while (index > 0 && personNameSurnameParticles.has(parts[index - 1])) index -= 1;
    return parts.slice(index);
  };
  const leftSurnameParticles = trailingSurnameParticles(leftMiddle);
  const rightSurnameParticles = trailingSurnameParticles(rightMiddle);
  if (leftSurnameParticles.join(" ") !== rightSurnameParticles.join(" ")) return false;
  if (Math.abs(leftMiddle.length - rightMiddle.length) > 2) return false;

  const [shorterMiddle, longerMiddle] = leftMiddle.length < rightMiddle.length
    ? [leftMiddle, rightMiddle]
    : [rightMiddle, leftMiddle];
  if (!shorterMiddle.length) return longerMiddle.every((part) => part.length === 1);
  let longerIndex = 0;
  const omittedParts: string[] = [];
  const matched = shorterMiddle.every((part) => {
    while (longerIndex < longerMiddle.length && !namePartsMatch(part, longerMiddle[longerIndex])) {
      omittedParts.push(longerMiddle[longerIndex]);
      longerIndex += 1;
    }
    if (longerIndex >= longerMiddle.length) return false;
    longerIndex += 1;
    return true;
  });
  omittedParts.push(...longerMiddle.slice(longerIndex));
  return matched && omittedParts.every((part) => part.length === 1);
}

function hasGivenNameAfterHonorific(value: unknown) {
  if (typeof value !== "string") return false;
  const words = normalizeText(value).split(" ").filter(Boolean);
  if (!personNameHonorifics.has(words[0] ?? "")) return true;
  words.shift();
  return words.length >= 2 && !personNameSurnameParticles.has(words[0] ?? "");
}

function leadingHonorific(value: unknown) {
  if (typeof value !== "string") return "";
  const nameParts = value.split(",").map((part) => part.trim()).filter(Boolean);
  for (const namePart of nameParts.slice(0, 2)) {
    const firstWord = normalizeText(namePart).split(" ").filter(Boolean)[0] ?? "";
    if (personNameHonorifics.has(firstWord)) return firstWord;
  }
  return "";
}

function explicitCommaCompoundSurname(value: unknown, stripCredentials: boolean) {
  if (typeof value !== "string") return [];
  const rawParts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const finalSuffix = canonicalPersonNameToken(rawParts.at(-1), personNameSuffixes);
  if (finalSuffix) rawParts.pop();
  const nameParts = stripCredentials ? stripTrailingPersonCredentials(rawParts) : rawParts;
  if (nameParts.length < 2) return [];
  const surnameWords = normalizeText(nameParts[0]).split(" ").filter(Boolean);
  if (canonicalPersonNameToken(surnameWords.at(-1), personNameSuffixes)) surnameWords.pop();
  return surnameWords.length >= 2 ? surnameWords : [];
}

function explicitCompoundSurnameMatches(surnameWords: string[], value: unknown, stripCredentials: boolean) {
  const normalized = normalizePersonName(value, { stripCredentials });
  if (!normalized) return false;
  const parts = normalized.split(" ").filter(Boolean);
  if (personNameSuffixes.has(parts.at(-1) ?? "")) parts.pop();
  const joinedSurname = surnameWords.join("");
  return parts.at(-1) === joinedSurname
    || (parts.length > surnameWords.length
      && parts.slice(-surnameWords.length).every((part, index) => part === surnameWords[index]));
}

function personNameValuesMatch(
  left: unknown,
  right: unknown,
  options: { stripCredentials?: boolean } = {},
) {
  const stripCredentials = options.stripCredentials ?? true;
  const leftHonorific = leadingHonorific(left);
  const rightHonorific = leadingHonorific(right);
  if (leftHonorific && rightHonorific && leftHonorific !== rightHonorific) return false;
  if (!hasGivenNameAfterHonorific(left)
    || !hasGivenNameAfterHonorific(right)) return false;

  const leftNames = normalizePersonNameVariants(left, { stripCredentials });
  const rightNames = normalizePersonNameVariants(right, { stripCredentials });
  if (!leftNames.some((leftName) => rightNames.some((rightName) => personNamesMatch(leftName, rightName)))) {
    return false;
  }

  const leftCompoundSurname = explicitCommaCompoundSurname(left, stripCredentials);
  if (leftCompoundSurname.length && !explicitCompoundSurnameMatches(leftCompoundSurname, right, stripCredentials)) {
    return false;
  }
  const rightCompoundSurname = explicitCommaCompoundSurname(right, stripCredentials);
  return !rightCompoundSurname.length
    || explicitCompoundSurnameMatches(rightCompoundSurname, left, stripCredentials);
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

  const matchingChild = (left.children ?? []).some((leftChild) => {
    const leftDateOfBirth = normalizedDate(leftChild.dateOfBirth);
    return leftDateOfBirth && (right.children ?? []).some((rightChild) => (
      leftDateOfBirth === normalizedDate(rightChild.dateOfBirth)
        && personNameValuesMatch(leftChild.fullName, rightChild.fullName, { stripCredentials: false })
    ));
  });
  if (matchingChild) {
    score += 35;
    reasons.push("matching child name and date of birth");
  }

  const leftNames = normalizeTextVariants(left.name);
  const rightNames = normalizeTextVariants(right.name);
  if (hasIntersection(leftNames, rightNames)) {
    score += 20;
    reasons.push("same family name");
  }

  const leftAddresses = normalizeTextVariants(left.address);
  const rightAddresses = normalizeTextVariants(right.address);
  if (hasIntersection(leftAddresses, rightAddresses)) {
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
  const sameName = personNameValuesMatch(left.fullName, right.fullName, { stripCredentials: false });
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

  const sameName = personNameValuesMatch(left.fullName, right.fullName);
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
