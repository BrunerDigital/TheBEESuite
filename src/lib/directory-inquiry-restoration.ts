import type { PublicKidCityLocation } from "@/lib/active-school-locations";
import { isBlockedPublicInquiryLocation } from "@/lib/public-inquiry-policy";

// Public inquiries only. These bindings never authorize operational activation,
// access, registration, billing, invitations, reminders or school synchronization.
export const directoryInquiryRestorations = [
  {
    "centerId": "cmp4ew7tp000w6alw8ep0mi0d",
    "name": "Kid City USA - DeLand - Orange",
    "publicLocationId": "Kid City USA - FL | Deland - Orange",
    "notificationEmail": "deland1@kidcityusa.com",
    "status": "closed",
    "flag": "INQUIRY_DELAND_ORANGE_ENABLED",
    "address": "404 N. Orange Ave.",
    "city": "Deland",
    "state": "FL",
    "postalCode": "32720",
    "phone": "386-736-0000"
  },
  {
    "centerId": "f9fd9005-a81f-400f-b72e-f95d60d5e550",
    "name": "Kid City USA - Lake City 2",
    "publicLocationId": "Kid City USA - FL | Lake City 2",
    "notificationEmail": "lakecity2@kidcityusa.com",
    "status": "trial_setup",
    "flag": "INQUIRY_LAKE_CITY_2_ENABLED",
    "address": "522 NW Turner Ave.",
    "city": "Lake City",
    "state": "FL",
    "postalCode": "32055",
    "phone": "386-752-4411"
  },
  {
    "centerId": "cmp4ewfv2004e6alw9mg7zlwb",
    "name": "Kid City USA - Bardstown",
    "publicLocationId": "Kid City USA - KY | Bardstown",
    "notificationEmail": "bardstown@kidcityusa.com",
    "status": "closed",
    "flag": "INQUIRY_BARDSTOWN_ENABLED",
    "address": "104 Keystone Ave",
    "city": "Bardstown",
    "state": "KY",
    "postalCode": "40004",
    "phone": "502-348-4444"
  }
] as const;
export type DirectoryInquiryRestoration = typeof directoryInquiryRestorations[number];
const tenantId = "cmp4evl4v00006arspz79fggn";
const organizationId = "cmp4evliu00046arsseizap58";

function key(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
export function isDirectoryInquiryIdentifier(value: string | null | undefined, binding: DirectoryInquiryRestoration) {
  return [binding.publicLocationId, binding.publicLocationId.replace("Kid City USA - ", ""), binding.name]
    .some((identifier) => key(value) === key(identifier));
}
export function directoryInquiryBinding(value: string | null | undefined) {
  return directoryInquiryRestorations.find((binding) => value === binding.centerId || isDirectoryInquiryIdentifier(value, binding));
}
export function isProtectedDirectoryInquiryCenterId(value: string | null | undefined) {
  return directoryInquiryRestorations.some((binding) => binding.centerId === value);
}
export function directoryInquiryEnabled(binding: DirectoryInquiryRestoration, env: Record<string, string | undefined>) {
  return env[binding.flag] === "true";
}

type StoredDirectoryCenter = {
  id: string; organizationId: string; name: string; status: string | null;
  email: string | null; crmLocationId: string | null; locationId: string | null;
  organization: { tenantId: string; tenant: { slug: string } };
};
export function isVerifiedDirectoryInquiryCenter(center: StoredDirectoryCenter | null, binding: DirectoryInquiryRestoration, enabled: boolean) {
  return Boolean(enabled && center
    && center.id === binding.centerId && center.organizationId === organizationId
    && center.organization.tenantId === tenantId && center.organization.tenant.slug === "kid-city-usa"
    && center.name === binding.name && center.status === binding.status
    && key(center.email) === binding.notificationEmail
    && [center.crmLocationId, center.locationId].some((value) => isDirectoryInquiryIdentifier(value, binding))
    && [center.crmLocationId, center.locationId].every((value) => !key(value) || isDirectoryInquiryIdentifier(value, binding))
    && !isBlockedPublicInquiryLocation(center));
}
export function directoryInquiryPublicLocation(binding: DirectoryInquiryRestoration): PublicKidCityLocation {
  return { crmLocationId: binding.publicLocationId, locationId: binding.publicLocationId,
    name: binding.name, address: binding.address, city: binding.city, state: binding.state,
    postalCode: binding.postalCode, phone: binding.phone };
}
