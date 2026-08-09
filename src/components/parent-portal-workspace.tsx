"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedDateTime } from "@/lib/zoned-date-time";
import {
  AlertCircle,
  BellRing,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  KeyRound,
  LifeBuoy,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { GuardianKioskCredential } from "@/lib/kiosk-credentials";
import {
  PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
  paymentProcessingRecoverySummary,
} from "@/lib/payment-disclosures";
import type { MessageAttachmentView } from "@/lib/message-attachments";
import { replySubject } from "@/lib/message-reply-routing";
import type { StripeCheckoutReadiness } from "@/lib/stripe-connect-readiness";
import { isParentVisiblePayment } from "@/lib/parent-billing-visibility";
import type { ParentPortalTodayState } from "@/lib/parent-portal-today";
import {
  dailyReportTimedCareEvents,
  sortDailyReportsChronologically,
} from "@/lib/daily-report-ordering";

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
  tuitionAssignment?: {
    enabled: boolean;
    cadence: string | null;
    amountCents: number | null;
    tuitionPlanName: string | null;
  } | null;
  today?: ParentPortalTodayState;
};

type PendingInvoicePayment = {
  id: string;
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
  purposeLabel?: string | null;
  productCheckoutAvailable?: boolean;
  pendingPayment?: PendingInvoicePayment | null;
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
  sentAt?: string | Date | null;
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
  pickups?: Array<{ id: string; fullName: string; phone: string | null; relation: string | null }>;
  emergencyContacts?: Array<{ id: string; fullName: string; phone: string; relation: string }>;
  children: Child[];
};

type ParentMedia = {
  id: string;
  url: string;
  caption: string | null;
  createdAt: string | Date;
  child: { fullName: string };
};

type DailyUpdateActivity = NonNullable<DailyReport["activities"]>[number] & {
  childName: string;
};

