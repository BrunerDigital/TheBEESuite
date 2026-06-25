import type { Prisma } from "@prisma/client";
import { readStripeConnectAccountId } from "@/lib/stripe-connect-readiness";
import { stripeConnectSetupCustomFieldPatch, type StripeConnectSetupDetails, type StripeConnectSetupInput } from "@/lib/stripe-connect-setup";

export const SCHOOL_PAYOUT_SETUP_VERSION = "2026-06-school-payout-script-v1";

export type SchoolPayoutCenter = {
  id?: string;
  name?: string | null;
  crmLocationId?: string | null;
  locationId?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  customFields?: unknown;
};

export type SchoolPayoutSelector = {
  centerId?: string;
  locationId?: string;
  crmLocationId?: string;
  name?: string;
};

export type SchoolPayoutSetupArgs = Partial<Record<keyof StripeConnectSetupInput, string>>;

export type SchoolPayoutCustomFieldPatchInput = {
  existingCustomFields: unknown;
  setupDetails: StripeConnectSetupDetails;
  setupVersion?: string;
  now?: Date;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function valueOrUndefined(value: unknown) {
  const cleaned = clean(value);
  return cleaned || undefined;
}

export function hasSchoolPayoutSelector(selector: SchoolPayoutSelector) {
  return Boolean(
    clean(selector.centerId) ||
      clean(selector.locationId) ||
      clean(selector.crmLocationId) ||
      clean(selector.name),
  );
}

export function schoolPayoutCenterWhere(selector: SchoolPayoutSelector): Prisma.CenterWhereInput {
  const matchers: Prisma.CenterWhereInput[] = [];
  const centerId = clean(selector.centerId);
  const locationId = clean(selector.locationId);
  const crmLocationId = clean(selector.crmLocationId);
  const name = clean(selector.name);

  if (centerId) matchers.push({ id: centerId });
  if (locationId) matchers.push({ locationId });
  if (crmLocationId) matchers.push({ crmLocationId });
  if (name) {
    matchers.push({ name });
    matchers.push({ name: { contains: name, mode: "insensitive" } });
  }

  if (!matchers.length) {
    throw new Error("Pass --center-id, --location-id, --crm-location-id, or --name.");
  }

  return { OR: matchers };
}

export function buildSchoolPayoutSetupInput(
  args: SchoolPayoutSetupArgs,
  center: SchoolPayoutCenter,
): StripeConnectSetupInput {
  const centerName = clean(center.name);
  const productDescription =
    clean(args.productDescription) ||
    (centerName
      ? `Childcare tuition, registration fees, deposits, and ${centerName} school account payouts.`
      : undefined);

  return {
    legalBusinessName: valueOrUndefined(args.legalBusinessName) ?? valueOrUndefined(center.name),
    displayName: valueOrUndefined(args.displayName) ?? valueOrUndefined(center.name),
    payoutContactName: valueOrUndefined(args.payoutContactName),
    payoutContactEmail: valueOrUndefined(args.payoutContactEmail) ?? valueOrUndefined(center.email),
    payoutContactPhone: valueOrUndefined(args.payoutContactPhone) ?? valueOrUndefined(center.phone),
    supportEmail:
      valueOrUndefined(args.supportEmail) ??
      valueOrUndefined(args.payoutContactEmail) ??
      valueOrUndefined(center.email),
    supportPhone:
      valueOrUndefined(args.supportPhone) ??
      valueOrUndefined(args.payoutContactPhone) ??
      valueOrUndefined(center.phone),
    addressLine1: valueOrUndefined(args.addressLine1) ?? valueOrUndefined(center.address),
    addressLine2: valueOrUndefined(args.addressLine2),
    city: valueOrUndefined(args.city) ?? valueOrUndefined(center.city),
    state: valueOrUndefined(args.state) ?? valueOrUndefined(center.state),
    postalCode: valueOrUndefined(args.postalCode) ?? valueOrUndefined(center.postalCode),
    businessUrl: valueOrUndefined(args.businessUrl),
    productDescription,
  };
}

function jsonObject(value: unknown): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

export function schoolPayoutSetupCustomFieldPatch({
  existingCustomFields,
  setupDetails,
  setupVersion = SCHOOL_PAYOUT_SETUP_VERSION,
  now = new Date(),
}: SchoolPayoutCustomFieldPatchInput): Prisma.JsonObject {
  const existingFields = jsonObject(existingCustomFields);
  const accountId = readStripeConnectAccountId(existingFields);
  const existingStatus = typeof existingFields.stripePayoutStatus === "string"
    ? existingFields.stripePayoutStatus.trim()
    : "";

  return {
    ...existingFields,
    ...(stripeConnectSetupCustomFieldPatch(setupDetails) as Prisma.JsonObject),
    stripeConnectSetupUpdatedAt: now.toISOString(),
    stripeConnectSetupVersion: setupVersion,
    stripePayoutStatus: accountId ? existingStatus || "account_created" : "profile_ready",
  };
}
