import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  getKidCitySoftwareFeeUnitAmountCents,
  getKidCitySoftwareInvoiceAmount,
  getKidCitySoftwareInvoiceDescription,
  getKidCitySoftwareInvoiceNumber,
  getKidCitySoftwareInvoicePeriod,
  kidCitySchoolUserWhere,
} from "../src/lib/kidcity-software-billing";

const originalUnitAmount = process.env.STRIPE_SCHOOL_SOFTWARE_FEE_CENTS;

afterEach(() => {
  if (originalUnitAmount === undefined) delete process.env.STRIPE_SCHOOL_SOFTWARE_FEE_CENTS;
  else process.env.STRIPE_SCHOOL_SOFTWARE_FEE_CENTS = originalUnitAmount;
});

test("school software billing defaults to $99 per active school", () => {
  delete process.env.STRIPE_SCHOOL_SOFTWARE_FEE_CENTS;

  assert.equal(getKidCitySoftwareFeeUnitAmountCents(), 9_900);
  assert.equal(getKidCitySoftwareInvoiceAmount(72), 712_800);
});

test("Kid City software invoice number and description include the monthly period and school count", () => {
  const period = getKidCitySoftwareInvoicePeriod(new Date("2026-06-08T12:00:00.000Z"));

  assert.equal(period, "2026-06");
  assert.equal(getKidCitySoftwareInvoiceNumber(period), "BEE-KCUSA-SOFTWARE-2026-06");
  assert.equal(
    getKidCitySoftwareInvoiceDescription({ period, schoolCount: 72, unitAmountCents: 9_900 }),
    "The BEE Suite monthly software access fee for Kid City USA Enterprises - 2026-06 - 72 active school(s) at $99.00 each",
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
