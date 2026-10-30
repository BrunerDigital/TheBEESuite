"use client";

import { useEffect, useState } from "react";
import { requestBillingAccountOverview, type BillingAccountOverview } from "@/lib/billing-account-overview";

export function useBillingAccountOverview(target: { familyId: string; centerId: string; billingAccountId: string; balanceCents: number }, fixtures?: Record<string, BillingAccountOverview>) {
  const { familyId, centerId, billingAccountId, balanceCents } = target;
  const key = JSON.stringify([familyId, centerId, billingAccountId, balanceCents]);
  const [result, setResult] = useState<{ key: string; data?: BillingAccountOverview; error?: boolean }>();
  const [revision, setRevision] = useState(0);
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
      onResult: data => setResult({ key, data }),
      onError: () => setResult({ key, error: true }),
    });
  }, [familyId, centerId, billingAccountId, balanceCents, key, revision, fixtures]);
  return { data: result?.key === key ? result.data : undefined, error: result?.key === key && result.error, retry: () => { setResult(undefined); setRevision(value => value + 1); } };
}
