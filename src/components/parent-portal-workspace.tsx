"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BellRing,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FileText,
  KeyRound,
  MessageSquare,
  Minus,
  Paperclip,
  Plus,
  ReceiptText,
  Reply,
  ShoppingBag,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ParentKioskCredentialPanel } from "@/components/parent-kiosk-credential-panel";
import { Textarea } from "@/components/ui/textarea";
import type { GuardianKioskCredential } from "@/lib/kiosk-credentials";
import {
  PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
  paymentProcessingRecoverySummary,
} from "@/lib/payment-disclosures";
import type { MessageAttachmentView } from "@/lib/message-attachments";
import { replySubject } from "@/lib/message-reply-routing";
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

type PendingInvoicePayment = {
  id: string;
  amountCents: number | null;
  status: string | null;
  paymentMethodCategory: string | null;
  requestedPaymentMethodCategory: string | null;
  bankAccountVerificationMethod: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripePaymentIntentStatus: string | null;
  stripePaymentStatus: string | null;
};

type Invoice = {
  id: string;
  number: string;
  status: string;
  dueDate: string | Date;
  totalCents: number;
  purposeLabel?: string | null;
  pendingPayment?: PendingInvoicePayment | null;
  checkoutOptions?: {
    ach: {
      checkoutTotalCents: number;
      parentProcessingRecoveryAmountCents: number;
      applicationFeeAmountCents: number;
      paymentMethodConfigurationReady: boolean;
    };
    instantBank: {
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
  externalIdPlaceholder?: string | null;
  customFields?: unknown;
};

type LedgerEntry = {
  id: string;
  type: string;
  description: string;
  amountCents: number;
  balanceAfterCents: number | null;
  effectiveAt: string | Date;
};

type UniformProductOption = {
  id: string;
  productId: string;
  name: string;
  type: string;
  amountCents: number;
  color: "Black" | "Yellow";
  size: string;
  purchaseOption: "single" | "bundle_5";
  shirtCount: number;
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

type AccountDeletionRequestSummary = {
  id: string;
  requestType: string;
  status: string;
  createdAt: string | Date;
  dueAt: string | Date | null;
  verifiedAt: string | Date | null;
  completedAt: string | Date | null;
  retentionNoticeAccepted: boolean;
  schoolReviewRequired: boolean;
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
  messages: Array<{ id: string; subject: string | null; body: string; createdAt: string | Date; attachments?: MessageAttachmentView[] }>;
  documents: Array<{ id: string; name: string; type: string; status: string; expiresAt: string | Date | null; storageKey?: string | null; downloadUrl?: string | null }>;
  media?: Array<{ id: string; url: string; caption: string | null; createdAt: string | Date; child: { fullName: string } }>;
  announcements?: Array<{ id: string; title: string; body: string; sendAt: string | Date | null }>;
  uniformProducts?: UniformProductOption[];
  currentGuardianId?: string | null;
  kioskCredentials?: GuardianKioskCredential[];
  notificationPreferences?: Partial<NotificationPreferences> | null;
  accountDeletionRequest?: AccountDeletionRequestSummary | null;
  replyDraft?: {
    replyToMessageId: string;
    subject?: string | null;
  } | null;
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

const parentPortalDocumentsEnabled = process.env.NEXT_PUBLIC_PARENT_PORTAL_DOCUMENTS_ENABLED === "1";

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

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function paymentMethodCategoryLabel(category: string | null | undefined) {
  switch (category) {
    case "ach":
      return "ACH bank";
    case "link_bank":
      return "Instant bank";
    case "card":
      return "Debit/credit card";
    default:
      return "Payment";
  }
}

function pendingPaymentCategory(payment: Pick<PendingInvoicePayment, "paymentMethodCategory" | "requestedPaymentMethodCategory">) {
  return payment.paymentMethodCategory || payment.requestedPaymentMethodCategory;
}

function pendingPaymentMessage(payment: PendingInvoicePayment) {
  const label = paymentMethodCategoryLabel(pendingPaymentCategory(payment));
  if (label === "Debit/credit card") {
    return "A card checkout is already pending for this invoice. Complete or expire it before starting another checkout.";
  }
  return `${label} payment is processing. Bank payments can take a few business days to settle; the invoice will update when Stripe confirms the funds.`;
}

function paymentFields(payment: Payment) {
  return recordFromUnknown(payment.customFields);
}

function isProcessingPayment(payment: Payment) {
  const status = textField(paymentFields(payment).status);
  return payment.status === "DRAFT" && (status === "checkout_created" || status === "checkout_pending");
}

function paymentListLabel(payment: Payment) {
  if (isProcessingPayment(payment)) {
    const fields = paymentFields(payment);
    const category = textField(fields.paymentMethodCategory) || textField(fields.requestedPaymentMethodCategory);
    return `${paymentMethodCategoryLabel(category)} processing`;
  }
  if (payment.status === "PAID") return `Paid · ${formatDate(payment.paidAt)}`;
  return payment.status.toLowerCase();
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`;
}

const MAX_UNIFORM_PURCHASE_QUANTITY = 12;

function clampUniformQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_UNIFORM_PURCHASE_QUANTITY, Math.max(1, Math.round(value)));
}

function formatTime(value: string | Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function renderableImageSrc(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith("/") || value.startsWith("https://") || value.startsWith("http://") || value.startsWith("data:image/")) {
    return value;
  }
  return null;
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
  void cents;
  return 0;
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
  uniformProducts = [],
  currentGuardianId = null,
  kioskCredentials = [],
  notificationPreferences,
  accountDeletionRequest: initialAccountDeletionRequest = null,
  replyDraft = null,
  demoMode,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [subject, setSubject] = useState(replyDraft?.replyToMessageId ? replySubject(replyDraft.subject) : "Question for the center");
  const [message, setMessage] = useState("");
  const [replyToMessageId, setReplyToMessageId] = useState(replyDraft?.replyToMessageId ?? "");
  const [replyingToSubject, setReplyingToSubject] = useState(replyDraft?.subject ?? "");
  const [messageAttachments, setMessageAttachments] = useState<File[]>([]);
  const [messageAttachmentInputKey, setMessageAttachmentInputKey] = useState(0);
  const [requestDetails, setRequestDetails] = useState("");
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({});
  const [documentFiles, setDocumentFiles] = useState<Record<string, File | null>>({});
  const [signatureAcknowledgements, setSignatureAcknowledgements] = useState<Record<string, boolean>>({});
  const [signatureNames, setSignatureNames] = useState<Record<string, string>>({});
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    ...defaultNotificationPreferences,
    ...(notificationPreferences ?? {}),
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountDeletionRequest, setAccountDeletionRequest] = useState<AccountDeletionRequestSummary | null>(initialAccountDeletionRequest);
  const [accountDeletionDetails, setAccountDeletionDetails] = useState("");
  const [retentionNoticeAccepted, setRetentionNoticeAccepted] = useState(false);
  const [uniformColor, setUniformColor] = useState<"Black" | "Yellow">(uniformProducts[0]?.color ?? "Black");
  const [uniformSize, setUniformSize] = useState(uniformProducts[0]?.size ?? "2T");
  const [uniformPurchaseOption, setUniformPurchaseOption] = useState<"single" | "bundle_5">(uniformProducts[0]?.purchaseOption ?? "single");
  const [uniformQuantity, setUniformQuantity] = useState(1);
  const [isPending, startTransition] = useTransition();

  const openInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === "OPEN"), [invoices]);
  const payableOpenInvoices = useMemo(() => openInvoices.filter((invoice) => !invoice.pendingPayment), [openInvoices]);
  const pendingOpenInvoices = useMemo(() => openInvoices.filter((invoice) => invoice.pendingPayment), [openInvoices]);
  const nextOpenInvoice = useMemo(
    () => payableOpenInvoices.slice().sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime())[0] ?? null,
    [payableOpenInvoices],
  );
  const firstPendingOpenInvoice = pendingOpenInvoices[0] ?? null;
  const unacknowledged = useMemo(() => incidents.filter((incident) => !incident.parentAcknowledgedAt), [incidents]);
  const balanceCents = billingAccount?.balanceCents ?? openInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const paymentMethodManagement = billingAccount?.paymentMethodManagement;
  const autopayStatus = paymentMethodManagement?.autopayStatus ?? (billingAccount?.autopayPlaceholder ? "enabled" : "disabled");
  const checkoutBlocked = !checkoutReadiness.canAcceptParentPayments;
  const currentGuardian = useMemo(() => {
    if (!family) return null;
    return family.guardians.find((guardian) => guardian.id === currentGuardianId) ?? family.guardians.find((guardian) => guardian.userId) ?? family.guardians[0] ?? null;
  }, [family, currentGuardianId]);
  const uniformColors = useMemo(
    () => Array.from(new Set(uniformProducts.map((product) => product.color))),
    [uniformProducts],
  );
  const uniformSizes = useMemo(
    () => Array.from(new Set(uniformProducts.filter((product) => product.color === uniformColor).map((product) => product.size))),
    [uniformColor, uniformProducts],
  );
  const uniformPurchaseOptions = useMemo(
    () => uniformProducts.filter((product) => product.color === uniformColor && product.size === uniformSize),
    [uniformColor, uniformProducts, uniformSize],
  );
  const selectedUniformProduct = useMemo(
    () => uniformProducts.find((product) =>
      product.color === uniformColor
      && product.size === uniformSize
      && product.purchaseOption === uniformPurchaseOption,
    ) ?? null,
    [uniformColor, uniformProducts, uniformPurchaseOption, uniformSize],
  );
  const uniformSelectedShirtCount = selectedUniformProduct
    ? selectedUniformProduct.shirtCount * uniformQuantity
    : 0;
  const uniformOrderTotalCents = selectedUniformProduct?.amountCents
    ? selectedUniformProduct.amountCents * uniformQuantity
    : 0;
  const latestReport = dailyReports[0] ?? null;
  const activityHighlights = useMemo(
    () => dailyReports
      .flatMap((report) =>
        (report.activities ?? []).map((activity) => ({
          ...activity,
          childName: report.child.fullName,
          date: report.date,
        })),
      )
      .slice(0, 8),
    [dailyReports],
  );

  function showStatus(next: string) {
    setError("");
    setStatus(next);
  }

  function showError(next: string) {
    setStatus("");
    setError(next);
  }

  function addMessageAttachments(files: FileList | null) {
    const selected = Array.from(files ?? []).filter((file) => file.size > 0);
    if (!selected.length) return;
    setMessageAttachments((current) => {
      const next = [...current, ...selected].slice(0, 5);
      if (current.length + selected.length > 5) {
        showError("Attach up to 5 files per message.");
      }
      return next;
    });
  }

  function removeMessageAttachment(index: number) {
    setMessageAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function buildMessageFormData(familyId: string) {
    const formData = new FormData();
    formData.append("familyId", familyId);
    if (replyToMessageId) formData.append("replyToMessageId", replyToMessageId);
    formData.append("subject", subject);
    formData.append("message", message);
    formData.append("priority", "normal");
    formData.append("sendEmailCopy", "true");
    formData.append("sendPushCopy", "true");
    for (const file of messageAttachments) {
      formData.append("attachments", file);
    }
    return formData;
  }

  function sendMessage() {
    if (!family) return;
    startTransition(async () => {
      const body = {
        familyId: family.id,
        replyToMessageId: replyToMessageId || null,
        subject,
        message,
        priority: "normal",
        sendEmailCopy: true,
        sendPushCopy: true,
      };
      const response = await fetch("/api/communications/messages", {
        method: "POST",
        ...(messageAttachments.length
          ? { body: buildMessageFormData(family.id) }
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return showError(json?.error || "Message could not be sent.");
      setMessage("");
      setReplyToMessageId("");
      setReplyingToSubject("");
      setMessageAttachments([]);
      setMessageAttachmentInputKey((current) => current + 1);
      showStatus("Message sent to the center and recorded in the family timeline.");
    });
  }

  function startMessageReply(item: { id: string; subject: string | null }) {
    const nextSubject = item.subject || "Portal message";
    setReplyToMessageId(item.id);
    setReplyingToSubject(nextSubject);
    setSubject(replySubject(nextSubject));
    setMessage("");
    document.getElementById("messages")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  function payInvoice(invoiceId: string, paymentMethodCategory: "ach" | "card" | "link_bank") {
    if (checkoutBlocked) {
      return showError(checkoutReadiness.blockingReason || "Parent payments are not ready for this school yet.");
    }
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (invoice?.pendingPayment) {
      return showError(pendingPaymentMessage(invoice.pendingPayment));
    }
    const recoveryAmount = paymentMethodCategory === "card"
      ? invoice?.checkoutOptions?.card.parentProcessingRecoveryAmountCents ?? estimatedCardRecovery(invoice?.totalCents ?? 0)
      : paymentMethodCategory === "link_bank"
        ? invoice?.checkoutOptions?.instantBank.parentProcessingRecoveryAmountCents ?? invoice?.checkoutOptions?.ach.parentProcessingRecoveryAmountCents ?? estimatedAchRecovery(invoice?.totalCents ?? 0)
        : invoice?.checkoutOptions?.ach.parentProcessingRecoveryAmountCents ?? estimatedAchRecovery(invoice?.totalCents ?? 0);
    if (recoveryAmount > 0) {
      const accepted = window.confirm(
        `${paymentMethodCategory === "card" ? "Debit/credit card" : paymentMethodCategory === "link_bank" ? "Instant bank" : "Bank"} payment includes a ${money(recoveryAmount)} processing recovery. Continue to secure checkout?`,
      );
      if (!accepted) return;
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

  function payBalance(paymentMethodCategory: "ach" | "card" | "link_bank") {
    if (!nextOpenInvoice) return showError("There is no open invoice to pay.");
    payInvoice(nextOpenInvoice.id, paymentMethodCategory);
  }

  function selectUniformColor(color: "Black" | "Yellow") {
    setUniformColor(color);
    const firstSize = uniformProducts.find((product) => product.color === color && product.purchaseOption === uniformPurchaseOption)?.size
      ?? uniformProducts.find((product) => product.color === color)?.size;
    if (firstSize) setUniformSize(firstSize);
  }

  function selectUniformPurchaseOption(purchaseOption: "single" | "bundle_5") {
    setUniformPurchaseOption(purchaseOption);
    setUniformQuantity(1);
    const matchingSize = uniformProducts.find((product) =>
      product.color === uniformColor
      && product.size === uniformSize
      && product.purchaseOption === purchaseOption,
    )?.size;
    if (matchingSize) return;
    const firstSize = uniformProducts.find((product) =>
      product.color === uniformColor
      && product.purchaseOption === purchaseOption,
    )?.size;
    if (firstSize) setUniformSize(firstSize);
  }

  function buyUniform(paymentMethodCategory: "ach" | "card" | "link_bank") {
    if (checkoutBlocked) {
      return showError(checkoutReadiness.blockingReason || "Parent payments are not ready for this school yet.");
    }
    if (!selectedUniformProduct) {
      return showError("Choose an available uniform shirt color and size.");
    }
    const recoveryAmount = paymentMethodCategory === "card"
      ? estimatedCardRecovery(uniformOrderTotalCents)
      : estimatedAchRecovery(uniformOrderTotalCents);
    if (recoveryAmount > 0) {
      const accepted = window.confirm(
        `${paymentMethodCategory === "card" ? "Debit/credit card" : paymentMethodCategory === "link_bank" ? "Instant bank" : "Bank"} payment includes a ${money(recoveryAmount)} processing recovery. Continue to secure checkout?`,
      );
      if (!accepted) return;
    }
    startTransition(async () => {
      const purchaseResponse = await fetch("/api/parent/products/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedUniformProduct.productId,
          purchaseOption: selectedUniformProduct.purchaseOption,
          quantity: uniformQuantity,
        }),
      });
      const purchaseJson = await purchaseResponse.json().catch(() => null) as {
        error?: string;
        invoice?: { id: string; totalCents: number };
      } | null;
      if (!purchaseResponse.ok || !purchaseJson?.invoice?.id) {
        return showError(purchaseJson?.error || "Uniform shirt purchase could not be started.");
      }

      const checkoutResponse = await fetch("/api/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: purchaseJson.invoice.id,
          paymentMethodCategory,
          returnPath: "/parent-portal",
        }),
      });
      const checkoutJson = await checkoutResponse.json().catch(() => null) as { error?: string; url?: string } | null;
      if (!checkoutResponse.ok || !checkoutJson?.url) {
        showStatus("Uniform shirt invoice was added to your family ledger. Checkout can be completed from the open invoices list.");
        router.refresh();
        return;
      }
      window.location.href = checkoutJson.url;
    });
  }

  function managePaymentMethod(action: "setup" | "portal" | "disable_autopay", paymentMethodCategory: "ach" | "card" | "link_bank" | "default" = "default") {
    if (!family) return showError("A family profile is required before saving payment methods.");
    if (action !== "setup" && !billingAccount) return showError("Save a payment method before managing autopay settings.");
    if (action === "setup" && paymentMethodCategory === "card") {
      const accepted = window.confirm(
        "Card autopay may include the approved card processing recovery when a payment is charged. Continue with card setup?",
      );
      if (!accepted) return;
    }
    startTransition(async () => {
      const response = await fetch("/api/billing/payment-method-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingAccountId: billingAccount?.id,
          familyId: family.id,
          action,
          paymentMethodCategory,
          processingRecoveryAccepted: action === "setup" && paymentMethodCategory === "card",
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

  function updateProfilePassword() {
    if (!currentPassword || !newPassword) return showError("Enter your current password and a new password.");
    if (newPassword.length < 8) return showError("New password must be at least 8 characters.");
    if (newPassword !== confirmPassword) return showError("New passwords do not match.");

    startTransition(async () => {
      const response = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, password: newPassword, confirmPassword }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return showError(json?.error || "Password could not be updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showStatus("Password updated.");
      router.refresh();
    });
  }

  function requestAccountDeletion() {
    if (!family || !currentGuardianId) {
      return showError("Sign in as a linked parent or guardian before requesting account deletion.");
    }
    if (!retentionNoticeAccepted) {
      return showError("Confirm the childcare record retention notice before submitting the request.");
    }
    const accepted = window.confirm(
      "Submit an account deletion request? The school may need to retain childcare, safety, billing, payment, or audit records.",
    );
    if (!accepted) return;

    startTransition(async () => {
      const response = await fetch("/api/privacy/deletion-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardianId: currentGuardianId,
          details: accountDeletionDetails,
          retentionNoticeAccepted,
        }),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        duplicate?: boolean;
        request?: AccountDeletionRequestSummary;
      } | null;
      if (!response.ok || !json?.request) {
        return showError(json?.error || "Account deletion request could not be submitted.");
      }
      setAccountDeletionRequest(json.request);
      setAccountDeletionDetails("");
      setRetentionNoticeAccepted(false);
      showStatus(json.duplicate ? "An open account deletion request is already on file." : "Account deletion request submitted for review.");
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
      <section id="family-summary" className="scroll-mt-28 rounded-2xl border bg-card/80 p-4 shadow-2xl shadow-black/15 sm:p-6">
        <Badge className="mb-4">
          <ShieldCheck data-icon="inline-start" />
          Family portal
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{family.name}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Daily reports, classroom activities, photos, messages, billing, and family account details.
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
        <Card className="glass-panel">
          <CardHeader>
            <CardDescription>Latest report</CardDescription>
            <CardTitle>{latestReport ? formatDate(latestReport.date) : "None yet"}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel">
          <CardHeader>
            <CardDescription>Shared photos</CardDescription>
            <CardTitle>{media.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel">
          <CardHeader>
            <CardDescription>Recent activities</CardDescription>
            <CardTitle>{activityHighlights.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel">
          <CardHeader>
            <CardDescription>Need acknowledgment</CardDescription>
            <CardTitle>{unacknowledged.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <section id="daily-updates" className="scroll-mt-28 rounded-2xl border bg-card/90 p-4 shadow-2xl shadow-black/15 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Badge className="mb-3">
              <Sparkles data-icon="inline-start" />
              Today at school
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Daily Reports, Activities, and Photos</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Recent teacher notes, classroom activities, and photo moments for this family.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <a
              className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted sm:flex-none"
              href="#daily-reports"
            >
              <ClipboardList data-icon="inline-start" />
              Reports
            </a>
            <a
              className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted sm:flex-none"
              href="#photos"
            >
              <Camera data-icon="inline-start" />
              Photos
            </a>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card id="daily-reports" className="glass-panel scroll-mt-28">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="size-5 text-primary" />
                Daily Reports
              </CardTitle>
              <CardDescription>Recent teacher notes and care details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {dailyReports.slice(0, 5).map((report, index) => (
                <div
                  key={report.id}
                  className={`rounded-xl border p-4 ${index === 0 ? "bg-primary/10 shadow-sm" : "bg-background/40"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{report.child.fullName}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(report.date)}</div>
                    </div>
                    {index === 0 ? <Badge>Latest</Badge> : null}
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
                    {!report.naps?.length && /\bno nap\b/i.test(report.teacherNote ?? "") ? (
                      <span>Nap: No nap today</span>
                    ) : null}
                    {report.diapers?.map((diaper) => (
                      <span key={diaper.id}>Potty/diaper: {diaper.type} · {formatTime(diaper.occurredAt)}{diaper.notes ? ` · ${diaper.notes}` : ""}</span>
                    ))}
                    {report.activities?.slice(0, 4).map((activity) => (
                      <span key={activity.id}>Activity: {activity.title}{activity.notes ? ` · ${activity.notes}` : ""}</span>
                    ))}
                  </div>
                </div>
              ))}
              {!dailyReports.length ? (
                <p className="text-sm text-muted-foreground">No daily reports have been shared recently.</p>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card id="photos" className="glass-panel scroll-mt-28">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="size-5 text-primary" />
                  Photos and Moments
                </CardTitle>
                <CardDescription>Teacher-shared classroom photos for this family.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {media.slice(0, 1).map((item) => {
                  const imageSrc = renderableImageSrc(item.url);
                  return (
                    <div key={item.id} className="overflow-hidden rounded-xl border bg-background/40">
                      <div className="relative aspect-[4/3] w-full bg-muted/40">
                        {imageSrc ? (
                          <Image
                            src={imageSrc}
                            alt={item.caption || `${item.child.fullName} classroom moment`}
                            fill
                            sizes="(min-width: 1280px) 35vw, 100vw"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                            Image unavailable
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="text-sm font-medium">{item.child.fullName}</div>
                        <p className="mt-1 text-xs text-muted-foreground">{item.caption || formatDate(item.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
                <div className="grid gap-3 sm:grid-cols-2">
                  {media.slice(1, 5).map((item) => {
                    const imageSrc = renderableImageSrc(item.url);
                    return (
                      <div key={item.id} className="overflow-hidden rounded-xl border bg-background/40">
                        <div className="relative aspect-video w-full bg-muted/40">
                          {imageSrc ? (
                            <Image
                              src={imageSrc}
                              alt={item.caption || `${item.child.fullName} classroom moment`}
                              fill
                              sizes="(min-width: 640px) 25vw, 50vw"
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                              Image unavailable
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <div className="text-sm font-medium">{item.child.fullName}</div>
                          <p className="mt-1 text-xs text-muted-foreground">{item.caption || formatDate(item.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!media.length ? <p className="text-sm text-muted-foreground">No shared photos have been added yet.</p> : null}
              </CardContent>
            </Card>

            <Card id="activities" className="glass-panel scroll-mt-28">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" />
                  Daily Activities
                </CardTitle>
                <CardDescription>Classroom activity highlights from recent reports.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {activityHighlights.map((activity) => (
                  <div key={`${activity.id}-${activity.childName}`} className="rounded-xl border bg-background/40 p-3">
                    <div className="text-sm font-medium">{activity.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{activity.childName} · {formatDate(activity.date)}</div>
                    {activity.notes ? <p className="mt-2 text-sm text-muted-foreground">{activity.notes}</p> : null}
                  </div>
                ))}
                {!activityHighlights.length ? (
                  <p className="text-sm text-muted-foreground">No classroom activities have been shared recently.</p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <ParentKioskCredentialPanel initialCredentials={kioskCredentials} />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card id="children" className="glass-panel scroll-mt-28">
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

        <Card className="glass-panel scroll-mt-28">
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
        <Card id="billing" className="glass-panel scroll-mt-28">
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
                  <div className="flex items-center gap-2 font-medium">
                    Payment Methods And Autopay
                    <InfoTip label="About payment methods and autopay">
                      Save a bank account or card if you want autopay, or make a one-time payment on any open invoice below. Open invoices do not block bank verification.
                    </InfoTip>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {paymentMethodManagement?.hasSavedPaymentMethod
                      ? `${paymentMethodManagement.paymentMethodLabel ?? "Payment method saved securely"}${paymentMethodManagement.lastUpdatedAt ? ` on ${formatDate(paymentMethodManagement.lastUpdatedAt)}` : ""}. Autopay is optional and can be disabled here.`
                      : paymentMethodManagement?.autopayStatus === "pending"
                        ? "Bank verification is pending."
                        : "No saved payment method yet."}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="w-full sm:w-auto" disabled={isPending || !family} onClick={() => managePaymentMethod("setup", "link_bank")}>
                    <Building2 data-icon="inline-start" />
                    {paymentMethodManagement?.autopayStatus === "pending" ? "Verify Bank Instantly" : paymentMethodManagement?.hasSavedPaymentMethod ? "Instant Bank Login" : "Set Up Instant Bank"}
                  </Button>
                  <Button className="w-full sm:w-auto" disabled={isPending || !family} onClick={() => managePaymentMethod("setup", "card")} variant="outline">
                    <CreditCard data-icon="inline-start" />
                    {paymentMethodManagement?.hasSavedPaymentMethod ? "Replace Autopay Card" : "Set Up Card Autopay"}
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    disabled={isPending || !paymentMethodManagement?.hasStripeCustomer}
                    onClick={() => managePaymentMethod("portal")}
                    variant="outline"
                  >
                    Manage Payment Method
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
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
                    <div className="text-xs text-muted-foreground">Pay today</div>
                    <div className="font-medium">
                      {nextOpenInvoice.purposeLabel ? `${nextOpenInvoice.purposeLabel} · ` : ""}{nextOpenInvoice.number} · due {formatDate(nextOpenInvoice.dueDate)} · {money(nextOpenInvoice.totalCents)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button className="w-full sm:w-auto" disabled={isPending || checkoutBlocked} onClick={() => payBalance("link_bank")}>
                      <Building2 data-icon="inline-start" />
                      Instant Bank {nextOpenInvoice.checkoutOptions ? money(nextOpenInvoice.checkoutOptions.instantBank.checkoutTotalCents) : ""}
                    </Button>
                    <Button className="w-full sm:w-auto" disabled={isPending || checkoutBlocked} onClick={() => payBalance("ach")} variant="outline">
                      <Building2 data-icon="inline-start" />
                      Pay by Bank {nextOpenInvoice.checkoutOptions ? money(nextOpenInvoice.checkoutOptions.ach.checkoutTotalCents) : ""}
                    </Button>
                    <Button className="w-full sm:w-auto" disabled={isPending || checkoutBlocked} onClick={() => payBalance("card")} variant="outline">
                      <CreditCard data-icon="inline-start" />
                      Debit/Credit Card {nextOpenInvoice.checkoutOptions ? money(nextOpenInvoice.checkoutOptions.card.checkoutTotalCents) : ""}
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
            {!nextOpenInvoice && firstPendingOpenInvoice?.pendingPayment ? (
              <Alert>
                <AlertCircle className="size-4" />
                <AlertTitle>Payment Processing</AlertTitle>
                <AlertDescription>
                  {firstPendingOpenInvoice.number}: {pendingPaymentMessage(firstPendingOpenInvoice.pendingPayment)}
                </AlertDescription>
              </Alert>
            ) : null}
            {uniformProducts.length ? (
              <div className="rounded-xl border bg-background/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <ShoppingBag className="size-4 text-primary" />
                      Student Uniform Shirt
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Choose a shirt color, size, and purchase option. Uniform purchases are added to your family ledger with separate product checkout and receipt details.
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Order total</div>
                    <div className="text-lg font-semibold">{money(uniformOrderTotalCents)}</div>
                    {selectedUniformProduct ? (
                      <div className="text-xs text-muted-foreground">
                        {uniformSelectedShirtCount} shirt{uniformSelectedShirtCount === 1 ? "" : "s"} selected
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr_1fr_1fr]">
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="flex flex-wrap gap-2">
                      {uniformColors.map((color) => (
                        <Button
                          key={color}
                          disabled={isPending}
                          onClick={() => selectUniformColor(color)}
                          size="sm"
                          type="button"
                          variant={uniformColor === color ? "default" : "outline"}
                        >
                          <span className={`size-3 rounded-full border ${color === "Black" ? "bg-black" : "bg-yellow-300"}`} />
                          {color}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Size</Label>
                    <div className="flex flex-wrap gap-2">
                      {uniformSizes.map((size) => (
                        <Button
                          key={size}
                          disabled={isPending}
                          onClick={() => setUniformSize(size)}
                          size="sm"
                          type="button"
                          variant={uniformSize === size ? "default" : "outline"}
                        >
                          {size}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Option</Label>
                    <div className="flex flex-wrap gap-2">
                      {uniformPurchaseOptions.map((product) => (
                        <Button
                          key={product.purchaseOption}
                          disabled={isPending}
                          onClick={() => selectUniformPurchaseOption(product.purchaseOption)}
                          size="sm"
                          type="button"
                          variant={uniformPurchaseOption === product.purchaseOption ? "default" : "outline"}
                        >
                          {product.shirtCount === 5 ? "5-pack" : "Individual"} {money(product.amountCents)}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="uniformQuantity">Quantity</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        aria-label="Decrease quantity"
                        disabled={isPending || uniformQuantity <= 1}
                        onClick={() => setUniformQuantity((current) => clampUniformQuantity(current - 1))}
                        size="icon-sm"
                        type="button"
                        variant="outline"
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <Input
                        className="h-7 w-20 text-center text-sm"
                        disabled={isPending}
                        id="uniformQuantity"
                        inputMode="numeric"
                        max={MAX_UNIFORM_PURCHASE_QUANTITY}
                        min={1}
                        onChange={(event) => setUniformQuantity(clampUniformQuantity(Number.parseInt(event.target.value, 10)))}
                        type="number"
                        value={uniformQuantity}
                      />
                      <Button
                        aria-label="Increase quantity"
                        disabled={isPending || uniformQuantity >= MAX_UNIFORM_PURCHASE_QUANTITY}
                        onClick={() => setUniformQuantity((current) => clampUniformQuantity(current + 1))}
                        size="icon-sm"
                        type="button"
                        variant="outline"
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedUniformProduct?.purchaseOption === "bundle_5"
                        ? `${uniformQuantity} pack${uniformQuantity === 1 ? "" : "s"} · ${uniformSelectedShirtCount} shirts total`
                        : `${uniformQuantity} shirt${uniformQuantity === 1 ? "" : "s"} at ${money(selectedUniformProduct?.amountCents ?? 0)} each`}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button className="w-full sm:w-auto" disabled={isPending || checkoutBlocked || !selectedUniformProduct} onClick={() => buyUniform("link_bank")}>
                    <Building2 data-icon="inline-start" />
                    Buy With Instant Bank
                  </Button>
                  <Button className="w-full sm:w-auto" disabled={isPending || checkoutBlocked || !selectedUniformProduct} onClick={() => buyUniform("card")} variant="outline">
                    <CreditCard data-icon="inline-start" />
                    Buy With Card
                  </Button>
                </div>
              </div>
            ) : null}
            {invoices.map((invoice) => {
              const invoiceHasPendingPayment = Boolean(invoice.pendingPayment);
              return (
                <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/40 p-4">
                  <div>
                    <div className="font-medium">{invoice.number}</div>
                    <div className="text-xs text-muted-foreground">
                      {invoice.purposeLabel ? `${invoice.purposeLabel} · ` : ""}Due {formatDate(invoice.dueDate)}
                    </div>
                  </div>
                  <Badge variant={invoiceHasPendingPayment ? "secondary" : invoice.status === "OPEN" ? "outline" : "default"}>
                    {invoiceHasPendingPayment ? "PROCESSING" : invoice.status}
                  </Badge>
                  <div className="text-lg font-semibold">{money(invoice.totalCents)}</div>
                  <div className="flex flex-wrap gap-2">
                    <Button className="w-full sm:w-auto" disabled={isPending || checkoutBlocked || invoice.status !== "OPEN" || invoiceHasPendingPayment} onClick={() => payInvoice(invoice.id, "link_bank")}>
                      <Building2 data-icon="inline-start" />
                      Instant Bank {invoice.checkoutOptions ? money(invoice.checkoutOptions.instantBank.checkoutTotalCents) : ""}
                    </Button>
                    <Button className="w-full sm:w-auto" disabled={isPending || checkoutBlocked || invoice.status !== "OPEN" || invoiceHasPendingPayment} onClick={() => payInvoice(invoice.id, "ach")} variant="outline">
                      <Building2 data-icon="inline-start" />
                      One-Time Bank {invoice.checkoutOptions ? money(invoice.checkoutOptions.ach.checkoutTotalCents) : ""}
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      disabled={isPending || checkoutBlocked || invoice.status !== "OPEN" || invoiceHasPendingPayment}
                      onClick={() => payInvoice(invoice.id, "card")}
                      variant="outline"
                    >
                      <CreditCard data-icon="inline-start" />
                      Debit/Credit Card {invoice.checkoutOptions ? money(invoice.checkoutOptions.card.checkoutTotalCents) : ""}
                    </Button>
                  </div>
                  {invoice.pendingPayment ? (
                    <div className="basis-full rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                      {pendingPaymentMessage(invoice.pendingPayment)}
                    </div>
                  ) : null}
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
              );
            })}
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
                      {payment.provider === "stripe" ? "Stripe" : payment.provider} · {paymentListLabel(payment)}
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

        <Card id="messages" className="glass-panel scroll-mt-28">
          <CardHeader>
            <CardTitle>Message the Center</CardTitle>
            <CardDescription>Send a note to your school office.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="portal-subject">Subject</Label>
              <Input id="portal-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            {replyToMessageId ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/40 p-3 text-sm">
                <div>
                  <div className="font-medium">Replying in Bee Suite</div>
                  <div className="text-xs text-muted-foreground">{replyingToSubject || "Selected message thread"}</div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReplyToMessageId("");
                    setReplyingToSubject("");
                  }}
                >
                  <X data-icon="inline-start" />
                  Cancel reply
                </Button>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="portal-message">Message</Label>
              <Textarea id="portal-message" value={message} onChange={(event) => setMessage(event.target.value)} />
            </div>
            <div className="space-y-2 rounded-lg border bg-background/40 p-3">
              <Label htmlFor="portal-message-attachments" className="flex items-center gap-2">
                <Paperclip className="size-4" />
                Attach photos or files
              </Label>
              <Input
                key={messageAttachmentInputKey}
                id="portal-message-attachments"
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={(event) => addMessageAttachments(event.target.files)}
              />
              {messageAttachments.length ? (
                <div className="flex flex-wrap gap-2">
                  {messageAttachments.map((file, index) => (
                    <span key={`${file.name}-${file.size}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-md border bg-card px-2 py-1 text-xs">
                      <span className="truncate">{file.name || "attachment"}</span>
                      <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeMessageAttachment(index)} title="Remove attachment">
                        <X className="size-3" />
                      </Button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <Button className="w-full sm:w-auto" disabled={isPending || (!message.trim() && !messageAttachments.length)} onClick={sendMessage}>
              <MessageSquare data-icon="inline-start" />
              Send Message
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        {parentPortalDocumentsEnabled ? (
        <Card id="documents" className="glass-panel scroll-mt-28">
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
                      className="w-full sm:w-auto"
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
              <Button className="w-full sm:w-auto" disabled={isPending || !requestDetails.trim()} onClick={requestContactUpdate}>
                <FileText data-icon="inline-start" />
                Submit Request
              </Button>
            </div>
          </CardContent>
        </Card>
        ) : null}
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
              {item.attachments?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      className="inline-flex max-w-full items-center gap-2 rounded-md border bg-background/60 px-2 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent"
                      href={attachment.downloadUrl ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {attachment.kind === "image" ? <Camera className="size-3.5 shrink-0 text-primary" /> : <FileText className="size-3.5 shrink-0 text-primary" />}
                      <span className="truncate">{attachment.filename}</span>
                      <span className="shrink-0 text-muted-foreground">{formatFileSize(attachment.size)}</span>
                    </a>
                  ))}
                </div>
              ) : null}
              <Button className="mt-3 w-full sm:w-auto" variant="outline" size="sm" onClick={() => startMessageReply(item)}>
                <Reply data-icon="inline-start" />
                Reply in Bee Suite
              </Button>
            </div>
          ))}
          {!messages.length ? <p className="text-sm text-muted-foreground">No messages have been recorded yet.</p> : null}
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="text-primary" />
            Profile Settings
          </CardTitle>
          <CardDescription>Parent portal login and optional password changes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border bg-background/40 p-4">
            <div className="text-xs text-muted-foreground">Parent login email</div>
            <div className="mt-1 break-words font-medium">{currentGuardian?.email ?? family.guardians[0]?.email ?? "Email pending"}</div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              This is the personal guardian email on file with the school.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="profile-current-password">Current password</Label>
              <Input
                id="profile-current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="profile-new-password">New password</Label>
              <Input
                id="profile-new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="profile-confirm-password">Confirm password</Label>
              <Input
                id="profile-confirm-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={8}
              />
            </div>
          </div>
          <Button className="w-full sm:w-auto" disabled={isPending} onClick={updateProfilePassword}>
            <KeyRound data-icon="inline-start" />
            Update Password
          </Button>
          <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <ShieldCheck className="size-4 text-destructive" />
                  Privacy and Account Deletion
                  <InfoTip label="About account deletion" side="right">
                    This requests removal of parent portal login access. Some childcare, safety, licensing, billing, payment, and audit records may need to be retained by your school or The BEE Suite.
                  </InfoTip>
                </div>
              </div>
              {accountDeletionRequest ? (
                <Badge variant="outline">
                  {accountDeletionRequest.status.replaceAll("_", " ")}
                </Badge>
              ) : null}
            </div>
            {accountDeletionRequest ? (
              <div className="rounded-lg border bg-background/60 p-3 text-sm">
                <div className="font-medium">Request received {formatDate(accountDeletionRequest.createdAt)}</div>
                <p className="mt-1 text-muted-foreground">
                  Status: {accountDeletionRequest.status.replaceAll("_", " ")}
                  {accountDeletionRequest.dueAt ? ` · target response by ${formatDate(accountDeletionRequest.dueAt)}` : ""}
                </p>
              </div>
            ) : (
              <>
                <Textarea
                  value={accountDeletionDetails}
                  onChange={(event) => setAccountDeletionDetails(event.target.value)}
                  placeholder="Optional details for support or your school"
                />
                <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={retentionNoticeAccepted}
                    onChange={(event) => setRetentionNoticeAccepted(event.target.checked)}
                  />
                  <span>
                    I understand this starts an account deletion request and that required childcare, licensing, safety, billing, payment, and audit records may be retained.
                  </span>
                </label>
                <Button
                  className="w-full sm:w-auto"
                  disabled={isPending || !currentGuardianId || !retentionNoticeAccepted}
                  onClick={requestAccountDeletion}
                  variant="destructive"
                >
                  <Trash2 data-icon="inline-start" />
                  Request Account Deletion
                </Button>
              </>
            )}
          </div>
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
            <Button className="w-full sm:w-auto" disabled={isPending || !currentGuardianId} onClick={saveNotificationPreferences}>
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
