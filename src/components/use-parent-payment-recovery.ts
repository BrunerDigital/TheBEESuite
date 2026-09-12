"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { isParentPaymentObservation, isPaymentObservationId, type ParentPaymentObservationTarget } from "@/lib/parent-payment-observation";
import { mergeParentAccountPaymentBlockers, mergeParentPaymentPhases, type ParentAccountPaymentBlocker, type ParentPendingPayment } from "@/lib/parent-payment-status";

type Attempt = { familyId: string; invoiceId: string | null; method: "ach" | "card" | "link_bank"; sequence: number };
type Hold = Attempt & { paymentId: string | null; summary: ParentPendingPayment; settled: boolean };
type Request = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Local uncertainty survives portal tabs. Only an explicit new page can discard a held attempt. */
export function useParentPaymentRecovery(familyId: string, request: Request, refreshPage: () => void, serverBlocker?: ParentAccountPaymentBlocker | null) {
  const [holds, setHolds] = useState<Hold[]>([]);
  const [isRefreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState({ familyId, message: "" });
  const setRefreshMessage = (message: string) => setRefreshNotice({ familyId, message });
  const [isSubmitting, setSubmitting] = useState(false);
  const [latestAccount, setLatestAccount] = useState<{ familyId: string; blocker: ParentAccountPaymentBlocker | null; invoices: Map<string, ParentPendingPayment> } | null>(null);
  const latestAccountRef = useRef(latestAccount);
  const activeFamily = useRef(familyId);
  const sequence = useRef(0);
  const inFlight = useRef<Attempt | null>(null);
  const held = useRef(holds);
  const observation = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; observation.current?.abort(); };
  }, []);
  useLayoutEffect(() => { activeFamily.current = familyId; observation.current?.abort(); }, [familyId]);

  function begin(invoiceId: string | null, method: Attempt["method"]) {
    if (inFlight.current || held.current.some(hold => hold.familyId === familyId && (!invoiceId || !hold.invoiceId || hold.invoiceId === invoiceId))) return null;
    const observed = latestAccountRef.current?.familyId === familyId ? latestAccountRef.current : null;
    if (observed?.blocker && (!invoiceId || observed.blocker.blocksInvoicePayments || observed.invoices.has(invoiceId))) return null;
    observation.current?.abort();
    const attempt = { familyId, invoiceId, method, sequence: ++sequence.current };
    inFlight.current = attempt; setSubmitting(true); setRefreshMessage("");
    return attempt;
  }
  function finish(attempt: Attempt) {
    if (inFlight.current !== attempt) return;
    inFlight.current = null;
    if (mounted.current) setSubmitting(false);
  }
  function hold(attempt: Attempt, paymentId: unknown) {
    if (!mounted.current || inFlight.current !== attempt) return;
    const next: Hold = { ...attempt, paymentId: isPaymentObservationId(paymentId) ? paymentId : null,
      summary: { phase: "confirmation_unknown", method: attempt.method }, settled: false };
    const updated = [...held.current.filter(item => item.familyId !== attempt.familyId || item.invoiceId !== attempt.invoiceId), next];
    // Synchronous guard prevents a second click before React commits the notice.
    held.current = updated; setHolds(updated); finish(attempt);
  }
  async function refresh() {
    if (!isPaymentObservationId(familyId) || inFlight.current) return;
    observation.current?.abort();
    const controller = new AbortController(); observation.current = controller;
    const capturedSequence = sequence.current, capturedFamily = familyId;
    const currentHolds = held.current.filter(item => item.familyId === capturedFamily);
    setRefreshing(true); setRefreshMessage("");
    const current = () => mounted.current && !controller.signal.aborted && observation.current === controller
      && activeFamily.current === capturedFamily && sequence.current === capturedSequence;
    try {
      const updates = await Promise.all((currentHolds.length ? currentHolds : [null]).map(async item => {
        const target: ParentPaymentObservationTarget = { familyId: capturedFamily, invoiceId: item?.invoiceId ?? null,
          paymentId: item?.paymentId ?? null, requestNonce: crypto.randomUUID() };
        const params = new URLSearchParams({ familyId: capturedFamily, requestNonce: target.requestNonce });
        if (target.invoiceId) params.set("invoiceId", target.invoiceId);
        if (target.paymentId) params.set("paymentId", target.paymentId);
        const response = await request(`/api/parent/payment-status?${params}`, { method: "GET", cache: "no-store", signal: controller.signal });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !isParentPaymentObservation(body, target)) throw new Error("Unverified payment observation");
        const payment = target.invoiceId ? body.invoicePayments.find(entry => entry.invoiceId === target.invoiceId)?.payment : body.accountPaymentBlocker;
        return { hold: item ? { ...item, summary: payment ?? item.summary, settled: body.outcome === "settled" } : null, account: body.accountPaymentBlocker, invoices: body.invoicePayments };
      }));
      if (!current()) return;
      const updated = [...held.current.filter(item => item.familyId !== capturedFamily), ...updates.map(item => item.hold).filter((item): item is Hold => item !== null)];
      held.current = updated; setHolds(updated);
      // Multiple observations can race other tabs: retain any observed blocker.
      const observedBlocker = mergeParentAccountPaymentBlockers(updates.map(item => item.account));
      const invoices = new Map<string, ParentPendingPayment>();
      for (const update of updates) for (const entry of update.invoices) {
        invoices.set(entry.invoiceId, mergeParentPaymentPhases([...(invoices.has(entry.invoiceId) ? [invoices.get(entry.invoiceId)!] : []), entry.payment])!);
      }
      const latest = { familyId: capturedFamily, blocker: observedBlocker, invoices };
      latestAccountRef.current = latest; setLatestAccount(latest);
      setRefreshMessage(currentHolds.length
        ? updates.every(item => item.hold?.settled) && !observedBlocker ? "Your payment is recorded. Review the updated balance before making another payment."
          : "Status checked. Keep this attempt paused until its outcome is confirmed. Contact your school if it does not update."
        : "Status checked. Your account details are refreshing.");
      refreshPage();
    } catch {
      if (current()) setRefreshMessage("We could not confirm the latest status. This payment remains paused. Check your connection and refresh again, or contact your school.");
    } finally {
      if (mounted.current && observation.current === controller) setRefreshing(false);
    }
  }
  const currentHolds = holds.filter(item => item.familyId === familyId);
  const observedBlocker = latestAccount?.familyId === familyId ? latestAccount.blocker : null;
  const activeBlockers = [serverBlocker, observedBlocker].filter((item): item is ParentAccountPaymentBlocker => Boolean(item));
  const blocker = mergeParentAccountPaymentBlockers([...activeBlockers, currentHolds.length ? {
    ...(currentHolds.find(item => !item.settled)?.summary ?? currentHolds[0].summary),
    count: Math.max(currentHolds.filter(item => !item.settled).length, ...activeBlockers.map(item => item.count)),
    blocksInvoicePayments: currentHolds.some(item => !item.invoiceId) || activeBlockers.some(item => item.blocksInvoicePayments),
  } : null]);
  return { begin, finish, hold, refresh, isRefreshing, isSubmitting, refreshMessage: refreshNotice.familyId === familyId ? refreshNotice.message : "", blocker,
    canNavigate: (attempt: Attempt) => mounted.current && activeFamily.current === attempt.familyId && inFlight.current === attempt && sequence.current === attempt.sequence,
    hasHolds: currentHolds.length > 0, allSettled: currentHolds.length > 0 && currentHolds.every(item => item.settled) && activeBlockers.length === 0,
    pendingInvoice: (invoiceId: string) => mergeParentPaymentPhases([
      ...currentHolds.filter(item => !item.settled && item.invoiceId === invoiceId).map(item => item.summary),
      ...(latestAccount?.familyId === familyId && latestAccount.invoices.has(invoiceId) ? [latestAccount.invoices.get(invoiceId)!] : []),
    ]),
    blocksInvoice: (invoiceId: string) => activeBlockers.some(item => item.blocksInvoicePayments)
      || (latestAccount?.familyId === familyId && latestAccount.invoices.has(invoiceId)) || currentHolds.some(item => !item.invoiceId || item.invoiceId === invoiceId) };
}

export type ParentPaymentRecovery = ReturnType<typeof useParentPaymentRecovery>;
