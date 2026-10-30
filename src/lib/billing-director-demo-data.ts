import type { BillingWorkbenchFamily } from "@/components/billing-workbench";
import { parentPaymentAmountCents } from "@/lib/parent-billing-visibility";

// Synthetic fixtures only. The development-only device route blocks all API traffic.
export const center = { id: "preview-center", name: "Centennial · Demo", crmLocationId: null, timezone: "America/Denver", classrooms: [{ id: "demo-classroom", name: "Busy Bees", ageGroup: "Pre-K" }], checkoutReadiness: { accountId: "demo-connected-account", label: "Demo checkout ready", canAcceptParentPayments: true, blockingReason: null, stripeConfigured: true, webhookConfigured: true } };
export const families: BillingWorkbenchFamily[] = Array.from({ length: 32 }, (_, index) => ({
  id: `demo-family-${index}`, centerId: center.id,
  name: index < 2 ? "Rivera Household" : index === 2 ? "Brooks Household" : `Sample Household ${String(index).padStart(2, "0")}`,
  accountCategory: index === 30 ? "past" : index === 31 ? "prospective" : "current",
  billingEmail: index < 2 ? `rivera${index + 1}@example.com` : `family${index}@example.com`, guardians: [],
  billingAccount: { id: `demo-account-${index}`, balanceCents: index === 2 ? -12500 : 24500 + index * 100, autopayPlaceholder: false, openInvoices: [], recentPayments: [], ...(index === 0 ? { paymentProgress: { phase: "ach_processing" as const, count: 1, provisionalAchCreditCents: 10000 } } : {}) },
  children: [{ id: `demo-child-${index}`, fullName: index < 2 ? `${index === 0 ? "Ava" : "Liam"} Rivera` : `Sample Child ${index}`, ageGroup: "Pre-K", enrollmentStatus: index === 30 ? "withdrawn" : index === 31 ? "pending" : "enrolled", classroomId: index < 31 ? "demo-classroom" : null, startDate: "2026-08-01", careScheduleType: "full_time", scheduledDaysPerWeek: 5, tuitionAssignment: null }],
}));
export const schools = [{ id: center.id, name: center.name, ein: "Demo only" }];
export const accountOverviewFixtures = Object.fromEntries(families.map(family => [family.id, {
  familyId: family.id, centerId: center.id, billingAccountId: family.billingAccount!.id,
  postedBalanceCents: family.billingAccount!.balanceCents,
  collectibleCents: parentPaymentAmountCents({ accountBalanceCents: family.billingAccount!.balanceCents, agencyLedgerEntries: [], provisionalCreditCents: family.billingAccount!.paymentProgress?.provisionalAchCreditCents ?? 0 }),
  responsibilityReviewRequired: false, pendingCount: family.billingAccount!.paymentProgress?.count ?? 0,
  provisionalAchCreditCents: family.billingAccount!.paymentProgress?.provisionalAchCreditCents ?? 0,
}]));
export const accounts = families.map(family => ({ familyId: family.id, familyName: family.name, billingEmail: family.billingEmail, centerId: family.centerId, balanceCents: family.billingAccount!.balanceCents }));
export const entries = families.map(family => ({ id: `entry-${family.id}`, type: "tuition_charge", description: `Demo tuition · ${family.children[0].fullName}`, amountCents: family.billingAccount!.balanceCents, balanceAfterCents: family.billingAccount!.balanceCents, effectiveAt: "2026-10-26T12:00:00Z", billingAccount: { family } }));

export const BILLING_DIRECTOR_DEMO_SCHOOL_NAME = center.name;
