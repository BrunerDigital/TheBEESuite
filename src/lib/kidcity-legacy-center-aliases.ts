export type KidCityLegacyCenterAlias = {
  sourceCrmLocationId: string;
  targetCrmLocationId: string;
  targetStatus: "active" | "archived" | "closed";
  evidence: string;
};

export const KIDCITY_LEGACY_CENTER_ALIASES = [
  {
    sourceCrmLocationId: "CO | Colorado Springs",
    targetCrmLocationId: "CO | Colorado Springs - Cordera",
    targetStatus: "active",
    evidence: "Cordera is the sole canonical Colorado Springs school profile.",
  },
  {
    sourceCrmLocationId: "CO | Grand Junction 1",
    targetCrmLocationId: "CO | Grand Junction",
    targetStatus: "active",
    evidence: "The canonical profile description identifies this school as Grand Junction 1.",
  },
  {
    sourceCrmLocationId: "CO | Woodland Park",
    targetCrmLocationId: "CO | Woodland Par",
    targetStatus: "active",
    evidence: "The canonical East Midland profile has a truncated CRM ID and identifies Woodland Park in its name and city.",
  },
  {
    sourceCrmLocationId: "FL | Altamonte Springs 1 - Douglas Ave",
    targetCrmLocationId: "FL | Altamonte - Douglas",
    targetStatus: "active",
    evidence: "Both labels identify the Douglas Avenue school.",
  },
  {
    sourceCrmLocationId: "FL | Altamonte Springs 2 - Fruitland St",
    targetCrmLocationId: "FL | Altamonte - Fruitland",
    targetStatus: "active",
    evidence: "Both labels identify the Fruitland Street school.",
  },
  {
    sourceCrmLocationId: "FL | Altamonte Springs 3 - Maitland Ave",
    targetCrmLocationId: "FL | Altamonte - Maitland",
    targetStatus: "active",
    evidence: "Both labels identify the Maitland Avenue school.",
  },
  {
    sourceCrmLocationId: "FL | Daytona Beach",
    targetCrmLocationId: "FL | Daytona Beach East",
    targetStatus: "active",
    evidence: "Daytona Beach East is the sole canonical Daytona Beach school profile.",
  },
  {
    sourceCrmLocationId: "FL | Deland 1 - Orange Ave",
    targetCrmLocationId: "FL | Deland - Orange",
    targetStatus: "active",
    evidence: "Both labels identify the Orange Avenue school.",
  },
  {
    sourceCrmLocationId: "FL | Deland 2 - Amelia Ave",
    targetCrmLocationId: "FL | Deland - Amelia",
    targetStatus: "active",
    evidence: "Both labels identify the Amelia Avenue school.",
  },
  {
    sourceCrmLocationId: "FL | Deltona 1 - Howland",
    targetCrmLocationId: "FL | Deltona - Howland",
    targetStatus: "active",
    evidence: "Both labels identify the Howland school.",
  },
  {
    sourceCrmLocationId: "FL | Deltona 2 - Providence",
    targetCrmLocationId: "FL | Deltona - Providence",
    targetStatus: "closed",
    evidence: "Both labels identify the Providence school; the canonical profile is closed.",
  },
  {
    sourceCrmLocationId: "FL | Jacksonville - Beach Blvd",
    targetCrmLocationId: "FL | Jacksonville - Beach",
    targetStatus: "active",
    evidence: "The canonical Beach profile is named Beach Blvd and uses the Beach Boulevard address.",
  },
  {
    sourceCrmLocationId: "FL | Jacksonville Heights",
    targetCrmLocationId: "FL | Jacksonville - Jacksonville Heights",
    targetStatus: "archived",
    evidence: "Both labels identify Jacksonville Heights; the canonical profile is archived.",
  },
  {
    sourceCrmLocationId: "FL | MacClenny",
    targetCrmLocationId: "FL | Macclenny",
    targetStatus: "active",
    evidence: "The identifiers differ only by capitalization.",
  },
  {
    sourceCrmLocationId: "FL | Middleburg - Cinnamon St",
    targetCrmLocationId: "FL | Middleburg",
    targetStatus: "active",
    evidence: "The canonical Middleburg profile uses the Cinnamon Street address.",
  },
  {
    sourceCrmLocationId: "FL | Ocala - 2nd Street",
    targetCrmLocationId: "FL | Ocala",
    targetStatus: "archived",
    evidence: "The canonical archived Ocala profile is named Ocala - 2nd and describes the 2nd Street school.",
  },
  {
    sourceCrmLocationId: "FL | Port Orange North",
    targetCrmLocationId: "FL | Port Orange",
    targetStatus: "active",
    evidence: "Port Orange is the sole canonical Port Orange school profile.",
  },
  {
    sourceCrmLocationId: "IN | Beechgrove",
    targetCrmLocationId: "IN | Beech Grove",
    targetStatus: "archived",
    evidence: "The identifiers differ only by the missing space; the canonical profile is archived.",
  },
  {
    sourceCrmLocationId: "IN | Jasper - Baden Strausse",
    targetCrmLocationId: "IN | Jasper - Baden Strasse",
    targetStatus: "active",
    evidence: "The legacy identifier misspells Strasse as Strausse.",
  },
  {
    sourceCrmLocationId: "IN | Mccordsville",
    targetCrmLocationId: "IN | McCordsville",
    targetStatus: "archived",
    evidence: "The identifiers differ only by capitalization.",
  },
  {
    sourceCrmLocationId: "TN | Lewisburg 1",
    targetCrmLocationId: "TN | Lewisburg",
    targetStatus: "active",
    evidence: "The canonical Lewisburg profile description identifies the school as Lewisburg 1.",
  },
] as const satisfies readonly KidCityLegacyCenterAlias[];

export function normalizeKidCityCenterIdentifier(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

const aliasTargetBySource = new Map(
  KIDCITY_LEGACY_CENTER_ALIASES.map((alias) => [
    normalizeKidCityCenterIdentifier(alias.sourceCrmLocationId),
    alias.targetCrmLocationId,
  ]),
);

function uniquelyMappedCenterId(centerMap: Map<string, string>, identifier: string) {
  const normalized = normalizeKidCityCenterIdentifier(identifier);
  const ids = new Set(
    Array.from(centerMap.entries())
      .filter(([key]) => normalizeKidCityCenterIdentifier(key) === normalized)
      .map(([, centerId]) => centerId),
  );

  return ids.size === 1 ? Array.from(ids)[0] : undefined;
}

export function resolveKidCityLegacyLeadCenterId(
  centerMap: Map<string, string>,
  legacyCrmLocationId: string,
) {
  const direct = uniquelyMappedCenterId(centerMap, legacyCrmLocationId);
  if (direct) return direct;

  const targetIdentifier = aliasTargetBySource.get(
    normalizeKidCityCenterIdentifier(legacyCrmLocationId),
  );
  if (!targetIdentifier) return undefined;

  return uniquelyMappedCenterId(centerMap, targetIdentifier);
}
