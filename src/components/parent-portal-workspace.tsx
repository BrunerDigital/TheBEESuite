"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ComponentPropsWithoutRef, Dispatch, SetStateAction } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { InvoicePrintButton, PaymentReceiptPrintButton } from "@/components/billing-print-actions";
import { formatZonedDateTime } from "@/lib/zoned-date-time";
import {
  AlertCircle,
  ArrowRight,
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
  Home,
  KeyRound,
  LifeBuoy,
  LoaderCircle,
  MessageSquare,
  Minus,
  Paperclip,
  Plus,
  ReceiptText,
  Reply,
  SendHorizontal,
  ShoppingBag,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ParentKioskCredentialPanel } from "@/components/parent-kiosk-credential-panel";
import { CollapsiblePanel } from "@/components/workspace-preferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { GuardianKioskCredential } from "@/lib/kiosk-credentials";
import type { MessageAttachmentView } from "@/lib/message-attachments";
import { replySubject } from "@/lib/message-reply-routing";
import type { StripeCheckoutReadiness } from "@/lib/stripe-connect-readiness";
import { isParentVisiblePayment } from "@/lib/parent-billing-visibility";
import type { ParentPortalTodayState } from "@/lib/parent-portal-today";
import {
  PARENT_PORTAL_FAMILY_SECTIONS,
  parentPortalWorkspaceHref,
  type ParentPortalFamilySection,
  type ParentPortalView,
} from "@/lib/parent-portal-navigation";
import styles from "@/components/message-conversation.module.css";
import {
  dailyReportTimedCareEvents,
  sortDailyReportsChronologically,
} from "@/lib/daily-report-ordering";

function ParentPortalDocumentLink({
  href,
  ...props
}: ComponentPropsWithoutRef<"a"> & { href: string }) {
  return <a href={href} {...props} />;
}

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
  profilePhotoUrl?: string | null;
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
  familyDocumentAmountCents?: number | null;
  childName?: string | null;
  servicePeriodStart?: string | null;
  servicePeriodEnd?: string | null;
  items?: Array<{ description: string; amountCents: number }>;
};

type Payment = {
  id: string;
  amountCents: number;
  principalAmountCents?: number | null;
  processingRecoveryCents?: number | null;
  status: string;
  provider: string;
  paidAt: string | Date | null;
  externalIdPlaceholder?: string | null;
  invoiceNumber?: string | null;
  paymentReferenceLabel?: string;
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
  checkInAt?: string | Date | null;
  checkOutAt?: string | Date | null;
  child: { fullName: string };
  meals?: Array<{
    id: string;
    mealType: string;
    food: string;
    amount: string | null;
  }>;
  naps?: Array<{
    id: string;
    startsAt: string | Date;
    endsAt: string | Date | null;
  }>;
  diapers?: Array<{
    id: string;
    type: string;
    occurredAt: string | Date;
    notes: string | null;
  }>;
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
  centerId?: string | null;
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
  pickups?: Array<{
    id: string;
    fullName: string;
    phone: string | null;
    relation: string | null;
  }>;
  emergencyContacts?: Array<{
    id: string;
    fullName: string;
    phone: string;
    relation: string;
  }>;
  children: Child[];
};

type ParentMedia = {
  id: string;
  url: string;
  caption: string | null;
  createdAt: string | Date;
  child: { fullName: string };
};

type ClassroomTeacherRecipient = {
  id: string;
  name: string;
  classroomNames: string[];
};

type DailyUpdateDay = {
  key: string;
  date: string | Date;
  reports: DailyReport[];
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

function normalizeParentFamilySection(
  value: string | undefined,
): ParentPortalFamilySection {
  return PARENT_PORTAL_FAMILY_SECTIONS.includes(
    value as ParentPortalFamilySection,
  )
    ? (value as ParentPortalFamilySection)
    : "children";
}

const parentViewCopy: Record<
  ParentPortalView,
  { title: string; description: string }
> = {
  home: {
    title: "Your family",
    description:
      "See today’s status, important updates, and the next things that need your attention.",
  },
  updates: {
    title: "Daily history",
    description:
      "Choose a date to review that day’s report, activities, and photos.",
  },
  messages: {
    title: "Messages",
    description: "Private conversation with your school.",
  },
  payments: {
    title: "Payments",
    description:
      "View your balance, make a payment, and review invoices and account activity.",
  },
  family: {
    title: "Family",
    description:
      "Manage family information, school check-in tools, documents, and account settings.",
  },
};

type Props = {
  activeView?: ParentPortalView;
  familySection?: string;
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
  paymentTransitionActive?: boolean;
  paymentMethodReauthorizationRequired?: boolean;
  paymentMethodReauthorizationPreservesAutopay?: boolean;
  parentBalanceReviewRequired?: boolean;
  parentBalanceVisibilityConfirmed?: boolean;
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
  messages: Array<{
    id: string;
    subject: string | null;
    body: string;
    channel?: string;
    createdAt: string | Date;
    sender?: { name: string; role?: string } | null;
    isFromFamily?: boolean;
    attachments?: MessageAttachmentView[];
  }>;
  documents: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    expiresAt: string | Date | null;
    storageKey?: string | null;
    downloadUrl?: string | null;
  }>;
  media?: ParentMedia[];
  announcements?: Array<{
    id: string;
    title: string;
    body: string;
    sendAt: string | Date | null;
  }>;
  uniformProducts?: UniformProductOption[];
  currentGuardianId?: string | null;
  kioskCredentials?: GuardianKioskCredential[];
  notificationPreferences?: Partial<NotificationPreferences> | null;
  accountDeletionRequest?: AccountDeletionRequestSummary | null;
  replyDraft?: {
    replyToMessageId: string;
    subject?: string | null;
  } | null;
  availableFamilies?: Array<{
    id: string;
    name: string;
    centerName: string | null;
    childNames: string[];
  }>;
  centerName?: string | null;
  centerEin?: string | null;
  centerTimeZone?: string | null;
  classroomTeachers?: ClassroomTeacherRecipient[];
  demoMode?: boolean;
  previewMode?: boolean;
};

type PaymentCheckoutMethod = "ach" | "card" | "link_bank" | null;

