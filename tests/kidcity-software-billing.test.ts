import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  formatSchoolSoftwareFeeAmount,
  getCorporateSchoolSoftwareFeeUnitAmountCents,
  getKidCitySoftwareFeeUnitAmountCents,
  getKidCitySoftwareInvoiceAmount,
  getKidCitySoftwareInvoiceDescription,
  getKidCitySoftwareInvoiceNumber,
  getKidCitySoftwareInvoicePeriod,
  getPartnerSchoolSoftwareFeeUnitAmountCents,
  getSchoolSoftwareFeePolicyForCenter,
  getSchoolSoftwareFeeTier,
  kidCitySchoolUserWhere,
} from "../src/lib/kidcity-software-billing";

const originalCorporateAmount = process.env.STRIPE_CORPORATE_SCHOOL_SOFTWARE_FEE_CENTS;
const originalPartnerAmount = process.env.STRIPE_PARTNER_SCHOOL_SOFTWARE_FEE_CENTS;
const originalCorporateIds = process.env.STRIPE_CORPORATE_SCHOOL_SOFTWARE_FEE_CENTER_IDS;
const originalLegacyUnitAmount = process.env.STRIPE_SCHOOL_SOFTWARE_FEE_CENTS;

afterEach(() => {
  if (originalCorporateAmount === undefined) delete process.env.STRIPE_CORPORATE_SCHOOL_SOFTWARE_FEE_CENTS;
  else process.env.STRIPE_CORPORATE_SCHOOL_SOFTWARE_FEE_CENTS = originalCorporateAmount;
  if (originalPartnerAmount === undefined) delete process.env.STRIPE_PARTNER_SCHOOL_SOFTWARE_FEE_CENTS;
  else process.env.STRIPE_PARTNER_SCHOOL_SOFTWARE_FEE_CENTS = originalPartnerAmount;
  if (originalCorporateIds === undefined) delete process.env.STRIPE_CORPORATE_SCHOOL_SOFTWARE_FEE_CENTER_IDS;
  else process.env.STRIPE_CORPORATE_SCHOOL_SOFTWARE_FEE_CENTER_IDS = originalCorporateIds;
  if (originalLegacyUnitAmount === undefined) delete process.env.STRIPE_SCHOOL_SOFTWARE_FEE_CENTS;
  else process.env.STRIPE_SCHOOL_SOFTWARE_FEE_CENTS = originalLegacyUnitAmount;
});

test("school software billing defaults to $49 for corporate schools and $79 for partner schools", () => {
  delete process.env.STRIPE_CORPORATE_SCHOOL_SOFTWARE_FEE_CENTS;
  delete process.env.STRIPE_PARTNER_SCHOOL_SOFTWARE_FEE_CENTS;
  process.env.STRIPE_SCHOOL_SOFTWARE_FEE_CENTS = "9900";

  assert.equal(getCorporateSchoolSoftwareFeeUnitAmountCents(), 4_900);
  assert.equal(getPartnerSchoolSoftwareFeeUnitAmountCents(), 7_900);
  assert.equal(getKidCitySoftwareFeeUnitAmountCents(), 7_900);
  assert.equal(getKidCitySoftwareInvoiceAmount(72), 568_800);
});

test("school software fee policy identifies corporate schools from owner groups and explicit center flags", () => {
  assert.deepEqual(getSchoolSoftwareFeePolicyForCenter({
    id: "center_corp",
    customFields: {},
    ownerGroup: { name: "Corp Schools", ownerType: "corporate_owned", billingEmail: "corpschools@kidcityusa.com" },
  }), {
    tier: "corporate",
    unitAmountCents: 4_900,
    billingBasis: "per_school",
  });

  assert.equal(getSchoolSoftwareFeeTier({
    id: "center_explicit",
    customFields: { stripeSoftwareFeeTier: "corporate" },
    ownerGroup: { ownerType: "franchisee" },
  }), "corporate");

  assert.equal(getSchoolSoftwareFeeTier({
    id: "center_partner",
    customFields: {},
    ownerGroup: { name: "Local Franchise Owner", ownerType: "franchisee" },
  }), "partner");
});

test("corporate school software fee can be configured by center identifiers", () => {
  process.env.STRIPE_CORPORATE_SCHOOL_SOFTWARE_FEE_CENTER_IDS = "center_123, CO_Cordera";

  assert.equal(getSchoolSoftwareFeeTier({ id: "center_123", customFields: {} }), "corporate");
  assert.equal(getSchoolSoftwareFeeTier({ crmLocationId: "CO | Cordera", customFields: {} }), "corporate");
  assert.equal(getSchoolSoftwareFeeTier({ id: "center_999", customFields: {} }), "partner");
});

test("Kid City software invoice number and description include the monthly period and school count", () => {
  const period = getKidCitySoftwareInvoicePeriod(new Date("2026-06-08T12:00:00.000Z"));

  assert.equal(period, "2026-06");
  assert.equal(getKidCitySoftwareInvoiceNumber(period), "BEE-KCUSA-SOFTWARE-2026-06");
  assert.equal(formatSchoolSoftwareFeeAmount(4_900), "$49");
  assert.equal(
    getKidCitySoftwareInvoiceDescription({ period, schoolCount: 72, unitAmountCents: 7_900 }),
    "The BEE Suite monthly software access fee for Kid City USA Enterprises - 2026-06 - 72 active school(s) at $79 each",
  );
});

test("Kid City school user query counts active center-scoped school billing users only", () => {
  const where = kidCitySchoolUserWhere(new Date("2026-06-08T12:00:00.000Z"));

  assert.equal(where.isActive, true);
  assert.deepEqual(where.role, {
    in: ["CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "BILLING_ADMIN"],
  });
  assert.deepEqual(where.tenant, {
    OR: [
      { slug: "kid-city-usa" },
      { name: { contains: "Kid City", mode: "insensitive" } },
    ],
  });
  assert.ok(Array.isArray(where.OR));
});
