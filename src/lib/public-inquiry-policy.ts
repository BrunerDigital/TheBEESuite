// Inquiry-only restrictions must not retire directory listings, registration,
// school access, finance operations, or historical records.
const blockedInquiryIdentifiers = new Set([
  "kid city usa fl daytona beach east",
  "fl daytona beach east",
  "kid city usa daytona beach east",
  "daytona beach east",
]);

export function isBlockedPublicInquiryIdentifier(value: string | null | undefined) {
  const key = (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return blockedInquiryIdentifiers.has(key);
}

type InquiryLocation = {
  crmLocationId?: string | null;
  locationId?: string | null;
  name?: string | null;
};

export function isBlockedPublicInquiryLocation(location: InquiryLocation) {
  return [location.crmLocationId, location.locationId, location.name]
    .some(isBlockedPublicInquiryIdentifier);
}

export function filterPublicInquiryLocations<T extends InquiryLocation>(locations: T[]) {
  return locations.filter((location) => !isBlockedPublicInquiryLocation(location));
}
