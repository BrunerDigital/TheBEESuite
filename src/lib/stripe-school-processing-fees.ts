export type StripeSchoolProcessingFeeCategory = "default" | "ach" | "card" | "card_present" | "link_bank";

export type StripeSchoolProcessingFeeRate = {
  basisPoints: number;
  fixedCents: number;
  maximumCents: number;
};

function nonNegativeIntegerEnvironmentValue(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] || String(fallback), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function basisPointsEnvironmentValue(name: string, fallback: number) {
  return Math.min(nonNegativeIntegerEnvironmentValue(name, fallback), 10_000);
}

function rateFromEnvironment(prefix: string, fallback: StripeSchoolProcessingFeeRate): StripeSchoolProcessingFeeRate {
  return {
    basisPoints: basisPointsEnvironmentValue(`${prefix}_BPS`, fallback.basisPoints),
    fixedCents: nonNegativeIntegerEnvironmentValue(`${prefix}_FIXED_CENTS`, fallback.fixedCents),
    maximumCents: nonNegativeIntegerEnvironmentValue(`${prefix}_MAX_CENTS`, fallback.maximumCents),
  };
}

export function stripeSchoolProcessingFeeRate(
  category: StripeSchoolProcessingFeeCategory,
): StripeSchoolProcessingFeeRate {
  if (category === "ach") {
    return rateFromEnvironment("STRIPE_SCHOOL_ACH_PROCESSING_FEE", {
      basisPoints: 80,
      fixedCents: 0,
      maximumCents: 500,
    });
  }
  if (category === "link_bank") {
    return rateFromEnvironment("STRIPE_SCHOOL_LINK_PROCESSING_FEE", {
      basisPoints: 144,
      fixedCents: 0,
      maximumCents: 0,
    });
  }
  if (category === "card_present") {
    return rateFromEnvironment("STRIPE_SCHOOL_CARD_PRESENT_PROCESSING_FEE", {
      basisPoints: 270,
      fixedCents: 5,
      maximumCents: 0,
    });
  }
  return rateFromEnvironment("STRIPE_SCHOOL_CARD_PROCESSING_FEE", {
    basisPoints: 290,
    fixedCents: 30,
    maximumCents: 0,
  });
}

export function calculateStripeSchoolProcessingFeeAmount(
  amountCents: number,
  category: StripeSchoolProcessingFeeCategory,
) {
  const safeAmountCents = Math.max(0, Math.round(amountCents));
  if (safeAmountCents === 0) return 0;
  const rate = stripeSchoolProcessingFeeRate(category);
  const calculatedCents = Math.round(safeAmountCents * (rate.basisPoints / 10_000)) + rate.fixedCents;
  return Math.max(0, rate.maximumCents > 0 ? Math.min(calculatedCents, rate.maximumCents) : calculatedCents);
}