type DailyUpdateDay = {
  key: string;
  date: string | Date;
  reports: DailyReport[];
  activities: DailyUpdateActivity[];
  media: ParentMedia[];
  totalItems: number;
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
  parentBalanceReviewRequired?: boolean;
  invoices: Invoice[];
  payments?: Payment[];
  ledgerEntries?: LedgerEntry[];
  latestLedgerEntry?: LedgerEntry | null;
  ledgerPagination?: {
    page: number;
    pageSize: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };
  dailyReports: DailyReport[];
  incidents: Incident[];
  messages: Array<{ id: string; subject: string | null; body: string; createdAt: string | Date; attachments?: MessageAttachmentView[] }>;
  documents: Array<{ id: string; name: string; type: string; status: string; expiresAt: string | Date | null; storageKey?: string | null; downloadUrl?: string | null }>;
  media?: ParentMedia[];
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
  availableFamilies?: Array<{ id: string; name: string; centerName: string | null; childNames: string[] }>;
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

// Secure family/document guards are always enforced server-side. Keep the parent
// document surface on by default so a school-issued document request cannot land
// on a portal where the requested action is hidden. Set explicitly to "0" only
// for an approved school-level rollout hold.
const parentPortalDocumentsEnabled = process.env.NEXT_PUBLIC_PARENT_PORTAL_DOCUMENTS_ENABLED !== "0";

function requiresDocumentSignature(document: { storageKey?: string | null }) {
  return signaturePendingStorageKeys.has((document.storageKey || "").trim().toLowerCase());
}

function formatDateInTimeZone(value: string | Date | null, timeZone: string) {
  return formatZonedDateTime(value, timeZone, { month: "short", day: "numeric", year: "numeric" });
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
  return `${label} payment is processing. Bank payments can take a few business days to settle; the invoice will update when the payment processor confirms the funds.`;
}

function paymentFields(payment: Payment) {
  return recordFromUnknown(payment.customFields);
}

function isProcessingPayment(payment: Payment) {
  const status = textField(paymentFields(payment).status);
  return payment.status === "DRAFT" && (status === "checkout_created" || status === "checkout_pending");
}

function paymentListLabel(payment: Payment, timeZone: string) {
  if (isProcessingPayment(payment)) {
    const fields = paymentFields(payment);
    const category = textField(fields.paymentMethodCategory) || textField(fields.requestedPaymentMethodCategory);
    return `${paymentMethodCategoryLabel(category)} processing`;
  }
  if (payment.status === "PAID") return `Paid · ${formatDateInTimeZone(payment.paidAt, timeZone)}`;
  return payment.status.toLowerCase();
}

function paymentProviderLabel(provider: string) {
  if (provider === "stripe") return "Online payment";
  if (provider === "stripe_terminal") return "In-person card payment";
  if (provider === "manual_check") return "Check payment";
  if (provider === "manual_cash") return "Cash payment";
  return provider.replaceAll("_", " ");
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

function formatTimeInTimeZone(value: string | Date | null, timeZone: string) {
  return formatZonedDateTime(value, timeZone, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
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

function todayStatusVariant(status: ParentPortalTodayState["status"] | undefined) {
  if (status === "absent") return "destructive" as const;
  if (status === "checked_in" || status === "present") return "default" as const;
  if (status === "checked_out") return "secondary" as const;
  return "outline" as const;
}

function localDateKey(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateTimestamp(value: string | Date | null | undefined) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function paymentAmountCents(value: string) {
  const dollars = Number.parseFloat(value);
  return Number.isFinite(dollars) ? Math.max(0, Math.round(dollars * 100)) : 0;
}

export function ParentPortalWorkspace({
  family,
  billingAccount,
  checkoutReadiness = fallbackCheckoutReadiness,
  parentBalanceReviewRequired = false,
  invoices,
  payments = [],
  ledgerEntries = [],
  latestLedgerEntry = null,
  ledgerPagination,
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
  availableFamilies = [],
  demoMode,
}: Props) {
  const timeZone = useSchoolTimeZone();
  const formatDate = (value: string | Date | null) => formatDateInTimeZone(value, timeZone);
  const formatTime = (value: string | Date | null) => formatTimeInTimeZone(value, timeZone);
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
  const [requestEntity, setRequestEntity] = useState<"emergency_contact" | "authorized_pickup">("emergency_contact");
  const [requestOperation, setRequestOperation] = useState<"add" | "update" | "remove">("add");
  const [requestTargetId, setRequestTargetId] = useState("");
  const [requestName, setRequestName] = useState("");
  const [requestPhone, setRequestPhone] = useState("");
  const [requestRelation, setRequestRelation] = useState("");
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
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [autopayConfirmation, setAutopayConfirmation] = useState("");
  const [autopayStatusOverride, setAutopayStatusOverride] = useState<"enabled" | "disabled" | null>(null);
  const [accountDeletionRequest, setAccountDeletionRequest] = useState<AccountDeletionRequestSummary | null>(initialAccountDeletionRequest);
  const [accountDeletionDetails, setAccountDeletionDetails] = useState("");
  const [retentionNoticeAccepted, setRetentionNoticeAccepted] = useState(false);
  const [autopayEnableRequirements, setAutopayEnableRequirements] = useState<string[]>([]);
  const [uniformColor, setUniformColor] = useState<"Black" | "Yellow">(uniformProducts[0]?.color ?? "Black");
  const [uniformSize, setUniformSize] = useState(uniformProducts[0]?.size ?? "2T");
  const [uniformPurchaseOption, setUniformPurchaseOption] = useState<"single" | "bundle_5">(uniformProducts[0]?.purchaseOption ?? "single");
  const [uniformQuantity, setUniformQuantity] = useState(1);
  const [selectedUpdateDayKey, setSelectedUpdateDayKey] = useState("");
  const [tuitionCadenceDrafts, setTuitionCadenceDrafts] = useState<Record<string, string>>({});
  const [accountPaymentAmountDollars, setAccountPaymentAmountDollars] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveTuitionCadence(child: Child) {
    const billingCadence = tuitionCadenceDrafts[child.id] ?? (child.tuitionAssignment?.cadence === "four_week" ? "four_week" : "weekly");
    startTransition(async () => {
      setStatus("");
      setError("");
      const response = await fetch("/api/parent/tuition-cadence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: child.id, billingCadence }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return setError(result?.error || "Billing cycle could not be saved.");
      setStatus(billingCadence === "four_week"
        ? `${child.fullName}'s tuition will be invoiced every four weeks for the four weeks ahead.`
        : `${child.fullName}'s tuition will be invoiced one week at a time.`);
      router.refresh();
    });
  }

  const openInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === "OPEN"), [invoices]);
  const balanceCents = billingAccount?.balanceCents ?? 0;
  const payableOpenInvoices = useMemo(
    () => balanceCents > 0 ? openInvoices.filter((invoice) => !invoice.pendingPayment) : [],
    [balanceCents, openInvoices],
  );
  const pendingOpenInvoices = useMemo(() => openInvoices.filter((invoice) => invoice.pendingPayment), [openInvoices]);
  const nextOpenInvoice = useMemo(
    () => payableOpenInvoices.slice().sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime())[0] ?? null,
    [payableOpenInvoices],
  );
  const firstPendingOpenInvoice = pendingOpenInvoices[0] ?? null;
  const accountPaymentAmountCents = paymentAmountCents(accountPaymentAmountDollars);
  const showFamilyPaymentPanel = parentBalanceReviewRequired
    || Boolean(nextOpenInvoice)
    || (balanceCents > 0 && openInvoices.length === 0);
  const latestAccountLedgerEntry = latestLedgerEntry ?? ledgerEntries[0] ?? null;
  const parentVisiblePayments = payments.filter(isParentVisiblePayment);
  const paymentMethodManagement = billingAccount?.paymentMethodManagement;
  const autopayStatus = autopayStatusOverride ?? paymentMethodManagement?.autopayStatus ?? (billingAccount?.autopayPlaceholder ? "enabled" : "disabled");
  const autopayCanEnable = paymentMethodManagement?.hasStripeCustomer === true && paymentMethodManagement?.hasSavedPaymentMethod === true;
  const autopayLocalRequirements = useMemo(() => {
    const requirements: string[] = [];
    if (!autopayCanEnable) {
      requirements.push("Save and verify one family payment method before enabling autopay.");
    }
    if (autopayStatus === "pending") {
      requirements.push("Bank verification is pending. Complete verification for your payment method before enabling autopay.");
    }
    return requirements;
  }, [autopayCanEnable, autopayStatus]);
  const autopayRequirements = useMemo(() => {
    const values = [...autopayEnableRequirements, ...autopayLocalRequirements];
    const seen = new Set<string>();
    return values.filter((requirement) => {
      const text = requirement.trim();
      if (!text || seen.has(text)) return false;
      seen.add(text);
      return true;
    });
  }, [autopayEnableRequirements, autopayLocalRequirements]);
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
  const dailyUpdateDays = useMemo<DailyUpdateDay[]>(() => {
    const days = new Map<string, Omit<DailyUpdateDay, "totalItems">>();
    const ensureDay = (value: string | Date) => {
      const key = localDateKey(value);
      if (!key) return null;
      const existing = days.get(key);
      if (existing) return existing;
      const created = { key, date: value, reports: [], activities: [], media: [] };
      days.set(key, created);
      return created;
    };

    for (const report of dailyReports) {
      const day = ensureDay(report.date);
      if (!day) continue;
      day.reports.push(report);
      for (const activity of report.activities ?? []) {
        day.activities.push({ ...activity, childName: report.child.fullName });
      }
    }
    for (const item of media) {
      ensureDay(item.createdAt)?.media.push(item);
    }

    return Array.from(days.values())
      .map((day) => ({
        ...day,
        reports: sortDailyReportsChronologically(day.reports),
        media: day.media.toSorted((left, right) => dateTimestamp(right.createdAt) - dateTimestamp(left.createdAt)),
        totalItems: day.reports.length + day.activities.length + day.media.length,
      }))
      .toSorted((left, right) => right.key.localeCompare(left.key));
  }, [dailyReports, media]);
  const selectedUpdateDay = dailyUpdateDays.find((day) => day.key === selectedUpdateDayKey) ?? dailyUpdateDays[0] ?? null;
  const latestReport = selectedUpdateDay?.reports.at(-1) ?? dailyReports[0] ?? null;

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
          requestType: requestEntity === "emergency_contact" ? "Emergency contact update" : "Authorized pickup update",
          details: requestDetails,
          changeData: {
            entity: requestEntity,
            operation: requestOperation,
            targetId: requestTargetId || undefined,
            fullName: requestName,
            phone: requestPhone,
            relation: requestRelation,
          },
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return showError(json?.error || "Request could not be submitted.");
      setRequestDetails("");
      setRequestTargetId("");
      setRequestName("");
      setRequestPhone("");
      setRequestRelation("");
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

  function payFamilyBalance(paymentMethodCategory: "ach" | "card" | "link_bank") {
    if (checkoutBlocked) {
      return showError(checkoutReadiness.blockingReason || "Parent payments are not ready for this school yet.");
    }
    if (!family || !billingAccount) {
      return showError("Your family billing account is not available yet.");
    }
    if (balanceCents <= 0 && !parentBalanceReviewRequired) {
      return showError("There is no family balance to pay.");
    }
    if (parentBalanceReviewRequired && accountPaymentAmountCents <= 0) {
      return showError("Enter the amount you want to pay toward your account.");
    }
    startTransition(async () => {
      const method = paymentMethodCategory === "card"
        ? "card_checkout"
        : paymentMethodCategory === "link_bank" ? "instant_bank_checkout" : "ach_checkout";
      const response = await fetch("/api/billing/family-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingAccountId: billingAccount.id,
          familyId: family.id,
          method,
          returnPath: "/parent-portal",
          ...(parentBalanceReviewRequired ? { amountCents: accountPaymentAmountCents } : {}),
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; url?: string; configured?: boolean } | null;
      if (!response.ok || !json?.url) {
        return showError(json?.error || "Payment checkout is not configured yet.");
      }
      window.location.href = json.url;
    });
  }

  function payBalance(paymentMethodCategory: "ach" | "card" | "link_bank") {
    if (!nextOpenInvoice && balanceCents <= 0 && !parentBalanceReviewRequired) {
      return showError("There is no family balance to pay.");
    }
    payFamilyBalance(paymentMethodCategory);
  }

  function payProductInvoice(invoiceId: string, paymentMethodCategory: "card" | "link_bank") {
    if (checkoutBlocked) {
      return showError(checkoutReadiness.blockingReason || "Parent payments are not ready for this school yet.");
    }
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice?.productCheckoutAvailable || invoice.status !== "OPEN") {
      return showError("This product invoice is not available for checkout.");
    }
    if (invoice.pendingPayment) {
      return showError(pendingPaymentMessage(invoice.pendingPayment));
    }
    startTransition(async () => {
      const response = await fetch("/api/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          paymentMethodCategory,
          returnPath: "/parent-portal",
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; url?: string } | null;
      if (!response.ok || !json?.url) {
        return showError(json?.error || "Product checkout could not be opened.");
      }
      window.location.href = json.url;
    });
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

  function managePaymentMethod(action: "setup" | "portal" | "enable_autopay" | "disable_autopay", paymentMethodCategory: "ach" | "card" | "link_bank" | "default" = "default") {
    if (!family) return showError("A family profile is required before saving payment methods.");
    if (action !== "setup" && !billingAccount) return showError("Save a payment method before managing autopay settings.");
    if (action === "enable_autopay" && !window.confirm(
      "Enable autopay? The one selected saved method will pay open invoices on or after their due date. Weekly tuition invoices are created separately, and the amount charged is the unpaid invoice balance.",
    )) return;
    startTransition(async () => {
      setAutopayConfirmation("");
      setAutopayEnableRequirements([]);
      const response = await fetch("/api/billing/payment-method-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingAccountId: billingAccount?.id,
          familyId: family.id,
          action,
          paymentMethodCategory,
          returnPath: "/parent-portal",
        }),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        url?: string;
        autopayEnableRequirements?: Array<{ code: string; message: string }>;
      } | null;
      if (!response.ok) {
        if (action === "enable_autopay" && json?.autopayEnableRequirements?.length) {
          setAutopayEnableRequirements(json.autopayEnableRequirements.map((requirement) => requirement.message));
        } else {
          setAutopayEnableRequirements([]);
        }
        return showError(json?.error || "Payment method management is not configured yet.");
      }
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      const confirmation = action === "enable_autopay"
        ? "Autopay is enabled. The saved method will be used for eligible open invoices on or after their due date."
        : action === "disable_autopay"
          ? "Autopay is disabled. Your saved payment method remains available for one-time payments."
          : "Payment method settings updated. Autopay was not changed.";
      if (action === "enable_autopay" || action === "disable_autopay") {
        setAutopayStatusOverride(action === "enable_autopay" ? "enabled" : "disabled");
      }
      setAutopayConfirmation(confirmation);
      showStatus(confirmation);
      router.refresh();
    });
  }

  function toggleAutopay(enabled: boolean) {
    if (!family) return;
    if (enabled === (autopayStatus === "enabled")) return;
    if (enabled && !autopayCanEnable) {
      setAutopayEnableRequirements(autopayLocalRequirements);
      return;
    }
    managePaymentMethod(enabled ? "enable_autopay" : "disable_autopay");
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
    setPasswordConfirmation("");
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
      const confirmation = "Password changed successfully. Use your new password the next time you sign in.";
      setPasswordConfirmation(confirmation);
      showStatus(confirmation);
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
        {availableFamilies.length > 1 ? (
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Choose family profile">
            {availableFamilies.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={item.id === family.id ? "default" : "outline"}
                nativeButton={false}
                render={<Link href={`/parent-portal?familyId=${encodeURIComponent(item.id)}`} />}
              >
                <Building2 data-icon="inline-start" />
                {item.name}{item.centerName ? ` · ${item.centerName}` : ""}
              </Button>
            ))}
          </div>
        ) : null}
      </section>

      {demoMode ? (
        <Alert className="border-primary/30 bg-primary/10">
          <ShieldCheck className="size-4" />
          <AlertTitle>Read-only workspace</AlertTitle>
          <AlertDescription>
            This parent portal preview is read-only. Changes are not saved as live family data.
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

      <section id="today" className="scroll-mt-28 overflow-hidden rounded-2xl border border-primary/20 bg-card/85 shadow-xl shadow-black/[0.07]" aria-labelledby="parent-today-heading">
        <div className="border-b border-border/70 bg-gradient-to-r from-primary/[0.10] via-transparent to-transparent p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Badge className="mb-3" variant="secondary"><CalendarDays data-icon="inline-start" /> Today</Badge>
              <h2 id="parent-today-heading" className="text-2xl font-semibold tracking-tight text-pretty sm:text-3xl">Your Child’s Day at a Glance</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Current check-in evidence, assigned classroom, schedule, and shared daily report status from your existing family records.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="#daily-updates" className="inline-flex min-h-10 items-center gap-2 rounded-lg border bg-background/70 px-3 text-sm font-medium transition-colors hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Camera className="size-4" aria-hidden="true" /> Updates</a>
              <a href="#recent-messages" className="inline-flex min-h-10 items-center gap-2 rounded-lg border bg-background/70 px-3 text-sm font-medium transition-colors hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><MessageSquare className="size-4" aria-hidden="true" /> Messages</a>
              <a href="#billing" className="inline-flex min-h-10 items-center gap-2 rounded-lg border bg-background/70 px-3 text-sm font-medium transition-colors hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><CreditCard className="size-4" aria-hidden="true" /> Billing</a>
            </div>
          </div>
        </div>
        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
          {family.children.map((child) => (
            <article key={child.id} className="min-w-0 rounded-2xl border bg-background/60 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold">{child.preferredName || child.fullName}</h3>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{child.classroom?.name || "Classroom not assigned"}</p>
                </div>
                <Badge variant={todayStatusVariant(child.today?.status)}>{child.today?.label || "Not marked today"}</Badge>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="min-w-0 rounded-xl border bg-card/70 p-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Today’s Schedule</dt>
                  <dd className="mt-1 line-clamp-2 break-words font-medium">{scheduleSummary(child.schedule)}</dd>
                </div>
                <div className="min-w-0 rounded-xl border bg-card/70 p-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current Location</dt>
                  <dd className="mt-1 truncate font-medium">{child.today?.currentLocationName || (child.today?.status === "checked_out" ? "Checked out" : "No live location shared")}</dd>
                </div>
                <div className="min-w-0 rounded-xl border bg-card/70 p-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Latest Attendance Event</dt>
                  <dd className="mt-1 font-medium">{child.today?.latestEventAt ? formatTime(child.today.latestEventAt) : "No event recorded today"}</dd>
                </div>
                <div className="min-w-0 rounded-xl border bg-card/70 p-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Daily Report</dt>
                  <dd className="mt-1 font-medium">{child.today?.dailyReportShared ? "Shared today" : "Not shared yet"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-panel">
          <CardHeader>
            <CardDescription>Selected day</CardDescription>
            <CardTitle>{latestReport ? formatDate(latestReport.date) : "None yet"}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel">
          <CardHeader>
            <CardDescription>Shared photos</CardDescription>
            <CardTitle>{selectedUpdateDay?.media.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel">
          <CardHeader>
            <CardDescription>Activities</CardDescription>
            <CardTitle>{selectedUpdateDay?.activities.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="glass-panel">
          <CardHeader>
            <CardDescription>Daily reports</CardDescription>
            <CardTitle>{selectedUpdateDay?.reports.length ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <section id="daily-updates" className="scroll-mt-28 rounded-2xl border bg-card/90 p-4 shadow-2xl shadow-black/15 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Badge className="mb-3">
              <Sparkles data-icon="inline-start" />
              Daily updates
            </Badge>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Daily Reports, Activities, and Photos</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Choose a date to see the reports, classroom activities, and photo moments shared for that day.
            </p>
          </div>
          <div className="w-full sm:w-80">
            <Label className="sr-only" htmlFor="parent-update-day">Choose update day</Label>
            <Select value={selectedUpdateDay?.key ?? ""} onValueChange={(value) => setSelectedUpdateDayKey(value ?? "")}>
              <SelectTrigger id="parent-update-day" className="w-full" aria-label="Choose update day">
                <CalendarDays data-icon="inline-start" />
                <SelectValue placeholder="No updates yet" />
              </SelectTrigger>
              <SelectContent align="end">
                {dailyUpdateDays.map((day) => (
                  <SelectItem key={day.key} value={day.key}>
                    {formatDate(day.date)} · {day.totalItems} update{day.totalItems === 1 ? "" : "s"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              {(selectedUpdateDay?.reports ?? []).map((report, index, reportsForDay) => {
                const timedCareEvents = dailyReportTimedCareEvents(report);
                const isLatest = index === reportsForDay.length - 1;
                return (
                  <div
                    key={report.id}
                    className={`rounded-xl border p-4 ${isLatest ? "bg-primary/10 shadow-sm" : "bg-background/40"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{report.child.fullName}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(report.date)}</div>
                      </div>
                      {isLatest ? <Badge>Latest</Badge> : null}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{report.teacherNote ?? report.mood ?? "No teacher note added."}</p>
                    {report.suppliesNeeded ? <Badge className="mt-3" variant="outline">Needs {report.suppliesNeeded}</Badge> : null}
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                      {report.meals?.map((meal) => (
                        <span key={meal.id}>Meal: {meal.mealType} · {meal.food}{meal.amount ? ` · ${meal.amount}` : ""}</span>
                      ))}
                      {timedCareEvents.map((event) => event.kind === "nap" ? (
                        <span key={`nap-${event.id}`}>Nap: {formatTime(event.startsAt)} - {formatTime(event.endsAt ?? null)}</span>
                      ) : (
                        <span key={`diaper-${event.id}`}>Potty/diaper: {event.type} · {formatTime(event.occurredAt)}{event.notes ? ` · ${event.notes}` : ""}</span>
                      ))}
                      {!report.naps?.length && /\bno nap\b/i.test(report.teacherNote ?? "") ? (
                        <span>Nap: No nap today</span>
                      ) : null}
                      {report.activities?.slice(0, 4).map((activity) => (
                        <span key={activity.id}>Activity: {activity.title}{activity.notes ? ` · ${activity.notes}` : ""}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!selectedUpdateDay?.reports.length ? (
                <p className="text-sm text-muted-foreground">No daily report was shared for this day.</p>
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
                {(selectedUpdateDay?.media ?? []).slice(0, 1).map((item) => {
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
                  {(selectedUpdateDay?.media ?? []).slice(1, 5).map((item) => {
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
                {!selectedUpdateDay?.media.length ? <p className="text-sm text-muted-foreground">No shared photos were added for this day.</p> : null}
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
                {(selectedUpdateDay?.activities ?? []).map((activity) => (
                  <div key={`${activity.id}-${activity.childName}`} className="rounded-xl border bg-background/40 p-3">
                    <div className="text-sm font-medium">{activity.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{activity.childName}</div>
                    {activity.notes ? <p className="mt-2 text-sm text-muted-foreground">{activity.notes}</p> : null}
                  </div>
                ))}
                {!selectedUpdateDay?.activities.length ? (
                  <p className="text-sm text-muted-foreground">No classroom activities were logged for this day.</p>
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border bg-background/40 p-4">
                <div className="text-xs text-muted-foreground">Balance due</div>
                <div className="mt-1 text-2xl font-semibold">{parentBalanceReviewRequired ? "Agency split under review" : money(balanceCents)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {parentBalanceReviewRequired
                    ? "You can still choose an amount to pay toward your account. Agency responsibility remains hidden."
                    : "Only your family responsibility is included."}
                </div>
              </div>
              <div className="rounded-xl border bg-background/40 p-4">
                <div className="text-xs text-muted-foreground">Latest account activity</div>
                {latestAccountLedgerEntry ? (
                  <>
                    <div className="mt-1 truncate font-medium">{latestAccountLedgerEntry.description}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDate(latestAccountLedgerEntry.effectiveAt)}
                    </div>
                  </>
                ) : (
                  <div className="mt-1 font-medium">No account activity recorded</div>
                )}
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
            {family.children.some((child) => child.tuitionAssignment?.enabled && (child.tuitionAssignment.amountCents ?? 0) > 0) ? (
              <div className="rounded-xl border bg-background/40 p-4">
                <div className="font-medium">Tuition billing cycle</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your weekly rate stays the same. Choose weekly invoices or one invoice every four weeks that covers the next four weeks. This choice does not create an opening balance or turn on autopay.
                </p>
                <div className="mt-3 space-y-3">
                  {family.children.filter((child) => child.tuitionAssignment?.enabled && (child.tuitionAssignment.amountCents ?? 0) > 0).map((child) => {
                    const cadence = tuitionCadenceDrafts[child.id] ?? (child.tuitionAssignment?.cadence === "four_week" ? "four_week" : "weekly");
                    const weeklyAmount = child.tuitionAssignment?.amountCents ?? 0;
                    return (
                      <div key={child.id} className="grid gap-3 rounded-lg bg-background/35 p-3 sm:grid-cols-[1fr_minmax(15rem,auto)_auto] sm:items-end">
                        <div>
                          <div className="text-sm font-medium">{child.fullName}</div>
                          <div className="text-xs text-muted-foreground">{money(weeklyAmount)}/week · {child.tuitionAssignment?.tuitionPlanName ?? "Tuition"}</div>
                        </div>
                        <div className="space-y-1">
                          <Label>Billing cycle</Label>
                          <Select value={cadence} onValueChange={(value) => value && setTuitionCadenceDrafts((current) => ({ ...current, [child.id]: value }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="weekly">Weekly · {money(weeklyAmount)}</SelectItem>
                              <SelectItem value="four_week">Every 4 weeks · {money(weeklyAmount * 4)}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button disabled={isPending} onClick={() => saveTuitionCadence(child)} variant="outline">Save cycle</Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="mb-3">
                <div className="font-medium">Account ledger</div>
                <div className="text-xs text-muted-foreground">Family-responsible charges, credits, payments, and adjustments. Agency subsidy activity remains visible to your school.</div>
              </div>
              <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1">
                {ledgerEntries.map((entry) => (
                  <div key={entry.id} className="grid gap-1 rounded-lg bg-background/35 p-3 text-sm sm:grid-cols-[1fr_auto]">
                    <div>
                      <div className="font-medium">{entry.description}</div>
                      <div className="text-xs text-muted-foreground">{entry.type.replaceAll("_", " ")} · {formatDate(entry.effectiveAt)}</div>
                    </div>
                  </div>
                ))}
                {!ledgerEntries.length ? <p className="text-sm text-muted-foreground">No ledger entries are visible yet.</p> : null}
              </div>
              {ledgerPagination && (ledgerPagination.hasPrevious || ledgerPagination.hasNext) ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    Page {ledgerPagination.page} · Up to {ledgerPagination.pageSize} entries per page
                  </p>
                  <div className="flex gap-2">
                    {ledgerPagination.hasPrevious ? (
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/parent-portal?familyId=${encodeURIComponent(family?.id ?? "")}&ledgerPage=${ledgerPagination.page - 1}`} />}
                      >
                        Previous
                      </Button>
                    ) : null}
                    {ledgerPagination.hasNext ? (
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={`/parent-portal?familyId=${encodeURIComponent(family?.id ?? "")}&ledgerPage=${ledgerPagination.page + 1}`} />}
                      >
                        Next
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <ReceiptText className="size-4 text-primary" />
                Recent payments
              </div>
              <div className="space-y-2">
                {parentVisiblePayments.slice(0, 5).map((payment) => {
                  const completed = payment.status === "PAID";
                  return (
                    <div key={payment.id} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                      <span className="text-muted-foreground">
                        {paymentProviderLabel(payment.provider)} · {paymentListLabel(payment, timeZone)}
                      </span>
                      <span className={completed ? "font-medium text-emerald-700 dark:text-emerald-300" : "font-medium text-muted-foreground"}>
                        {completed ? "−" : ""}{money(payment.amountCents)}
                      </span>
                    </div>
                  );
                })}
                {!parentVisiblePayments.length ? <p className="text-sm text-muted-foreground">No family payments have been posted to this account yet.</p> : null}
              </div>
            </div>
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    Payment Methods and Autopay
                    <InfoTip label="About payment methods and autopay">
                      Saving a debit/credit card or bank account does not enable autopay. Enable it separately, or make a one-time payment on an open invoice below.
                    </InfoTip>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {autopayStatus === "enabled"
                      ? "Autopay is enabled and will charge eligible open tuition invoices automatically."
                      : paymentMethodManagement?.hasSavedPaymentMethod
                        ? `${paymentMethodManagement.paymentMethodLabel ?? "Payment method saved securely"}${paymentMethodManagement.lastUpdatedAt ? ` on ${formatDate(paymentMethodManagement.lastUpdatedAt)}` : ""}`
                        : paymentMethodManagement?.autopayStatus === "pending"
                          ? "Bank verification is pending."
                          : "No saved payment method yet."}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="parent-autopay-toggle" className="text-xs text-muted-foreground">Autopay</Label>
                  <Switch
                    id="parent-autopay-toggle"
                    checked={autopayStatus === "enabled"}
                    onCheckedChange={toggleAutopay}
                    disabled={isPending || !family || autopayStatus === "pending"}
                    aria-label="Enable or disable autopay"
                  />
                  <span className="text-xs font-medium text-muted-foreground">
                    {autopayStatus === "enabled" ? "On" : "Off"}
                  </span>
                </div>
              </div>
              {autopayConfirmation ? (
                <Alert className="mt-4 border-emerald-500/30 bg-emerald-500/10">
                  <CheckCircle2 />
                  <AlertTitle>Autopay status confirmed</AlertTitle>
                  <AlertDescription>{autopayConfirmation}</AlertDescription>
                </Alert>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button className="w-full sm:w-auto" disabled={isPending || !family} onClick={() => managePaymentMethod("setup", "card")}>
                  <CreditCard data-icon="inline-start" />
                  {paymentMethodManagement?.hasSavedPaymentMethod ? "Replace Saved Card" : "Save Card"}
                </Button>
                <Button className="w-full sm:w-auto" disabled={isPending || !family} onClick={() => managePaymentMethod("setup", "link_bank")} variant="outline">
                  <Building2 data-icon="inline-start" />
                  {paymentMethodManagement?.autopayStatus === "pending" ? "Verify Bank Instantly" : paymentMethodManagement?.hasSavedPaymentMethod ? "Instant Bank Login" : "Set Up Instant Bank"}
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  disabled={isPending || !paymentMethodManagement?.hasStripeCustomer}
                  onClick={() => managePaymentMethod("portal")}
                  variant="outline"
                >
                  Manage Payment Method
                </Button>
              </div>
            </div>
            {autopayRequirements.length ? (
              <Alert className="mt-3">
                <AlertCircle className="size-4" />
                <AlertTitle>Autopay requirements</AlertTitle>
                <AlertDescription className="space-y-1">
                  {autopayRequirements.map((requirement) => (
                    <p key={requirement}>{requirement}</p>
                  ))}
                </AlertDescription>
              </Alert>
            ) : null}
            {showFamilyPaymentPanel ? (
              <div className="rounded-xl border bg-primary/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">{parentBalanceReviewRequired ? "Make an account payment" : "Pay today"}</div>
                    <div className="font-medium">
                      {parentBalanceReviewRequired
                        ? "Choose the amount you want credited to your family account."
                        : nextOpenInvoice
                          ? <>Family balance {money(balanceCents)} · {nextOpenInvoice.number} due {formatDate(nextOpenInvoice.dueDate)}</>
                          : <>Family balance {money(balanceCents)} · available for secure account payment</>}
                    </div>
                  </div>
                  {parentBalanceReviewRequired ? (
                    <div className="w-full space-y-1 sm:w-48">
                      <Label htmlFor="account-payment-amount">Amount to pay</Label>
                      <Input
                        id="account-payment-amount"
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        placeholder="0.00"
                        value={accountPaymentAmountDollars}
                        onChange={(event) => setAccountPaymentAmountDollars(event.target.value)}
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button className="w-full sm:w-auto" disabled={isPending || checkoutBlocked || (parentBalanceReviewRequired && accountPaymentAmountCents <= 0)} onClick={() => payBalance("card")}>
                      <CreditCard data-icon="inline-start" />
                      Debit/Credit Card
                    </Button>
                    <Button className="w-full sm:w-auto" disabled={isPending || checkoutBlocked || (parentBalanceReviewRequired && accountPaymentAmountCents <= 0)} onClick={() => payBalance("link_bank")} variant="outline">
                      <Building2 data-icon="inline-start" />
                      Instant Bank
                    </Button>
                    <Button className="w-full sm:w-auto" disabled={isPending || checkoutBlocked || (parentBalanceReviewRequired && accountPaymentAmountCents <= 0)} onClick={() => payBalance("ach")} variant="outline">
                      <Building2 data-icon="inline-start" />
                      Pay by Bank
                    </Button>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {paymentProcessingRecoverySummary({
                    achRecovery: 0,
                    cardRecovery: 0,
                    formatMoney: money,
                  })}
                </div>
                {!parentBalanceReviewRequired && openInvoices.length > 1 ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {openInvoices.length} open invoice records are listed below. Checkout uses only the family balance shown here.
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
                  <Button className="w-full sm:w-auto" disabled={isPending || checkoutBlocked || !selectedUniformProduct} onClick={() => buyUniform("card")}>
                    <CreditCard data-icon="inline-start" />
                    Buy With Card
                  </Button>
                  <Button className="w-full sm:w-auto" disabled={isPending || checkoutBlocked || !selectedUniformProduct} onClick={() => buyUniform("link_bank")} variant="outline">
                    <Building2 data-icon="inline-start" />
                    Buy With Instant Bank
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="pt-2">
              <div className="font-medium">Invoice history</div>
              <div className="text-xs text-muted-foreground">Invoice records are listed without agency subsidy amounts. Use the family Balance due and Account ledger above for what you owe.</div>
            </div>
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
                  {invoice.productCheckoutAvailable && invoice.status === "OPEN" && !invoiceHasPendingPayment ? (
                    <div className="flex basis-full flex-wrap gap-2 sm:justify-end">
                      <Button className="w-full sm:w-auto" disabled={isPending || checkoutBlocked} onClick={() => payProductInvoice(invoice.id, "card")}>
                        <CreditCard data-icon="inline-start" />
                        Pay Product by Card
                      </Button>
                      <Button className="w-full sm:w-auto" disabled={isPending || checkoutBlocked} onClick={() => payProductInvoice(invoice.id, "link_bank")} variant="outline">
                        <Building2 data-icon="inline-start" />
                        Pay Product by Bank
                      </Button>
                    </div>
                  ) : null}
                  {invoice.pendingPayment ? (
                    <div className="basis-full rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                      {pendingPaymentMessage(invoice.pendingPayment)}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!invoices.length ? <p className="text-sm text-muted-foreground">No invoices are visible yet.</p> : null}
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
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>Record type</span>
                  <select className="h-10 w-full rounded-md border bg-background px-3" value={requestEntity} onChange={(event) => { setRequestEntity(event.target.value as typeof requestEntity); setRequestTargetId(""); }}>
                    <option value="emergency_contact">Emergency contact</option>
                    <option value="authorized_pickup">Authorized pickup</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>Change</span>
                  <select className="h-10 w-full rounded-md border bg-background px-3" value={requestOperation} onChange={(event) => { setRequestOperation(event.target.value as typeof requestOperation); setRequestTargetId(""); }}>
                    <option value="add">Add</option>
                    <option value="update">Update</option>
                    <option value="remove">Remove</option>
                  </select>
                </label>
              </div>
              {requestOperation !== "add" ? (
                <label className="block space-y-1 text-sm">
                  <span>Existing record</span>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={requestTargetId}
                    onChange={(event) => {
                      const id = event.target.value;
                      setRequestTargetId(id);
                      const records = requestEntity === "emergency_contact" ? (family.emergencyContacts ?? []) : (family.pickups ?? []);
                      const selected = records.find((item) => item.id === id);
                      setRequestName(selected?.fullName ?? "");
                      setRequestPhone(selected?.phone ?? "");
                      setRequestRelation(selected?.relation ?? "");
                    }}
                  >
                    <option value="">Choose a record</option>
                    {(requestEntity === "emergency_contact" ? (family.emergencyContacts ?? []) : (family.pickups ?? [])).map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
                  </select>
                </label>
              ) : null}
              {requestOperation !== "remove" ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input aria-label="Contact name" placeholder="Full name" value={requestName} onChange={(event) => setRequestName(event.target.value)} />
                  <Input aria-label="Contact phone" placeholder="Phone" value={requestPhone} onChange={(event) => setRequestPhone(event.target.value)} />
                  <Input aria-label="Contact relationship" placeholder="Relationship" value={requestRelation} onChange={(event) => setRequestRelation(event.target.value)} />
                </div>
              ) : null}
              <Textarea id="contact-request" placeholder="Reason or helpful details for the director" value={requestDetails} onChange={(event) => setRequestDetails(event.target.value)} />
              <Button className="w-full sm:w-auto" disabled={isPending || !requestDetails.trim() || ((requestOperation === "update" || requestOperation === "remove") && !requestTargetId) || (requestOperation !== "remove" && (!requestName.trim() || !requestPhone.trim() || !requestRelation.trim()))} onClick={requestContactUpdate}>
                <FileText data-icon="inline-start" />
                Submit Request
              </Button>
            </div>
          </CardContent>
        </Card>
        ) : null}
      </div>

      <Card id="recent-messages" className="glass-panel scroll-mt-28">
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
          {passwordConfirmation ? (
            <Alert className="border-emerald-500/30 bg-emerald-500/10">
              <CheckCircle2 />
              <AlertTitle>Password changed</AlertTitle>
              <AlertDescription>{passwordConfirmation}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowPasswords((visible) => !visible)}>
              {showPasswords ? <EyeOff data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
              {showPasswords ? "Hide passwords" : "Show passwords"}
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="profile-current-password">Current password</Label>
              <Input
                id="profile-current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                type={showPasswords ? "text" : "password"}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="profile-new-password">New password</Label>
              <Input
                id="profile-new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type={showPasswords ? "text" : "password"}
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
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
              />
            </div>
          </div>
          <Button className="w-full sm:w-auto" disabled={isPending} onClick={updateProfilePassword}>
            <KeyRound data-icon="inline-start" />
            Update Password
          </Button>
          <div className="flex flex-col gap-3 rounded-xl border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">Need help with access, payments, or documents?</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Use the support page for recovery steps and safe contact guidance. Call your school directly for urgent child, pickup, medical, or custody concerns.
              </p>
            </div>
            <Button className="w-full shrink-0 sm:w-auto" variant="outline" nativeButton={false} render={<Link href="/support" />}>
              <LifeBuoy data-icon="inline-start" />
              Open Support
            </Button>
          </div>
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
