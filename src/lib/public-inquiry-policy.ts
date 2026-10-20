// Public visibility/intake restrictions never change operational school status,
// registration, school access, finance operations, or historical records.
function identifierKey(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// These two schools are hidden from the website and new public inquiries only.
// Keep this separate from active-school-locations: its eligibility is also used
// by finance selectors, which are outside the public-removal scope.
const hiddenWebsiteIdentifiers = new Set([
  "Kid City USA - IN | Whitestown", "IN | Whitestown", "Kid City USA - Whitestown",
  "Kid City USA - TN | Pulaski", "TN | Pulaski", "Kid City USA - Pulaski TN",
].map(identifierKey));
const blockedInquiryIdentifiers = new Set([
  "kid city usa fl daytona beach east",
  "fl daytona beach east",
  "kid city usa daytona beach east",
  "daytona beach east",
]);

export function isBlockedPublicInquiryIdentifier(value: string | null | undefined) {
  const key = identifierKey(value);
  return blockedInquiryIdentifiers.has(key) || hiddenWebsiteIdentifiers.has(key);
}

type InquiryLocation = {
  crmLocationId?: string | null;
  locationId?: string | null;
  name?: string | null;
};

export function filterPublicWebsiteLocations<T extends InquiryLocation>(locations: T[]) {
  return locations.filter((location) => ![location.crmLocationId, location.locationId, location.name]
    .some((value) => hiddenWebsiteIdentifiers.has(identifierKey(value))));
}

export function isBlockedPublicInquiryLocation(location: InquiryLocation) {
  return [location.crmLocationId, location.locationId, location.name]
    .some(isBlockedPublicInquiryIdentifier);
}

export function filterPublicInquiryLocations<T extends InquiryLocation>(locations: T[]) {
  return locations.filter((location) => !isBlockedPublicInquiryLocation(location));
}
