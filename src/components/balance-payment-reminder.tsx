"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SchoolAccountBalance } from "@/lib/accounts-receivable";

type Preview = { familyName: string; balanceCents: number; subject: string; recipients: Array<{ email: string; label: string; text: string }> };

export function BalancePaymentReminder({ account, onClose }: { account: SchoolAccountBalance; onClose: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/billing/payment-reminder-preview?familyId=${encodeURIComponent(account.familyId)}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Reminder preview could not be loaded.");
        if (controller.signal.aborted) return;
        setPreview(body as Preview);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Reminder preview could not be loaded.");
      }
    })();
    return () => controller.abort();
  }, [account.familyId]);

  async function send() {
    if (!preview || !emails.length || sending || submitted) return;
    setSending(true); setError(""); setSubmitted(true);
    try {
      const response = await fetch("/api/billing/payment-method-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId: account.familyId, emails, intent: "payment_steps", balanceReminder: true, expectedBalanceCents: preview.balanceCents }),
      });
      const body = await response.json().catch(() => null) as { error?: string; emailsSent?: number; notificationsCreated?: number; results?: Array<{ ok: boolean }> } | null;
      if (!response.ok) throw new Error(body?.error || "The reminder could not be confirmed. Check delivery history before trying again.");
      const failed = body?.results?.filter((result) => !result.ok).length ?? 0;
      setStatus(`${body?.emailsSent ?? 0} emails accepted for sending; ${body?.notificationsCreated ?? 0} portal notifications created.${failed ? ` ${failed} email attempts need attention in delivery history.` : ""}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delivery outcome is unknown. Check delivery history before trying again.");
    } finally { setSending(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !sending) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Payment reminder · {account.familyName}</DialogTitle><DialogDescription>Review recipients and the secure tuition payment link email before sending. Sending creates an email and portal notification.</DialogDescription></DialogHeader>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {status ? <p role="status" className="text-sm">{status}</p> : null}
      {!preview && !error ? <p role="status">Loading current balance and recipients…</p> : null}
      {preview ? <div className="space-y-3">
        <p className="text-sm font-medium">Current balance: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(preview.balanceCents / 100)}</p>
        <fieldset disabled={sending || submitted} className="space-y-2"><legend className="mb-2 text-sm font-medium">Select saved recipients</legend>{preview.recipients.map((recipient) => <label key={recipient.email} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={emails.includes(recipient.email)} onChange={(event) => setEmails((current) => event.target.checked ? [...current, recipient.email] : current.filter((email) => email !== recipient.email))} /><span>{recipient.label} · {recipient.email}</span></label>)}</fieldset>
        {!preview.recipients.length ? <p className="text-sm">Add a valid billing or guardian email to the family record first.</p> : null}
        <p className="text-sm"><strong>Subject:</strong> {preview.subject}</p>
        {preview.recipients.filter((recipient) => emails.includes(recipient.email)).map((recipient) => <details key={recipient.email} open><summary className="text-sm">Preview for {recipient.email}</summary><p className="mt-2 whitespace-pre-wrap rounded-lg border p-3 text-xs">{recipient.text}</p></details>)}
      </div> : null}
      <DialogFooter><Button variant="outline" disabled={sending} onClick={onClose}>Close</Button><Button disabled={!preview || !emails.length || sending || submitted} onClick={() => void send()}>{sending ? "Sending…" : submitted ? "Request submitted" : "Send payment reminder"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
