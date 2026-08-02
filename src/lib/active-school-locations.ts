import {
  canonicalSchoolLocationId,
  cleanLocationIdentifier,
  parseSchoolLocationIdentifier,
} from "@/lib/school-location-identifiers";

export const CRM_LOCATION_ID_EXAMPLE = "Kid City USA - FL | Sarasota";

export type CenterPublicLocationInput = {
  crmLocationId: string | null;
  locationId: string | null;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  status?: string | null;
};

export type PublicKidCityLocation = {
  crmLocationId: string;
  locationId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
};

const clean = cleanLocationIdentifier;

function canonicalKidCityLocationId(value: string | null | undefined) {
  return canonicalSchoolLocationId({
    brandName: "Kid City USA",
    brandSlug: "kid-city-usa",
    crmLocationId: value,
  });
}

export function parseCrmLocationId(value: string | null | undefined) {
  const parsed = parseSchoolLocationIdentifier(value);
  if (!parsed) return null;

  return {
    brandName: parsed.brandName,
    state: parsed.state,
    city: parsed.location,
    crmLocationId: parsed.canonicalId,
  };
}

export function normalizeCrmLocationId(value: string | null | undefined) {
  return parseCrmLocationId(value)?.crmLocationId ?? "";
}

export function isValidCrmLocationId(value: string | null | undefined) {
  return Boolean(parseCrmLocationId(value));
}

export function defaultCenterNameFromCrmLocationId(value: string | null | undefined) {
  const parsed = parseCrmLocationId(value);
  return parsed ? `${parsed.brandName ?? "Kid City USA"} - ${parsed.city}` : "";
}

export function isActivePublicSchoolCandidate(center: CenterPublicLocationInput) {
  return center.status === "active" && isValidCrmLocationId(center.crmLocationId);
}

export function toPublicKidCityLocation(center: CenterPublicLocationInput): PublicKidCityLocation {
  const parsed = parseCrmLocationId(center.crmLocationId);
  const crmLocationId = parsed
    ? canonicalKidCityLocationId(parsed.crmLocationId) ?? parsed.crmLocationId
    : clean(center.crmLocationId);
  const name = clean(center.name) || defaultCenterNameFromCrmLocationId(crmLocationId);

  return {
    crmLocationId,
    locationId: crmLocationId,
    name,
    address: clean(center.address),
    city: clean(center.city) || parsed?.city || "",
    state: clean(center.state).toUpperCase() || parsed?.state || "",
    postalCode: clean(center.postalCode),
    phone: clean(center.phone),
  };
}

export function comparePublicKidCityLocations(
  left: PublicKidCityLocation,
  right: PublicKidCityLocation,
) {
  return left.crmLocationId.localeCompare(right.crmLocationId, "en-US", {
    sensitivity: "base",
  });
}

function publicLocationKey(location: PublicKidCityLocation) {
  const canonical = canonicalKidCityLocationId(location.crmLocationId);
  return normalizeCrmLocationId(canonical) || clean(canonical ?? location.crmLocationId).toLowerCase();
}

function canonicalizeKidCityPublicLocation(location: PublicKidCityLocation): PublicKidCityLocation {
  const canonicalId = canonicalKidCityLocationId(location.crmLocationId)
    ?? canonicalKidCityLocationId(location.locationId)
    ?? clean(location.crmLocationId)
    ?? clean(location.locationId);
  return {
    ...location,
    crmLocationId: canonicalId,
    locationId: canonicalId,
  };
}

export function mergePublicKidCityLocations(
  liveLocations: PublicKidCityLocation[],
  staticLocations: PublicKidCityLocation[],
) {
  const locationsByCrmId = new Map<string, PublicKidCityLocation>();

  for (const item of staticLocations) {
    const location = canonicalizeKidCityPublicLocation(item);
    const key = publicLocationKey(location);
    if (key) locationsByCrmId.set(key, location);
  }

  for (const item of liveLocations) {
    const location = canonicalizeKidCityPublicLocation(item);
    const key = publicLocationKey(location);
    if (key) locationsByCrmId.set(key, location);
  }

  return Array.from(locationsByCrmId.values()).sort(comparePublicKidCityLocations);
}
