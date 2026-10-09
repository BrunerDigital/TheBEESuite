import { normalizeBillingCadence } from "./billing-workflows";

// A weekly rate can be invoiced weekly, every two weeks, or every four weeks.
// Editing the rate must not silently reset that schedule or its anchor.
export function tuitionScheduleAfterRateSave(input: {
  assignmentCadence: string;
  startsPeriod: string;
  previousRateCadence?: string;
  savedRateCadence: string;
  defaultPeriod: (cadence: string) => string;
}) {
  const saved = normalizeBillingCadence(input.savedRateCadence);
  const previous = input.previousRateCadence ? normalizeBillingCadence(input.previousRateCadence) : null;
  const assignment = normalizeBillingCadence(input.assignmentCadence);
  const cadence = previous === saved && (assignment === "monthly") === (saved === "monthly")
    ? assignment
    : saved;
  const validPeriod = cadence === "monthly" ? /^\d{4}-\d{2}$/.test(input.startsPeriod) : /^\d{4}-W\d{2}$/.test(input.startsPeriod);
  return { cadence, startsPeriod: validPeriod ? input.startsPeriod : input.defaultPeriod(cadence) };
}
