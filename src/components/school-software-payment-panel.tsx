"use client";

import { useMemo, useState, useTransition } from "react";
import { BadgeDollarSign, Building2, CheckCircle2, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type SchoolSoftwareBillingRow = {
  id: string;
  name: string;
  tier: "corporate" | "partner";
  monthlyAmountCents: number;
  paymentMethodReady: boolean;
  paymentMethodLabel: string | null;
  paymentStatus: string;
  subscriptionStatus: string;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function SchoolSoftwarePaymentPanel({ schools }: { schools: SchoolSoftwareBillingRow[] }) {
  const [selectedId, setSelectedId] = useState(schools[0]?.id || "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const school = useMemo(() => schools.find((item) => item.id === selectedId) || schools[0], [schools, selectedId]);

  function authorize(method: "ach" | "card") {
    if (!school) return;
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/billing/software-payment-method", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ centerId: school.id, method }),
      });
      const json = await response.json().catch(() => ({})) as { ok?: boolean; url?: string; error?: string };
      if (!response.ok || !json.ok || !json.url) {
        setMessage(json.error || "The secure school payment-method setup could not be opened.");
        return;
      }
      window.location.assign(json.url);
    });
  }

  if (!school) return null;
  return (
    <Card className="glass-panel border-primary/35">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle as="h2" className="flex items-center gap-2"><BadgeDollarSign className="size-5 text-primary" />BEE Suite software subscription</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              Authorize the school&apos;s recurring monthly software fee. The first paid cycle begins September 1, 2026. This payment method is separate from parent tuition and the school&apos;s Stripe payout bank.
            </CardDescription>
          </div>
          <Badge variant={school.paymentMethodReady ? "default" : "outline"}>
            {school.paymentMethodReady ? <CheckCircle2 /> : <Building2 />}
            {school.paymentMethodReady ? "Payment method ready" : "Authorization required"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {schools.length > 1 ? (
          <label className="block space-y-2 text-sm font-medium">
            School
            <select className="h-10 w-full rounded-md border bg-background px-3 font-normal" value={school.id} onChange={(event) => setSelectedId(event.target.value)}>
              {schools.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-background/45 p-3"><div className="text-xs uppercase tracking-wide text-muted-foreground">Monthly fee</div><div className="mt-1 text-lg font-semibold">{money(school.monthlyAmountCents)}</div></div>
          <div className="rounded-xl border bg-background/45 p-3"><div className="text-xs uppercase tracking-wide text-muted-foreground">Rate</div><div className="mt-1 text-lg font-semibold">{school.tier === "corporate" ? "Corporate" : "Standard"}</div></div>
          <div className="rounded-xl border bg-background/45 p-3"><div className="text-xs uppercase tracking-wide text-muted-foreground">Subscription</div><div className="mt-1 text-lg font-semibold capitalize">{school.subscriptionStatus.replaceAll("_", " ")}</div></div>
        </div>
        {school.paymentMethodLabel ? <p className="text-sm text-muted-foreground">Authorized method: {school.paymentMethodLabel}</p> : null}
        {message ? <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => authorize("ach")}><Landmark />Authorize bank account</Button>
          <Button variant="outline" disabled={pending} onClick={() => authorize("card")}>Authorize card</Button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Parents are never charged this fee. Parent tuition payments remain principal-only; the school separately pays Stripe processing costs and the 1% BEE Suite application fee from school proceeds.
        </p>
      </CardContent>
    </Card>
  );
}
