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

const originalUnitAmount = process.env.STRIPE_KIDCITY_SOFTWARE_FEE_PER_SCHOOL_USER_CENTS;

afterEach(() => {
  if (originalUnitAmount === undefined) delete process.env.STRIPE_KIDCITY_SOFTWARE_FEE_PER_SCHOOL_USER_CENTS;
  else process.env.STRIPE_KIDCITY_SOFTWARE_FEE_PER_SCHOOL_USER_CENTS = originalUnitAmount;
});

test("Kid City software invoice defaults to $49 per active school user", () => {
  delete process.env.STRIPE_KIDCITY_SOFTWARE_FEE_PER_SCHOOL_USER_CENTS;

  assert.equal(getKidCitySoftwareFeeUnitAmountCents(), 4_900);
  assert.equal(getKidCitySoftwareInvoiceAmount(94), 460_600);
});

test("Kid City software invoice number and description include the monthly period and school user count", () => {
  const period = getKidCitySoftwareInvoicePeriod(new Date("2026-06-08T12:00:00.000Z"));

  assert.equal(period, "2026-06");
  assert.equal(getKidCitySoftwareInvoiceNumber(period), "BEE-KCUSA-SOFTWARE-2026-06");
  assert.equal(
    getKidCitySoftwareInvoiceDescription({ period, userCount: 94, unitAmountCents: 4_900 }),
    "The BEE Suite monthly software access fee for Kid City USA Enterprises - 2026-06 - 94 active school user(s) at $49.00 each",
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
