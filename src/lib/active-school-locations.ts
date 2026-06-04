export const CRM_LOCATION_ID_EXAMPLE = "FL | Sarasota";

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

function clean(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function parseCrmLocationId(value: string | null | undefined) {
  const match = clean(value).match(/^([A-Za-z]{2})\s*\|\s*(.+)$/);
  if (!match) return null;

  const city = clean(match[2]);
  if (!city) return null;

  return {
    state: match[1].toUpperCase(),
    city,
    crmLocationId: `${match[1].toUpperCase()} | ${city}`,
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
  return parsed ? `Kid City USA - ${parsed.city}` : "";
}

export function isActivePublicSchoolCandidate(center: CenterPublicLocationInput) {
  return center.status === "active" && isValidCrmLocationId(center.crmLocationId);
}

export function toPublicKidCityLocation(center: CenterPublicLocationInput): PublicKidCityLocation {
  const parsed = parseCrmLocationId(center.crmLocationId);
  const crmLocationId = parsed?.crmLocationId ?? clean(center.crmLocationId);
  const name = clean(center.name) || defaultCenterNameFromCrmLocationId(crmLocationId);

  return {
    crmLocationId,
    locationId: clean(center.locationId) || crmLocationId,
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
