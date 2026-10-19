import { parseSchoolLocationIdentifier } from "@/lib/school-location-identifiers";

// Inquiry-only restrictions must not retire directory listings, registration,
// school access, finance operations, or historical records.
const blockedInquiryIdentifiers = new Set([
  "kid city usa fl daytona beach east",
  "fl daytona beach east",
  "kid city usa daytona beach east",
  "daytona beach east",
  "kid city usa fl vero beach",
  "kid city usa vero beach",
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

// Unbranded place names cannot establish the school or brand by themselves.
export function isAmbiguousPublicInquiryIdentifier(value: string | null | undefined) {
  const key = (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return key === "vero beach" || key === "fl vero beach";
}

export function hasExplicitOtherBrandInquiryIdentity(
  location: InquiryLocation,
  requestedIdentifiers: Array<string | null | undefined> = [],
) {
  const identity = parseSchoolLocationIdentifier(location.crmLocationId);
  const normalize = (value: string | null | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const requiresFlorida = [...requestedIdentifiers, location.crmLocationId, location.locationId, location.name]
    .some((value) => normalize(value) === "fl vero beach");
  return Boolean(identity?.brandName && normalize(identity.brandName) !== "kid city usa"
    && normalize(identity.location) === "vero beach"
    && (!requiresFlorida || identity.state === "FL"));
}

export function isBlockedPublicInquiryLocation(location: InquiryLocation) {
  const identifiers = [location.crmLocationId, location.locationId, location.name];
  return identifiers.some(isBlockedPublicInquiryIdentifier)
    || (identifiers.some(isAmbiguousPublicInquiryIdentifier) && !hasExplicitOtherBrandInquiryIdentity(location));
}

export function filterPublicInquiryLocations<T extends InquiryLocation>(locations: T[]) {
  return locations.filter((location) => !isBlockedPublicInquiryLocation(location));
}
