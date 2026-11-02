"use client";

import { useEffect, useMemo, useState } from "react";
import { requestBillingAccountOverview, type BillingAccountOverview } from "@/lib/billing-account-overview";

export function useBillingAccountOverview(target: { familyId: string; centerId: string; billingAccountId: string; balanceCents: number; paymentStateKey?: string; refreshSource?: object | null }, fixtures?: Record<string, BillingAccountOverview>) {
  const { familyId, centerId, billingAccountId, balanceCents, paymentStateKey, refreshSource } = target;
  const key = JSON.stringify([familyId, centerId, billingAccountId, balanceCents, paymentStateKey]);
  const [result, setResult] = useState<{ context: object; data?: BillingAccountOverview; error?: boolean }>();
  const [revision, setRevision] = useState(0);
  // A server refresh may change processing/agency state while the posted balance stays put.
  // A fresh context also prevents an older A result from reappearing during A -> B -> A.
  const context = useMemo(() => ({ key, refreshSource, revision }), [key, refreshSource, revision]);
  useEffect(() => {
    if (!familyId || !centerId || !billingAccountId) return;
    return requestBillingAccountOverview({
      target: { familyId, centerId, billingAccountId },
      read: async signal => {
        if (fixtures) return fixtures[familyId];
        const response = await fetch(`/api/billing/account-overview?${new URLSearchParams({ familyId, centerId, billingAccountId })}`, { signal, cache: "no-store" });
        if (!response.ok) throw new Error("Account overview unavailable");
        return response.json();
      },
      onResult: data => setResult({ context, data }),
      onError: () => setResult({ context, error: true }),
    });
  }, [familyId, centerId, billingAccountId, context, fixtures]);
  return { data: result?.context === context ? result.data : undefined, error: result?.context === context && result.error, retry: () => setRevision(value => value + 1) };
}
