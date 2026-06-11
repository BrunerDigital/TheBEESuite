"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BellRing,
  Building2,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  FileText,
  MessageSquare,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ParentKioskCredentialPanel } from "@/components/parent-kiosk-credential-panel";
import { Textarea } from "@/components/ui/textarea";
import type { GuardianKioskCredential } from "@/lib/kiosk-credentials";
import {
  PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
  paymentProcessingRecoverySummary,
} from "@/lib/payment-disclosures";
import type { StripeCheckoutReadiness } from "@/lib/stripe-connect-readiness";

type Child = {
  id: string;
  fullName: string;
  preferredName?: string | null;
  ageGroup: string;
  enrollmentStatus: string;
  startDate?: string | Date | null;
  schedule?: unknown;
  photoVideoPermission?: boolean;
  fieldTripPermission?: boolean;
  classroom?: { name: string; ageGroup: string } | null;
};

type Invoice = {
  id: string;
  number: string;
  status: string;
  dueDate: string | Date;
  totalCents: number;
  purposeLabel?: string | null;
  checkoutOptions?: {
    ach: {
      checkoutTotalCents: number;
      parentProcessingRecoveryAmountCents: number;
      applicationFeeAmountCents: number;
      paymentMethodConfigurationReady: boolean;
    };
    card: {
      checkoutTotalCents: number;
      parentProcessingRecoveryAmountCents: number;
      applicationFeeAmountCents: number;
      paymentMethodConfigurationReady: boolean;
    };
    beeSuitePaymentOperationsFeeAmountCents: number;
    beeSuitePaymentOperationsFeeWaived: boolean;
  };
};

type Payment = {
  id: string;
  amountCents: number;
  status: string;
  provider: string;
  paidAt: string | Date | null;
};

type LedgerEntry = {
  id: string;
  type: string;
  description: string;
  amountCents: number;
  balanceAfterCents: number | null;
  effectiveAt: string | Date;
};

type DailyReport = {
  id: string;
  date: string | Date;
  mood: string | null;
  teacherNote: string | null;
  suppliesNeeded: string | null;
  child: { fullName: string };
  meals?: Array<{ id: string; mealType: string; food: string; amount: string | null }>;
  naps?: Array<{ id: string; startsAt: string | Date; endsAt: string | Date | null }>;
  diapers?: Array<{ id: string; type: string; occurredAt: string | Date; notes: string | null }>;
  activities?: Array<{ id: string; title: string; notes: string | null }>;
};

type Incident = {
  id: string;
  occurredAt: string | Date;
  type: string;
  description: string;
  actionTaken: string;
  parentAcknowledgedAt: string | Date | null;
  child: { fullName: string };
};

type PortalFamily = {
  id: string;
  name: string;
  billingEmail: string | null;
  guardians: Array<{
    id: string;
    userId?: string | null;
    fullName: string;
    email: string | null;
    phone: string | null;
    relation?: string | null;
    preferredCommunication?: string | null;
  }>;
  children: Child[];
};

type NotificationPreferences = {
  portal: boolean;
  email: boolean;
  sms: boolean;
  dailyReports: boolean;
  photos: boolean;
  billing: boolean;
  incidents: boolean;
  announcements: boolean;
};

type Props = {
  family: PortalFamily | null;
  billingAccount?: {
    id: string;
    balanceCents: number;
    autopayPlaceholder: boolean;
    paymentMethodManagement?: {
      autopayEnabled: boolean;
      autopayStatus: "enabled" | "disabled" | "pending";
      hasStripeCustomer: boolean;
      hasSavedPaymentMethod: boolean;
      stripeCustomerId: string | null;
      stripeDefaultPaymentMethodId: string | null;
      paymentMethodType: string | null;
      paymentMethodLabel: string | null;
      lastUpdatedAt: string | null;
    };
  } | null;
  checkoutReadiness?: StripeCheckoutReadiness;
  invoices: Invoice[];
  payments?: Payment[];
  ledgerEntries?: LedgerEntry[];
  dailyReports: DailyReport[];
  incidents: Incident[];
  messages: Array<{ id: string; subject: string | null; body: string; createdAt: string | Date }>;
  documents: Array<{ id: string; name: string; type: string; status: string; expiresAt: string | Date | null; storageKey?: string | null; downloadUrl?: string | null }>;
  media?: Array<{ id: string; url: string; caption: string | null; createdAt: string | Date; child: { fullName: string } }>;
  announcements?: Array<{ id: string; title: string; body: string; sendAt: string | Date | null }>;
  currentGuardianId?: string | null;
  kioskCredentials?: GuardianKioskCredential[];
  notificationPreferences?: Partial<NotificationPreferences> | null;
  demoMode?: boolean;
};

