import type { Metadata } from "next";
import { PaymentStatus } from "@prisma/client";
import { InvalidPaymentSetupLink as InvalidLink, PublicPaymentPageShell } from "@/components/public-payment-page-shell";
import { PaymentMethodRequestForm } from "@/components/payment-method-request-form";
import { readStripeConnectedAccountId } from "@/lib/integrations";
import {
  canPreservePendingAutopayConsentForPaymentMethodMigration,
  canPreserveAutopayConsentForPaymentMethodMigration,
  paymentMethodManagementSummary,
} from "@/lib/payment-method-management";
import {
  paymentMethodRequestRecipientOptions,
  validatePaymentMethodRequestToken,
} from "@/lib/payment-method-request-forms";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceBranding } from "@/lib/brand-assets";
import { stripeConnectSavedMethodNeedsReauthorization } from "@/lib/stripe-connect-migration";

export const metadata: Metadata = {
  title: "Payment Setup | The BEE Suite",
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}


export default async function PaymentMethodFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const search = searchParams ? await searchParams : {};
  const validation = validatePaymentMethodRequestToken(token);
  if (!validation.ok) {
    return <InvalidLink message={validation.error} />;
  }

  const payload = validation.payload;
  const [family, center] = await Promise.all([
    prisma.family.findUnique({
      where: { id: payload.familyId },
      select: {
        id: true,
        centerId: true,
        name: true,
        billingEmail: true,
        billingAccount: {
          select: {
            customFields: true,
            autopayPlaceholder: true,
            invoices: {
              where: { status: PaymentStatus.OPEN },
              orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
              take: 5,
              select: { id: true, number: true, status: true, dueDate: true, totalCents: true },
            },
          },
        },
        guardians: {
          select: { id: true, fullName: true, email: true, userId: true },
          orderBy: { fullName: "asc" },
        },
        children: {
          orderBy: { fullName: "asc" },
          take: 4,
          select: { fullName: true },
        },
      },
    }),
    prisma.center.findUnique({
      where: { id: payload.centerId },
      select: {
        id: true,
        name: true,
        crmLocationId: true,
        customFields: true,
        organization: {
          select: {
            name: true,
            tenant: { select: { id: true, name: true, slug: true } },
            brand: { select: { name: true, slug: true } },
          },
        },
      },
    }),
  ]);

  if (!family || family.centerId !== payload.centerId || !center || center.organization.tenant.id !== payload.tenantId) {
    return <InvalidLink message="This payment setup link could not be matched to an active family record." />;
  }

  const recipients = paymentMethodRequestRecipientOptions({
    billingEmail: family.billingEmail,
    guardians: family.guardians,
  });
  const recipient = recipients.find((item) => item.email === payload.email);
  if (!recipient) {
    return <InvalidLink message="This payment setup link is no longer connected to a saved family email." />;
  }

  const branding = resolveWorkspaceBranding({
    tenantName: center.organization.tenant.name,
    tenantSlug: center.organization.tenant.slug,
    brandName: center.organization.brand?.name,
    brandSlug: center.organization.brand?.slug,
    organizationName: center.organization.name,
    email: payload.email,
  });
  const billingAccountFields = family.billingAccount?.customFields && typeof family.billingAccount.customFields === "object" && !Array.isArray(family.billingAccount.customFields)
    ? family.billingAccount.customFields as Record<string, unknown>
    : {};
  const activeConnectedAccountId = readStripeConnectedAccountId(center.customFields);
  const paymentMethod = paymentMethodManagementSummary({
    autopayPlaceholder: family.billingAccount?.autopayPlaceholder,
    customFields: billingAccountFields,
    activeConnectedAccountId,
    centerCustomFields: center.customFields,
  });
  const reauthorizationRequired = stripeConnectSavedMethodNeedsReauthorization({
    activeAccountId: activeConnectedAccountId,
    savedMethodAccountId: typeof billingAccountFields.stripeDefaultPaymentMethodConnectedAccountId === "string"
      ? billingAccountFields.stripeDefaultPaymentMethodConnectedAccountId
      : null,
    centerCustomFields: center.customFields,
  });
  const reauthorizationPreservesAutopay = payload.intent === "payment_method_reauthorization"
    && reauthorizationRequired
    && (
      canPreserveAutopayConsentForPaymentMethodMigration({
        autopayPlaceholder: family.billingAccount?.autopayPlaceholder,
        customFields: billingAccountFields,
        linkedGuardianUserIds: recipient.userIds,
      })
      || canPreservePendingAutopayConsentForPaymentMethodMigration({
        currentFields: billingAccountFields,
        linkedGuardianUserIds: recipient.userIds,
        currentCenterId: center.id,
        currentTenantId: center.organization.tenant.id,
        activeConnectedAccountId,
        centerCustomFields: center.customFields,
      })
    );
  const centerLabel = center.crmLocationId ?? center.name;
  const childNames = family.children.map((child) => child.fullName).join(", ");
  const paymentMethodStatus = firstQueryValue(search.paymentMethod) ?? null;
  const paymentStatus = firstQueryValue(search.payment) ?? null;
  const focus = firstQueryValue(search.focus) === "instant-bank" ? "instant-bank" : null;

  return (
    <PublicPaymentPageShell branding={branding} familyName={family.name} centerLabel={centerLabel} childNames={childNames}>
        <PaymentMethodRequestForm
          token={token}
          familyName={family.name}
          centerLabel={centerLabel}
          recipientEmail={payload.email}
          savedPaymentMethodLabel={paymentMethod.paymentMethodLabel}
          autopayStatus={paymentMethod.autopayStatus}
          bankVerificationPending={paymentMethod.bankVerificationPending}
          paymentMethodStatus={paymentMethodStatus}
          paymentStatus={paymentStatus}
          focus={focus}
          reauthorization={payload.intent === "payment_method_reauthorization"}
          reauthorizationPreservesAutopay={reauthorizationPreservesAutopay}
          openInvoices={(payload.intent === "payment_method_reauthorization" ? [] : family.billingAccount?.invoices ?? []).map((invoice) => ({
            id: invoice.id,
            number: invoice.number,
            status: invoice.status,
            dueDate: invoice.dueDate,
            totalCents: invoice.totalCents,
          }))}
        />
    </PublicPaymentPageShell>
  );
}
