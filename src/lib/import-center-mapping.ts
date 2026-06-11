export type ImportCenterLike = {
  id: string;
  name: string;
  crmLocationId: string | null;
  locationId: string | null;
  city: string | null;
  state: string | null;
};

export type CenterAliasMap<TCenter extends ImportCenterLike> = Map<string, TCenter | null>;

const BRAND_PREFIX_PATTERN = /\bkid\s*city\s*usa\b/gi;
const STATE_PIPE_PATTERN = /^[A-Z]{2}\s*\|\s*/i;

export function centerKey(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function importLocationKeyVariants(value: string | null | undefined) {
  const raw = value || "";
  const variants = [
    raw,
    raw.replace(BRAND_PREFIX_PATTERN, " "),
    raw.replace(STATE_PIPE_PATTERN, ""),
    raw.includes("|") ? raw.split("|").slice(1).join("|") : "",
  ];

  return [...new Set(variants.map(centerKey).filter(Boolean))];
}

export function centerAliasKeys(center: ImportCenterLike) {
  const aliases = [
    center.id,
    center.name,
    center.crmLocationId,
    center.locationId,
    [center.city, center.state].filter(Boolean).join(" "),
    [center.name, center.city, center.state].filter(Boolean).join(" "),
  ];

  return [...new Set(aliases.flatMap(importLocationKeyVariants))];
}

export function buildCenterAliasMap<TCenter extends ImportCenterLike>(centers: TCenter[]) {
  const map: CenterAliasMap<TCenter> = new Map();

  for (const center of centers) {
    for (const alias of centerAliasKeys(center)) {
      const existing = map.get(alias);
      if (existing && existing.id !== center.id) {
        map.set(alias, null);
      } else if (!map.has(alias)) {
        map.set(alias, center);
      }
    }
  }

  return map;
}

export function resolveImportCenter<TCenter extends ImportCenterLike>(
  centerByAlias: CenterAliasMap<TCenter>,
  value: string | null | undefined,
) {
  for (const alias of importLocationKeyVariants(value)) {
    const center = centerByAlias.get(alias);
    if (center) return center;
  }
  return null;
}
