import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { resolvePaymentMethodRequestShortLink } from "@/lib/payment-method-request-forms";

function InvalidLink() {
  return (
    <main className="min-h-dvh bg-[#090b10] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))] text-white sm:pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-2xl flex-col justify-center gap-5 sm:min-h-[calc(100dvh-4rem)]">
        <BrandLogo size="md" priority />
        <Alert variant="destructive" className="bg-red-950/40">
          <AlertCircle className="size-4" />
          <AlertTitle>Payment setup link unavailable</AlertTitle>
          <AlertDescription>This payment setup link is invalid or has expired. Please ask the school to send a new one.</AlertDescription>
        </Alert>
      </div>
    </main>
  );
}

export default async function PaymentMethodShortLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const token = await resolvePaymentMethodRequestShortLink(code);
  if (!token) return <InvalidLink />;

  const search = searchParams ? await searchParams : {};
  const focus = Array.isArray(search.focus) ? search.focus[0] : search.focus;
  const suffix = focus === "instant-bank" ? "?focus=instant-bank" : "";
  redirect(`/payment-method-form/${encodeURIComponent(token)}${suffix}`);
}
