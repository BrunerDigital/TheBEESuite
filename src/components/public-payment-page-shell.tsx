import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import type { WorkspaceBranding } from "@/lib/brand-assets";

export function InvalidPaymentSetupLink({ message }: { message: string }) {
  return (
    <main className="public-payment-page min-h-dvh bg-[#090b10] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))] text-white sm:pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-2xl flex-col justify-center gap-5 sm:min-h-[calc(100dvh-4rem)]">
        <BrandLogo size="md" priority />
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">Payment setup link unavailable</h1>
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

export function PublicPaymentPageShell({ branding, familyName, centerLabel, childNames, children }: {
  branding?: WorkspaceBranding; familyName: string; centerLabel: string; childNames: string; children: ReactNode;
}) {
  return (
    <main className="public-payment-page min-h-dvh bg-[#090b10] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))] text-white sm:pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto grid min-h-[calc(100dvh-8rem)] w-full max-w-5xl gap-4 sm:min-h-[calc(100dvh-4rem)] lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <section className="space-y-3">
          <BrandLogo branding={branding} size="md" priority />
          <div>
            <Badge className="mb-2 border-amber-300/30 bg-amber-300/10 text-amber-100" variant="outline">
              Secure tuition payment
            </Badge>
            <div className="flex items-start gap-2">
              <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">Set up your family&apos;s payment method</h1>
              <InfoTip label="About this payment setup" side="bottom" align="end" className="mt-1 text-zinc-400 hover:text-white">
                Connect a bank account or save a debit or credit card for {familyName}. Payment details are entered only in the secure payment form.
              </InfoTip>
            </div>
          </div>
          <Card className="border-white/10 bg-white/[0.04] text-white">
            <CardContent className="space-y-2 p-3">
              <div className="flex flex-wrap gap-x-2 text-sm">
                <span className="text-zinc-400">School</span>
                <span className="font-medium">{centerLabel}</span>
              </div>
              {childNames ? (
                <div className="flex flex-wrap gap-x-2 text-sm">
                  <span className="text-zinc-400">Children</span>
                  <span className="font-medium">{childNames}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
        {children}
      </div>
    </main>
  );
}
