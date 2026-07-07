import Link from "next/link";
import { redirect } from "next/navigation";
import { DoorOpen } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser, getLeadScopeWhere, requiresPasswordResetGate } from "@/lib/auth";
import { loginHrefForNextPath } from "@/lib/login-routing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CheckInLauncherPage() {
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) redirect(loginHrefForNextPath("/check-in"));
  if (requiresPasswordResetGate(user)) redirect("/reset-password?force=1&next=/check-in");

  const centers = await prisma.center.findMany({
    where: { ...getLeadScopeWhere(user), status: { not: "closed" } },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: { id: true, name: true, crmLocationId: true, city: true, state: true },
  });

  if (centers.length === 1) redirect(`/check-in/${centers[0].id}`);

  return (
    <AppShell currentUser={user}>
      <div className="flex flex-col gap-6">
        <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
          <Badge className="mb-4">
            <DoorOpen data-icon="inline-start" />
            Lobby tablet mode
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Choose a Check-In Kiosk</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Directors can sign into the school account on a lobby tablet or front-desk computer, open the kiosk for the correct school, then leave the tablet on the family PIN/QR or staff clock-in/out screen.
          </p>
        </section>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {centers.map((center) => (
            <Link key={center.id} href={`/check-in/${center.id}`} target="_blank" rel="noreferrer">
              <Card className="glass-panel h-full transition hover:border-primary/60 hover:shadow-xl hover:shadow-primary/10">
                <CardHeader>
                  <CardTitle>{center.crmLocationId ?? center.name}</CardTitle>
                  <CardDescription>{[center.city, center.state].filter(Boolean).join(", ") || "School kiosk"}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-primary">Open family and staff kiosk screen</CardContent>
              </Card>
            </Link>
          ))}
          {!centers.length ? (
            <Card className="glass-panel">
              <CardContent className="p-6 text-sm text-muted-foreground">No active schools are visible for this account.</CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
