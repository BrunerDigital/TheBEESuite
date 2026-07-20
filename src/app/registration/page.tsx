import Link from "next/link";
import { ArrowLeft, BadgeCheck, CreditCard, FileCheck2, ShieldCheck } from "lucide-react";
import { BrandIcon } from "@/components/brand-logo";
import { OnlineRegistrationForm } from "@/components/online-registration-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { logOperationalError } from "@/lib/request-response-logging";
import { resolveRegistrationHandoffCenterId } from "@/lib/registration-handoff";

export const dynamic = "force-dynamic";

async function getRegistrationCenters() {
  try {
    return await prisma.center.findMany({
      where: { status: { not: "closed" } },
      orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        crmLocationId: true,
        city: true,
        state: true,
      },
    });
  } catch (error) {
    logOperationalError("registration.centers_lookup_failed", error);
    return [];
  }
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function OnlineRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ centerId?: string | string[] }>;
}) {
  const [centers, query] = await Promise.all([getRegistrationCenters(), searchParams]);
  const requestedCenterId = firstSearchParam(query.centerId).trim();
  const initialCenterId = resolveRegistrationHandoffCenterId(requestedCenterId, centers.map((center) => center.id));

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(245,181,27,0.16),transparent_28rem),linear-gradient(135deg,#05070a,#0a0f15_56%,#171104)] px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Button
            variant="outline"
            className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10"
            nativeButton={false}
            render={<Link href="/" />}
          >
            <ArrowLeft data-icon="inline-start" />
            <BrandIcon className="size-6 rounded-md" />
            The BEE Suite
          </Button>
          <Button nativeButton={false} render={<Link href="/parents" />}>
            Parent login
          </Button>
        </div>

        <section className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div className="sticky top-6 space-y-5">
            <div className="rounded-2xl border border-white/10 bg-black/45 p-6 text-white shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-sm text-amber-200">
                <FileCheck2 className="size-4" />
                Online registration
              </div>
              <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">Start a childcare registration packet.</h1>
              <p className="mt-5 text-sm leading-6 text-zinc-300">
                Families can submit registration details online. The BEE Suite routes the packet to the selected school, creates or updates the CRM lead, and queues a director review task.
              </p>
            </div>

            <div className="grid gap-3">
              {[
                [ShieldCheck, "Protected review", "Medical, custody, pickup, and emergency details stay in director-reviewed workflows."],
                [BadgeCheck, "CRM connected", "The selected school gets a registration-stage lead with a follow-up task."],
                [CreditCard, "Billing ready", "Tuition balances and payments are handled in the parent portal after school setup is active."],
              ].map(([Icon, title, body]) => (
                <Card key={title as string} className="border-white/10 bg-black/35 text-white backdrop-blur-xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="size-4 text-amber-300" />
                      {title as string}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 text-zinc-400">{body as string}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <OnlineRegistrationForm centers={centers} initialCenterId={initialCenterId} />
        </section>
      </div>
    </main>
  );
}
