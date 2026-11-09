"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CreditCard, Copy, ExternalLink, RefreshCw, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PlatformBillingDashboard } from "@/lib/platform-billing";
import { platformBillingAmount, platformCheckoutUrl, platformInvoiceUrl } from "@/lib/platform-billing-policy";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const selectClass = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";
const statusLabels: Record<string, string> = {
  draft: "Checkout needs retry", checkout_open: "Awaiting payment", paid: "Paid", processing: "Payment processing",
  active: "Monthly billing active", past_due: "Payment past due", canceled: "Subscription ended", unpaid: "Unpaid",
  incomplete: "Authorization incomplete", incomplete_expired: "Authorization expired", expired: "Payment link closed",
  trialing: "Trial", failed: "Payment failed", paused: "Subscription paused", payment_failed: "Payment failed", action_required: "Payer action required",
  partially_refunded: "Partially refunded", refunded: "Refunded",
};
type Charge = PlatformBillingDashboard["charges"][number];
type Review = { action: string; charge?: Charge } | null;

export function PlatformBillingConsole() {
  const [data, setData] = useState<PlatformBillingDashboard | null>(null);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [link, setLink] = useState<{ url: string; name: string; description: string; amountCents: number; kind: string } | null>(null);
  const [payer, setPayer] = useState({ name: "", email: "", customerTenantId: "" });
  const [accountId, setAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState("ONE_TIME");
  const [review, setReview] = useState<Review>(null);
  const payerRequestId = useRef("");
  const chargeRequestId = useRef("");
  const actionRequestIds = useRef<Record<string, string>>({});
  const selectedAccount = data?.accounts.find((account) => account.id === accountId);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/platform-billing", { cache: "no-store", signal });
    const json = await response.json();
    if (!response.ok || !json.ok) throw new Error(json.error || "Billing history could not be loaded.");
    setData(json.data);
    setConfigured(json.configured === true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/platform-billing", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || !json.ok) throw new Error(json.error || "Billing history could not be loaded.");
        setData(json.data); setConfigured(json.configured === true);
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Billing history could not be loaded."); });
    return () => controller.abort();
  }, []);

  async function send(body: Record<string, unknown>) {
    const response = await fetch("/api/platform-billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) throw new Error(json.error || "The billing request could not be completed. Refresh the history before retrying.");
    return json as { accountId?: string; url?: string };
  }

  async function savePayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice(""); setBusy("payer");
    payerRequestId.current ||= crypto.randomUUID();
    try {
      const result = await send({ action: "create-account", ...payer, requestId: payerRequestId.current });
      payerRequestId.current = "";
      setPayer({ name: "", email: "", customerTenantId: "" });
      setAccountId(result.accountId || "");
      if (!payer.customerTenantId) setKind("ONE_TIME");
      setLink(null);
      setNotice("Payer saved. Enter the charge below.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Payer could not be saved."); }
    finally { setBusy(""); }
  }

  function reviewCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      platformBillingAmount(amount);
      if (!selectedAccount) throw new Error("Choose a payer for this charge.");
      if (kind === "MONTHLY" && !selectedAccount.customerTenantId) throw new Error("Choose a tenant payer for monthly billing.");
      setReview({ action: "create-charge" });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Check the charge details."); }
  }

  async function run(action: string, charge?: Charge) {
    setBusy(charge?.id || "charge"); setError(""); setNotice("");
    const actionKey = `${action}:${charge?.id || "new"}`;
    actionRequestIds.current[actionKey] ||= crypto.randomUUID();
    chargeRequestId.current ||= crypto.randomUUID();
    try {
      const result = await send(action === "create-charge"
        ? { action, requestId: chargeRequestId.current, accountId, description, amount, kind }
        : { action, chargeId: charge?.id, requestId: actionRequestIds.current[actionKey] });
      if (result.url && platformCheckoutUrl(result.url)) setLink({ url: result.url, name: charge?.name || selectedAccount?.name || "", description: charge?.description || description, amountCents: charge?.amountCents || platformBillingAmount(amount), kind: charge?.kind || kind });
      if (action === "create-charge") { chargeRequestId.current = ""; setDescription(""); setAmount(""); }
      delete actionRequestIds.current[actionKey];
      setReview(null);
      setNotice(action === "create-charge" || action === "retry" ? "Payment link ready. Open it to take payment, or copy it for the payer." : "Billing status refreshed.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The billing request could not be completed.");
      await load().catch(() => undefined);
    } finally { setBusy(""); }
  }

  async function copyLink(url: string) {
    try { await navigator.clipboard.writeText(url); setNotice("Payment link copied."); }
    catch { setError("The link could not be copied. Open the payment link and copy its address."); }
  }

  const reviewAmount = review?.action === "create-charge" ? (() => { try { return platformBillingAmount(amount); } catch { return 0; } })() : review?.charge?.amountCents || 0;
  const reviewMonthly = review?.action === "create-charge" ? kind === "MONTHLY" : review?.charge?.kind === "MONTHLY";

  return <div className="flex min-w-0 flex-col gap-6">
    <section className="space-y-2 rounded-xl border bg-card p-4 sm:p-6">
      <Badge variant="outline"><CreditCard className="mr-1 size-4" />Platform revenue</Badge>
      <h1 className="text-3xl font-semibold tracking-tight">BEE Suite Billing</h1>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">Bill tenants for monthly fees and accept card payments for other charges. All payments here are made to The BEE Suite.</p>
    </section>

    {error ? <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</div> : null}
    {notice ? <div role="status" className="rounded-lg border bg-card p-3 text-sm">{notice}</div> : null}
    {!data ? <Button className="self-start" variant="outline" onClick={() => { setError(""); load().catch((reason) => setError(reason.message)); }}><RefreshCw className="size-4" />{error ? "Retry billing history" : "Loading billing history…"}</Button> : null}
    {data && !configured ? <p role="status" className="rounded-lg border p-3 text-sm">The BEE Suite payment account needs to be configured before payment links can be created.</p> : null}
    {link ? <Card className="border-primary/40"><CardHeader><CardTitle as="h2">Payment link ready</CardTitle><CardDescription>{link.name} · {link.description} · {money(link.amountCents)}{link.kind === "MONTHLY" ? " per month" : " one time"}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">
      <a className={buttonVariants()} href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />Open checkout</a>
      <Button variant="outline" onClick={() => copyLink(link.url)}><Copy className="size-4" />Copy payment link</Button>
    </CardContent></Card> : null}

    {data ? <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle as="h2">Add a payer</CardTitle><CardDescription>Link a tenant for monthly fees, or add another customer for a one-time charge.</CardDescription></CardHeader><CardContent>
        <form onSubmit={savePayer} data-submission-feedback="inline" className="space-y-4">
          <div className="space-y-2"><Label htmlFor="platform-payer-tenant">Tenant</Label><select id="platform-payer-tenant" className={selectClass} value={payer.customerTenantId} disabled={Boolean(busy)} onChange={(e) => setPayer({ ...payer, customerTenantId: e.target.value })}>
            <option value="">Other customer / one-time payer</option>
            {data.tenants.filter((tenant) => !data.accounts.some((a) => a.customerTenantId === tenant.id)).map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
          </select></div>
          <div className="space-y-2"><Label htmlFor="platform-payer-name">Payer / company name</Label><Input id="platform-payer-name" required maxLength={160} autoComplete="organization" disabled={Boolean(busy)} value={payer.name} onChange={(e) => setPayer({ ...payer, name: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="platform-payer-email">Billing email</Label><Input id="platform-payer-email" type="email" required maxLength={254} autoComplete="email" disabled={Boolean(busy)} value={payer.email} onChange={(e) => setPayer({ ...payer, email: e.target.value })} /></div>
          <Button type="submit" disabled={Boolean(busy)}>{busy === "payer" ? "Saving…" : "Save payer"}</Button>
        </form>
      </CardContent></Card>

      <Card><CardHeader><CardTitle as="h2">Create a charge</CardTitle><CardDescription>The payer completes secure checkout. Monthly fees repeat after the payer authorizes the subscription.</CardDescription></CardHeader><CardContent>
        <form onSubmit={reviewCharge} data-submission-feedback="inline" className="space-y-4">
          <div className="space-y-2"><Label htmlFor="platform-charge-payer">Payer</Label><select id="platform-charge-payer" required className={selectClass} value={accountId} disabled={Boolean(busy)} onChange={(e) => { setAccountId(e.target.value); setLink(null); if (!data.accounts.find((a) => a.id === e.target.value)?.customerTenantId) setKind("ONE_TIME"); }}>
            <option value="">Choose a payer</option>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.tenantName ? ` · ${a.tenantName}` : ""}</option>)}
          </select>{selectedAccount ? <p className="break-words text-xs text-muted-foreground">{selectedAccount.email}</p> : null}</div>
          <div className="space-y-2"><Label htmlFor="platform-charge-kind">Billing frequency</Label><select id="platform-charge-kind" className={selectClass} value={kind} disabled={Boolean(busy)} onChange={(e) => setKind(e.target.value)}>
            <option value="ONE_TIME">One-time payment</option><option value="MONTHLY" disabled={!selectedAccount?.customerTenantId}>Monthly tenant fee</option>
          </select></div>
          <div className="space-y-2"><Label htmlFor="platform-charge-description">Charge description</Label><Input id="platform-charge-description" required maxLength={200} placeholder="Monthly software fee, setup, services…" value={description} disabled={Boolean(busy)} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="platform-charge-amount">{kind === "MONTHLY" ? "Monthly amount (USD)" : "Amount (USD)"}</Label><Input id="platform-charge-amount" required inputMode="decimal" autoComplete="off" placeholder="79.00" aria-describedby="platform-charge-amount-help" value={amount} disabled={Boolean(busy)} onChange={(e) => setAmount(e.target.value)} /><p id="platform-charge-amount-help" className="text-xs text-muted-foreground">Enter $0.50 to $999,999.99. The payer sees this amount at checkout.</p></div>
          <Button type="submit" disabled={Boolean(busy) || !configured || !data.accounts.length}>Review charge</Button>
        </form>
      </CardContent></Card>
    </div> : null}

    {data ? <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-1"><CardTitle as="h2"><ReceiptText className="mr-2 inline size-5" />Charges and monthly fees</CardTitle><CardDescription>Recent charges and all outstanding monthly fees. Refresh a charge to check its latest payment and invoice status.</CardDescription></div><Button variant="outline" disabled={Boolean(busy)} onClick={() => { setError(""); load().catch((reason) => setError(reason.message)); }}><RefreshCw className="size-4" />Refresh history</Button></div></CardHeader><CardContent className="space-y-4">
      {!data.charges.length ? <p className="text-sm text-muted-foreground">No BEE Suite charges yet. Add a payer and create the first charge above.</p> : data.charges.map((charge) => <article key={charge.id} className="min-w-0 space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0 space-y-1"><h3 className="break-words font-medium">{charge.description}</h3><p className="break-words text-sm text-muted-foreground">{charge.name} · {charge.email}</p><p className="text-sm">{money(charge.amountCents)}{charge.kind === "MONTHLY" ? " per month" : " one time"}</p></div><Badge variant="outline" className="h-fit">{charge.cancelAtPeriodEnd ? "Ends at renewal" : statusLabels[charge.status] || charge.status}</Badge></div>
        {charge.currentPeriodEnd ? <p className="text-xs text-muted-foreground">{charge.cancelAtPeriodEnd ? "Ends" : "Current period ends"} {new Date(charge.currentPeriodEnd).toLocaleDateString("en-US")}</p> : null}
        {charge.refundedAmountCents > 0 ? <p className="text-sm">{money(charge.refundedAmountCents)} refunded</p> : null}
        <div className="flex flex-wrap gap-2">
          {charge.checkoutUrl && platformCheckoutUrl(charge.checkoutUrl) ? <><a className={buttonVariants({ size: "sm" })} href={charge.checkoutUrl} target="_blank" rel="noopener noreferrer">Open payment link<ExternalLink className="size-4" /></a><Button size="sm" variant="outline" onClick={() => copyLink(charge.checkoutUrl!)}>Copy link</Button><Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => setReview({ action: "close-request", charge })}>Close payment link</Button></> : null}
          {charge.status === "draft" ? <Button size="sm" disabled={Boolean(busy)} onClick={() => run("retry", charge)}>Retry checkout</Button> : <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => run("sync", charge)}><RefreshCw className={busy === charge.id ? "size-4 animate-spin" : "size-4"} />Refresh status</Button>}
          {charge.hasSubscription && !["canceled", "incomplete_expired"].includes(charge.status) ? <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => setReview({ action: charge.cancelAtPeriodEnd ? "resume-subscription" : "cancel-subscription", charge })}>{charge.cancelAtPeriodEnd ? "Keep monthly billing" : "End at renewal"}</Button> : null}
        </div>
        {charge.invoices.length ? <details className="text-sm"><summary className="cursor-pointer font-medium">Invoice history ({charge.invoices.length})</summary><ul className="mt-2 space-y-2">{charge.invoices.map((invoice) => <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-2"><span>{invoice.number || "Invoice"} · {statusLabels[invoice.status] || invoice.status} · {money(invoice.amountDueCents)} due / {money(invoice.amountPaidCents)} paid</span>{invoice.hostedInvoiceUrl && platformInvoiceUrl(invoice.hostedInvoiceUrl) ? <a className="underline underline-offset-4" href={invoice.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer">View invoice</a> : null}</li>)}</ul></details> : null}
      </article>)}
    </CardContent></Card> : null}

    <Dialog open={Boolean(review)} onOpenChange={(open) => { if (!open && !busy) setReview(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{review?.action === "create-charge" ? "Review BEE Suite charge" : review?.action === "close-request" ? "Close this payment link?" : review?.action === "resume-subscription" ? "Keep monthly billing?" : "End monthly billing at renewal?"}</DialogTitle><DialogDescription>{review?.action === "create-charge"
      ? "Confirm the payer, description, and amount before creating the payment link."
      : review?.action === "close-request" ? "The unpaid checkout will close. A new charge will require a new payment link."
      : review?.action === "resume-subscription" ? "This subscription will continue renewing under the payer's existing authorization."
      : "The subscription stays in place through the current period and will not renew after that."}</DialogDescription></DialogHeader>
      <div className="space-y-2 rounded-lg border p-3 text-sm"><p className="break-words font-medium">{review?.charge?.name || selectedAccount?.name}</p><p className="break-words">{review?.charge?.description || description}</p><p className="text-lg font-semibold">{money(reviewAmount)}{reviewMonthly ? " per month" : " one time"}</p><p className="text-muted-foreground">Payable to The BEE Suite</p></div>
      {review?.action === "create-charge" && reviewMonthly ? <p className="text-sm">Monthly billing begins when the payer completes checkout and authorizes recurring payments.</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter><Button variant="outline" disabled={Boolean(busy)} onClick={() => setReview(null)}>Back</Button><Button disabled={Boolean(busy)} onClick={() => review && run(review.action, review.charge)}>{busy ? "Working…" : review?.action === "create-charge" ? "Create payment link" : "Confirm"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
