// Public visibility/intake restrictions never change operational school status,
// registration, school access, finance operations, or historical records.
function identifierKey(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// These schools are hidden from the website and new public inquiries only.
// Keep this separate from active-school-locations: its eligibility is also used
// by finance selectors, which are outside the public-removal scope.
const hiddenWebsiteIdentifiers = new Set([
  "Kid City USA - IN | Whitestown", "IN | Whitestown", "Kid City USA - Whitestown",
  "Kid City USA - TN | Pulaski", "TN | Pulaski", "Kid City USA - Pulaski TN",
  // October 25 removal supersedes the earlier public-only restoration.
  "Kid City USA - MO | Lees Summit", "MO | Lees Summit", "Kid City USA - Lees Summit",
  "Kid City USA - MO | Lee's Summit", "MO | Lee's Summit", "Kid City USA - Lee's Summit",
  "cmp4ewfzn004g6alwqbqrzcql",
  "Kid City USA - TX | Garland", "TX | Garland", "Kid City USA - Garland",
  "cmp4ewh78004y6alwu6s3bsv4",
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
  id?: string | null;
  crmLocationId?: string | null;
  locationId?: string | null;
  name?: string | null;
};

export function filterPublicWebsiteLocations<T extends InquiryLocation>(locations: T[]) {
  return locations.filter((location) => ![location.id, location.crmLocationId, location.locationId, location.name]
    .some((value) => hiddenWebsiteIdentifiers.has(identifierKey(value))));
}

export function isBlockedPublicInquiryLocation(location: InquiryLocation) {
  return [location.id, location.crmLocationId, location.locationId, location.name]
    .some(isBlockedPublicInquiryIdentifier);
}

export function filterPublicInquiryLocations<T extends InquiryLocation>(locations: T[]) {
  return locations.filter((location) => !isBlockedPublicInquiryLocation(location));
}
