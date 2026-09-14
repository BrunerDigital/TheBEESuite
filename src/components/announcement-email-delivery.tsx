"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { requestWithNetworkRecovery } from "@/lib/client-request-recovery";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import type { AnnouncementEmailPreview } from "@/lib/announcement-email";

const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const validCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1000;
function attemptFrom(value: unknown) {
  const attempt = object(value);
  return typeof attempt.id === "string" && attempt.id.length > 0 && ["queued", "unconfirmed", "follow_up"].includes(String(attempt.status)) && validCount(attempt.recipientCount)
    ? { id: attempt.id, status: attempt.status as string, recipientCount: attempt.recipientCount as number } : null;
}
const uncertainMessage = "The delivery result is not confirmed. Do not send again. Check email status; your request will not be retried automatically.";

export function AnnouncementEmailDelivery({ id, centerId, disabled, sendDisabled, onBusyChange }: { id: string; centerId: string; disabled: boolean; sendDisabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [preview, setPreview] = useState<AnnouncementEmailPreview | null>(null);
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false), requestId = useRef("");
  useUnsavedChangesGuard(pending || uncertain, "An email delivery result is still unconfirmed. Leave this page? Check its status before trying any new delivery.");
  const begin = (work: () => Promise<void>) => {
    if (inFlight.current || disabled) return;
    inFlight.current = true; onBusyChange(true);
    startTransition(async () => { try { await work(); } finally { inFlight.current = false; onBusyChange(false); } });
  };
  const endpoint = `/api/communications/announcements/${encodeURIComponent(id)}/send`;
  function review() {
    begin(async () => {
      setMessage("");
      const response = await requestWithNetworkRecovery(endpoint, { method: "GET", cache: "no-store" }, "Email status could not be checked. No new email request was sent.");
      const json = object(await response.json().catch(() => null)), value = object(json.preview);
      const attempt = value.attempt === null ? null : attemptFrom(value.attempt);
      if (!response.ok || json.ok !== true || value.announcementId !== id || value.centerId !== centerId || ![value.schoolName, value.subject, value.body, value.fingerprint].every(item => typeof item === "string") || !validCount(value.recipientCount) || !validCount(value.familyCount) || !validCount(value.suppressedRecipientCount) || (value.attempt !== null && !attempt) || (!attempt && !/^[a-f0-9]{64}$/.test(String(value.fingerprint)))) {
        setMessage(typeof json.error === "string" ? json.error : "The email preview could not be verified. No new email request was sent."); return;
      }
      setPreview({ announcementId: id, centerId, schoolName: String(value.schoolName), subject: String(value.subject), body: String(value.body), fingerprint: String(value.fingerprint), recipientCount: value.recipientCount as number, familyCount: value.familyCount as number, suppressedRecipientCount: value.suppressedRecipientCount as number, attempt });
      setUncertain(false);
    });
  }
  function send() {
    if (!preview || preview.attempt || uncertain || disabled || sendDisabled || inFlight.current) return;
    if (!window.confirm(`Send “${preview.subject}” to ${preview.recipientCount} eligible email addresses for current families at ${preview.schoolName}? This is a real email and cannot be recalled.`)) return;
    const submitted = preview;
    if (!requestId.current) requestId.current = crypto.randomUUID();
    begin(async () => {
      setMessage(""); setUncertain(true);
      const response = await requestWithNetworkRecovery(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: requestId.current, expectedFingerprint: submitted.fingerprint, confirmEmail: true }) }, uncertainMessage);
      const json = object(await response.json().catch(() => null)), attempt = attemptFrom(json.attempt);
      if (!response.ok || json.ok !== true || json.announcementId !== id || json.centerId !== centerId || !attempt || attempt.recipientCount !== submitted.recipientCount) { setMessage(uncertainMessage); return; }
      setPreview({ ...submitted, attempt }); setUncertain(false);
    });
  }
  const status = preview?.attempt?.status;
  return <div className={`min-w-0 space-y-2 ${preview || uncertain || message ? "basis-full" : ""}`}>
    <Button type="button" size="sm" variant="outline" disabled={disabled || pending} onClick={review}>{pending ? "Checking…" : preview || uncertain ? "Check email status" : "Review email delivery"}</Button>
    {message ? <p role="alert" className="text-sm">{message}</p> : null}
    {preview ? <section aria-label="Email delivery review" className="min-w-0 space-y-2 rounded-lg border p-3 text-sm [overflow-wrap:anywhere]">
      <h4 className="font-semibold">{preview.schoolName} · Email delivery</h4>
      {preview.attempt ? <p role="status">{status === "queued" ? `Email was queued for ${preview.attempt.recipientCount} addresses. This does not confirm every recipient received it.` : status === "unconfirmed" ? uncertainMessage : "Delivery follow-up is needed. Contact support with this announcement; do not recreate or resend it until the existing attempt is reconciled."} This announcement cannot be emailed again from this page.</p> : <p>{preview.recipientCount} eligible email addresses across {preview.familyCount} current families. {preview.suppressedRecipientCount ? `${preview.suppressedRecipientCount} reserved review addresses excluded.` : ""} Recipient addresses are kept private.</p>}
      <p className="font-medium">{preview.subject}</p><p className="whitespace-pre-wrap">{preview.body}</p>
      {!preview.attempt ? <><p className="text-muted-foreground">Only this saved text will be sent, once. Portal publication is unchanged. No SMS or push notification is included.</p><Button type="button" disabled={pending || disabled || sendDisabled || uncertain} onClick={send}>Confirm email to {preview.recipientCount} addresses</Button></> : null}
    </section> : null}
  </div>;
}