const defaultNotificationPreferences: NotificationPreferences = {
  portal: true,
  email: true,
  sms: false,
  dailyReports: true,
  photos: true,
  billing: true,
  incidents: true,
  announcements: true,
};

const signaturePendingStorageKeys = new Set(["internal_signature_pending", "signature_provider_pending"]);

const fallbackCheckoutReadiness: StripeCheckoutReadiness = {
  accountId: null,
  chargesEnabled: true,
  payoutsEnabled: true,
  detailsSubmitted: true,
  requirementFields: [],
  status: "ready",
  label: "Ready",
  canAcceptParentPayments: true,
  lastSyncedAt: null,
  blockingReason: null,
  stripeConfigured: true,
  webhookConfigured: true,
  allowPlatformOnlyPayments: false,
};

function requiresDocumentSignature(document: { storageKey?: string | null }) {
  return signaturePendingStorageKeys.has((document.storageKey || "").trim().toLowerCase());
}

function formatDate(value: string | Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatTime(value: string | Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function scheduleSummary(value: unknown) {
  if (!value) return "Schedule not set";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return "Schedule not set";
    return entries
      .slice(0, 3)
      .map(([key, item]) => `${key}: ${Array.isArray(item) ? item.join(", ") : String(item)}`)
      .join(" · ");
  }
  return String(value);
}

function estimatedAchRecovery(cents: number) {
  return Math.min(Math.round(cents * 0.008), 500);
}

function estimatedCardRecovery(cents: number) {
  return Math.max(0, Math.ceil((cents + 30) / (1 - 0.029) - cents));
}

export function ParentPortalWorkspace({
  family,
  billingAccount,
  checkoutReadiness = fallbackCheckoutReadiness,
  invoices,
  payments = [],
  ledgerEntries = [],
  dailyReports,
  incidents,
  messages,
  documents,
  media = [],
  announcements = [],
  currentGuardianId = null,
  kioskCredentials = [],
  notificationPreferences,
  demoMode,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("Question for the center");
  const [message, setMessage] = useState("");
  const [requestDetails, setRequestDetails] = useState("");
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({});
  const [documentFiles, setDocumentFiles] = useState<Record<string, File | null>>({});
  const [signatureAcknowledgements, setSignatureAcknowledgements] = useState<Record<string, boolean>>({});
  const [signatureNames, setSignatureNames] = useState<Record<string, string>>({});
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    ...defaultNotificationPreferences,
    ...(notificationPreferences ?? {}),
  });
  const [isPending, startTransition] = useTransition();

  const openInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === "OPEN"), [invoices]);
  const nextOpenInvoice = useMemo(
    () => openInvoices.slice().sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime())[0] ?? null,
    [openInvoices],
  );
  const unacknowledged = useMemo(() => incidents.filter((incident) => !incident.parentAcknowledgedAt), [incidents]);
  const balanceCents = billingAccount?.balanceCents ?? openInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const paymentMethodManagement = billingAccount?.paymentMethodManagement;
  const autopayStatus = paymentMethodManagement?.autopayStatus ?? (billingAccount?.autopayPlaceholder ? "enabled" : "disabled");
  const checkoutBlocked = !checkoutReadiness.canAcceptParentPayments;

  function showStatus(next: string) {
    setError("");
    setStatus(next);
  }

  function showError(next: string) {
    setStatus("");
    setError(next);
  }

  function sendMessage() {
    if (!family) return;
    startTransition(async () => {
      const response = await fetch("/api/communications/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: family.id,
          subject,
          message,
          priority: "normal",
          sendEmailCopy: true,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return showError(json?.error || "Message could not be sent.");
      setMessage("");
      showStatus("Message sent to the center and recorded in the family timeline.");
    });
  }

  function requestContactUpdate() {
    if (!family) return;
    startTransition(async () => {
      const response = await fetch("/api/parent/contact-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: family.id,
          requestType: "Emergency contact / authorized pickup update",
          details: requestDetails,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return showError(json?.error || "Request could not be submitted.");
      setRequestDetails("");
      showStatus("Update request sent for director review.");
    });
  }

  function acknowledgeIncident(incidentId: string) {
    startTransition(async () => {
      const response = await fetch(`/api/parent/incidents/${incidentId}/acknowledge`, { method: "POST" });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return showError(json?.error || "Incident could not be acknowledged.");
      showStatus("Incident acknowledgment recorded.");
    });
  }

  function payInvoice(invoiceId: string, paymentMethodCategory: "ach" | "card") {
    if (checkoutBlocked) {
      return showError(checkoutReadiness.blockingReason || "Parent checkout is not ready for this school yet.");
    }
    startTransition(async () => {
      const response = await fetch("/api/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, paymentMethodCategory }),
      });
      const json = await response.json().catch(() => null) as { error?: string; url?: string; configured?: boolean } | null;
      if (!response.ok || !json?.url) {
        return showError(json?.error || "Payment checkout is not configured yet.");
      }
      window.location.href = json.url;
    });
  }

  function payBalance(paymentMethodCategory: "ach" | "card") {
    if (!nextOpenInvoice) return showError("There is no open invoice to pay.");
    payInvoice(nextOpenInvoice.id, paymentMethodCategory);
  }

  function managePaymentMethod(action: "setup" | "portal" | "disable_autopay", paymentMethodCategory: "ach" | "card" | "default" = "default") {
    if (!billingAccount) return showError("A billing account is required before saving payment methods.");
    startTransition(async () => {
      const response = await fetch("/api/billing/payment-method-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingAccountId: billingAccount.id,
          action,
          paymentMethodCategory,
          returnPath: "/parent-portal",
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; url?: string } | null;
      if (!response.ok) return showError(json?.error || "Payment method management is not configured yet.");
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      showStatus(action === "disable_autopay" ? "Autopay disabled." : "Payment method settings updated.");
      router.refresh();
    });
  }

  function updatePreference(key: keyof NotificationPreferences, checked: boolean) {
    setPreferences((current) => ({ ...current, [key]: checked }));
  }

  function saveNotificationPreferences() {
    if (!currentGuardianId) return;
    startTransition(async () => {
      const response = await fetch("/api/parent/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardianId: currentGuardianId, preferences }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return showError(json?.error || "Notification preferences could not be saved.");
      showStatus("Notification preferences saved.");
    });
  }

  function submitDocument(documentId: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("note", documentNotes[documentId] || "");
      formData.append("signatureAcknowledged", String(Boolean(signatureAcknowledgements[documentId])));
      formData.append("signatureConsentAccepted", String(Boolean(signatureAcknowledgements[documentId])));
      formData.append("signatureName", signatureNames[documentId] || "");
      const file = documentFiles[documentId];
      if (file) formData.append("file", file);
      const response = await fetch(`/api/parent/documents/${documentId}/submit`, {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return showError(json?.error || "Document could not be submitted.");
      setDocumentNotes((current) => ({ ...current, [documentId]: "" }));
      setDocumentFiles((current) => ({ ...current, [documentId]: null }));
      setSignatureAcknowledgements((current) => ({ ...current, [documentId]: false }));
      setSignatureNames((current) => ({ ...current, [documentId]: "" }));
      showStatus("Document submitted for director review.");
      router.refresh();
    });
  }

  if (!family) {
    return (
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Parent Portal</CardTitle>
          <CardDescription>No family profile is connected to this account yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <ShieldCheck data-icon="inline-start" />
          Family portal
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">{family.name}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Daily reports, invoices, messages, documents, and director-reviewed update requests for your family.
        </p>
      </section>

      {demoMode ? (
        <Alert className="border-primary/30 bg-primary/10">
          <ShieldCheck className="size-4" />
          <AlertTitle>Demo account data</AlertTitle>
          <AlertDescription>
            This parent portal sample is visible only to demo accounts and is not saved as live family data.
          </AlertDescription>
        </Alert>
      ) : null}

      {status ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-panel"><CardHeader><CardDescription>Current balance</CardDescription><CardTitle>{money(balanceCents)}</CardTitle></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardDescription>Open invoices</CardDescription><CardTitle>{openInvoices.length}</CardTitle></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardDescription>Reports</CardDescription><CardTitle>{dailyReports.length}</CardTitle></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardDescription>Need acknowledgment</CardDescription><CardTitle>{unacknowledged.length}</CardTitle></CardHeader></Card>
      </div>

      <ParentKioskCredentialPanel initialCredentials={kioskCredentials} />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Children</CardTitle>
            <CardDescription>Enrollment, classroom, schedule, and permission snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {family.children.map((child) => (
              <div key={child.id} className="rounded-xl border bg-background/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{child.fullName}</div>
                    <div className="text-xs text-muted-foreground">
                      {child.preferredName ? `Preferred: ${child.preferredName} · ` : ""}
                      {child.ageGroup}
                    </div>
                  </div>
                  <Badge variant="outline">{child.enrollmentStatus.replaceAll("_", " ")}</Badge>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                  <span>Classroom: {child.classroom?.name ?? "Unassigned"}</span>
                  <span>Start date: {formatDate(child.startDate ?? null)}</span>
                  <span>Schedule: {scheduleSummary(child.schedule)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant={child.photoVideoPermission ? "default" : "secondary"}>Photo/video {child.photoVideoPermission ? "yes" : "needs review"}</Badge>
                  <Badge variant={child.fieldTripPermission ? "default" : "secondary"}>Field trips {child.fieldTripPermission ? "yes" : "needs review"}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Announcements</CardTitle>
            <CardDescription>Center updates visible to this family.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="rounded-xl border bg-background/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{announcement.title}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(announcement.sendAt)}</div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{announcement.body}</p>
              </div>
            ))}
            {!announcements.length ? <p className="text-sm text-muted-foreground">No announcements are visible yet.</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>
              Secure checkout is available when the school payout account is ready. {PAYMENT_PROCESSING_RECOVERY_DISCLOSURE}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {checkoutBlocked ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Checkout is not active yet</AlertTitle>
                <AlertDescription>
                  {checkoutReadiness.blockingReason || "The school is still finishing payout setup."}
                  {checkoutReadiness.requirementFields.length
                    ? ` Outstanding payout requirement fields: ${checkoutReadiness.requirementFields.slice(0, 4).join(", ")}${checkoutReadiness.requirementFields.length > 4 ? "..." : ""}.`
                    : ""}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-background/40 p-4">
                <div className="text-xs text-muted-foreground">Balance due</div>
                <div className="mt-1 text-2xl font-semibold">{money(balanceCents)}</div>
              </div>
              <div className="rounded-xl border bg-background/40 p-4">
                <div className="text-xs text-muted-foreground">Billing email</div>
                <div className="mt-1 truncate font-medium">{family.billingEmail ?? family.guardians[0]?.email ?? "Not set"}</div>
              </div>
              <div className="rounded-xl border bg-background/40 p-4">
                <div className="text-xs text-muted-foreground">Autopay</div>
                <div className="mt-1 font-medium capitalize">{autopayStatus}</div>
              </div>
            </div>
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium">Payment Method And Autopay</div>
                  <div className="text-xs text-muted-foreground">
                    {paymentMethodManagement?.hasSavedPaymentMethod
                      ? `${paymentMethodManagement.paymentMethodLabel ?? "Payment method saved securely"}${paymentMethodManagement.lastUpdatedAt ? ` on ${formatDate(paymentMethodManagement.lastUpdatedAt)}` : ""}.`
                      : paymentMethodManagement?.autopayStatus === "pending"
                        ? "A secure setup session is pending."
                        : "Add a bank account or card to enable autopay."}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={isPending || !billingAccount} onClick={() => managePaymentMethod("setup", "ach")}>
                    <Building2 data-icon="inline-start" />
                    {paymentMethodManagement?.hasSavedPaymentMethod ? "Replace With Bank" : "Add Bank Account"}
                  </Button>
                  <Button disabled={isPending || !billingAccount} onClick={() => managePaymentMethod("setup", "card")} variant="outline">
                    <CreditCard data-icon="inline-start" />
                    {paymentMethodManagement?.hasSavedPaymentMethod ? "Replace With Card" : "Add Card"}
                  </Button>
                  <Button
                    disabled={isPending || !paymentMethodManagement?.hasStripeCustomer}
                    onClick={() => managePaymentMethod("portal")}
                    variant="outline"
                  >
                    Manage Payment Method
                  </Button>
                  <Button
                    disabled={isPending || autopayStatus === "disabled" || !billingAccount}
                    onClick={() => managePaymentMethod("disable_autopay")}
                    variant="outline"
                  >
                    Disable Autopay
                  </Button>
                </div>
              </div>
            </div>
            {nextOpenInvoice ? (
              <div className="rounded-xl border bg-primary/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Next balance payment</div>
                    <div className="font-medium">
                      {nextOpenInvoice.purposeLabel ? `${nextOpenInvoice.purposeLabel} · ` : ""}{nextOpenInvoice.number} · due {formatDate(nextOpenInvoice.dueDate)} · {money(nextOpenInvoice.totalCents)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={isPending || checkoutBlocked} onClick={() => payBalance("ach")}>
                      <Building2 data-icon="inline-start" />
                      Bank {nextOpenInvoice.checkoutOptions ? money(nextOpenInvoice.checkoutOptions.ach.checkoutTotalCents) : ""}
                    </Button>
                    <Button disabled={isPending || checkoutBlocked} onClick={() => payBalance("card")} variant="outline">
                      <CreditCard data-icon="inline-start" />
                      Card {nextOpenInvoice.checkoutOptions ? money(nextOpenInvoice.checkoutOptions.card.checkoutTotalCents) : ""}
                    </Button>
                  </div>
                </div>
                {openInvoices.length > 1 ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {openInvoices.length} open invoices are listed below for separate checkout and receipt tracking.
                  </div>
                ) : null}
              </div>
            ) : null}
            {invoices.map((invoice) => (
              <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/40 p-4">
                <div>
                  <div className="font-medium">{invoice.number}</div>
                  <div className="text-xs text-muted-foreground">
                    {invoice.purposeLabel ? `${invoice.purposeLabel} · ` : ""}Due {formatDate(invoice.dueDate)}
                  </div>
                </div>
                <Badge variant={invoice.status === "OPEN" ? "outline" : "default"}>{invoice.status}</Badge>
                <div className="text-lg font-semibold">{money(invoice.totalCents)}</div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={isPending || checkoutBlocked || invoice.status !== "OPEN"} onClick={() => payInvoice(invoice.id, "ach")}>
                    <Building2 data-icon="inline-start" />
                    Bank {invoice.checkoutOptions ? money(invoice.checkoutOptions.ach.checkoutTotalCents) : ""}
                  </Button>
                  <Button
                    disabled={isPending || checkoutBlocked || invoice.status !== "OPEN"}
                    onClick={() => payInvoice(invoice.id, "card")}
                    variant="outline"
                  >
                    <CreditCard data-icon="inline-start" />
                    Card {invoice.checkoutOptions ? money(invoice.checkoutOptions.card.checkoutTotalCents) : ""}
                  </Button>
                </div>
                <div className="basis-full text-xs text-muted-foreground sm:text-right">
                  {paymentProcessingRecoverySummary({
                    achRecovery: invoice.checkoutOptions?.ach.parentProcessingRecoveryAmountCents ?? estimatedAchRecovery(invoice.totalCents),
                    cardRecovery: invoice.checkoutOptions?.card.parentProcessingRecoveryAmountCents ?? estimatedCardRecovery(invoice.totalCents),
                    formatMoney: money,
                  })}
                  {invoice.checkoutOptions?.beeSuitePaymentOperationsFeeAmountCents ? (
                    <span className="block">
                      School-paid BEE Suite payment operations fee retained from payout: {money(invoice.checkoutOptions.beeSuitePaymentOperationsFeeAmountCents)}.
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            {!invoices.length ? <p className="text-sm text-muted-foreground">No invoices are visible yet.</p> : null}
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <ReceiptText className="size-4 text-primary" />
                Recent payments
              </div>
              <div className="space-y-2">
                {payments.slice(0, 5).map((payment) => (
                  <div key={payment.id} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {payment.provider} · {payment.status} · {formatDate(payment.paidAt)}
                    </span>
                    <span className="font-medium">{money(payment.amountCents)}</span>
                  </div>
                ))}
                {!payments.length ? <p className="text-sm text-muted-foreground">No payments are recorded yet.</p> : null}
              </div>
            </div>
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="mb-3 text-sm font-medium">Ledger history</div>
              <div className="space-y-2">
                {ledgerEntries.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="grid gap-1 rounded-lg bg-background/35 p-3 text-sm sm:grid-cols-[1fr_auto]">
                    <div>
                      <div className="font-medium">{entry.description}</div>
                      <div className="text-xs text-muted-foreground">{entry.type} · {formatDate(entry.effectiveAt)}</div>
                    </div>
                    <div className="text-right font-medium">
                      {money(entry.amountCents)}
                      <div className="text-xs text-muted-foreground">
                        Balance {entry.balanceAfterCents === null ? "not set" : money(entry.balanceAfterCents)}
                      </div>
                    </div>
                  </div>
                ))}
                {!ledgerEntries.length ? <p className="text-sm text-muted-foreground">No ledger entries are visible yet.</p> : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Message the Center</CardTitle>
            <CardDescription>Messages are logged and routed to center leadership.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="portal-subject">Subject</Label>
              <Input id="portal-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="portal-message">Message</Label>
              <Textarea id="portal-message" value={message} onChange={(event) => setMessage(event.target.value)} />
            </div>
            <Button disabled={isPending || !message.trim()} onClick={sendMessage}>
              <MessageSquare data-icon="inline-start" />
              Send Message
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Photos and Moments</CardTitle>
            <CardDescription>Teacher-shared classroom photos for this family.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {media.slice(0, 8).map((item) => (
              <div key={item.id} className="overflow-hidden rounded-xl border bg-background/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.caption || `${item.child.fullName} classroom moment`} className="aspect-video w-full object-cover" />
                <div className="p-3">
                  <div className="text-sm font-medium">{item.child.fullName}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.caption || formatDate(item.createdAt)}</p>
                </div>
              </div>
            ))}
            {!media.length ? <p className="text-sm text-muted-foreground">No shared photos have been added yet.</p> : null}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Daily Reports</CardTitle>
            <CardDescription>Recent teacher notes and care details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dailyReports.map((report) => (
              <div key={report.id} className="rounded-xl border bg-background/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{report.child.fullName}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(report.date)}</div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{report.teacherNote ?? report.mood ?? "No teacher note added."}</p>
                {report.suppliesNeeded ? <Badge className="mt-3" variant="outline">Needs {report.suppliesNeeded}</Badge> : null}
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                  {report.meals?.map((meal) => (
                    <span key={meal.id}>Meal: {meal.mealType} · {meal.food}{meal.amount ? ` · ${meal.amount}` : ""}</span>
                  ))}
                  {report.naps?.map((nap) => (
                    <span key={nap.id}>Nap: {formatTime(nap.startsAt)} - {formatTime(nap.endsAt)}</span>
                  ))}
                  {report.diapers?.map((diaper) => (
                    <span key={diaper.id}>Potty/diaper: {diaper.type} · {formatTime(diaper.occurredAt)}{diaper.notes ? ` · ${diaper.notes}` : ""}</span>
                  ))}
                  {report.activities?.map((activity) => (
                    <span key={activity.id}>Activity: {activity.title}{activity.notes ? ` · ${activity.notes}` : ""}</span>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Documents and Requests</CardTitle>
            <CardDescription>Director-reviewed changes protect child safety data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {documents.slice(0, 5).map((document) => (
              <div key={document.id} className="space-y-3 rounded-xl border bg-background/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{document.name}</div>
                    <div className="text-xs text-muted-foreground">{document.type} · expires {formatDate(document.expiresAt)}</div>
                    {document.downloadUrl ? (
                      <a className="text-xs font-medium text-primary underline-offset-4 hover:underline" href={document.downloadUrl} target="_blank" rel="noreferrer">
                        Open uploaded file
                      </a>
                    ) : null}
                  </div>
                  <Badge>{document.status}</Badge>
                </div>
                {document.status !== "APPROVED" ? (
                  <div className="space-y-2">
                    {requiresDocumentSignature(document) ? (
                      <Input
                        value={signatureNames[document.id] ?? ""}
                        onChange={(event) => setSignatureNames((current) => ({ ...current, [document.id]: event.target.value }))}
                        placeholder="Typed signature"
                      />
                    ) : (
                      <Input
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,text/plain"
                        onChange={(event) => setDocumentFiles((current) => ({ ...current, [document.id]: event.target.files?.[0] ?? null }))}
                      />
                    )}
                    <Textarea
                      value={documentNotes[document.id] ?? ""}
                      onChange={(event) => setDocumentNotes((current) => ({ ...current, [document.id]: event.target.value }))}
                      placeholder="Optional note for the director"
                    />
                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={Boolean(signatureAcknowledgements[document.id])}
                        onChange={(event) => setSignatureAcknowledgements((current) => ({ ...current, [document.id]: event.target.checked }))}
                      />
                      {requiresDocumentSignature(document)
                        ? "I agree that typing my name and submitting this document is my electronic signature."
                        : "I confirm this submission is complete and ready for school review."}
                    </label>
                    <Button
                      disabled={
                        isPending ||
                        (requiresDocumentSignature(document) &&
                          (!signatureNames[document.id]?.trim() || !signatureAcknowledgements[document.id]))
                      }
                      onClick={() => submitDocument(document.id)}
                      variant="outline"
                    >
                      <FileCheck2 data-icon="inline-start" />
                      {requiresDocumentSignature(document) ? "Sign and Submit" : "Submit for Review"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="contact-request">Request an emergency contact or pickup change</Label>
              <Textarea id="contact-request" value={requestDetails} onChange={(event) => setRequestDetails(event.target.value)} />
              <Button disabled={isPending || !requestDetails.trim()} onClick={requestContactUpdate}>
                <FileText data-icon="inline-start" />
                Submit Request
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Recent Messages</CardTitle>
          <CardDescription>Family communication timeline</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.slice(0, 5).map((item) => (
            <div key={item.id} className="rounded-xl border bg-background/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{item.subject ?? "Portal message"}</div>
                <div className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
          {!messages.length ? <p className="text-sm text-muted-foreground">No messages have been recorded yet.</p> : null}
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="text-primary" />
            Notification Preferences
          </CardTitle>
          <CardDescription>Parents can choose which updates should be emphasized as more delivery channels are enabled.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {([
            ["portal", "Portal alerts"],
            ["email", "Email updates"],
            ["sms", "SMS updates"],
            ["dailyReports", "Daily reports"],
            ["photos", "Photos"],
            ["billing", "Billing reminders"],
            ["incidents", "Incident notices"],
            ["announcements", "Center announcements"],
          ] as Array<[keyof NotificationPreferences, string]>).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded-xl border bg-background/40 p-3 text-sm">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={preferences[key]}
                onChange={(event) => updatePreference(key, event.target.checked)}
                disabled={!currentGuardianId}
              />
            </label>
          ))}
          <div className="md:col-span-2">
            <Button disabled={isPending || !currentGuardianId} onClick={saveNotificationPreferences}>
              <CalendarDays data-icon="inline-start" />
              Save Preferences
            </Button>
            {!currentGuardianId ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Preference editing appears when signed in as a linked parent or guardian.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Incident Acknowledgments</CardTitle>
          <CardDescription>Review and acknowledge center-shared incident documentation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {incidents.map((incident) => (
            <div key={incident.id} className="rounded-xl border bg-background/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{incident.type} · {incident.child.fullName}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(incident.occurredAt)}</div>
                </div>
                {incident.parentAcknowledgedAt ? <Badge> Acknowledged</Badge> : <Button disabled={isPending} onClick={() => acknowledgeIncident(incident.id)}>Acknowledge</Button>}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{incident.description} Action: {incident.actionTaken}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