type ParentPortalWorkspaceViewProps = Props & {
  paymentCheckoutMethod: PaymentCheckoutMethod;
  setPaymentCheckoutMethod: Dispatch<SetStateAction<PaymentCheckoutMethod>>;
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

const signaturePendingStorageKeys = new Set([
  "internal_signature_pending",
  "signature_provider_pending",
]);

const fallbackCheckoutReadiness: StripeCheckoutReadiness = {
  accountId: null,
  chargesEnabled: true,
  payoutsEnabled: true,
  detailsSubmitted: true,
  requirementFields: [],
  pendingVerificationFields: [],
  merchantCapabilityStatus: "active",
  merchantPayoutCapabilityStatus: "active",
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
const parentPortalDocumentsEnabled =
  process.env.NEXT_PUBLIC_PARENT_PORTAL_DOCUMENTS_ENABLED !== "0";

function requiresDocumentSignature(document: { storageKey?: string | null }) {
  return signaturePendingStorageKeys.has(
    (document.storageKey || "").trim().toLowerCase(),
  );
}

function formatDateInTimeZone(value: string | Date | null, timeZone: string) {
  return formatZonedDateTime(value, timeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function guardianFirstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const DISPLAY_ACRONYMS: Record<string, string> = {
  ach: "ACH",
  id: "ID",
  qr: "QR",
  sms: "SMS",
};

function displayTokenLabel(
  value: string | null | undefined,
  fallback = "Not available",
) {
  const normalized = value?.trim();
  if (!normalized) return fallback;

  return normalized
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      return (
        DISPLAY_ACRONYMS[lower] ??
        `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
      );
    })
    .join(" ");
}

function communicationPreferenceLabel(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "Not listed";
  if (normalized === "sms" || normalized === "text") return "Text message";
  if (normalized === "portal") return "Parent Portal";
  if (normalized === "portal + sms") return "Parent Portal and text message";
  if (normalized === "email + sms") return "Email and text message";
  return displayTokenLabel(value);
}

function paymentMethodCategoryLabel(category: string | null | undefined) {
  switch (category) {
    case "ach":
      return "Bank account";
    case "link_bank":
      return "Stripe Link";
    case "card":
      return "Debit or credit card";
    default:
      return "Payment";
  }
}

function pendingPaymentCategory(
  payment: Pick<
    PendingInvoicePayment,
    "paymentMethodCategory" | "requestedPaymentMethodCategory"
  >,
) {
  return (
    payment.paymentMethodCategory || payment.requestedPaymentMethodCategory
  );
}

function pendingPaymentMessage(payment: PendingInvoicePayment) {
  const label = paymentMethodCategoryLabel(pendingPaymentCategory(payment));
  if (label === "Debit or credit card") {
    return "A card checkout is already pending for this invoice. Complete or expire it before starting another checkout.";
  }
  if (label === "Stripe Link") {
    return "A Stripe Link payment is processing. The invoice will update when the payment processor confirms it.";
  }
  return `${label} payment is processing. Bank payments can take a few business days to settle; the invoice will update when the payment processor confirms the funds.`;
}

function paymentFields(payment: Payment) {
  return recordFromUnknown(payment.customFields);
}

function isProcessingPayment(payment: Payment) {
  const status = textField(paymentFields(payment).status);
  return (
    payment.status === "DRAFT" &&
    (status === "checkout_created" || status === "checkout_pending")
  );
}

function paymentListLabel(payment: Payment, timeZone: string) {
  if (isProcessingPayment(payment)) {
    const fields = paymentFields(payment);
    const category =
      textField(fields.paymentMethodCategory) ||
      textField(fields.requestedPaymentMethodCategory);
    return `${paymentMethodCategoryLabel(category)} processing`;
  }
  if (payment.status === "PAID")
    return `Paid · ${formatDateInTimeZone(payment.paidAt, timeZone)}`;
  return displayTokenLabel(payment.status);
}

function paymentProviderLabel(provider: string) {
  if (provider === "stripe") return "Online payment";
  if (provider === "stripe_terminal") return "In-person card payment";
  if (provider === "manual_check") return "Check payment";
  if (provider === "manual_cash") return "Cash payment";
  return "Other payment";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`;
}

const MAX_UNIFORM_PURCHASE_QUANTITY = 12;

function clampUniformQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(
    MAX_UNIFORM_PURCHASE_QUANTITY,
    Math.max(1, Math.round(value)),
  );
}

function formatTimeInTimeZone(value: string | Date | null, timeZone: string) {
  return formatZonedDateTime(value, timeZone, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function renderableImageSrc(value: string | null | undefined) {
  if (!value) return null;
  if (
    value.startsWith("/") ||
    value.startsWith("https://") ||
    value.startsWith("http://") ||
    value.startsWith("data:image/")
  ) {
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
      .map(
        ([key, item]) =>
          `${displayTokenLabel(key)}: ${Array.isArray(item) ? item.join(", ") : String(item)}`,
      )
      .join(" · ");
  }
  return String(value);
}

function todayStatusVariant(
  status: ParentPortalTodayState["status"] | undefined,
) {
  if (status === "absent") return "destructive" as const;
  if (status === "checked_in" || status === "present")
    return "default" as const;
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

async function parentPortalRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    return await fetch(input, init);
  } catch {
    return new Response(
      JSON.stringify({
        error:
          "We could not reach The BEE Suite. Check your connection and try again.",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export function ParentPortalWorkspace(props: Props) {
  const activeView = props.activeView ?? "home";
  const familySection = normalizeParentFamilySection(props.familySection);
  const familyId = props.family?.id ?? "no-family";
  const [paymentCheckoutMethod, setPaymentCheckoutMethod] =
    useState<PaymentCheckoutMethod>(null);

  return (
    <ParentPortalWorkspaceView
      key={`${familyId}:${activeView}:${familySection}`}
      {...props}
      activeView={activeView}
      familySection={familySection}
      paymentCheckoutMethod={paymentCheckoutMethod}
      setPaymentCheckoutMethod={setPaymentCheckoutMethod}
    />
  );
}

function ParentPortalWorkspaceView({
  activeView = "home",
  familySection,
  family,
  billingAccount,
  checkoutReadiness = fallbackCheckoutReadiness,
  paymentTransitionActive = false,
  paymentMethodReauthorizationRequired = false,
  paymentMethodReauthorizationPreservesAutopay = false,
  parentBalanceReviewRequired = false,
  parentBalanceVisibilityConfirmed = false,
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
  centerName = null,
  centerEin = null,
  centerTimeZone = null,
  classroomTeachers = [],
  demoMode,
  previewMode = false,
  paymentCheckoutMethod,
  setPaymentCheckoutMethod,
}: ParentPortalWorkspaceViewProps) {
  const timeZone = useSchoolTimeZone();
  const formatDate = (value: string | Date | null) =>
    formatDateInTimeZone(value, timeZone);
  const formatTime = (value: string | Date | null) =>
    formatTimeInTimeZone(value, timeZone);
  const router = useRouter();
  const activeFamilySection = normalizeParentFamilySection(familySection);

  useEffect(() => {
    if (activeView !== "family") return;
    const activeSection = document.querySelector(
      "#parent-family-section-nav [aria-current='page']",
    );
    activeSection?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeFamilySection, activeView]);
  const activeViewCopy = parentViewCopy[activeView];
  const previewHrefBase = previewMode
    ? "/device-preview?view=parent"
    : undefined;
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [subject, setSubject] = useState(
    replyDraft?.replyToMessageId
      ? replySubject(replyDraft.subject)
      : "Question for the center",
  );
  const [message, setMessage] = useState("");
  const [messageRecipientId, setMessageRecipientId] = useState(
    classroomTeachers.length === 1 ? classroomTeachers[0].id : "school",
  );
  const [replyToMessageId, setReplyToMessageId] = useState(
    replyDraft?.replyToMessageId ?? "",
  );
  const [replyingToSubject, setReplyingToSubject] = useState(
    replyDraft?.subject ?? "",
  );
  const [messageAttachments, setMessageAttachments] = useState<File[]>([]);
  const [messageAttachmentInputKey, setMessageAttachmentInputKey] = useState(0);
  const messageTimelineRef = useRef<HTMLOListElement | null>(null);
  const [requestDetails, setRequestDetails] = useState("");
  const [requestEntity, setRequestEntity] = useState<
    "emergency_contact" | "authorized_pickup"
  >("emergency_contact");
  const [requestOperation, setRequestOperation] = useState<
    "add" | "update" | "remove"
  >("add");
  const [requestTargetId, setRequestTargetId] = useState("");
  const [requestName, setRequestName] = useState("");
  const [requestPhone, setRequestPhone] = useState("");
  const [requestRelation, setRequestRelation] = useState("");
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>(
    {},
  );
  const [documentFiles, setDocumentFiles] = useState<
    Record<string, File | null>
  >({});
  const [signatureAcknowledgements, setSignatureAcknowledgements] = useState<
    Record<string, boolean>
  >({});
  const [signatureNames, setSignatureNames] = useState<Record<string, string>>(
    {},
  );
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
  const [autopayError, setAutopayError] = useState("");
  const [autopayStatusOverride, setAutopayStatusOverride] = useState<
    "enabled" | "disabled" | null
  >(null);
  const [accountDeletionRequest, setAccountDeletionRequest] =
    useState<AccountDeletionRequestSummary | null>(
      initialAccountDeletionRequest,
    );
  const [accountDeletionDetails, setAccountDeletionDetails] = useState("");
  const [retentionNoticeAccepted, setRetentionNoticeAccepted] = useState(false);
  const [autopayEnableRequirements, setAutopayEnableRequirements] = useState<
    string[]
  >([]);
  const [uniformColor, setUniformColor] = useState<"Black" | "Yellow">(
    uniformProducts[0]?.color ?? "Black",
  );
  const [uniformSize, setUniformSize] = useState(
    uniformProducts[0]?.size ?? "2T",
  );
  const [uniformPurchaseOption, setUniformPurchaseOption] = useState<
    "single" | "bundle_5"
  >(uniformProducts[0]?.purchaseOption ?? "single");
  const [uniformQuantity, setUniformQuantity] = useState(1);
  const [selectedUpdateDayKey, setSelectedUpdateDayKey] = useState("");
  const [tuitionCadenceDrafts, setTuitionCadenceDrafts] = useState<
    Record<string, string>
  >({});
  const [accountPaymentAmountDollars, setAccountPaymentAmountDollars] =
    useState("");
  const [paymentCheckoutError, setPaymentCheckoutError] = useState("");
  const [isPending, startTransition] = useTransition();
  const passwordLengthReady = newPassword.length >= 8;
  const passwordsMatch =
    Boolean(confirmPassword) && newPassword === confirmPassword;
  const passwordUpdateReady =
    Boolean(currentPassword) && passwordLengthReady && passwordsMatch;
  let passwordGuidance = "Use at least 8 characters for your new password.";
  if (newPassword && !passwordLengthReady) {
    passwordGuidance = "Your new password needs at least 8 characters.";
  } else if (confirmPassword && !passwordsMatch) {
    passwordGuidance = "The new passwords do not match.";
  }

  useEffect(() => {
    if (activeView !== "messages") return;
    const timeline = messageTimelineRef.current;
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }, [activeView, messages.length]);

  function workspaceHref(
    view: ParentPortalView,
    options: {
      familyId?: string | null;
      section?: ParentPortalFamilySection | null;
      hash?: string | null;
    } = {},
  ) {
    return parentPortalWorkspaceHref({
      view,
      previewHrefBase,
      ...options,
    });
  }

  function saveTuitionCadence(child: Child) {
    if (previewOnly()) return;
    if (!family) {
      setError("Choose a linked family before changing the billing cycle.");
      return;
    }
    if (child.tuitionAssignment?.cadence === "monthly") {
      setError("Monthly tuition timing is managed by the school.");
      return;
    }
    const billingCadence =
      tuitionCadenceDrafts[child.id] ??
      (child.tuitionAssignment?.cadence === "biweekly"
        ? "biweekly"
        : child.tuitionAssignment?.cadence === "four_week"
          ? "four_week"
          : "weekly");
    startTransition(async () => {
      setStatus("");
      setError("");
      const response = await parentPortalRequest("/api/parent/tuition-cadence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: child.id, familyId: family.id, billingCadence }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        return setError(result?.error || "Billing cycle could not be saved.");
      setStatus(
        billingCadence === "four_week"
          ? `${child.fullName}'s tuition will be invoiced every four weeks for the four weeks ahead.`
          : billingCadence === "biweekly"
            ? `${child.fullName}'s tuition will be invoiced every two weeks for the two weeks ahead.`
            : `${child.fullName}'s tuition will be invoiced one week at a time.`,
      );
      router.refresh();
    });
  }

  const openInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.status === "OPEN"),
    [invoices],
  );
  const balanceCents = billingAccount?.balanceCents ?? 0;
  const payableOpenInvoices = useMemo(
    () =>
      balanceCents > 0
        ? openInvoices.filter((invoice) => !invoice.pendingPayment)
        : [],
    [balanceCents, openInvoices],
  );
  const pendingOpenInvoices = useMemo(
    () => openInvoices.filter((invoice) => invoice.pendingPayment),
    [openInvoices],
  );
  const nextOpenInvoice = useMemo(
    () =>
      payableOpenInvoices
        .slice()
        .sort(
          (left, right) =>
            new Date(left.dueDate).getTime() -
            new Date(right.dueDate).getTime(),
        )[0] ?? null,
    [payableOpenInvoices],
  );
  const firstPendingOpenInvoice = pendingOpenInvoices[0] ?? null;
  const accountPaymentAmountCents = paymentAmountCents(
    accountPaymentAmountDollars,
  );
  const accountPaymentAmountEntered = accountPaymentAmountDollars.trim() !== "";
  const accountPaymentAmountInvalid =
    accountPaymentAmountEntered && accountPaymentAmountCents <= 0;
  const accountPaymentAmountExceedsBalance =
    !parentBalanceReviewRequired && accountPaymentAmountCents > balanceCents;
  const accountPaymentRequestCents = accountPaymentAmountEntered
    ? accountPaymentAmountCents
    : balanceCents;
  const accountPaymentAmountRequired =
    parentBalanceReviewRequired && !accountPaymentAmountEntered;
  const accountPaymentDisabled =
    accountPaymentAmountRequired ||
    accountPaymentAmountInvalid ||
    accountPaymentAmountExceedsBalance;
  const showFamilyPaymentPanel =
    parentBalanceReviewRequired ||
    Boolean(nextOpenInvoice) ||
    (balanceCents > 0 && openInvoices.length === 0);
  const latestAccountLedgerEntry =
    latestLedgerEntry ?? ledgerEntries[0] ?? null;
  const parentVisiblePayments = payments.filter(isParentVisiblePayment);
  const paymentMethodManagement = billingAccount?.paymentMethodManagement;
  const autopayStatus =
    autopayStatusOverride ??
    paymentMethodManagement?.autopayStatus ??
    (billingAccount?.autopayPlaceholder ? "enabled" : "disabled");
  const autopayRequirements = useMemo(() => {
    const seen = new Set<string>();
    return autopayEnableRequirements.filter((requirement) => {
      const text = requirement.trim();
      if (!text || seen.has(text)) return false;
      seen.add(text);
      return true;
    });
  }, [autopayEnableRequirements]);
  const checkoutBlocked = !checkoutReadiness.canAcceptParentPayments;
  const checkoutBlockedMessage =
    "Online payments are temporarily unavailable. Please contact your school if you need help.";
  const currentGuardian = useMemo(() => {
    if (!family) return null;
    return (
      family.guardians.find((guardian) => guardian.id === currentGuardianId) ??
      family.guardians.find((guardian) => guardian.userId) ??
      family.guardians[0] ??
      null
    );
  }, [family, currentGuardianId]);

  const uniformColors = useMemo(
    () => Array.from(new Set(uniformProducts.map((product) => product.color))),
    [uniformProducts],
  );
  const uniformSizes = useMemo(
    () =>
      Array.from(
        new Set(
          uniformProducts
            .filter((product) => product.color === uniformColor)
            .map((product) => product.size),
        ),
      ),
    [uniformColor, uniformProducts],
  );
  const uniformPurchaseOptions = useMemo(
    () =>
      uniformProducts.filter(
        (product) =>
          product.color === uniformColor && product.size === uniformSize,
      ),
    [uniformColor, uniformProducts, uniformSize],
  );
  const selectedUniformProduct = useMemo(
    () =>
      uniformProducts.find(
        (product) =>
          product.color === uniformColor &&
          product.size === uniformSize &&
          product.purchaseOption === uniformPurchaseOption,
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
      const created = {
        key,
        date: value,
        reports: [],
        media: [],
      };
      days.set(key, created);
      return created;
    };

    for (const report of dailyReports) {
      const day = ensureDay(report.date);
      if (!day) continue;
      day.reports.push(report);
    }
    for (const item of media) {
      ensureDay(item.createdAt)?.media.push(item);
    }

    return Array.from(days.values())
      .map((day) => ({
        ...day,
        reports: sortDailyReportsChronologically(day.reports),
        media: day.media.toSorted(
          (left, right) =>
            dateTimestamp(right.createdAt) - dateTimestamp(left.createdAt),
        ),
        totalItems: day.reports.length + day.media.length,
      }))
      .toSorted((left, right) => right.key.localeCompare(left.key));
  }, [dailyReports, media]);
  const selectedUpdateDay =
    dailyUpdateDays.find((day) => day.key === selectedUpdateDayKey) ??
    dailyUpdateDays[0] ??
    null;
  const documentsNeedingAction = documents.filter((document) => {
    const status = document.status.trim().toLowerCase();
    return (
      requiresDocumentSignature(document) ||
      !["approved", "complete", "completed", "signed"].includes(status)
    );
  });
  const incidentsNeedingReceipt = incidents.filter(
    (incident) => !incident.parentAcknowledgedAt,
  );
  const homeAttentionCount =
    documentsNeedingAction.length +
    openInvoices.length +
    incidentsNeedingReceipt.length;

  useEffect(() => {
    const hash = window.location.hash.toLowerCase();
    const legacyDestination: {
      view: ParentPortalView;
      section?: ParentPortalFamilySection;
    } | null =
      hash === "#today" || hash === "#family-summary"
        ? { view: "home" }
        : [
              "#daily-updates",
              "#daily-reports",
              "#photos",
              "#activities",
            ].includes(hash)
          ? { view: "updates" }
          : hash === "#messages"
            ? { view: "messages" }
            : hash === "#billing"
              ? { view: "payments" }
              : hash === "#documents"
                ? { view: "family", section: "documents" }
                : hash === "#profile"
                  ? { view: "family", section: "profile" }
                  : hash === "#children" || hash === "#check-in"
                    ? {
                        view: "family",
                        section: hash === "#check-in" ? "check-in" : "children",
                      }
                    : null;
    if (!legacyDestination) return;
    if (
      legacyDestination.view === activeView &&
      (!legacyDestination.section ||
        legacyDestination.section === activeFamilySection)
    )
      return;

    const next = new URL(window.location.href);
    if (previewMode) {
      router.replace(
        parentPortalWorkspaceHref({
          view: legacyDestination.view,
          previewHrefBase: `${next.pathname}${next.search}`,
          familyId: next.searchParams.get("familyId"),
          section: legacyDestination.section,
          hash: null,
        }),
      );
      return;
    }
    next.searchParams.set("view", legacyDestination.view);
    if (legacyDestination.section)
      next.searchParams.set("section", legacyDestination.section);
    else next.searchParams.delete("section");
    next.hash = "";
    router.replace(`${next.pathname}${next.search}`);
  }, [activeFamilySection, activeView, previewMode, router]);

  function showStatus(next: string) {
    setError("");
    setStatus(next);
  }

  function showError(next: string) {
    setStatus("");
    setError(next);
  }

  function previewOnly() {
    if (!previewMode) return false;
    showStatus("Preview only — no family information was changed.");
    return true;
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
    setMessageAttachments((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  function buildMessageFormData(familyId: string) {
    const formData = new FormData();
    formData.append("familyId", familyId);
    if (replyToMessageId) formData.append("replyToMessageId", replyToMessageId);
    if (!replyToMessageId && messageRecipientId !== "school") formData.append("assignedToId", messageRecipientId);
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
    if (previewOnly()) return;
    if (!family) return;
    startTransition(async () => {
      const body = {
        familyId: family.id,
        replyToMessageId: replyToMessageId || null,
        assignedToId: !replyToMessageId && messageRecipientId !== "school" ? messageRecipientId : null,
        subject,
        message,
        priority: "normal",
        sendEmailCopy: true,
        sendPushCopy: true,
      };
      const response = await parentPortalRequest("/api/communications/messages", {
        method: "POST",
        ...(messageAttachments.length
          ? { body: buildMessageFormData(family.id) }
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });
      const json = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        return showError(json?.error || "Message could not be sent.");
      setMessage("");
      setReplyToMessageId("");
      setReplyingToSubject("");
      setMessageAttachments([]);
      setMessageAttachmentInputKey((current) => current + 1);
      showStatus(
        messageRecipientId === "school"
          ? "Message sent to the school and recorded in the family timeline."
          : "Message sent to your child’s teacher and recorded in the family timeline.",
      );
      router.refresh();
    });
  }

  function startMessageReply(item: { id: string; subject: string | null }) {
    const nextSubject = item.subject || "Portal message";
    setReplyToMessageId(item.id);
    setReplyingToSubject(nextSubject);
    setSubject(replySubject(nextSubject));
    setMessage("");
    document.getElementById("portal-message")?.focus({ preventScroll: true });
  }

  function requestContactUpdate() {
    if (previewOnly()) return;
    if (!family) return;
    startTransition(async () => {
      const response = await parentPortalRequest("/api/parent/contact-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: family.id,
          requestType:
            requestEntity === "emergency_contact"
              ? "Emergency contact update"
              : "Authorized pickup update",
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
      const json = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        return showError(json?.error || "Request could not be submitted.");
      setRequestDetails("");
      setRequestTargetId("");
      setRequestName("");
      setRequestPhone("");
      setRequestRelation("");
      showStatus("Update request sent for director review.");
    });
  }

  function acknowledgeIncident(incidentId: string) {
    if (previewOnly()) return;
    startTransition(async () => {
      const response = await parentPortalRequest(
        `/api/parent/incidents/${incidentId}/acknowledge`,
        { method: "POST" },
      );
      const json = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        return showError(json?.error || "Incident could not be acknowledged.");
      showStatus("Incident acknowledgment recorded.");
    });
  }

  function payFamilyBalance(
    paymentMethodCategory: "ach" | "card" | "link_bank",
  ) {
    if (previewOnly()) return;
    if (!family) {
      return showError("Choose a linked family before making a payment.");
    }
    if (checkoutBlocked) {
      return showError(
        checkoutBlockedMessage,
      );
    }
    if (!billingAccount) {
      return showError("Your family billing account is not available yet.");
    }
    if (balanceCents <= 0 && !parentBalanceReviewRequired) {
      return showError("There is no family balance to pay.");
    }
    if (accountPaymentAmountRequired) {
      return showError("Enter the amount you want to pay toward your account.");
    }
    if (accountPaymentAmountInvalid) {
      return showError("Payment amount must be greater than zero.");
    }
    if (accountPaymentAmountExceedsBalance) {
      return showError(
        "Payment amount cannot exceed your current family balance.",
      );
    }
    setPaymentCheckoutMethod(paymentMethodCategory);
    setPaymentCheckoutError("");
    setError("");
    setStatus("");
    void (async () => {
      const method =
        paymentMethodCategory === "card"
          ? "card_checkout"
          : paymentMethodCategory === "link_bank"
            ? "instant_bank_checkout"
            : "ach_checkout";
      const response = await parentPortalRequest("/api/billing/family-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingAccountId: billingAccount.id,
          familyId: family.id,
          method,
          returnPath: workspaceHref("family", { familyId: family.id, section: "billing" }),
          amountCents: accountPaymentRequestCents,
        }),
      });
      const json = (await response.json().catch(() => null)) as {
        error?: string;
        url?: string;
        configured?: boolean;
      } | null;
      if (!response.ok || !json?.url) {
        const message =
          json?.error || "Payment checkout is not configured yet.";
        setPaymentCheckoutMethod(null);
        setPaymentCheckoutError(message);
        showError(message);
        return;
      }
      window.location.href = json.url;
    })();
  }

  function payBalance(paymentMethodCategory: "ach" | "card" | "link_bank") {
    if (!nextOpenInvoice && balanceCents <= 0 && !parentBalanceReviewRequired) {
      return showError("There is no family balance to pay.");
    }
    payFamilyBalance(paymentMethodCategory);
  }

  function payProductInvoice(
    invoiceId: string,
    paymentMethodCategory: "card" | "link_bank",
  ) {
    if (previewOnly()) return;
    if (!family) {
      return showError("Choose a linked family before paying this invoice.");
    }
    if (checkoutBlocked) {
      return showError(
        checkoutBlockedMessage,
      );
    }
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice?.productCheckoutAvailable || invoice.status !== "OPEN") {
      return showError("This product invoice is not available for checkout.");
    }
    if (invoice.pendingPayment) {
      return showError(pendingPaymentMessage(invoice.pendingPayment));
    }
    startTransition(async () => {
      const response = await parentPortalRequest("/api/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          paymentMethodCategory,
          returnPath: workspaceHref("family", { familyId: family.id, section: "billing" }),
        }),
      });
      const json = (await response.json().catch(() => null)) as {
        error?: string;
        url?: string;
      } | null;
      if (!response.ok || !json?.url) {
        return showError(
          json?.error || "Product checkout could not be opened.",
        );
      }
      window.location.href = json.url;
    });
  }

  function selectUniformColor(color: "Black" | "Yellow") {
    setUniformColor(color);
    const firstSize =
      uniformProducts.find(
        (product) =>
          product.color === color &&
          product.purchaseOption === uniformPurchaseOption,
      )?.size ??
      uniformProducts.find((product) => product.color === color)?.size;
    if (firstSize) setUniformSize(firstSize);
  }

  function selectUniformPurchaseOption(purchaseOption: "single" | "bundle_5") {
    setUniformPurchaseOption(purchaseOption);
    setUniformQuantity(1);
    const matchingSize = uniformProducts.find(
      (product) =>
        product.color === uniformColor &&
        product.size === uniformSize &&
        product.purchaseOption === purchaseOption,
    )?.size;
    if (matchingSize) return;
    const firstSize = uniformProducts.find(
      (product) =>
        product.color === uniformColor &&
        product.purchaseOption === purchaseOption,
    )?.size;
    if (firstSize) setUniformSize(firstSize);
  }

  function buyUniform(paymentMethodCategory: "ach" | "card" | "link_bank") {
    if (previewOnly()) return;
    if (!family) {
      return showError("Choose a linked family before purchasing a uniform.");
    }
    if (checkoutBlocked) {
      return showError(
        checkoutBlockedMessage,
      );
    }
    if (!selectedUniformProduct) {
      return showError("Choose an available uniform shirt color and size.");
    }
    startTransition(async () => {
      const purchaseResponse = await parentPortalRequest("/api/parent/products/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: family.id,
          productId: selectedUniformProduct.productId,
          purchaseOption: selectedUniformProduct.purchaseOption,
          quantity: uniformQuantity,
        }),
      });
      const purchaseJson = (await purchaseResponse
        .json()
        .catch(() => null)) as {
        error?: string;
        invoice?: { id: string; totalCents: number };
      } | null;
      if (!purchaseResponse.ok || !purchaseJson?.invoice?.id) {
        return showError(
          purchaseJson?.error || "Uniform shirt purchase could not be started.",
        );
      }

      const checkoutResponse = await parentPortalRequest("/api/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: purchaseJson.invoice.id,
          paymentMethodCategory,
          returnPath: workspaceHref("family", { familyId: family.id, section: "billing" }),
        }),
      });
      const checkoutJson = (await checkoutResponse
        .json()
        .catch(() => null)) as { error?: string; url?: string } | null;
      if (!checkoutResponse.ok || !checkoutJson?.url) {
        showStatus(
          "Uniform shirt invoice was added to your family ledger. Checkout can be completed from the open invoices list.",
        );
        router.refresh();
        return;
      }
      window.location.href = checkoutJson.url;
    });
  }

  function managePaymentMethod(
    action: "setup" | "portal" | "enable_autopay" | "disable_autopay",
    paymentMethodCategory: "ach" | "card" | "link_bank" | "default" = "default",
  ) {
    if (previewOnly()) return;
    if (!family)
      return showError(
        "A family profile is required before saving payment methods.",
      );
    if (action !== "setup" && !billingAccount)
      return showError(
        "Save a payment method before managing autopay settings.",
      );
    if (
      action === "enable_autopay" &&
      !window.confirm(
        "Enable autopay? Open invoices are processed on or after their due date. Account credit is applied first, and the selected saved method pays any remaining balance. Weekly tuition invoices are created separately.",
      )
    )
      return;
    startTransition(async () => {
      setAutopayConfirmation("");
      setAutopayError("");
      setAutopayEnableRequirements([]);
      const response = await parentPortalRequest("/api/billing/payment-method-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingAccountId: billingAccount?.id,
          familyId: family.id,
          action,
          paymentMethodCategory,
          returnPath: workspaceHref("family", { familyId: family.id, section: "billing" }),
        }),
      });
      const json = (await response.json().catch(() => null)) as {
        error?: string;
        url?: string;
        autopayEnableRequirements?: Array<{ code: string; message: string }>;
      } | null;
      if (!response.ok) {
        if (
          action === "enable_autopay" &&
          json?.autopayEnableRequirements?.length
        ) {
          setAutopayEnableRequirements(
            json.autopayEnableRequirements.map(
              (requirement) => requirement.message,
            ),
          );
        } else {
          setAutopayEnableRequirements([]);
        }
        const message = json?.error || "Payment method management is not configured yet.";
        if (action === "enable_autopay" || action === "disable_autopay") {
          setAutopayError(message);
        }
        return showError(message);
      }
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      const confirmation =
        action === "enable_autopay"
          ? "Autopay is enabled. The saved method will be used for eligible open invoices on or after their due date."
          : action === "disable_autopay"
            ? "Autopay is disabled. Your saved payment method remains available for one-time payments."
            : "Payment method settings updated. Autopay was not changed.";
      if (action === "enable_autopay" || action === "disable_autopay") {
        setAutopayStatusOverride(
          action === "enable_autopay" ? "enabled" : "disabled",
        );
      }
      setAutopayConfirmation(confirmation);
      setAutopayError("");
      showStatus(confirmation);
      router.refresh();
    });
  }

  function toggleAutopay(enabled: boolean) {
    if (!family) return;
    if (enabled === (autopayStatus === "enabled")) return;
    managePaymentMethod(enabled ? "enable_autopay" : "disable_autopay");
  }

  function updatePreference(
    key: keyof NotificationPreferences,
    checked: boolean,
  ) {
    setPreferences((current) => ({ ...current, [key]: checked }));
  }

  function saveNotificationPreferences() {
    if (previewOnly()) return;
    if (!currentGuardianId) return;
    startTransition(async () => {
      const response = await parentPortalRequest("/api/parent/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardianId: currentGuardianId, preferences }),
      });
      const json = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        return showError(
          json?.error || "Notification preferences could not be saved.",
        );
      showStatus("Notification preferences saved.");
    });
  }

  function updateProfilePassword() {
    if (previewOnly()) return;
    setPasswordConfirmation("");
    if (!currentPassword || !newPassword)
      return showError("Enter your current password and a new password.");
    if (newPassword.length < 8)
      return showError("New password must be at least 8 characters.");
    if (newPassword !== confirmPassword)
      return showError("New passwords do not match.");

    startTransition(async () => {
      const response = await parentPortalRequest("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          password: newPassword,
          confirmPassword,
        }),
      });
      const json = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        return showError(json?.error || "Password could not be updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      const confirmation =
        "Password changed successfully. Use your new password the next time you sign in.";
      setPasswordConfirmation(confirmation);
      showStatus(confirmation);
      router.refresh();
    });
  }

  function requestAccountDeletion() {
    if (previewOnly()) return;
    if (!family || !currentGuardianId) {
      return showError(
        "Sign in as a linked parent or guardian before requesting account deletion.",
      );
    }
    if (!retentionNoticeAccepted) {
      return showError(
        "Confirm the childcare record retention notice before submitting the request.",
      );
    }
    const accepted = window.confirm(
      "Submit an account deletion request? The school may need to retain childcare, safety, billing, payment, or audit records.",
    );
    if (!accepted) return;

    startTransition(async () => {
      const response = await parentPortalRequest("/api/privacy/deletion-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardianId: currentGuardianId,
          details: accountDeletionDetails,
          retentionNoticeAccepted,
        }),
      });
      const json = (await response.json().catch(() => null)) as {
        error?: string;
        duplicate?: boolean;
        request?: AccountDeletionRequestSummary;
      } | null;
      if (!response.ok || !json?.request) {
        return showError(
          json?.error || "Account deletion request could not be submitted.",
        );
      }
      setAccountDeletionRequest(json.request);
      setAccountDeletionDetails("");
      setRetentionNoticeAccepted(false);
      showStatus(
        json.duplicate
          ? "An open account deletion request is already on file."
          : "Account deletion request submitted for review.",
      );
    });
  }

  function submitDocument(documentId: string) {
    if (previewOnly()) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.append("note", documentNotes[documentId] || "");
      formData.append(
        "signatureAcknowledged",
        String(Boolean(signatureAcknowledgements[documentId])),
      );
      formData.append(
        "signatureConsentAccepted",
        String(Boolean(signatureAcknowledgements[documentId])),
      );
      formData.append("signatureName", signatureNames[documentId] || "");
      const file = documentFiles[documentId];
      if (file) formData.append("file", file);
      const response = await parentPortalRequest(
        `/api/parent/documents/${documentId}/submit`,
        {
          method: "POST",
          body: formData,
        },
      );
      const json = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        return showError(json?.error || "Document could not be submitted.");
      setDocumentNotes((current) => ({ ...current, [documentId]: "" }));
      setDocumentFiles((current) => ({ ...current, [documentId]: null }));
      setSignatureAcknowledgements((current) => ({
        ...current,
        [documentId]: false,
      }));
      setSignatureNames((current) => ({ ...current, [documentId]: "" }));
      showStatus("Document submitted for director review.");
      router.refresh();
    });
  }

  if (!family) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle as="h2">Parent Portal</CardTitle>
          <CardDescription>
            No family profile is connected to this account yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const featuredChild = family.children[0] ?? null;
  const featuredMedia = featuredChild
    ? media.find((item) => item.child.fullName === featuredChild.fullName) ??
      media[0] ??
      null
    : media[0] ?? null;
  const featuredMediaSrc = renderableImageSrc(featuredMedia?.url);
  const featuredChildPresent =
    featuredChild?.today?.status === "checked_in" ||
    featuredChild?.today?.status === "present";
  const latestReport = dailyUpdateDays[0]?.reports[0] ?? null;
  const guardianName =
    currentGuardian?.fullName ?? family.guardians[0]?.fullName ?? null;
  const homeGreeting = `Welcome back, ${guardianFirstName(guardianName)}`;

  return (
    <div
      className="parent-portal-workspace mx-auto flex w-full max-w-[88rem] flex-col gap-6 [&_button]:min-h-10"
      data-parent-portal-view={activeView}
      aria-busy={isPending}
    >
      <header
        id="family-summary"
        className={`parent-portal-heading scroll-mt-28 rounded-[1.75rem] border border-border/70 bg-card px-5 py-5 sm:px-7 sm:py-6 ${activeView === "messages" ? "max-sm:sr-only" : ""}`}
      >
        <div className="relative z-[1] flex min-w-0 items-center justify-between gap-3">
          <h1 className="text-balance font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            {activeView === "home" ? homeGreeting : activeViewCopy.title}
          </h1>
          {activeView !== "home" ? (
            <ParentPortalDocumentLink
              href={workspaceHref("home", { familyId: family.id })}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Home data-icon="inline-start" aria-hidden="true" />
              Home
            </ParentPortalDocumentLink>
          ) : null}
        </div>
        {availableFamilies.length > 1 ? (
          <div
            className="mt-5 flex flex-wrap gap-2"
            aria-label="Choose family profile"
          >
            {availableFamilies.map((item) => (
              <ParentPortalDocumentLink
                key={item.id}
                href={workspaceHref(activeView, {
                  familyId: item.id,
                  section:
                    activeView === "family"
                      ? activeFamilySection
                      : undefined,
                })}
                aria-current={item.id === family.id ? "page" : undefined}
                className={buttonVariants({
                  size: "sm",
                  variant: item.id === family.id ? "default" : "outline",
                })}
              >
                <Building2 data-icon="inline-start" aria-hidden="true" />
                {item.name}
                {item.centerName ? ` · ${item.centerName}` : ""}
              </ParentPortalDocumentLink>
            ))}
          </div>
        ) : null}
      </header>

      {demoMode ? (
        <Alert className="border-primary/30 bg-primary/10">
          <ShieldCheck className="size-4" />
          <AlertTitle>Preview only</AlertTitle>
          <AlertDescription>
            You can explore every parent view here. No family information is
            changed.
          </AlertDescription>
        </Alert>
      ) : null}

      {status ? (
        <Alert role="status" aria-live="polite">
          <CheckCircle2 className="size-4" />
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" />
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {activeView === "family" ? (
        <nav
          aria-label="Family sections"
          className="-mt-2 border-b border-border/80"
        >
          <div id="parent-family-section-nav" className="flex snap-x gap-2 overflow-x-auto pb-2 sm:min-w-max sm:gap-6 sm:pb-0">
            {(
              [
                ["children", "Children"],
                ["check-in", "School Check-In"],
                ["documents", "Documents"],
                ["billing", "Billing Settings"],
                ["profile", "Profile & Security"],
                ["notifications", "Notifications & Privacy"],
              ] as Array<[ParentPortalFamilySection, string]>
            ).map(([section, label]) => (
              <ParentPortalDocumentLink
                key={section}
                href={workspaceHref("family", {
                  familyId: family.id,
                  section,
                  hash: null,
                })}
                aria-current={
                  activeFamilySection === section ? "page" : undefined
                }
                className={`relative flex min-h-11 shrink-0 snap-start items-center rounded-full border px-4 py-2 text-sm font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:rounded-none sm:border-x-0 sm:border-t-0 sm:border-b-2 sm:px-1 ${activeFamilySection === section ? "border-primary/40 bg-primary/10 text-foreground sm:border-primary sm:bg-transparent" : "border-border/70 bg-card/70 text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground sm:border-transparent sm:bg-transparent sm:hover:bg-transparent"}`}
              >
                {label}
              </ParentPortalDocumentLink>
            ))}
          </div>
        </nav>
      ) : null}

      {activeView === "home" ? (
        <>
          <section
            id="today"
            className="parent-portal-feature scroll-mt-28 overflow-hidden rounded-[1.75rem] border bg-card"
            aria-labelledby="parent-today-heading"
          >
            <div className="border-b border-border/70 p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2
                    id="parent-today-heading"
                    className="text-2xl font-semibold tracking-tight text-pretty"
                  >
                    Today
                  </h2>
                  <p className="sr-only">
                    See today’s check-in status, classroom, schedule, and latest
                    update from your school.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ParentPortalDocumentLink
                    href={workspaceHref("updates", { familyId: family.id })}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary/70 bg-background px-4 text-sm font-medium transition-colors hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Camera className="size-4" aria-hidden="true" /> View
                    Today’s Update{" "}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </ParentPortalDocumentLink>
                </div>
              </div>
            </div>
            {featuredChild ? (
              <div className="grid border-b border-border/60 bg-primary/[0.045] sm:grid-cols-[minmax(0,1fr)_15rem]">
                <div className="flex min-w-0 items-center gap-4 p-4 sm:p-6">
                  <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${featuredChildPresent ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-primary/10 text-primary"}`}>
                    {featuredChildPresent ? (
                      <CheckCircle2 className="size-6" aria-hidden="true" />
                    ) : (
                      <CalendarDays className="size-6" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">
                      {featuredChild.today?.label || "Today’s status is ready"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {featuredChild.preferredName || featuredChild.fullName}
                      {featuredChild.today?.latestEventAt
                        ? ` · ${formatTime(featuredChild.today.latestEventAt)}`
                        : ""}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {featuredChild.classroom?.name || "Classroom not assigned"}
                    </p>
                  </div>
                </div>
                <ParentPortalDocumentLink
                  href={workspaceHref("updates", { familyId: family.id })}
                  className="group relative hidden min-h-36 overflow-hidden border-l border-border/60 bg-muted sm:block"
                  aria-label="Open photos and daily reports"
                >
                  {featuredMediaSrc ? (
                    <Image
                      src={featuredMediaSrc}
                      alt={featuredMedia?.caption || `${featuredChild.fullName} school update`}
                      fill
                      sizes="240px"
                      priority
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:transform-none"
                    />
                  ) : (
                    <span className="grid h-full place-items-center text-primary/60">
                      <Camera className="size-10" aria-hidden="true" />
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-4 pb-3 pt-8 text-xs font-semibold text-white">
                    Photos &amp; reports
                  </span>
                </ParentPortalDocumentLink>
              </div>
            ) : null}
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto p-4 sm:grid sm:overflow-visible sm:p-6 lg:grid-cols-2">
              {family.children.map((child) => (
                <article
                  key={child.id}
                  className="w-[86%] min-w-0 shrink-0 snap-start rounded-2xl border bg-background/60 p-4 sm:w-auto sm:shrink sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    {child.profilePhotoUrl ? (
                      <span className="relative size-12 shrink-0 overflow-hidden rounded-full border bg-muted">
                        <Image src={child.profilePhotoUrl} alt={`${child.fullName} profile`} fill sizes="48px" unoptimized className="object-cover" />
                      </span>
                    ) : null}
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold">
                        {child.preferredName || child.fullName}
                      </h3>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {child.classroom?.name || "Classroom not assigned"}
                      </p>
                    </div>
                    <Badge variant={todayStatusVariant(child.today?.status)}>
                      {child.today?.label || "Not marked today"}
                    </Badge>
                  </div>
                  <details className="mt-4 rounded-xl border bg-card/70 p-3 text-sm sm:hidden">
                    <summary className="cursor-pointer select-none font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      View day details
                    </summary>
                    <dl className="mt-3 divide-y border-t text-sm">
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2.5">
                        <dt className="text-xs font-medium text-muted-foreground">
                          Schedule
                        </dt>
                        <dd className="break-words font-medium">
                          {scheduleSummary(child.schedule)}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2.5">
                        <dt className="text-xs font-medium text-muted-foreground">
                          Classroom
                        </dt>
                        <dd className="break-words font-medium">
                          {child.today?.currentLocationName ||
                            (child.today?.status === "checked_out"
                              ? "Checked out"
                              : "No live location shared")}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2.5">
                        <dt className="text-xs font-medium text-muted-foreground">
                          Last Check-In
                        </dt>
                        <dd className="font-medium">
                          {child.today?.latestEventAt
                            ? formatTime(child.today.latestEventAt)
                            : "No event today"}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 pt-2.5">
                        <dt className="text-xs font-medium text-muted-foreground">
                          Daily Update
                        </dt>
                        <dd className="font-medium">
                          {child.today?.dailyReportShared
                            ? "Shared today"
                            : "Not shared yet"}
                        </dd>
                      </div>
                    </dl>
                  </details>
                  <dl className="mt-4 hidden gap-3 text-sm sm:grid sm:grid-cols-2">
                    <div className="min-w-0 rounded-xl border bg-card/70 p-3">
                      <dt className="text-xs font-medium text-muted-foreground">
                        Today’s Schedule
                      </dt>
                      <dd className="mt-1 line-clamp-2 break-words font-medium">
                        {scheduleSummary(child.schedule)}
                      </dd>
                    </div>
                    <div className="min-w-0 rounded-xl border bg-card/70 p-3">
                      <dt className="text-xs font-medium text-muted-foreground">
                        Classroom
                      </dt>
                      <dd className="mt-1 truncate font-medium">
                        {child.today?.currentLocationName ||
                          (child.today?.status === "checked_out"
                            ? "Checked out"
                            : "No live location shared")}
                      </dd>
                    </div>
                    <div className="min-w-0 rounded-xl border bg-card/70 p-3">
                      <dt className="text-xs font-medium text-muted-foreground">
                        Last Check-In Update
                      </dt>
                      <dd className="mt-1 font-medium">
                        {child.today?.latestEventAt
                          ? formatTime(child.today.latestEventAt)
                          : "No event recorded today"}
                      </dd>
                    </div>
                    <div className="min-w-0 rounded-xl border bg-card/70 p-3">
                      <dt className="text-xs font-medium text-muted-foreground">
                        Today’s Update
                      </dt>
                      <dd className="mt-1 font-medium">
                        {child.today?.dailyReportShared
                          ? "Shared today"
                          : "Not shared yet"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <CollapsiblePanel
              id="parent-home-attention"
              title="Needs Your Attention"
              summary={homeAttentionCount ? `${homeAttentionCount} item${homeAttentionCount === 1 ? "" : "s"} to review` : "You’re all caught up"}
              className="rounded-[1.5rem] bg-card"
              contentClassName="divide-y px-4 pb-4 pt-0 sm:px-6 sm:pb-6"
              defaultCollapsed={!homeAttentionCount}
            >
                {documentsNeedingAction[0] ? (
                  <ParentPortalDocumentLink
                    href={workspaceHref("family", {
                      familyId: family.id,
                      section: "documents",
                    })}
                    className="group flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <FileText className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        Review {documentsNeedingAction[0].name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {displayTokenLabel(documentsNeedingAction[0].status)}
                      </span>
                    </span>
                    <ArrowRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </ParentPortalDocumentLink>
                ) : null}
                {openInvoices[0] ? (
                  <ParentPortalDocumentLink
                    href={workspaceHref("payments", { familyId: family.id })}
                    className="group flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <ReceiptText className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        Upcoming payment
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {openInvoices[0].number} · due{" "}
                        {formatDate(openInvoices[0].dueDate)}
                      </span>
                    </span>
                    <ArrowRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </ParentPortalDocumentLink>
                ) : null}
                {incidentsNeedingReceipt[0] ? (
                  <ParentPortalDocumentLink
                    href={workspaceHref("family", {
                      familyId: family.id,
                      section: "children",
                      hash: "incidents",
                    })}
                    className="group flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <AlertCircle className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        Incident Report to Review
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {incidentsNeedingReceipt[0].child.fullName} ·{" "}
                        {formatDate(incidentsNeedingReceipt[0].occurredAt)}
                      </span>
                    </span>
                    <ArrowRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </ParentPortalDocumentLink>
                ) : null}
                {!homeAttentionCount ? (
                  <p className="py-6 text-sm text-muted-foreground">
                    You’re all caught up.
                  </p>
                ) : null}
            </CollapsiblePanel>

            <CollapsiblePanel
              id="parent-home-announcements"
              title={`Latest From ${centerName ?? "Your School"}`}
              summary={announcements[0]?.title ?? "No new announcements"}
              className="rounded-[1.5rem] bg-card"
              contentClassName="px-4 pb-4 pt-0 sm:px-6 sm:pb-6"
              defaultCollapsed
            >
              {announcements[0] ? (
                <div className="mt-5 hidden sm:block">
                  <BellRing
                    className="size-6 text-primary"
                    aria-hidden="true"
                  />
                  <h3 className="mt-4 font-semibold">
                    {announcements[0].title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {announcements[0].body}
                  </p>
                  {announcements[0].sendAt ? (
                    <p className="mt-4 text-xs text-muted-foreground">
                      {formatDate(announcements[0].sendAt)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-5 text-sm text-muted-foreground">
                  No new announcements.
                </p>
              )}
              {announcements[0] ? (
                <details className="mt-4 rounded-xl border bg-background/45 p-3 sm:hidden">
                  <summary className="cursor-pointer select-none font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {announcements[0].title}
                  </summary>
                  <p className="mt-3 border-t pt-3 text-sm leading-6 text-muted-foreground">
                    {announcements[0].body}
                  </p>
                  {announcements[0].sendAt ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {formatDate(announcements[0].sendAt)}
                    </p>
                  ) : null}
                </details>
              ) : null}
            </CollapsiblePanel>

            <CollapsiblePanel
              id="parent-home-account"
              title={<>Account &amp; Payments</>}
              accessibleLabel="Account & Payments"
              summary={parentBalanceReviewRequired && !parentBalanceVisibilityConfirmed ? "Balance review in progress" : `${money(balanceCents)} · ${openInvoices.length} open invoice${openInvoices.length === 1 ? "" : "s"}`}
              className="rounded-[1.5rem] bg-card lg:col-span-2 xl:col-span-1"
              contentClassName="px-4 pb-4 pt-0 sm:px-6 sm:pb-6"
              defaultCollapsed={balanceCents <= 0}
            >
              {parentBalanceReviewRequired && !parentBalanceVisibilityConfirmed ? (
                <div className="mt-5 rounded-2xl border border-amber-400/35 bg-amber-400/10 p-4">
                  <p className="font-semibold">Balance review in progress</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Your school is confirming family and agency responsibility before showing a payable amount.
                  </p>
                </div>
              ) : (
                <div className="mt-5">
                  <p className="text-3xl font-semibold tabular-nums">
                    {money(balanceCents)}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {balanceCents > 0
                      ? checkoutBlocked
                        ? "Payment details are available; online checkout is temporarily unavailable."
                        : "Review invoices and choose a payment method."
                      : balanceCents < 0
                        ? "This account has a family credit."
                        : "Your family balance is current."}
                  </p>
                </div>
              )}
              <ParentPortalDocumentLink
                href={workspaceHref("payments", { familyId: family.id })}
                className={buttonVariants({
                  variant: balanceCents > 0 && !checkoutBlocked ? "default" : "outline",
                  className: "mt-5 w-full",
                })}
              >
                {balanceCents > 0 && !checkoutBlocked ? "Review & Pay" : "View Payment Details"}
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </ParentPortalDocumentLink>
              <p className="mt-3 text-xs text-muted-foreground">
                {openInvoices.length
                  ? `${openInvoices.length} open invoice${openInvoices.length === 1 ? "" : "s"}`
                  : latestAccountLedgerEntry
                    ? `Latest activity ${formatDate(latestAccountLedgerEntry.effectiveAt)}`
                    : "No open invoices"}
              </p>
            </CollapsiblePanel>
          </div>

          <section aria-labelledby="parent-quick-actions-heading">
            <h2
              id="parent-quick-actions-heading"
              className="text-lg font-semibold"
            >
              Quick Actions
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {(
                [
                  [
                    workspaceHref("updates", { familyId: family.id }),
                    "Photos & Daily Reports",
                    latestReport
                      ? `${latestReport.child.fullName} · ${formatDate(latestReport.date)}`
                      : "See shared classroom moments",
                    Camera,
                  ],
                  [
                    workspaceHref("messages", { familyId: family.id }),
                    "Message the School",
                    "Ask a question or send a note",
                    MessageSquare,
                  ],
                  [
                    workspaceHref("payments", { familyId: family.id }),
                    "View Payments",
                    "Balance, invoices, and payment methods",
                    CreditCard,
                  ],
                  [
                    workspaceHref("family", {
                      familyId: family.id,
                      section: "check-in",
                    }),
                    "School Check-In",
                    "View your Family PIN and QR code",
                    KeyRound,
                  ],
                ] as const
              ).map(([href, label, detail, Icon]) => (
                <ParentPortalDocumentLink
                  key={href}
                  href={href}
                  className="group flex min-h-20 items-center gap-2 rounded-xl border bg-card p-3 transition-colors hover:border-primary/60 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:p-4"
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold sm:text-sm">{label}</span>
                    <span className="mt-1 hidden text-xs text-muted-foreground sm:block">
                      {detail}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </ParentPortalDocumentLink>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {activeView === "updates" ? (
        <section
          id="daily-updates"
          className="scroll-mt-28 rounded-2xl border bg-card p-4 sm:p-6"
        >
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-5">
            <div className="w-full sm:w-80">
              <Label htmlFor="parent-update-day">Date</Label>
              <Select
                value={selectedUpdateDay?.key ?? ""}
                onValueChange={(value) => setSelectedUpdateDayKey(value ?? "")}
              >
                <SelectTrigger
                  id="parent-update-day"
                  className="mt-2 w-full"
                  aria-label="Choose update day"
                >
                  <CalendarDays data-icon="inline-start" />
                  <SelectValue placeholder="No updates yet" />
                </SelectTrigger>
                <SelectContent align="end">
                  {dailyUpdateDays.map((day) => (
                    <SelectItem key={day.key} value={day.key}>
                      {formatDate(day.date)} · {day.totalItems} update
                      {day.totalItems === 1 ? "" : "s"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              {selectedUpdateDay
                ? `${selectedUpdateDay.totalItems} update${selectedUpdateDay.totalItems === 1 ? "" : "s"}`
                : "No updates yet"}
            </p>
          </div>

          <div className="divide-y" aria-label="Updates for the selected date">
            {(selectedUpdateDay?.reports ?? []).map((report) => {
              const timedCareEvents = dailyReportTimedCareEvents(report);
              return (
                <article
                  key={report.id}
                  id="daily-reports"
                  className="py-4 first:pt-1"
                >
                  <div className="rounded-2xl border bg-background/55 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="font-semibold">Daily report · {report.child.fullName}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">Shared by your child’s classroom</p>
                      </div>
                      <time className="text-xs text-muted-foreground">{formatDate(report.date)}</time>
                    </div>
                    {report.checkInAt || report.checkOutAt ? (
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 rounded-xl border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                        <span>
                          Check-in: {report.checkInAt ? formatTime(report.checkInAt) : "Not recorded"}
                        </span>
                        <span>
                          Check-out: {report.checkOutAt ? formatTime(report.checkOutAt) : "Not recorded yet"}
                        </span>
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="secondary">Mood: {report.mood ? displayTokenLabel(report.mood) : "Not recorded"}</Badge>
                      <Badge variant="outline">{report.meals?.length ?? 0} meal{report.meals?.length === 1 ? "" : "s"}</Badge>
                      <Badge variant="outline">{report.naps?.length ?? 0} nap{report.naps?.length === 1 ? "" : "s"}</Badge>
                      <Badge variant="outline">{report.diapers?.length ?? 0} care log{report.diapers?.length === 1 ? "" : "s"}</Badge>
                      <Badge variant="outline">{report.activities?.length ?? 0} activit{report.activities?.length === 1 ? "y" : "ies"}</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground"><span className="font-medium text-foreground">Teacher note:</span> {report.teacherNote || "No note added."}</p>
                    {report.suppliesNeeded ? (
                      <p className="mt-3 text-sm font-medium">Please bring: {report.suppliesNeeded}</p>
                    ) : null}
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      {report.meals?.map((meal) => (
                        <div key={meal.id} className="rounded-xl border bg-background p-3">
                          <dt className="text-xs text-muted-foreground">{displayTokenLabel(meal.mealType)}</dt>
                          <dd className="mt-1 font-medium">{meal.food}{meal.amount ? ` · ${meal.amount}` : ""}</dd>
                        </div>
                      ))}
                      {timedCareEvents.map((event) => event.kind === "nap" ? (
                        <div key={`nap-${event.id}`} className="rounded-xl border bg-background p-3">
                          <dt className="text-xs text-muted-foreground">Nap</dt>
                          <dd className="mt-1 font-medium">{formatTime(event.startsAt)} – {formatTime(event.endsAt ?? null)}</dd>
                        </div>
                      ) : (
                        <div key={`diaper-${event.id}`} className="rounded-xl border bg-background p-3">
                          <dt className="text-xs text-muted-foreground">Diaper or potty</dt>
                          <dd className="mt-1 font-medium">{displayTokenLabel(event.type)} · {formatTime(event.occurredAt)}{event.notes ? ` · ${event.notes}` : ""}</dd>
                        </div>
                      ))}
                      {report.activities?.map((activity) => (
                        <div key={activity.id} className="rounded-xl border bg-background p-3">
                          <dt className="text-xs text-muted-foreground">Activity</dt>
                          <dd className="mt-1 font-medium">{activity.title}{activity.notes ? ` · ${activity.notes}` : ""}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </article>
              );
            })}

            {(selectedUpdateDay?.media ?? []).map((item, index) => {
              const imageSrc = renderableImageSrc(item.url);
              return (
                <article
                  key={item.id}
                  id={index === 0 ? "photos" : undefined}
                  className="grid gap-4 py-6 sm:grid-cols-[3rem_minmax(0,1fr)]"
                >
                  <span className="grid size-11 place-items-center rounded-full bg-primary/12 text-primary">
                    <Camera className="size-5" aria-hidden="true" />
                  </span>
                  <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start">
                    <div>
                      <h2 className="font-semibold">Photo · {item.child.fullName}</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.caption || "A classroom moment shared by your school."}</p>
                      <time className="mt-2 block text-xs text-muted-foreground">{formatTime(item.createdAt)}</time>
                    </div>
                    <a
                      href={imageSrc || undefined}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={imageSrc ? `Open full-size photo of ${item.child.fullName}` : undefined}
                      className="relative aspect-video overflow-hidden rounded-xl border bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {imageSrc ? (
                        <Image
                          src={imageSrc}
                          alt={item.caption || `${item.child.fullName} classroom moment`}
                          fill
                          sizes="12rem"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">Image unavailable</div>
                      )}
                      {imageSrc ? (
                        <span className="absolute inset-x-2 bottom-2 rounded-lg bg-black/70 px-2 py-1 text-center text-xs font-semibold text-white">
                          Open full-size photo
                        </span>
                      ) : null}
                    </a>
                  </div>
                </article>
              );
            })}

            {!selectedUpdateDay?.totalItems ? (
              <div className="py-12 text-center">
                <ClipboardList className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
                <h2 className="mt-3 font-semibold">No updates for this date</h2>
                <p className="mt-1 text-sm text-muted-foreground">Choose another date to review a shared report or photo.</p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeView === "family" && activeFamilySection === "check-in" ? (
        <ParentKioskCredentialPanel
          initialCredentials={kioskCredentials}
          previewMode={previewMode}
        />
      ) : null}

      {activeView === "family" && activeFamilySection === "billing" ? (
        <Card id="billing-settings" className="scroll-mt-28 shadow-none">
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <CreditCard className="text-primary" aria-hidden="true" />
              Billing Settings
            </CardTitle>
            <CardDescription>
              Manage the saved payment method and autopay used for this family account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3">
              <div className="min-w-0 rounded-2xl border bg-background/45 p-3">
                <dt className="text-xs text-muted-foreground">Billing email</dt>
                <dd className="mt-1 truncate font-medium">
                  {family.billingEmail ?? family.guardians[0]?.email ?? "Not set"}
                </dd>
              </div>
              <div className="rounded-2xl border bg-background/45 p-3">
                <dt className="text-xs text-muted-foreground">Autopay</dt>
                <dd className="mt-1 font-medium capitalize">{autopayStatus}</dd>
              </div>
            </dl>
            {paymentMethodReauthorizationRequired ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Replace your saved payment method</AlertTitle>
                <AlertDescription>
                  Your school now uses a new payment account. Replace the saved card or connect a bank account below. No payment is charged while you update it. {paymentMethodReauthorizationPreservesAutopay
                    ? "Your existing autopay consent will resume on the replacement method after Stripe confirms it."
                    : autopayStatus === "enabled"
                      ? "After replacement, review and re-enable autopay."
                      : "Autopay will remain off unless you enable it after replacement."}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="rounded-2xl border bg-background/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    Payment method &amp; autopay
                    <InfoTip label="About payment methods and autopay">
                      Saving a debit or credit card or bank account does not enable autopay. Enable it separately, or make a one-time payment from Payments.
                    </InfoTip>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {paymentMethodReauthorizationRequired
                      ? "The prior saved method is protected but cannot be charged on the school's current payment account."
                      : autopayStatus === "enabled"
                      ? "Account credit is applied first, then the saved method pays eligible invoices."
                      : paymentMethodManagement?.hasSavedPaymentMethod
                        ? `${paymentMethodManagement.paymentMethodLabel ?? "Payment method saved securely"}${paymentMethodManagement.lastUpdatedAt ? ` · updated ${formatDate(paymentMethodManagement.lastUpdatedAt)}` : ""}`
                        : paymentMethodManagement?.autopayStatus === "pending"
                          ? "Bank verification is pending."
                          : "No saved payment method yet."}
                  </p>
                </div>
                <div className="flex min-h-11 items-center gap-2 rounded-full border bg-card px-3">
                  <Label htmlFor="parent-family-autopay-toggle" className="text-sm">Autopay</Label>
                  <Switch
                    id="parent-family-autopay-toggle"
                    checked={autopayStatus === "enabled"}
                    onCheckedChange={toggleAutopay}
                    disabled={
                      isPending ||
                      paymentCheckoutMethod !== null ||
                      !family ||
                      autopayStatus === "pending" ||
                      (paymentMethodReauthorizationRequired && autopayStatus !== "enabled")
                    }
                    aria-label="Enable or disable autopay"
                  />
                  <span className="text-xs font-medium text-muted-foreground">{autopayStatus === "enabled" ? "On" : "Off"}</span>
                </div>
              </div>
              <Button
                className="mt-3 w-full sm:w-auto"
                type="button"
                variant={autopayStatus === "enabled" ? "outline" : "default"}
                disabled={isPending || paymentCheckoutMethod !== null || !family || autopayStatus === "pending" || (paymentMethodReauthorizationRequired && autopayStatus !== "enabled")}
                onClick={() => toggleAutopay(autopayStatus !== "enabled")}
              >
                {isPending
                  ? "Updating…"
                  : autopayStatus === "enabled"
                    ? "Disable autopay"
                    : "Enable autopay"}
              </Button>
              {autopayError ? (
                <Alert className="mt-3" variant="destructive" role="alert">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Autopay could not be updated</AlertTitle>
                  <AlertDescription>{autopayError}</AlertDescription>
                </Alert>
              ) : null}
              {autopayConfirmation ? (
                <Alert className="mt-4 border-emerald-500/30 bg-emerald-500/10">
                  <CheckCircle2 />
                  <AlertTitle>Autopay status confirmed</AlertTitle>
                  <AlertDescription>{autopayConfirmation}</AlertDescription>
                </Alert>
              ) : null}
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Button disabled={isPending || paymentCheckoutMethod !== null || !family} onClick={() => managePaymentMethod("setup", "card")}>
                  <CreditCard data-icon="inline-start" />
                  {paymentMethodManagement?.hasSavedPaymentMethod ? "Replace card" : "Save card"}
                </Button>
                <Button disabled={isPending || paymentCheckoutMethod !== null || !family} onClick={() => managePaymentMethod("setup", "link_bank")} variant="outline">
                  <Building2 data-icon="inline-start" />
                  {paymentMethodManagement?.autopayStatus === "pending" ? "Verify bank account" : "Connect bank account"}
                </Button>
                <Button disabled={isPending || paymentCheckoutMethod !== null || !paymentMethodManagement?.hasStripeCustomer} onClick={() => managePaymentMethod("portal")} variant="outline">
                  Manage methods
                </Button>
              </div>
              {autopayRequirements.length ? (
                <Alert className="mt-3">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Autopay requirements</AlertTitle>
                  <AlertDescription className="space-y-1">
                    {autopayRequirements.map((requirement) => <p key={requirement}>{requirement}</p>)}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
            <ParentPortalDocumentLink href={workspaceHref("payments", { familyId: family.id, section: null, hash: null })} className={buttonVariants({ variant: "outline", className: "w-full sm:w-auto" })}>
              <ArrowRight data-icon="inline-start" aria-hidden="true" />
              Return to Payments
            </ParentPortalDocumentLink>
          </CardContent>
        </Card>
      ) : null}

      {activeView === "family" && activeFamilySection === "children" ? (
        <div className="grid gap-4">
          <Card id="children" className="scroll-mt-28 shadow-none">
            <CardHeader>
              <CardTitle as="h2">Children</CardTitle>
              <CardDescription>
                View each child’s classroom, schedule, and permissions.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {family.children.map((child) => (
                <details
                  key={child.id}
                  className="group rounded-2xl border bg-background/40"
                >
                  <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/12 font-semibold text-primary" aria-hidden="true">
                      {(child.preferredName ?? child.fullName).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{child.fullName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {child.preferredName
                          ? `Preferred: ${child.preferredName} · `
                          : ""}
                        {child.ageGroup}
                      </span>
                    </span>
                    <Badge variant="outline">
                      {displayTokenLabel(child.enrollmentStatus)}
                    </Badge>
                  </summary>
                  <div className="border-t px-4 pb-4 pt-3">
                  <div className="grid gap-2 text-xs text-muted-foreground">
                    <span>
                      Classroom: {child.classroom?.name ?? "Unassigned"}
                    </span>
                    <span>
                      Start date: {formatDate(child.startDate ?? null)}
                    </span>
                    <span>Schedule: {scheduleSummary(child.schedule)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge
                      variant={
                        child.photoVideoPermission ? "default" : "secondary"
                      }
                    >
                      Photos and videos:{" "}
                      {child.photoVideoPermission
                        ? "Allowed"
                        : "Contact school"}
                    </Badge>
                    <Badge
                      variant={
                        child.fieldTripPermission ? "default" : "secondary"
                      }
                    >
                      Field trips:{" "}
                      {child.fieldTripPermission ? "Allowed" : "Contact school"}
                    </Badge>
                  </div>
                  </div>
                </details>
              ))}
            </CardContent>
          </Card>

          <Card id="incidents" className="scroll-mt-28 shadow-none">
            <CardHeader>
              <CardTitle as="h2">Incident Reports</CardTitle>
              <CardDescription>
                Review reports your school has shared for your children.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {incidents.map((incident) => (
                <div
                  key={incident.id}
                  className="rounded-xl border bg-background/40 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {displayTokenLabel(incident.type)} · {incident.child.fullName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(incident.occurredAt)}
                      </div>
                    </div>
                    {incident.parentAcknowledgedAt ? (
                      <Badge>Acknowledged</Badge>
                    ) : (
                      <Button
                        disabled={isPending}
                        onClick={() => acknowledgeIncident(incident.id)}
                      >
                        Acknowledge
                      </Button>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {incident.description} Action taken: {incident.actionTaken}
                  </p>
                </div>
              ))}
              {!incidents.length ? (
                <p className="text-sm text-muted-foreground">
                  No incident reports have been shared.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeView === "payments" ? (
        <Card id="billing" className="scroll-mt-28 shadow-none">
          <CardHeader className="sr-only">
            <CardTitle as="h2">Payment account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {paymentMethodReauthorizationRequired ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Payment method update required</AlertTitle>
                <AlertDescription>
                  Your school now uses a new payment account. Replace your saved card or connect a bank account in Payment settings before saved-method payments can resume. One-time checkout remains available. {paymentMethodReauthorizationPreservesAutopay
                    ? "Your existing autopay consent will resume automatically after Stripe confirms the replacement."
                    : autopayStatus === "enabled"
                      ? "Review and re-enable autopay after replacement."
                      : "Autopay remains off until you choose to enable it."}
                </AlertDescription>
              </Alert>
            ) : paymentTransitionActive ? (
              <Alert>
                <AlertCircle className="size-4" />
                <AlertTitle>School payment account update</AlertTitle>
                <AlertDescription>
                  Card and bank payments should remain available while your school updates its payment account. If a payment option is briefly unavailable, please retry in a few minutes. Your balance, payment history, and saved payment details remain protected.
                </AlertDescription>
              </Alert>
            ) : null}
            {checkoutBlocked ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>
                  Online Payments Are Temporarily Unavailable
                </AlertTitle>
                <AlertDescription>
                  Contact your school for another way to pay or try again later.
                </AlertDescription>
              </Alert>
            ) : null}
            {billingAccount ? (
              <div className="rounded-xl border bg-background/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">Autopay</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {paymentMethodReauthorizationRequired
                        ? paymentMethodReauthorizationPreservesAutopay
                          ? "Autopay is paused only until Stripe confirms the replacement method, then your existing consent resumes."
                          : "Autopay is paused until the method is replaced; review and enable it afterward if desired."
                        : autopayStatus === "enabled"
                        ? "Enabled for eligible invoices using the saved family payment method."
                        : paymentMethodManagement?.hasSavedPaymentMethod
                          ? `${paymentMethodManagement.paymentMethodLabel ?? "Payment method saved securely"} · autopay is off`
                          : "Save a payment method before enabling autopay."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={autopayStatus === "enabled" ? "outline" : "default"}
                    disabled={isPending || paymentCheckoutMethod !== null || autopayStatus === "pending" || (paymentMethodReauthorizationRequired && autopayStatus !== "enabled")}
                    onClick={() => toggleAutopay(autopayStatus !== "enabled")}
                  >
                    {isPending
                      ? "Updating…"
                      : autopayStatus === "enabled"
                        ? "Disable autopay"
                        : "Enable autopay"}
                  </Button>
                </div>
                {autopayError ? (
                  <Alert className="mt-3" variant="destructive" role="alert">
                    <AlertCircle className="size-4" />
                    <AlertTitle>Autopay could not be updated</AlertTitle>
                    <AlertDescription>{autopayError}</AlertDescription>
                  </Alert>
                ) : null}
                {autopayConfirmation ? (
                  <Alert className="mt-3 border-emerald-500/30 bg-emerald-500/10" role="status">
                    <CheckCircle2 className="size-4" />
                    <AlertTitle>Autopay status confirmed</AlertTitle>
                    <AlertDescription>{autopayConfirmation}</AlertDescription>
                  </Alert>
                ) : null}
                {autopayRequirements.length ? (
                  <Alert className="mt-3">
                    <AlertCircle className="size-4" />
                    <AlertTitle>Autopay requirements</AlertTitle>
                    <AlertDescription className="space-y-1">
                      {autopayRequirements.map((requirement) => <p key={requirement}>{requirement}</p>)}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-background/40 p-3 sm:p-4">
                <div className="text-xs text-muted-foreground">Balance due</div>
                <div className="mt-1 text-2xl font-semibold">
                  {parentBalanceReviewRequired && !parentBalanceVisibilityConfirmed
                    ? "Being confirmed"
                    : money(balanceCents)}
                </div>
                {parentBalanceReviewRequired && !parentBalanceVisibilityConfirmed ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Your school is confirming the amount. You can still choose an amount to pay.
                  </div>
                ) : (
                  <p className="sr-only">
                    {parentBalanceVisibilityConfirmed
                      ? "This reviewed family balance is visible while automatic collection remains blocked."
                      : "This is the amount currently due from your family."}
                  </p>
                )}
              </div>
              <div className="rounded-xl border bg-background/40 p-3 sm:p-4">
                <div className="text-xs text-muted-foreground">
                  Latest account activity
                </div>
                {latestAccountLedgerEntry ? (
                  <>
                    <div className="mt-1 truncate font-medium">
                      {latestAccountLedgerEntry.description}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDate(latestAccountLedgerEntry.effectiveAt)}
                    </div>
                  </>
                ) : (
                  <div className="mt-1 font-medium">
                    No account activity recorded
                  </div>
                )}
              </div>
            </div>
            {family.children.some(
              (child) =>
                child.tuitionAssignment?.enabled &&
                child.tuitionAssignment.cadence !== "monthly" &&
                (child.tuitionAssignment.amountCents ?? 0) > 0,
            ) ? (
              <div className="rounded-xl border bg-background/40 p-4">
                <div className="font-medium">Tuition billing cycle</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your weekly rate stays the same. Choose weekly, every two weeks,
                  or every four weeks. Multi-week invoices cover the upcoming two
                  or four weeks. This choice does not create an opening balance or
                  turn on autopay.
                </p>
                <div className="mt-3 space-y-3">
                  {family.children
                    .filter(
                      (child) =>
                        child.tuitionAssignment?.enabled &&
                        child.tuitionAssignment.cadence !== "monthly" &&
                        (child.tuitionAssignment.amountCents ?? 0) > 0,
                    )
                    .map((child) => {
                      const cadence =
                        tuitionCadenceDrafts[child.id] ??
                        (child.tuitionAssignment?.cadence === "biweekly"
                          ? "biweekly"
                          : child.tuitionAssignment?.cadence === "four_week"
                            ? "four_week"
                            : "weekly");
                      const weeklyAmount =
                        child.tuitionAssignment?.amountCents ?? 0;
                      return (
                        <div
                          key={child.id}
                          className="grid gap-3 rounded-lg bg-background/35 p-3 sm:grid-cols-[1fr_minmax(15rem,auto)_auto] sm:items-end"
                        >
                          <div>
                            <div className="text-sm font-medium">
                              {child.fullName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {money(weeklyAmount)}/week ·{" "}
                              {child.tuitionAssignment?.tuitionPlanName ??
                                "Tuition"}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`parent-billing-cycle-${child.id}`}>Billing cycle</Label>
                            <Select
                              value={cadence}
                              onValueChange={(value) =>
                                value &&
                                setTuitionCadenceDrafts((current) => ({
                                  ...current,
                                  [child.id]: value,
                                }))
                              }
                            >
                              <SelectTrigger id={`parent-billing-cycle-${child.id}`} aria-label={`Billing cycle for ${child.fullName}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="weekly">
                                  Weekly · {money(weeklyAmount)}
                                </SelectItem>
                                <SelectItem value="biweekly">
                                  Every 2 weeks · {money(weeklyAmount * 2)}
                                </SelectItem>
                                <SelectItem value="four_week">
                                  Every 4 weeks · {money(weeklyAmount * 4)}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            disabled={isPending}
                            onClick={() => saveTuitionCadence(child)}
                            variant="outline"
                          >
                            Save cycle
                          </Button>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : null}
            <details className="rounded-xl border bg-background/40 p-4 sm:hidden">
              <summary className="cursor-pointer select-none font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                View account history
              </summary>
              <div className="mt-4 space-y-4 border-t pt-4">
                <div>
                  <div className="mb-2 text-sm font-medium">Account activity</div>
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {ledgerEntries.map((entry) => (
                      <div key={entry.id} className="rounded-lg bg-background/45 p-3 text-sm">
                        <div className="font-medium">{entry.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {displayTokenLabel(entry.type)} · {formatDate(entry.effectiveAt)}
                        </div>
                      </div>
                    ))}
                    {!ledgerEntries.length ? (
                      <p className="text-sm text-muted-foreground">No account activity yet.</p>
                    ) : null}
                  </div>
                </div>
                <div className="border-t pt-4">
                  <div className="mb-2 text-sm font-medium">Recent payments</div>
                  <div className="space-y-2">
                    {parentVisiblePayments.slice(0, 5).map((payment) => {
                      const completed = payment.status === "PAID";
                      return (
                        <div key={payment.id} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">
                              {paymentProviderLabel(payment.provider)} · {paymentListLabel(payment, timeZone)}
                            </span>
                            {completed && family ? (
                              <div className="mt-2">
                                <PaymentReceiptPrintButton
                                  buttonLabel="View / print receipt"
                                  payment={{
                                    id: payment.id,
                                    amountCents: payment.amountCents,
                                    principalAmountCents: payment.principalAmountCents ?? null,
                                    processingRecoveryCents: payment.processingRecoveryCents ?? null,
                                    status: payment.status,
                                    provider: payment.provider,
                                    paidAt: payment.paidAt,
                                    externalIdPlaceholder: payment.externalIdPlaceholder ?? null,
                                    invoiceNumber: payment.invoiceNumber ?? null,
                                    paymentReferenceLabel: payment.paymentReferenceLabel ?? "Family account payment",
                                    billingAccount: {
                                      family: {
                                        name: family.name,
                                        billingEmail: family.billingEmail,
                                        centerId: family.centerId ?? null,
                                      },
                                    },
                                  }}
                                  schools={[{ id: family.centerId ?? "", name: centerName ?? "School", ein: centerEin ?? null }]}
                                  schoolTimeZone={centerTimeZone ?? undefined}
                                />
                              </div>
                            ) : null}
                          </div>
                          <span className={completed ? "font-medium text-emerald-700 dark:text-emerald-300" : "font-medium text-muted-foreground"}>
                            {completed ? "−" : ""}{money(payment.amountCents)}
                          </span>
                        </div>
                      );
                    })}
                    {!parentVisiblePayments.length ? (
                      <p className="text-sm text-muted-foreground">No payments posted yet.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </details>
            <div className="hidden rounded-xl border bg-background/40 p-4 sm:block">
              <div className="mb-3">
                <div className="font-medium">Account Activity</div>
                <div className="text-xs text-muted-foreground">
                  Charges, credits, payments, and adjustments included in your
                  family balance.
                </div>
              </div>
              <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1">
                {ledgerEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid gap-1 rounded-lg bg-background/35 p-3 text-sm sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <div className="font-medium">{entry.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {displayTokenLabel(entry.type)} ·{" "}
                        {formatDate(entry.effectiveAt)}
                      </div>
                    </div>
                  </div>
                ))}
                {!ledgerEntries.length ? (
                  <p className="text-sm text-muted-foreground">
                    No ledger entries are visible yet.
                  </p>
                ) : null}
              </div>
              {ledgerPagination &&
              (ledgerPagination.hasPrevious || ledgerPagination.hasNext) ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    Page {ledgerPagination.page} · Up to{" "}
                    {ledgerPagination.pageSize} entries per page
                  </p>
                  <div className="flex gap-2">
                    {ledgerPagination.hasPrevious ? (
                      <ParentPortalDocumentLink
                        href={`${workspaceHref("payments", { familyId: family?.id })}&ledgerPage=${ledgerPagination.page - 1}`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Previous
                      </ParentPortalDocumentLink>
                    ) : null}
                    {ledgerPagination.hasNext ? (
                      <ParentPortalDocumentLink
                        href={`${workspaceHref("payments", { familyId: family?.id })}&ledgerPage=${ledgerPagination.page + 1}`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Next
                      </ParentPortalDocumentLink>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="hidden rounded-xl border bg-background/40 p-4 sm:block">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <ReceiptText className="size-4 text-primary" />
                Recent payments
              </div>
              <div className="space-y-2">
                {parentVisiblePayments.slice(0, 5).map((payment) => {
                  const completed = payment.status === "PAID";
                  return (
                    <div
                      key={payment.id}
                      className="grid grid-cols-[1fr_auto] gap-3 text-sm"
                    >
                      <div>
                        <span className="text-muted-foreground">
                          {paymentProviderLabel(payment.provider)} ·{" "}
                          {paymentListLabel(payment, timeZone)}
                        </span>
                        {completed && family ? (
                          <div className="mt-2">
                            <PaymentReceiptPrintButton
                              buttonLabel="View / print receipt"
                              payment={{
                                id: payment.id,
                                amountCents: payment.amountCents,
                                principalAmountCents: payment.principalAmountCents ?? null,
                                processingRecoveryCents: payment.processingRecoveryCents ?? null,
                                status: payment.status,
                                provider: payment.provider,
                                paidAt: payment.paidAt,
                                externalIdPlaceholder: payment.externalIdPlaceholder ?? null,
                                invoiceNumber: payment.invoiceNumber ?? null,
                                paymentReferenceLabel: payment.paymentReferenceLabel ?? "Family account payment",
                                billingAccount: {
                                  family: {
                                    name: family.name,
                                    billingEmail: family.billingEmail,
                                    centerId: family.centerId ?? null,
                                  },
                                },
                              }}
                              schools={[{ id: family.centerId ?? "", name: centerName ?? "School", ein: centerEin ?? null }]}
                              schoolTimeZone={centerTimeZone ?? undefined}
                            />
                          </div>
                        ) : null}
                      </div>
                      <span
                        className={
                          completed
                            ? "font-medium text-emerald-700 dark:text-emerald-300"
                            : "font-medium text-muted-foreground"
                        }
                      >
                        {completed ? "−" : ""}
                        {money(payment.amountCents)}
                      </span>
                    </div>
                  );
                })}
                {!parentVisiblePayments.length ? (
                  <p className="text-sm text-muted-foreground">
                    No family payments have been posted to this account yet.
                  </p>
                ) : null}
              </div>
            </div>
            <ParentPortalDocumentLink
              href={workspaceHref("family", { familyId: family.id, section: "billing", hash: null })}
              className="flex min-h-16 items-center gap-3 rounded-2xl border bg-background/55 p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"><CreditCard className="size-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold">Billing settings</span><span className="block truncate text-xs text-muted-foreground">Payment methods, billing email &amp; autopay</span></span>
              <ArrowRight className="size-5 shrink-0 text-primary" aria-hidden="true" />
            </ParentPortalDocumentLink>
            {showFamilyPaymentPanel ? (
              <div className="rounded-xl border bg-primary/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {parentBalanceReviewRequired
                        ? "Make an account payment"
                        : "Pay today"}
                    </div>
                    <div className="font-medium">
                      {parentBalanceReviewRequired ? (
                        "Choose the amount you want credited to your family account."
                      ) : nextOpenInvoice ? (
                        <>
                          Family balance {money(balanceCents)} ·{" "}
                          {nextOpenInvoice.number} due{" "}
                          {formatDate(nextOpenInvoice.dueDate)}
                        </>
                      ) : (
                        <>
                          Family balance {money(balanceCents)} · available for
                          secure account payment
                        </>
                      )}
                    </div>
                  </div>
                  <div className="w-full space-y-1 sm:w-56">
                    <Label htmlFor="account-payment-amount">
                      Amount to pay
                      {parentBalanceReviewRequired ? "" : " (optional)"}
                    </Label>
                    <Input
                      id="account-payment-amount"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      max={
                        parentBalanceReviewRequired
                          ? undefined
                          : (balanceCents / 100).toFixed(2)
                      }
                      step="0.01"
                      placeholder={
                        parentBalanceReviewRequired
                          ? "0.00"
                          : money(balanceCents)
                      }
                      value={accountPaymentAmountDollars}
                      onChange={(event) =>
                        setAccountPaymentAmountDollars(event.target.value)
                      }
                      aria-invalid={
                        accountPaymentAmountInvalid ||
                        accountPaymentAmountExceedsBalance
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {parentBalanceReviewRequired
                        ? "Enter the family portion you want to pay."
                        : "Enter a custom amount to split the balance across payment methods, or leave blank to pay the full balance."}
                    </p>
                    {accountPaymentAmountInvalid ? (
                      <p className="text-xs text-destructive">
                        Payment amount must be greater than zero.
                      </p>
                    ) : accountPaymentAmountExceedsBalance ? (
                      <p className="text-xs text-destructive">
                        Amount cannot exceed {money(balanceCents)}.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="w-full sm:w-auto"
                      disabled={
                        isPending ||
                        paymentCheckoutMethod !== null ||
                        checkoutBlocked ||
                        accountPaymentDisabled
                      }
                      aria-busy={paymentCheckoutMethod === "card"}
                      onClick={() => payBalance("card")}
                    >
                      {paymentCheckoutMethod === "card" ? (
                        <LoaderCircle className="animate-spin" data-icon="inline-start" />
                      ) : (
                        <CreditCard data-icon="inline-start" />
                      )}
                      {paymentCheckoutMethod === "card"
                        ? "Opening secure checkout…"
                        : "Debit or credit card"}
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      disabled={
                        isPending ||
                        paymentCheckoutMethod !== null ||
                        checkoutBlocked ||
                        accountPaymentDisabled
                      }
                      aria-busy={paymentCheckoutMethod === "link_bank"}
                      onClick={() => payBalance("link_bank")}
                      variant="outline"
                    >
                      {paymentCheckoutMethod === "link_bank" ? (
                        <LoaderCircle className="animate-spin" data-icon="inline-start" />
                      ) : (
                        <CreditCard data-icon="inline-start" />
                      )}
                      {paymentCheckoutMethod === "link_bank"
                        ? "Opening secure checkout…"
                        : "Pay with Link"}
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      disabled={
                        isPending ||
                        paymentCheckoutMethod !== null ||
                        checkoutBlocked ||
                        accountPaymentDisabled
                      }
                      aria-busy={paymentCheckoutMethod === "ach"}
                      onClick={() => payBalance("ach")}
                      variant="outline"
                    >
                      {paymentCheckoutMethod === "ach" ? (
                        <LoaderCircle className="animate-spin" data-icon="inline-start" />
                      ) : (
                        <Building2 data-icon="inline-start" />
                      )}
                      {paymentCheckoutMethod === "ach"
                        ? "Opening secure checkout…"
                        : "Bank account"}
                    </Button>
                  </div>
                </div>
                {paymentCheckoutMethod ? (
                  <Alert className="mt-3" role="status" aria-live="polite">
                    <LoaderCircle className="size-4 animate-spin" />
                    <AlertTitle>Opening secure checkout</AlertTitle>
                    <AlertDescription>
                      Keep this screen open. Secure payment setup can take a few seconds on a mobile connection.
                    </AlertDescription>
                  </Alert>
                ) : paymentCheckoutError ? (
                  <Alert className="mt-3" variant="destructive" role="alert">
                    <AlertCircle className="size-4" />
                    <AlertTitle>Checkout did not open</AlertTitle>
                    <AlertDescription>
                      {paymentCheckoutError} Your payment status may still be updating. Wait a moment before trying again.
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="mt-2 text-xs text-muted-foreground">
                  No processing fee is added to your payment.
                </div>
                {!parentBalanceReviewRequired && openInvoices.length > 1 ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {openInvoices.length} open invoice records are listed below.
                    Checkout uses only the family balance shown here.
                  </div>
                ) : null}
              </div>
            ) : null}
            {!nextOpenInvoice && firstPendingOpenInvoice?.pendingPayment ? (
              <Alert>
                <AlertCircle className="size-4" />
                <AlertTitle>Payment Processing</AlertTitle>
                <AlertDescription>
                  {firstPendingOpenInvoice.number}:{" "}
                  {pendingPaymentMessage(
                    firstPendingOpenInvoice.pendingPayment,
                  )}
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
                      Choose a shirt color, size, and purchase option. Uniform
                      purchases are added to your family ledger with separate
                      product checkout and receipt details.
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">
                      Order total
                    </div>
                    <div className="text-lg font-semibold">
                      {money(uniformOrderTotalCents)}
                    </div>
                    {selectedUniformProduct ? (
                      <div className="text-xs text-muted-foreground">
                        {uniformSelectedShirtCount} shirt
                        {uniformSelectedShirtCount === 1 ? "" : "s"} selected
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr_1fr_1fr]">
                  <div className="space-y-2">
                    <div id="uniform-color-label" className="text-sm font-medium">Color</div>
                    <div className="flex flex-wrap gap-2" role="group" aria-labelledby="uniform-color-label">
                      {uniformColors.map((color) => (
                        <Button
                          key={color}
                          disabled={isPending}
                          onClick={() => selectUniformColor(color)}
                          size="sm"
                          type="button"
                          aria-pressed={uniformColor === color}
                          variant={
                            uniformColor === color ? "default" : "outline"
                          }
                        >
                          <span
                            className={`size-3 rounded-full border ${color === "Black" ? "bg-black" : "bg-yellow-300"}`}
                          />
                          {color}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div id="uniform-size-label" className="text-sm font-medium">Size</div>
                    <div className="flex flex-wrap gap-2" role="group" aria-labelledby="uniform-size-label">
                      {uniformSizes.map((size) => (
                        <Button
                          key={size}
                          disabled={isPending}
                          onClick={() => setUniformSize(size)}
                          size="sm"
                          type="button"
                          aria-pressed={uniformSize === size}
                          variant={uniformSize === size ? "default" : "outline"}
                        >
                          {size}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div id="uniform-option-label" className="text-sm font-medium">Option</div>
                    <div className="flex flex-wrap gap-2" role="group" aria-labelledby="uniform-option-label">
                      {uniformPurchaseOptions.map((product) => (
                        <Button
                          key={product.purchaseOption}
                          disabled={isPending}
                          onClick={() =>
                            selectUniformPurchaseOption(product.purchaseOption)
                          }
                          size="sm"
                          type="button"
                          aria-pressed={uniformPurchaseOption === product.purchaseOption}
                          variant={
                            uniformPurchaseOption === product.purchaseOption
                              ? "default"
                              : "outline"
                          }
                        >
                          {product.shirtCount === 5 ? "5-pack" : "Individual"}{" "}
                          {money(product.amountCents)}
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
                        onClick={() =>
                          setUniformQuantity((current) =>
                            clampUniformQuantity(current - 1),
                          )
                        }
                        size="icon"
                        type="button"
                        variant="outline"
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <Input
                        className="h-10 w-20 text-center text-sm"
                        disabled={isPending}
                        id="uniformQuantity"
                        inputMode="numeric"
                        max={MAX_UNIFORM_PURCHASE_QUANTITY}
                        min={1}
                        onChange={(event) =>
                          setUniformQuantity(
                            clampUniformQuantity(
                              Number.parseInt(event.target.value, 10),
                            ),
                          )
                        }
                        type="number"
                        value={uniformQuantity}
                      />
                      <Button
                        aria-label="Increase quantity"
                        disabled={
                          isPending ||
                          uniformQuantity >= MAX_UNIFORM_PURCHASE_QUANTITY
                        }
                        onClick={() =>
                          setUniformQuantity((current) =>
                            clampUniformQuantity(current + 1),
                          )
                        }
                        size="icon"
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
                  <Button
                    className="w-full sm:w-auto"
                    disabled={
                      isPending ||
                      paymentCheckoutMethod !== null ||
                      checkoutBlocked ||
                      !selectedUniformProduct
                    }
                    onClick={() => buyUniform("card")}
                  >
                    <CreditCard data-icon="inline-start" />
                    Buy with card
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    disabled={
                      isPending ||
                      paymentCheckoutMethod !== null ||
                      checkoutBlocked ||
                      !selectedUniformProduct
                    }
                    onClick={() => buyUniform("link_bank")}
                    variant="outline"
                  >
                    <CreditCard data-icon="inline-start" />
                    Buy with Link
                  </Button>
                </div>
              </div>
            ) : null}
            <details className="rounded-xl border bg-background/40 p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <ReceiptText className="size-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-semibold">Invoice history</span>
                    <span className="block text-xs text-muted-foreground">
                      {openInvoices.length
                        ? `${openInvoices.length} open invoice${openInvoices.length === 1 ? "" : "s"}`
                        : `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}
                    </span>
                  </span>
                </span>
                <Plus className="size-5 shrink-0 text-primary" aria-hidden="true" />
              </summary>
              <div className="mt-4 space-y-3 border-t pt-4">
                <p className="sr-only">
                  Review invoice dates and payment status. The balance above is
                  the current amount due from your family.
                </p>
            {invoices.map((invoice) => {
              const invoiceHasPendingPayment = Boolean(invoice.pendingPayment);
              return (
                <div
                  key={invoice.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/40 p-4"
                >
                  <div>
                    <div className="font-medium">{invoice.number}</div>
                    <div className="text-xs text-muted-foreground">
                      {invoice.purposeLabel ? `${invoice.purposeLabel} · ` : ""}
                      Due {formatDate(invoice.dueDate)}
                    </div>
                  </div>
                  <Badge
                    variant={
                      invoiceHasPendingPayment
                        ? "secondary"
                        : invoice.status === "OPEN"
                          ? "outline"
                          : "default"
                    }
                  >
                    {invoiceHasPendingPayment
                      ? "Processing"
                      : displayTokenLabel(invoice.status)}
                  </Badge>
                  {typeof invoice.familyDocumentAmountCents === "number" ? <InvoicePrintButton
                    invoice={{
                      number: invoice.number,
                      status: invoice.status,
                      dueDate: invoice.dueDate,
                      totalCents: invoice.familyDocumentAmountCents,
                      childName: invoice.childName ?? null,
                      servicePeriodStart: invoice.servicePeriodStart ?? null,
                      servicePeriodEnd: invoice.servicePeriodEnd ?? null,
                      items: invoice.items?.length
                        ? invoice.items
                        : [{ description: invoice.purposeLabel ?? "Family account charge", amountCents: invoice.familyDocumentAmountCents }],
                      documentTitle: invoice.productCheckoutAvailable ? "Purchase Invoice" : "Tuition Invoice",
                    }}
                    familyName={family.name}
                    schoolName={centerName}
                    schoolEin={centerEin}
                    buttonLabel="View / print invoice"
                  /> : null}
                  {invoice.productCheckoutAvailable &&
                  invoice.status === "OPEN" &&
                  !invoiceHasPendingPayment ? (
                    <div className="flex basis-full flex-wrap gap-2 sm:justify-end">
                      <Button
                        className="w-full sm:w-auto"
                        disabled={
                          isPending ||
                          paymentCheckoutMethod !== null ||
                          checkoutBlocked
                        }
                        onClick={() => payProductInvoice(invoice.id, "card")}
                      >
                        <CreditCard data-icon="inline-start" />
                        Pay invoice by card
                      </Button>
                      <Button
                        className="w-full sm:w-auto"
                        disabled={
                          isPending ||
                          paymentCheckoutMethod !== null ||
                          checkoutBlocked
                        }
                        onClick={() =>
                          payProductInvoice(invoice.id, "link_bank")
                        }
                        variant="outline"
                      >
                        <CreditCard data-icon="inline-start" />
                        Pay invoice with Link
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
            {!invoices.length ? (
              <p className="text-sm text-muted-foreground">
                No invoices are visible yet.
              </p>
            ) : null}
              </div>
            </details>
          </CardContent>
        </Card>
      ) : null}

      {activeView === "messages" ? (
        <Card
          id="messages"
          className={`${styles.parentWorkspace} ${previewMode ? styles.parentWorkspacePreview : ""} scroll-mt-28 gap-0 py-0 shadow-none`}
        >
          <CardHeader className={`${styles.smokedHeader} border-b px-4 py-3`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background"
                  aria-hidden="true"
                >
                  {(centerName ?? "School")
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <div className="min-w-0">
                  <CardTitle as="h2" className="truncate">
                    {centerName ?? "Your school"}
                  </CardTitle>
                  <CardDescription className="truncate">
                    Typically replies during school hours
                  </CardDescription>
                </div>
              </div>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500/10" aria-label="Private family conversation"><span className="size-2.5 rounded-full bg-emerald-600" aria-hidden="true" /></span>
            </div>
          </CardHeader>
          <CardContent className={`${styles.parentChatContent} p-0`}>
            <ol
              ref={messageTimelineRef}
              className={styles.parentTimeline}
              aria-label={`Messages with ${centerName ?? "your school"}`}
            >
              {messages
                .slice(0, 20)
                .reverse()
                .map((item) => {
                  const isFromFamily = Boolean(item.isFromFamily);
                  return (
                    <li
                      key={item.id}
                      className={`${styles.parentMessageRow} ${isFromFamily ? styles.parentMessageRowSelf : ""}`}
                    >
                      <article
                        data-message-origin={isFromFamily ? "family" : "school"}
                        className={`${styles.parentBubble} ${isFromFamily ? styles.parentBubbleSelf : ""}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[0.68rem] text-muted-foreground">
                          <span className="font-semibold">
                            {item.sender?.name ??
                              (isFromFamily ? "You" : (centerName ?? "School"))}
                          </span>
                          <span>{formatTime(item.createdAt)}</span>
                        </div>
                        {item.subject ? (
                          <div className="mt-1 text-sm font-semibold">
                            {item.subject}
                          </div>
                        ) : null}
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                          {item.body}
                        </p>
                        {item.attachments?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.attachments.map((attachment) => {
                              const attachmentContent = (
                                <>
                                  {attachment.kind === "image" ? (
                                    <Camera
                                      className="size-3.5 shrink-0"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <FileText
                                      className="size-3.5 shrink-0"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span className="truncate">
                                    {attachment.filename}
                                  </span>
                                  <span className="shrink-0 opacity-70">
                                    {formatFileSize(attachment.size)}
                                  </span>
                                </>
                              );

                              return attachment.downloadUrl ? (
                                <a
                                  key={attachment.id}
                                  className="inline-flex max-w-full items-center gap-2 rounded-lg border border-current/15 bg-background/35 px-2 py-1.5 text-xs font-medium transition-colors hover:bg-background/55"
                                  href={attachment.downloadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {attachmentContent}
                                </a>
                              ) : (
                                <span
                                  key={attachment.id}
                                  className="inline-flex max-w-full items-center gap-2 rounded-lg border border-current/15 bg-background/35 px-2 py-1.5 text-xs text-muted-foreground"
                                >
                                  {attachmentContent}
                                  <span className="sr-only">
                                    Download unavailable
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        ) : null}
                        {!isFromFamily ? (
                          <Button
                            className="mt-2 -ml-2"
                            variant="ghost"
                            size="sm"
                            onClick={() => startMessageReply(item)}
                          >
                            <Reply data-icon="inline-start" />
                            Reply
                          </Button>
                        ) : null}
                      </article>
                    </li>
                  );
                })}
              {!messages.length ? (
                <li className="flex min-h-64 flex-col items-center justify-center px-6 text-center text-muted-foreground">
                  <MessageSquare className="mb-3 size-8" aria-hidden="true" />
                  <div className="font-medium text-foreground">
                    No messages yet
                  </div>
                  <p className="mt-1 max-w-sm text-sm">
                    Start a conversation with your school using the composer
                    below.
                  </p>
                </li>
              ) : null}
            </ol>

            <form
              className={styles.parentComposer}
              onSubmit={(event) => {
                event.preventDefault();
                sendMessage();
              }}
            >
              {!replyToMessageId && classroomTeachers.length ? (
                <div className="mb-3">
                  <Label htmlFor="parent-message-recipient">Send to</Label>
                  <Select value={messageRecipientId} onValueChange={(value) => setMessageRecipientId(value ?? "school")}>
                    <SelectTrigger id="parent-message-recipient" className="mt-2 w-full" aria-label="Choose message recipient">
                      <SelectValue placeholder="Choose a recipient" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="school">School office</SelectItem>
                      {classroomTeachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.name} · {teacher.classroomNames.join(", ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {replyToMessageId ? (
                <div className={styles.parentReplyContext}>
                  <Reply className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium">Replying to school</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {replyingToSubject || "Selected message"}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setReplyToMessageId("");
                      setReplyingToSubject("");
                    }}
                    aria-label="Cancel reply"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}

              {messageAttachments.length ? (
                <div className={styles.parentAttachmentTray} aria-label="Selected attachments">
                  {messageAttachments.map((file, index) => (
                    <span
                      key={`${file.name}-${file.size}-${index}`}
                      className="inline-flex min-h-11 max-w-[15rem] shrink-0 items-center gap-2 rounded-full border bg-card px-3 text-xs"
                    >
                      <Paperclip className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate">{file.name || "attachment"}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMessageAttachment(index)}
                        aria-label={`Remove ${file.name || "attachment"}`}
                        className="-mr-2"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </Button>
                    </span>
                  ))}
                </div>
              ) : null}

              <div className={styles.parentComposerRow}>
                <Input
                  key={messageAttachmentInputKey}
                  id="portal-message-attachments"
                  name="message-attachments"
                  type="file"
                  multiple
                  aria-label="Attach photos or files"
                  className="absolute overflow-hidden whitespace-nowrap border-0 p-0"
                  style={{ width: 1, height: 1, clip: "rect(0 0 0 0)", clipPath: "inset(50%)" }}
                  accept="image/*,.pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={(event) => addMessageAttachments(event.target.files)}
                />
                <Label
                  htmlFor="portal-message-attachments"
                  className={styles.parentAttachButton}
                  aria-label="Attach photos or files"
                >
                  <Paperclip className="size-5" aria-hidden="true" />
                </Label>
                <Label htmlFor="portal-message" className="sr-only">Message</Label>
                <Textarea
                  id="portal-message"
                  name="message-body"
                  autoComplete="off"
                  enterKeyHint="send"
                  rows={1}
                  className={styles.parentMessageInput}
                  placeholder="Message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  aria-describedby="parent-message-privacy"
                />
                <Button
                  type="submit"
                  size="icon"
                  className={styles.parentSendButton}
                  disabled={
                    isPending || (!message.trim() && !messageAttachments.length)
                  }
                  aria-label={isPending ? "Sending message" : "Send message"}
                >
                  <SendHorizontal className="size-5" aria-hidden="true" />
                </Button>
              </div>
              <p id="parent-message-privacy" className="sr-only">
                Only your family and school can see this conversation.
              </p>
              <input
                id="portal-subject"
                name="message-subject"
                type="hidden"
                value={subject}
                readOnly
              />
            </form>
          </CardContent>
        </Card>
      ) : null}

      {activeView === "family" && activeFamilySection === "documents" ? (
        <div className="grid gap-4">
          {parentPortalDocumentsEnabled ? (
            <Card id="documents" className="scroll-mt-28 shadow-none">
              <CardHeader>
                <CardTitle as="h2">Documents and requests</CardTitle>
                <CardDescription>
                  Review requested documents or send contact and pickup changes
                  to your school.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {documents.slice(0, 5).map((document) => (
                  <details
                    key={document.id}
                    className="group rounded-2xl border bg-background/40"
                  >
                    <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary" aria-hidden="true">
                        <FileText className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{document.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {displayTokenLabel(document.type)} · expires{" "}
                          {formatDate(document.expiresAt)}
                        </span>
                      </span>
                      <Badge>{displayTokenLabel(document.status)}</Badge>
                    </summary>
                    <div className="space-y-3 border-t px-4 pb-4 pt-3">
                        {document.downloadUrl ? (
                          <a
                            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                            href={document.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open uploaded file
                          </a>
                        ) : null}
                    {document.status !== "APPROVED" ? (
                      <div className="space-y-2">
                        {requiresDocumentSignature(document) ? (
                          <div className="space-y-1">
                            <Label
                              htmlFor={`parent-document-signature-${document.id}`}
                            >
                              Type your full name
                            </Label>
                            <Input
                              id={`parent-document-signature-${document.id}`}
                              value={signatureNames[document.id] ?? ""}
                              onChange={(event) =>
                                setSignatureNames((current) => ({
                                  ...current,
                                  [document.id]: event.target.value,
                                }))
                              }
                              autoComplete="name"
                            />
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <Label
                              htmlFor={`parent-document-file-${document.id}`}
                            >
                              Completed document
                            </Label>
                            <Input
                              id={`parent-document-file-${document.id}`}
                              type="file"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,text/plain"
                              onChange={(event) =>
                                setDocumentFiles((current) => ({
                                  ...current,
                                  [document.id]: event.target.files?.[0] ?? null,
                                }))
                              }
                            />
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label
                            htmlFor={`parent-document-note-${document.id}`}
                          >
                            Note for the director (optional)
                          </Label>
                          <Textarea
                            id={`parent-document-note-${document.id}`}
                            value={documentNotes[document.id] ?? ""}
                            onChange={(event) =>
                              setDocumentNotes((current) => ({
                                ...current,
                                [document.id]: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <label className="flex min-h-10 items-start gap-2 text-xs leading-5 text-muted-foreground">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-5 shrink-0 accent-primary"
                            checked={Boolean(
                              signatureAcknowledgements[document.id],
                            )}
                            onChange={(event) =>
                              setSignatureAcknowledgements((current) => ({
                                ...current,
                                [document.id]: event.target.checked,
                              }))
                            }
                          />
                          {requiresDocumentSignature(document)
                            ? "I agree that typing my name and submitting this document is my electronic signature."
                            : "I confirm this submission is complete and ready for school review."}
                        </label>
                        <Button
                          className="w-full sm:w-auto"
                          disabled={
                            isPending ||
                            !signatureAcknowledgements[document.id] ||
                            (requiresDocumentSignature(document)
                              ? !signatureNames[document.id]?.trim()
                              : !documentFiles[document.id])
                          }
                          onClick={() => submitDocument(document.id)}
                          variant="outline"
                        >
                          <FileCheck2 data-icon="inline-start" />
                          {requiresDocumentSignature(document)
                            ? "Sign and Submit"
                            : "Submit for Review"}
                        </Button>
                      </div>
                    ) : null}
                    </div>
                  </details>
                ))}
                <details
                  id="contact-request"
                  className="group scroll-mt-28 rounded-2xl border bg-background/40"
                  aria-labelledby="contact-request-heading"
                >
                  <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary" aria-hidden="true"><FileCheck2 className="size-5" /></span>
                    <span id="contact-request-heading" className="flex-1 text-sm font-medium">Contact or pickup change</span>
                    <span className="text-xs font-medium text-primary group-open:hidden">Start request</span>
                    <span className="hidden text-xs font-medium text-primary group-open:inline">Close</span>
                  </summary>
                  <div className="space-y-3 border-t px-4 pb-4 pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span>Record type</span>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={requestEntity}
                        onChange={(event) => {
                          setRequestEntity(
                            event.target.value as typeof requestEntity,
                          );
                          setRequestTargetId("");
                        }}
                      >
                        <option value="emergency_contact">
                          Emergency contact
                        </option>
                        <option value="authorized_pickup">
                          Authorized pickup
                        </option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>Change</span>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={requestOperation}
                        onChange={(event) => {
                          setRequestOperation(
                            event.target.value as typeof requestOperation,
                          );
                          setRequestTargetId("");
                        }}
                      >
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
                          const records =
                            requestEntity === "emergency_contact"
                              ? (family.emergencyContacts ?? [])
                              : (family.pickups ?? []);
                          const selected = records.find(
                            (item) => item.id === id,
                          );
                          setRequestName(selected?.fullName ?? "");
                          setRequestPhone(selected?.phone ?? "");
                          setRequestRelation(selected?.relation ?? "");
                        }}
                      >
                        <option value="">Choose a record</option>
                        {(requestEntity === "emergency_contact"
                          ? (family.emergencyContacts ?? [])
                          : (family.pickups ?? [])
                        ).map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.fullName}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {requestOperation !== "remove" ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label htmlFor="contact-request-name">Full name</Label>
                        <Input
                          id="contact-request-name"
                          value={requestName}
                          onChange={(event) => setRequestName(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="contact-request-phone">Phone</Label>
                        <Input
                          id="contact-request-phone"
                          type="tel"
                          autoComplete="tel"
                          value={requestPhone}
                          onChange={(event) =>
                            setRequestPhone(event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="contact-request-relation">
                          Relationship to child
                        </Label>
                        <Input
                          id="contact-request-relation"
                          value={requestRelation}
                          onChange={(event) =>
                            setRequestRelation(event.target.value)
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label htmlFor="contact-request-details">
                      Reason for request
                    </Label>
                    <Textarea
                      id="contact-request-details"
                      placeholder="Add details your school should review"
                      value={requestDetails}
                      onChange={(event) => setRequestDetails(event.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full sm:w-auto"
                    disabled={
                      isPending ||
                      !requestDetails.trim() ||
                      ((requestOperation === "update" ||
                        requestOperation === "remove") &&
                        !requestTargetId) ||
                      (requestOperation !== "remove" &&
                        (!requestName.trim() ||
                          !requestPhone.trim() ||
                          !requestRelation.trim()))
                    }
                    onClick={requestContactUpdate}
                  >
                    <FileText data-icon="inline-start" />
                    Send change request
                  </Button>
                  </div>
                </details>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {activeView === "family" && activeFamilySection === "profile" ? (
        <Card id="profile" className="scroll-mt-28 shadow-none">
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <KeyRound className="text-primary" />
              Profile and Security
            </CardTitle>
            <CardDescription>
              Review your contact details, sign-in email, password, and privacy
              choices.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <details className="group rounded-2xl border bg-background/40">
              <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary" aria-hidden="true"><KeyRound className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {currentGuardian?.fullName ??
                      family.guardians[0]?.fullName ??
                      "Parent or guardian"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {currentGuardian?.email ?? family.guardians[0]?.email ?? "Email pending"}
                  </span>
                </span>
                <span className="text-xs font-medium text-primary group-open:hidden">Account details</span>
                <span className="hidden text-xs font-medium text-primary group-open:inline">Close</span>
              </summary>
              <div className="border-t px-4 pb-4 pt-3">
              <div className="flex justify-end">
                <ParentPortalDocumentLink
                  href={workspaceHref("family", {
                    familyId: family.id,
                    section: "documents",
                    hash: "contact-request",
                  })}
                  className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                  })}
                >
                  Request a Correction
                </ParentPortalDocumentLink>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Relationship
                  </dt>
                  <dd className="mt-1 font-medium">
                    {currentGuardian?.relation ??
                      family.guardians[0]?.relation ??
                      "Not listed"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Phone</dt>
                  <dd className="mt-1 font-medium">
                    {currentGuardian?.phone ??
                      family.guardians[0]?.phone ??
                      "Not listed"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Preferred Contact
                  </dt>
                  <dd className="mt-1 font-medium">
                    {communicationPreferenceLabel(
                      currentGuardian?.preferredCommunication ??
                        family.guardians[0]?.preferredCommunication,
                    )}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 rounded-xl border bg-card/70 p-3">
              <div className="text-xs text-muted-foreground">
                Sign-in email
              </div>
              <div className="mt-1 break-words font-medium">
                {currentGuardian?.email ??
                  family.guardians[0]?.email ??
                  "Email pending"}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                This is the personal guardian email on file with the school.
              </p>
              </div>
              </div>
            </details>
            {passwordConfirmation ? (
              <Alert className="border-emerald-500/30 bg-emerald-500/10">
                <CheckCircle2 />
                <AlertTitle>Password changed</AlertTitle>
                <AlertDescription>{passwordConfirmation}</AlertDescription>
              </Alert>
            ) : null}
            <details className="group rounded-2xl border bg-background/40">
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <KeyRound className="size-5 text-primary" aria-hidden="true" />
                <span className="flex-1 font-medium">Password & sign-in</span>
                <span className="text-xs font-medium text-primary group-open:hidden">Manage</span>
                <span className="hidden text-xs font-medium text-primary group-open:inline">Close</span>
              </summary>
            <form
              className="space-y-4 border-t px-4 pb-4 pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                updateProfilePassword();
              }}
            >
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPasswords((visible) => !visible)}
                >
                  {showPasswords ? (
                    <EyeOff data-icon="inline-start" />
                  ) : (
                    <Eye data-icon="inline-start" />
                  )}
                  {showPasswords ? "Hide passwords" : "Show passwords"}
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="profile-current-password">
                    Current password
                  </Label>
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
                    aria-describedby="profile-password-guidance"
                    aria-invalid={
                      newPassword.length > 0 && !passwordLengthReady
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="profile-confirm-password">
                    Confirm password
                  </Label>
                  <Input
                    id="profile-confirm-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    type={showPasswords ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={8}
                    aria-describedby="profile-password-guidance"
                    aria-invalid={
                      confirmPassword.length > 0 && !passwordsMatch
                    }
                  />
                </div>
              </div>
              <p
                id="profile-password-guidance"
                className="text-xs text-muted-foreground"
                aria-live="polite"
              >
                {passwordGuidance}
              </p>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={isPending || !passwordUpdateReady}
              >
                <KeyRound data-icon="inline-start" />
                Update Password
              </Button>
            </form>
            </details>
            <div className="flex flex-col gap-3 rounded-xl border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium">
                  Need help with access, payments, or documents?
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Use the support page for recovery steps and safe contact
                  guidance. Call your school directly for urgent child, pickup,
                  medical, or custody concerns.
                </p>
              </div>
              <ParentPortalDocumentLink
                href={previewHrefBase ?? "/support"}
                className={buttonVariants({
                  variant: "outline",
                  className: "w-full shrink-0 sm:w-auto",
                })}
              >
                <LifeBuoy data-icon="inline-start" aria-hidden="true" />
                Open support
              </ParentPortalDocumentLink>
            </div>
            <details className="group rounded-2xl border border-destructive/30 bg-destructive/5">
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <ShieldCheck className="size-5 text-destructive" aria-hidden="true" />
                <span className="flex-1 font-medium">Privacy & account deletion</span>
                {accountDeletionRequest ? <Badge variant="outline">{displayTokenLabel(accountDeletionRequest.status)}</Badge> : <span className="text-xs font-medium text-primary group-open:hidden">Review</span>}
              </summary>
              <div className="space-y-3 border-t px-4 pb-4 pt-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <ShieldCheck className="size-4 text-destructive" />
                    Privacy and Account Deletion
                    <InfoTip label="About account deletion" side="right">
                      This requests removal of parent portal login access. Some
                      childcare, safety, licensing, billing, payment, and audit
                      records may need to be retained by your school or The BEE
                      Suite.
                    </InfoTip>
                  </div>
                </div>
                {accountDeletionRequest ? (
                  <Badge variant="outline">
                    {displayTokenLabel(accountDeletionRequest.status)}
                  </Badge>
                ) : null}
              </div>
              {accountDeletionRequest ? (
                <div className="rounded-lg border bg-background/60 p-3 text-sm">
                  <div className="font-medium">
                    Request received{" "}
                    {formatDate(accountDeletionRequest.createdAt)}
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Status: {displayTokenLabel(accountDeletionRequest.status)}
                    {accountDeletionRequest.dueAt
                      ? ` · target response by ${formatDate(accountDeletionRequest.dueAt)}`
                      : ""}
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="account-deletion-details">
                      Additional details (optional)
                    </Label>
                    <Textarea
                      id="account-deletion-details"
                      value={accountDeletionDetails}
                      onChange={(event) =>
                        setAccountDeletionDetails(event.target.value)
                      }
                      placeholder="Share anything support or your school should know"
                    />
                  </div>
                  <label className="flex min-h-10 items-start gap-2 text-xs leading-5 text-muted-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5 shrink-0 accent-primary"
                      checked={retentionNoticeAccepted}
                      onChange={(event) =>
                        setRetentionNoticeAccepted(event.target.checked)
                      }
                    />
                    <span>
                      I understand this starts an account deletion request and
                      that required childcare, licensing, safety, billing,
                      payment, and audit records may be retained.
                    </span>
                  </label>
                  <Button
                    className="w-full sm:w-auto"
                    disabled={
                      isPending ||
                      !currentGuardianId ||
                      !retentionNoticeAccepted
                    }
                    onClick={requestAccountDeletion}
                    variant="destructive"
                  >
                    <Trash2 data-icon="inline-start" />
                    Request Account Deletion
                  </Button>
                </>
              )}
              </div>
            </details>
          </CardContent>
        </Card>
      ) : null}

      {activeView === "family" && activeFamilySection === "notifications" ? (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <BellRing className="text-primary" />
              Notification Preferences
            </CardTitle>
            <CardDescription>
              Choose which school updates you want to receive.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {(
              [
                ["portal", "Portal alerts"],
                ["email", "Email updates"],
                ["sms", "SMS updates"],
                ["dailyReports", "Daily reports"],
                ["photos", "Photos"],
                ["billing", "Billing reminders"],
                ["incidents", "Incident notices"],
                ["announcements", "Center announcements"],
              ] as Array<[keyof NotificationPreferences, string]>
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-background/40 p-3 text-sm transition-colors hover:bg-muted/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-primary"
                  checked={preferences[key]}
                  onChange={(event) =>
                    updatePreference(key, event.target.checked)
                  }
                  disabled={!currentGuardianId}
                />
              </label>
            ))}
            <div className="md:col-span-2">
              <Button
                className="w-full sm:w-auto"
                disabled={isPending || !currentGuardianId}
                onClick={saveNotificationPreferences}
              >
                <CalendarDays data-icon="inline-start" />
                Save Preferences
              </Button>
              {!currentGuardianId ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Preference editing appears when signed in as a linked parent
                  or guardian.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
