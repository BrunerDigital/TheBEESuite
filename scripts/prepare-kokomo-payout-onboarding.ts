import { runPrepareSchoolPayoutOnboarding } from "./prepare-school-payout-onboarding";
import type { SchoolPayoutSetupArgs } from "@/lib/school-payout-onboarding";

const KOKOMO_LOCATION_ID = "IN | Kokomo";
const KOKOMO_DEFAULTS: SchoolPayoutSetupArgs = {
  legalBusinessName: "Kid City USA - Kokomo",
  displayName: "Kid City USA - Kokomo",
  addressLine1: "1998 Bent Creek Road",
  city: "Kokomo",
  state: "IN",
  postalCode: "46901",
  productDescription: "Childcare tuition, registration fees, deposits, and Kokomo school account payouts.",
};

void runPrepareSchoolPayoutOnboarding({
  defaultSelector: { locationId: KOKOMO_LOCATION_ID },
  defaultInput: KOKOMO_DEFAULTS,
  scriptVersion: "2026-06-kokomo-payout-script-v2",
});
