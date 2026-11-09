import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Payment to The BEE Suite", robots: { index: false, follow: false } };

export default async function PlatformPaymentReturn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const canceled = (await searchParams).result === "canceled";
  return <main className="flex min-h-screen items-center justify-center p-6">
    <section className="w-full max-w-lg space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <p className="text-sm font-semibold text-muted-foreground">The BEE Suite</p>
      <h1 className="text-2xl font-semibold">{canceled ? "Checkout closed" : "Checkout submitted"}</h1>
      <p className="text-sm leading-6">{canceled
        ? "You can return to your payment link to continue checkout. Contact The BEE Suite if the charge needs to change."
        : "The BEE Suite will confirm your payment with the payment provider. You can close this page. Contact The BEE Suite for a receipt or help with this charge."}</p>
      <Link className="inline-block text-sm font-medium underline underline-offset-4" href="/">Return to The BEE Suite</Link>
    </section>
  </main>;
}
