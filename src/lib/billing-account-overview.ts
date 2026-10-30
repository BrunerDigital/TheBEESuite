export type BillingAccountOverview = {
  familyId: string;
  centerId: string;
  billingAccountId: string;
  postedBalanceCents: number;
  collectibleCents: number;
  responsibilityReviewRequired: boolean;
  pendingCount: number;
  provisionalAchCreditCents: number;
};

type Target = Pick<BillingAccountOverview, "familyId" | "centerId" | "billingAccountId">;

export function isBillingAccountOverview(value: unknown, target: Target): value is BillingAccountOverview {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (["familyId", "centerId", "billingAccountId"] as const).every(key => Boolean(target[key]) && data[key] === target[key])
    && ["postedBalanceCents", "collectibleCents", "pendingCount", "provisionalAchCreditCents"].every(key => Number.isSafeInteger(data[key]))
    && Number(data.collectibleCents) >= 0 && Number(data.pendingCount) >= 0 && Number(data.provisionalAchCreditCents) >= 0
    && typeof data.responsibilityReviewRequired === "boolean";
}

/** Both cancellation and exact response identity matter: transports may ignore abort. */
export function requestBillingAccountOverview({ target, read, onResult, onError }: {
  target: Target;
  read: (signal: AbortSignal) => Promise<unknown>;
  onResult: (data: BillingAccountOverview) => void;
  onError: () => void;
}) {
  const controller = new AbortController();
  let current = true;
  void read(controller.signal).then(data => {
    if (!current) return;
    if (!isBillingAccountOverview(data, target)) throw new Error("Account context changed");
    onResult(data);
  }).catch(() => { if (current) onError(); });
  return () => { current = false; controller.abort(); };
}
