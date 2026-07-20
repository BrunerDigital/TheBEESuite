import type { Metadata } from "next";
import Link from "next/link";
import { PaymentStatus } from "@prisma/client";
import { AlertCircle } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { PaymentMethodRequestForm } from "@/components/payment-method-request-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { paymentMethodManagementSummary } from "@/lib/payment-method-management";
import {
  paymentMethodRequestRecipientOptions,
  validatePaymentMethodRequestToken,
} from "@/lib/payment-method-request-forms";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceBranding } from "@/lib/brand-assets";

export const metadata: Metadata = {
  title: "Payment Setup | The BEE Suite",
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function InvalidLink({ message }: { message: string }) {
  return (
    <main className="min-h-dvh bg-[#090b10] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))] text-white sm:pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-2xl flex-col justify-center gap-5 sm:min-h-[calc(100dvh-4rem)]">
        <BrandLogo size="md" priority />
        <Alert variant="destructive" className="bg-red-950/40">
          <AlertCircle className="size-4" />
          <AlertTitle>Payment setup link unavailable</AlertTitle>
          <AlertDescription>
            {message} Ask your school office to send a new secure payment setup link. Do not enter payment details anywhere
            else.
          </AlertDescription>
        </Alert>
        <Link href="/parents" className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-amber-300 underline underline-offset-4 hover:text-amber-200">
          Return to parent portal sign in
        </Link>
      </div>
    </main>
  );
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
  const paymentMethod = paymentMethodManagementSummary({
    autopayPlaceholder: family.billingAccount?.autopayPlaceholder,
    customFields: family.billingAccount?.customFields,
  });
  const centerLabel = center.crmLocationId ?? center.name;
  const childNames = family.children.map((child) => child.fullName).join(", ");
  const paymentMethodStatus = firstQueryValue(search.paymentMethod) ?? null;
  const paymentStatus = firstQueryValue(search.payment) ?? null;
  const focus = firstQueryValue(search.focus) === "instant-bank" ? "instant-bank" : null;

  return (
    <main className="min-h-dvh bg-[#090b10] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))] text-white sm:pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto grid min-h-[calc(100dvh-8rem)] w-full max-w-5xl gap-6 sm:min-h-[calc(100dvh-4rem)] lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <section className="space-y-5">
          <BrandLogo branding={branding} size="lg" priority />
          <div>
            <Badge className="mb-3 border-amber-300/30 bg-amber-300/10 text-amber-100" variant="outline">
              The BEE Suite secure tuition flow
            </Badge>
            <div className="flex items-start gap-2">
              <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">Set up your family payment profile in The BEE Suite</h1>
              <InfoTip label="About this payment setup" side="bottom" align="end" className="mt-1 text-zinc-400 hover:text-white">
                Save a bank account or debit/credit card for tuition payments connected to {family.name}. A secure processor opens only when payment details must be collected.
              </InfoTip>
            </div>
          </div>
          <Card className="border-white/10 bg-white/[0.04] text-white">
            <CardContent className="space-y-3 p-4">
              <div>
                <div className="text-xs uppercase tracking-normal text-zinc-500">School</div>
                <div className="mt-1 text-sm font-medium">{centerLabel}</div>
              </div>
              {childNames ? (
                <div>
                  <div className="text-xs uppercase tracking-normal text-zinc-500">Linked child records</div>
                  <div className="mt-1 text-sm font-medium">{childNames}</div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
        <PaymentMethodRequestForm
          token={token}
          familyName={family.name}
          centerLabel={centerLabel}
          recipientEmail={payload.email}
          savedPaymentMethodLabel={paymentMethod.paymentMethodLabel}
          autopayStatus={paymentMethod.autopayStatus}
          paymentMethodStatus={paymentMethodStatus}
          paymentStatus={paymentStatus}
          focus={focus}
          openInvoices={(family.billingAccount?.invoices ?? []).map((invoice) => ({
            id: invoice.id,
            number: invoice.number,
            status: invoice.status,
            dueDate: invoice.dueDate,
            totalCents: invoice.totalCents,
          }))}
        />
      </div>
    </main>
  );
}
