export type IntakeCenterMatchCandidate = {
  crmLocationId: string | null;
  locationId: string | null;
  name: string;
  status: string | null;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchRank(center: IntakeCenterMatchCandidate, keys: Set<string>) {
  if (center.crmLocationId && keys.has(normalize(center.crmLocationId))) return 0;
  if (center.locationId && keys.has(normalize(center.locationId))) return 1;
  if (keys.has(normalize(center.name))) return 2;
  return 3;
}

export function selectPreferredInquiryCenter<T extends IntakeCenterMatchCandidate>(
  centers: T[],
  locationIds: string[],
) {
  const keys = new Set(locationIds.map(normalize).filter(Boolean));
  const ranked = centers
    .filter((center) => matchRank(center, keys) < 3)
    .map((center, index) => ({
      center,
      index,
      activeRank: center.status === "active" ? 0 : 1,
      matchRank: matchRank(center, keys),
    }))
    .sort((left, right) =>
      left.activeRank - right.activeRank ||
      left.matchRank - right.matchRank ||
      left.index - right.index,
    );

  return ranked[0]?.center ?? null;
}
