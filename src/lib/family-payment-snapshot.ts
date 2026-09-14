import { PaymentStatus, type Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "./enrollment-status";
import { AGENCY_LEDGER_ENTRY_TYPES, AGENCY_LEDGER_SOURCE_SYSTEM, paymentCollectionResponsibilityHoldRequired, parentPaymentAmountCents } from "./parent-billing-visibility";
import { allOpenInvoicesResponsibilitySeparated } from "./invoice-responsibility-separation";
import { provisionalAchCreditCents } from "./ach-payment-lifecycle";
import type { FamilyPaymentTarget } from "./family-payment-preflight";

/** Only after readAuthorizedFamilyPaymentTarget in this transaction. */
export async function readFamilyPaymentSnapshot(tx: Prisma.TransactionClient, target: FamilyPaymentTarget) {
  const billingAccount = await tx.billingAccount.findFirst({ where: { id: target.billingAccountId, familyId: target.familyId,
    family: { centerId: target.centerId } }, include: {
    invoices: { where: { status: { in: [PaymentStatus.OPEN, PaymentStatus.PAID, PaymentStatus.VOID] } },
      select: { status: true, totalCents: true, customFields: true, items: { select: { description: true } } } },
    family: { select: { id: true, name: true, billingEmail: true, centerId: true, customFields: true,
      children: { select: { id: true, customFields: true } }, _count: { select: { children: { where: currentlyEnrolledChildWhere() } } } } },
  } });
  if (!billingAccount) return null;
  const center = await tx.center.findFirst({ where: { id: target.centerId, organization: { tenantId: target.tenantId } }, select: {
    id: true, name: true, customFields: true, organization: { select: { tenant: { select: { name: true, slug: true } }, brand: { select: { name: true, slug: true } } } },
  } });
  if (!center) return null;
  const draftStripePayments = await tx.payment.findMany({ where: { billingAccountId: target.billingAccountId,
    provider: { in: ["stripe", "stripe_terminal"] }, status: PaymentStatus.DRAFT },
    select: { id: true, billingAccountId: true, amountCents: true, customFields: true, externalIdPlaceholder: true, provider: true, status: true } });
  const agencyLedgerEntries = await tx.ledgerEntry.findMany({ where: { billingAccountId: target.billingAccountId,
    OR: [{ type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } }, { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM }] }, select: { type: true, sourceSystem: true, amountCents: true } });
  const responsibilityReviewRequired = paymentCollectionResponsibilityHoldRequired({ accountBalanceCents: billingAccount.balanceCents, agencyLedgerEntries,
    invoiceResponsibilitySeparated: allOpenInvoicesResponsibilitySeparated(billingAccount.invoices, ...billingAccount.family.children),
    responsibilityEvidence: [billingAccount.customFields, billingAccount.family.customFields, ...billingAccount.family.children.map(child => child.customFields),
      ...billingAccount.invoices.flatMap(invoice => [invoice.customFields, invoice.items.map(item => item.description)])] });
  const collectableCents = parentPaymentAmountCents({ accountBalanceCents: billingAccount.balanceCents, agencyLedgerEntries, responsibilityReviewRequired,
    provisionalCreditCents: provisionalAchCreditCents(draftStripePayments) });
  return { billingAccount, center, draftStripePayments, agencyLedgerEntries, responsibilityReviewRequired, collectableCents };
}
