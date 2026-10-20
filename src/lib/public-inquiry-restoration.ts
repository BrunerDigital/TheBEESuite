import { isRetiredPublicKidCityLocation } from "@/lib/active-school-locations";
import { isBlockedPublicInquiryLocation } from "@/lib/public-inquiry-policy";

// Public intake only. Never use this binding for operational status, access,
// registration, billing, invitations or scheduled communications.
// Enable only after the tenant binding and mailbox have been verified in production.
export const leesSummitInquiryRestoration = {
  centerId: "cmp4ewfzn004g6alwqbqrzcql",
  tenantSlug: "kid-city-usa",
  name: "Kid City USA - Lees Summit",
  publicLocationId: "Kid City USA - MO | Lees Summit",
  notificationEmail: "leessummit@kidcityusa.com",
} as const;

function key(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

const identifiers = new Set([
  leesSummitInquiryRestoration.publicLocationId,
  "MO | Lees Summit",
  leesSummitInquiryRestoration.name,
].map(key));

export function isLeesSummitInquiryIdentifier(value: string | null | undefined) {
  return identifiers.has(key(value));
}

export type RestoredInquiryCenter = {
  id: string;
  name: string;
  status: string | null;
  crmLocationId: string | null;
  locationId: string | null;
  email: string | null;
  organization: { tenantId: string; tenant: { slug: string } };
};

export function isRestoredPublicInquiryCenter(center: RestoredInquiryCenter | null, enabled: boolean) {
  return Boolean(enabled && center
    && center.id === leesSummitInquiryRestoration.centerId
    && center.name === leesSummitInquiryRestoration.name
    && center.status === "closed"
    && center.organization.tenantId
    && center.organization.tenant.slug === leesSummitInquiryRestoration.tenantSlug
    && key(center.email) === leesSummitInquiryRestoration.notificationEmail
    && [center.crmLocationId, center.locationId].some(isLeesSummitInquiryIdentifier)
    && !isBlockedPublicInquiryLocation(center)
    && !isRetiredPublicKidCityLocation(center.crmLocationId)
    && !isRetiredPublicKidCityLocation(center.locationId));
}
