export type SchoolLocationIdentifierParts = {
  brandName: string | null;
  state: string;
  location: string;
  unbrandedId: string;
  canonicalId: string;
};

type CanonicalSchoolLocationInput = {
  brandName: string | null | undefined;
  brandSlug?: string | null;
  crmLocationId: string | null | undefined;
};

const CANONICAL_OVERRIDES = new Map([
  ["kid-city-usa\u0000co | woodland par", "Kid City USA - CO | Woodland Park - East Midland"],
  ["kid-city-usa\u0000co | forest edge", "Kid City USA - CO | Woodland Park - Forest Edge"],
  ["kid-city-usa\u0000fl | longwood", "Kid City USA - FL | Longwood - SR 434"],
  ["kid-city-usa\u0000fl | wekiva", "Kid City USA - FL | Longwood - Wekiva"],
  ["kid-city-usa\u0000in | paradise", "Kid City USA - IN | Newburgh - Paradise"],
]);

export function cleanLocationIdentifier(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeLocationIdentifier(value: string | null | undefined) {
  return cleanLocationIdentifier(value).toLocaleLowerCase("en-US");
}

export function parseSchoolLocationIdentifier(
  value: string | null | undefined,
): SchoolLocationIdentifierParts | null {
  const cleaned = cleanLocationIdentifier(value);
  const brandedMatch = cleaned.match(/^(.+?)\s+-\s+([A-Za-z]{2})\s*\|\s*(.+)$/);
  const unbrandedMatch = cleaned.match(/^([A-Za-z]{2})\s*\|\s*(.+)$/);
  const brandName = brandedMatch ? cleanLocationIdentifier(brandedMatch[1]) : null;
  const state = (brandedMatch?.[2] ?? unbrandedMatch?.[1] ?? "").toUpperCase();
  const location = cleanLocationIdentifier(brandedMatch?.[3] ?? unbrandedMatch?.[2]);
  if (!state || !location) return null;

  const unbrandedId = `${state} | ${location}`;
  return {
    brandName,
    state,
    location,
    unbrandedId,
    canonicalId: brandName ? `${brandName} - ${unbrandedId}` : unbrandedId,
  };
}

export function canonicalBrandLocationId(
  brandName: string | null | undefined,
  value: string | null | undefined,
) {
  const brand = cleanLocationIdentifier(brandName);
  const parsed = parseSchoolLocationIdentifier(value);
  return brand && parsed ? `${brand} - ${parsed.unbrandedId}` : null;
}

export function canonicalSchoolLocationId(input: CanonicalSchoolLocationInput) {
  const brandName = cleanLocationIdentifier(input.brandName);
  const brandSlug = normalizeLocationIdentifier(input.brandSlug);
  const current = parseSchoolLocationIdentifier(input.crmLocationId);
  if (!brandName || !current) return null;

  return CANONICAL_OVERRIDES.get(`${brandSlug}\u0000${normalizeLocationIdentifier(current.unbrandedId)}`)
    ?? `${brandName} - ${current.unbrandedId}`;
}

export function locationAliasesFromCustomFields(customFields: unknown) {
  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) return [];
  const value = (customFields as Record<string, unknown>).locationAliases;
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => cleanLocationIdentifier(typeof item === "string" ? item : "")).filter(Boolean)));
}

export function locationIdentifierCandidates(input: {
  crmLocationId?: string | null;
  locationId?: string | null;
  name?: string | null;
  customFields?: unknown;
}) {
  return Array.from(new Set([
    cleanLocationIdentifier(input.crmLocationId),
    cleanLocationIdentifier(input.locationId),
    cleanLocationIdentifier(input.name),
    ...locationAliasesFromCustomFields(input.customFields),
  ].filter(Boolean)));
}
