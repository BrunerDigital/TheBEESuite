"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowUpRight, BadgeDollarSign, Ban, Banknote, Building2, CalendarClock, CheckCircle2, ChevronDown, Copy, CreditCard, FilePenLine, Mail, MinusCircle, Play, PlusCircle, ReceiptText, RotateCcw, Rows3, Save, Search, Send } from "lucide-react";
import { ContextBadge, SummaryMetric } from "@/components/entity-context";
import { useSchoolTimeZoneResolver } from "@/components/school-time-zone-context";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import { scheduleFocusedPortalControlReveal } from "@/lib/focused-portal-control";
import { formatInvoiceDueDate } from "@/lib/invoice-due-date";
import { directorPaymentProgressTitle, type DirectorPaymentProgress } from "@/lib/director-payment-progress";
import { isConfirmedOfflinePaymentReceipt, readOfflinePaymentReceipt } from "@/lib/offline-payment-receipt";
import { clearConfirmedOfflinePaymentOperation, getOrCreateOfflinePaymentOperation, readOfflinePaymentOperation, type OfflinePaymentOperationScope } from "@/lib/offline-payment-operation";
import { formatZonedDateTime, unambiguousZonedDateTimeLocalToUtc, zonedDateTimeLocalValue } from "@/lib/zoned-date-time";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { DisplayValue } from "@/components/ui/editable-display-field";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { defaultAgeGroupOptions, mergeAgeGroupOptions, type DashboardOptions } from "@/lib/dashboard-options";
import {
  STUDENT_UNIFORM_SHIRT_BASE_NAME,
  STUDENT_UNIFORM_SHIRT_BUNDLE_PRODUCT_TYPE,
  STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE,
  STUDENT_UNIFORM_SHIRT_SINGLE_PRICE_CENTS,
  STUDENT_UNIFORM_SHIRT_BUNDLE_PRICE_CENTS,
  STUDENT_UNIFORM_SHIRT_BUNDLE_COUNT,
} from "@/lib/uniform-product-constants";
import type { StripeCheckoutReadiness } from "@/lib/stripe-connect-readiness";
import { StripeTerminalPayment } from "@/components/stripe-terminal-payment";
import { TUITION_CREDIT_CATEGORIES, type TuitionCreditCategory } from "@/lib/tuition-credits";
import { tuitionDescriptionAfterRateSave, tuitionScheduleAfterRateSave } from "@/lib/tuition-rate-schedule";
import { nextBiweeklyInvoiceDate } from "@/lib/tuition-invoice-timing";
import { PAY_AHEAD_MAX_MONTHS, payAheadTotalCents } from "@/lib/pay-ahead";
import {
  ONE_TIME_BILLING_ADJUSTMENT_OPTIONS,
  oneTimeBillingAdjustmentNeedsNote,
  oneTimeBillingAdjustmentOption,
  type OneTimeBillingAdjustmentReason,
} from "@/lib/one-time-billing-adjustments";
import { BillingFamilyPicker } from "@/components/billing-family-picker";
import { FamilyLedgerCard, type FamilyLedgerData } from "@/components/family-ledger-card";
import { billingContextUrl, billingSection, billingCategory, billingFamilySecondaryLabel, type BillingSection } from "@/lib/billing-workspace-context";
import { useBillingAccountOverview } from "@/components/use-billing-account-overview";
import type { BillingAccountOverview } from "@/lib/billing-account-overview";
import { isCurrentlyEnrolledChildRecord, isCurrentlyEnrolledStatus } from "@/lib/enrollment-status";
import { BILLING_TARGET_UNAVAILABLE, resolveBillingChildSelection, resolveBillingFamilySelection } from "@/lib/billing-family-selection";
import {
  childTuitionEligibilityError,
  singleInvoiceFamilyEligibilityError,
  type BillingFamilyAccountCategory,
  type SingleInvoiceChargeSource,
} from "@/lib/prospective-family-billing";

export type BillingWorkbenchFamily = {
  id: string;
  centerId: string | null;
  name: string;
  accountCategory?: BillingFamilyAccountCategory;
  billingEmail: string | null;
  updatedAt?: Date | string | null;
  guardians: Array<{
    id: string;
    fullName: string;
    email: string | null;
    userId: string | null;
  }>;
  billingAccount?: {
    id: string;
    balanceCents: number;
    paymentProgress?: DirectorPaymentProgress | null;
    autopayPlaceholder: boolean;
    paymentMethodManagement?: {
      autopayEnabled: boolean;
      autopayStatus: "enabled" | "disabled" | "pending";
      paymentMethodReauthorizationRequired: boolean;
      paymentMethodReauthorizationRecipientEmails: string[];
      hasStripeCustomer: boolean;
      hasSavedPaymentMethod: boolean;
      stripeCustomerId: string | null;
      stripeDefaultPaymentMethodId: string | null;
      paymentMethodType: string | null;
      paymentMethodLabel: string | null;
      lastUpdatedAt: string | null;
    };
    openInvoices?: Array<{
      id: string;
      number: string;
      status: string;
      dueDate: Date | string;
      totalCents: number;
      hasPendingPayment?: boolean;
      items?: Array<{
        id: string;
        description: string;
        amountCents: number;
        productId: string | null;
      }>;
    }>;
    recentPayments?: Array<{
      id: string;
      amountCents: number;
      refundedCents: number;
      refundableCents: number;
      status: string;
      provider: string;
      paidAt: Date | string | null;
      paymentMethodLabel: string | null;
      stripePaymentIntentId: string | null;
    }>;
  } | null;
  children: Array<{
    id: string;
    fullName: string;
    ageGroup: string;
    enrollmentStatus: string;
    classroomId: string | null;
    startDate: Date | string | null;
    careScheduleType: "full_time" | "part_time" | "unknown";
    scheduledDaysPerWeek: 2 | 3 | 4 | 5 | null;
    tuitionAssignment?: {
      enabled: boolean;
      tuitionPlanId: string | null;
      tuitionPlanName: string | null;
      cadence: string | null;
      amountCents: number | null;
      grossAmountCents: number | null;
      additionalCharges: Array<{ description: string; amountCents: number }>;
      additionalChargesTotalCents: number;
      credits: Array<{ category: TuitionCreditCategory; amountCents: number }>;
      creditsTotalCents: number;
      netAmountCents: number | null;
      billingDay: number | null;
      startsPeriod: string | null;
      invoiceDelayWeeks?: number;
      description: string | null;
    } | null;
  }>;
};

export type BillingWorkbenchCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  state?: string | null;
  timezone?: string | null;
  classrooms: Array<{ id: string; name: string; ageGroup: string }>;
  dashboardOptions?: DashboardOptions;
  isMissHoneysLearningCenter?: boolean;
  hardwareTerminalConfigured?: boolean;
  checkoutReadiness?: Pick<
    StripeCheckoutReadiness,
    "accountId" | "label" | "canAcceptParentPayments" | "blockingReason" | "stripeConfigured" | "webhookConfigured"
  >;
};

export type BillingWorkbenchProduct = {
  id: string;
  name: string;
  type: string;
  amountCents: number;
};

export type BillingWorkbenchTuitionPlan = {
  id: string;
  centerId: string;
  name: string;
  ageGroup: string;
  cadence: string;
  amountCents: number;
  archived?: boolean;
};

type BillingFamilyListMode = BillingFamilyAccountCategory;

type Props = {
  families: BillingWorkbenchFamily[];
  centers: BillingWorkbenchCenter[];
  products: BillingWorkbenchProduct[];
  tuitionPlans: BillingWorkbenchTuitionPlan[];
  currentRole: string;
  currentUserId?: string;
  canOpenFamilyProfile: boolean;
  canManageEnrollment: boolean;
  initialFamilyId?: string;
  initialCenterId?: string;
  initialChildId?: string;
  searchQuery?: string;
  initialSection?: string;
  initialCategory?: string;
  ledger?: FamilyLedgerData;
  accountOverviewFixtures?: Record<string, BillingAccountOverview>;
};

function billingFamilyAccountCategory(family: BillingWorkbenchFamily): BillingFamilyListMode {
  // Keep older callers and cached page data usable while the server metadata rolls out.
  return family.accountCategory ?? "current";
}

type DirectorPaymentMethod = "autopay" | "card_checkout" | "instant_bank_checkout" | "ach_checkout";
type TuitionFundingType = "family" | "voucher";

type BillingWorkbenchOpenInvoice = NonNullable<NonNullable<BillingWorkbenchFamily["billingAccount"]>["openInvoices"]>[number];

type InvoiceEditDraft = {
  invoiceId: string;
  amountDollars: string;
  dueDate: string;
  description: string;
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function currentLocalDateTime(timeZone: string) {
  return zonedDateTimeLocalValue(new Date(), timeZone);
}

function currentLocalDate(timeZone: string) {
  return currentLocalDateTime(timeZone).slice(0, 10);
}

function billingDraftDates(timeZone: string) {
  const localNow = currentLocalDateTime(timeZone);
  const date = localNow.slice(0, 10);
  return { localNow, date, month: date.slice(0, 7), week: currentWeeklyPeriod(new Date(`${date}T12:00:00.000Z`)) };
}

function manualPaymentTimestamp(value: string, timeZone: string) {
  return unambiguousZonedDateTimeLocalToUtc(value, timeZone)?.toISOString() ?? "";
}

function currentBillingPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function currentWeeklyPeriod(date = new Date()) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 7));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function currentPeriodForCadence(cadence: string) {
  return cadence === "weekly" || cadence === "biweekly" || cadence === "four_week" ? currentWeeklyPeriod() : currentBillingPeriod();
}

function periodMatchesCadence(value: string, cadence: string) {
  return cadence === "weekly" || cadence === "biweekly" || cadence === "four_week" ? /^\d{4}-W\d{2}$/i.test(value) : /^\d{4}-\d{2}$/.test(value);
}

function tuitionRateCadence(cadence: string | null | undefined) {
  return cadence === "monthly" ? "monthly" : "weekly";
}

function tuitionBillingCadence(cadence: string | null | undefined) {
  if (cadence === "monthly" || cadence === "biweekly" || cadence === "four_week") return cadence;
  return "weekly";
}

function tuitionCadenceUnit(cadence: string | null | undefined) {
  return tuitionRateCadence(cadence) === "monthly" ? "month" : "week";
}

function money(cents: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(cents / 100);
}

function isUniformShirtProduct(product: BillingWorkbenchProduct) {
  return product.type === STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE || product.type === STUDENT_UNIFORM_SHIRT_BUNDLE_PRODUCT_TYPE;
}

function dollarsToCents(value: string) {
  const amount = Number.parseFloat(value.replace(/[$,]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function tuitionCreditInputs(credits: Array<{ category: TuitionCreditCategory; amountCents: number }>) {
  const values = {} as Record<TuitionCreditCategory, string>;
  for (const category of TUITION_CREDIT_CATEGORIES) {
    const credit = Array.isArray(credits) ? credits.find((item) => item.category === category.id) : null;
    values[category.id] = credit ? String(credit.amountCents / 100) : "";
  }
  return values;
}

function tuitionAdditionalChargeInputs(charges: Array<{ description: string; amountCents: number }> | null | undefined) {
  const normalized = Array.isArray(charges) ? charges.slice(0, 2) : [];
  return [0, 1].map((index) => ({
    description: normalized[index]?.description ?? "",
    amountDollars: normalized[index]?.amountCents ? String(normalized[index].amountCents / 100) : "",
  }));
}

function centsToDollarsInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function dateInputValue(value: Date | string | null | undefined) {
  if (!value) return todayDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? todayDate() : date.toISOString().slice(0, 10);
}

function optionalDateInputValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function careScheduleLabel(value: BillingWorkbenchFamily["children"][number]["careScheduleType"]) {
  if (value === "full_time") return "Full-time";
  if (value === "part_time") return "Part-time";
  return "Not set";
}

function scheduledDaysLabel(child: BillingWorkbenchFamily["children"][number]) {
  return child.scheduledDaysPerWeek
    ? `${child.scheduledDaysPerWeek} days/week`
    : careScheduleLabel(child.careScheduleType);
}

function scheduledDaysValue(child: BillingWorkbenchFamily["children"][number] | null | undefined) {
  if (child?.scheduledDaysPerWeek) return String(child.scheduledDaysPerWeek);
  if (child?.careScheduleType === "full_time") return "5";
  return child?.careScheduleType === "part_time" ? "legacy_part_time" : "unknown";
}

function invoiceLineDescription(invoice: BillingWorkbenchOpenInvoice | null | undefined) {
  return invoice?.items?.[0]?.description || invoice?.number || "";
}

function invoiceEditDraftFromInvoice(invoice: BillingWorkbenchOpenInvoice | null | undefined): InvoiceEditDraft | null {
  if (!invoice) return null;
  return {
    invoiceId: invoice.id,
    amountDollars: centsToDollarsInput(invoice.totalCents),
    dueDate: dateInputValue(invoice.dueDate),
    description: invoiceLineDescription(invoice),
  };
}

function centerLabel(center: BillingWorkbenchCenter) {
  return [center.crmLocationId, center.name].filter(Boolean).join(" · ");
}

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function paymentRequestEmailOptions(family: BillingWorkbenchFamily | null) {
  if (!family) return [];
  const seen = new Set<string>();
  const options: Array<{ email: string; label: string; hasPortalUser: boolean }> = [];
  const add = (emailValue: string | null | undefined, label: string, hasPortalUser = false) => {
    const email = normalizeEmail(emailValue);
    if (!validEmail(email) || seen.has(email)) return;
    seen.add(email);
    options.push({ email, label, hasPortalUser });
  };
  add(family.billingEmail, "Billing email");
  for (const guardian of family.guardians) {
    add(guardian.email, guardian.fullName || "Guardian", Boolean(guardian.userId));
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

function billingFamilySearchText(family: BillingWorkbenchFamily) {
  return [
    family.name,
    family.billingEmail,
    family.guardians.map((guardian) => [guardian.fullName, guardian.email].filter(Boolean).join(" ")).join(" "),
    family.children.map((child) => [child.fullName, child.ageGroup, child.enrollmentStatus, child.tuitionAssignment?.tuitionPlanName].filter(Boolean).join(" ")).join(" "),
  ].filter(Boolean).join(" ").toLowerCase();
}

function preferredTuitionChild(family: BillingWorkbenchFamily | null | undefined, preferredChildId?: string) {
  return resolveBillingChildSelection(family?.children ?? [], preferredChildId, isCurrentlyEnrolledChildRecord);
}

function familyProfileHref(family: BillingWorkbenchFamily | null | undefined) {
  if (!family) return "/family-detail";
  return `/family-detail?familyId=${encodeURIComponent(family.id)}#family-editor`;
}

function formatShortDate(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function BillingWorkbench({ families, centers, products, tuitionPlans, currentRole, currentUserId, canOpenFamilyProfile, canManageEnrollment, initialFamilyId, initialCenterId, initialChildId, searchQuery, initialSection, initialCategory, ledger, accountOverviewFixtures }: Props) {
  const router = useRouter();
  const [offlineReceiptReview, setOfflineReceiptReview] = useState<{ scope: OfflinePaymentOperationScope; requestId: string; receipt: NonNullable<ReturnType<typeof readOfflinePaymentReceipt>> } | null>(null);
  const initialSelection = useMemo(
    () => resolveBillingFamilySelection({
      families: initialFamilyId || !initialCategory ? families : families.filter(family => billingFamilyAccountCategory(family) === billingCategory(initialCategory)), allowedCenterIds: centers.map((center) => center.id),
      requestedFamilyId: initialFamilyId, requestedCenterId: initialCenterId,
      matchesSearch: (family) => Boolean(searchQuery?.trim() && billingFamilySearchText(family).includes(searchQuery.trim().toLowerCase())),
    }),
    [families, centers, initialFamilyId, initialCenterId, searchQuery, initialCategory],
  );
  const initialFamily = initialSelection.family;
  const initialCenter = initialSelection.centerId;
  const [selectionError, setSelectionError] = useState(initialSelection.error);
  const initialLocationTuitionPlans = tuitionPlans.filter((plan) => plan.centerId === initialCenter);
  const initialAssignmentChild = preferredTuitionChild(initialFamily, initialChildId);
  const [childSelectionError, setChildSelectionError] = useState(Boolean(initialChildId && !initialAssignmentChild));
  const initialAssignment = initialAssignmentChild?.tuitionAssignment ?? null;
  const initialAssignedPlan = initialLocationTuitionPlans.find((plan) => plan.id === initialAssignment?.tuitionPlanId) ?? null;
  const initialFamilyIsPast = initialFamily ? billingFamilyAccountCategory(initialFamily) === "past" : false;
  const initialFamilyIsProspective = initialFamily ? billingFamilyAccountCategory(initialFamily) === "prospective" : false;
  const [centerId, setCenterId] = useState(initialCenter);
  const resolveSchoolTimeZone = useSchoolTimeZoneResolver();
  const timeZone = resolveSchoolTimeZone(centerId);
  const [draftDates, setDraftDates] = useState(() => billingDraftDates(timeZone));
  const [familyId, setFamilyId] = useState(initialFamily?.id ?? "");
  const [chargeSource, setChargeSource] = useState<SingleInvoiceChargeSource>(initialFamilyIsProspective ? "custom" : "tuitionPlan");
  const [tuitionPlanId, setTuitionPlanId] = useState(initialAssignedPlan?.id ?? "");
  const uniformShirtProduct = products.find((product) => product.type === STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE) ?? null;
  const [productId, setProductId] = useState(uniformShirtProduct?.id ?? products[0]?.id ?? "");
  const [productQuantity, setProductQuantity] = useState("1");
  const [childId, setChildId] = useState("none");
  const [description, setDescription] = useState(initialFamilyIsProspective ? "Enrollment fee" : "");
  const [amountDollars, setAmountDollars] = useState("");
  const [dueDate, setDueDate] = useState(draftDates.date);
  const [billingPeriod, setBillingPeriod] = useState(draftDates.month);
  const [payAheadMonthCount, setPayAheadMonthCount] = useState("1");
  const [payAheadStartPeriod, setPayAheadStartPeriod] = useState(draftDates.month);
  const [batchTarget, setBatchTarget] = useState("child");
  const [ageGroup, setAgeGroup] = useState("all");
  const [enrollmentStatus, setEnrollmentStatus] = useState("enrolled");
  const [adjustmentReason, setAdjustmentReason] = useState<OneTimeBillingAdjustmentReason>("vacation_credit");
  const [adjustmentAmountDollars, setAdjustmentAmountDollars] = useState("");
  const [adjustmentEffectiveDate, setAdjustmentEffectiveDate] = useState(draftDates.date);
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [checkAmountDollars, setCheckAmountDollars] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [checkPaidAt, setCheckPaidAt] = useState(draftDates.localNow);
  const [checkNotes, setCheckNotes] = useState("");
  const [cashAmountDollars, setCashAmountDollars] = useState("");
  const [cashPaidAt, setCashPaidAt] = useState(draftDates.localNow);
  const [cashReference, setCashReference] = useState("");
  const [cashNotes, setCashNotes] = useState("");
  const [payrollAmountDollars, setPayrollAmountDollars] = useState("");
  const [payrollPaidAt, setPayrollPaidAt] = useState(draftDates.localNow);
  const [payrollReference, setPayrollReference] = useState("");
  const [payrollNotes, setPayrollNotes] = useState("");
  const [refundPaymentIds, setRefundPaymentIds] = useState<string[]>([]);
  const [refundAmountDollars, setRefundAmountDollars] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const refundOperation = useRef<{ fingerprint: string; id: string; paymentIds: string[] } | null>(null);
  const [paymentTarget, setPaymentTarget] = useState("balance");
  const [paymentAmountDollars, setPaymentAmountDollars] = useState("");
  const [advancePayment, setAdvancePayment] = useState(false);
  const [paymentDescription, setPaymentDescription] = useState("Tuition payment");
  const [invoiceEditorId, setInvoiceEditorId] = useState("");
  const [invoiceEditDraft, setInvoiceEditDraft] = useState<InvoiceEditDraft | null>(null);
  const [invoiceVoidReason, setInvoiceVoidReason] = useState("");
  const [assignmentChildId, setAssignmentChildId] = useState(initialAssignmentChild?.id ?? "");
  const [assignmentEnabled, setAssignmentEnabled] = useState(initialAssignment?.enabled === false ? "false" : "true");
  const [assignmentCadence, setAssignmentCadence] = useState(
    initialAssignment?.cadence === "monthly" ? "monthly" : initialAssignment?.cadence === "biweekly" ? "biweekly" : initialAssignment?.cadence === "four_week" ? "four_week" : "weekly",
  );
  const [assignmentBillingDay, setAssignmentBillingDay] = useState(String(initialAssignment?.billingDay ?? 1));
  const [assignmentInvoiceDelayWeeks, setAssignmentInvoiceDelayWeeks] = useState(initialAssignment?.invoiceDelayWeeks === 1 ? "1" : "0");
  const [assignmentTimingReason, setAssignmentTimingReason] = useState("");
  const [assignmentTuitionPlanId, setAssignmentTuitionPlanId] = useState(initialAssignedPlan?.id ?? "");
  const [assignmentStartPeriod, setAssignmentStartPeriod] = useState(
    initialAssignment?.startsPeriod && periodMatchesCadence(initialAssignment.startsPeriod, initialAssignment.cadence ?? "weekly")
      ? initialAssignment.startsPeriod
      : currentPeriodForCadence(initialAssignment?.cadence ?? "weekly"),
  );
  const [assignmentDescription, setAssignmentDescription] = useState(initialAssignment?.description ?? initialAssignment?.tuitionPlanName ?? "");
  const [assignmentChildProgram, setAssignmentChildProgram] = useState(initialAssignmentChild?.ageGroup ?? defaultAgeGroupOptions[0]);
  const [assignmentChildClassroomId, setAssignmentChildClassroomId] = useState(initialAssignmentChild?.classroomId ?? "");
  const [assignmentChildScheduledDays, setAssignmentChildScheduledDays] = useState(
    scheduledDaysValue(initialAssignmentChild),
  );
  const [assignmentChildStartDate, setAssignmentChildStartDate] = useState(optionalDateInputValue(initialAssignmentChild?.startDate));
  const [assignmentCredits, setAssignmentCredits] = useState<Record<TuitionCreditCategory, string>>(
    tuitionCreditInputs(initialAssignment?.credits ?? []),
  );
  const [assignmentAdditionalCharges, setAssignmentAdditionalCharges] = useState(
    tuitionAdditionalChargeInputs(initialAssignment?.additionalCharges),
  );
  const [lastSavedTuitionDraftSignature, setLastSavedTuitionDraftSignature] = useState<string | null>(null);
  const [lastSavedChildContextDraftSignature, setLastSavedChildContextDraftSignature] = useState<string | null>(null);
  const [planEditorId, setPlanEditorId] = useState(initialAssignedPlan?.id ?? "new");
  const [planName, setPlanName] = useState(initialAssignedPlan?.name ?? "");
  const [planAgeGroup, setPlanAgeGroup] = useState(initialAssignedPlan?.ageGroup ?? initialAssignmentChild?.ageGroup ?? defaultAgeGroupOptions[0]);
  const [planCadence, setPlanCadence] = useState(tuitionBillingCadence(initialAssignedPlan?.cadence));
  const [planAmountDollars, setPlanAmountDollars] = useState(initialAssignedPlan ? String(initialAssignedPlan.amountCents / 100) : "");
  const [planFundingType, setPlanFundingType] = useState<TuitionFundingType>(initialAssignedPlan?.amountCents === 0 ? "voucher" : "family");
  const [savedRateRecords, setSavedRateRecords] = useState<BillingWorkbenchTuitionPlan[]>([]);
  const [billingAction, setBillingAction] = useState(billingSection(initialSection) === "payments" ? "online" : initialFamilyIsPast ? "edit" : initialFamilyIsProspective ? "single" : "recurring");
  const [moreBillingActionsExpanded, setMoreBillingActionsExpanded] = useState(false);
  const [familyPickerOpen, setFamilyPickerOpen] = useState(!initialFamily);
  const [workspaceSection, setWorkspaceSection] = useState<BillingSection>(billingSection(initialSection));
  const [familyListMode, setFamilyListMode] = useState<BillingFamilyListMode>(initialFamily ? billingFamilyAccountCategory(initialFamily) : billingCategory(initialCategory));

  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [weeklyRecoveryPeriod, setWeeklyRecoveryPeriod] = useState(draftDates.week);
  const [weeklyRecoveryPreview, setWeeklyRecoveryPreview] = useState<{ centerId: string; dueChildren: number; wouldCreate: number; assignedChildren: number; billingPeriod: string } | null>(null);
  const [manualPaymentEmailCopies, setManualPaymentEmailCopies] = useState<Array<{ clipboardText: string }>>([]);
  const [paymentRequestEmailSelections, setPaymentRequestEmailSelections] = useState<Record<string, string[]>>({});
  const [paymentReviewMethod, setPaymentReviewMethod] = useState<DirectorPaymentMethod | null>(null);
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    const sectionId = decodeURIComponent(window.location.hash.slice(1));
    const target = sectionId === "family-ledger" ? "ledger" : ["billing-payment-methods", "billing-payment-reminder"].includes(sectionId) ? "payments" : ["billing-actions", "child-tuition-setup"].includes(sectionId) ? "tuition" : sectionId === "billing-family-overview" ? "overview" : null;
    if (!target) return;
    startTransition(() => {
      setWorkspaceSection(target);
      setBillingAction(target === "payments" ? "online" : initialFamilyIsPast ? "edit" : initialFamilyIsProspective ? "single" : "recurring");
    });
    const frame = window.requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({ block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [initialFamilyIsPast, initialFamilyIsProspective, startTransition]);
  const offlinePaymentOperationInFlight = useRef(false);
  const billingRequestInFlight = useRef(false);
  const billingViewActive = useRef(true);
  useEffect(() => {
    billingViewActive.current = true;
    return () => { billingViewActive.current = false; };
  }, []);

  function runBillingTransition(action: () => Promise<void>) {
    if (!billingViewActive.current || billingRequestInFlight.current) return;
    billingRequestInFlight.current = true;
    startTransition(async () => {
      try {
        await action();
      } catch {
        if (!billingViewActive.current) return;
        setStatusMessage("");
        setErrorMessage("The billing request was interrupted. Review the current account and Stripe activity, if applicable, before trying the action again.");
      } finally {
        billingRequestInFlight.current = false;
      }
    });
  }

  const scopedFamilies = useMemo(
    () => families.filter((family) => Boolean(centerId) && family.centerId === centerId),
    [centerId, families],
  );
  const familyCounts = useMemo(() => {
    return {
      current: scopedFamilies.filter((family) => billingFamilyAccountCategory(family) === "current").length,
      past: scopedFamilies.filter((family) => billingFamilyAccountCategory(family) === "past").length,
      prospective: scopedFamilies.filter((family) => billingFamilyAccountCategory(family) === "prospective").length,
    } satisfies Record<BillingFamilyListMode, number>;
  }, [scopedFamilies]);
  const effectiveFamilyListMode = familyListMode;
  const filteredFamilies = useMemo(
    () => scopedFamilies.filter((family) => billingFamilyAccountCategory(family) === effectiveFamilyListMode),
    [effectiveFamilyListMode, scopedFamilies],
  );
  const locationTuitionPlans = useMemo(
    () => [
      ...tuitionPlans.filter((plan) => plan.centerId === centerId)
        .filter((plan) => !savedRateRecords.some((saved) => saved.id === plan.id)),
      ...savedRateRecords.filter((plan) => plan.centerId === centerId),
    ],
    [centerId, tuitionPlans, savedRateRecords],
  );
  const effectiveFamilyId = familyId && filteredFamilies.some((family) => family.id === familyId)
    ? familyId
    : "";
  const selectedFamily = filteredFamilies.find((family) => family.id === effectiveFamilyId) ?? null;
  const selectedFamilyAccountCategory = selectedFamily ? billingFamilyAccountCategory(selectedFamily) : null;
  const selectedFamilyIsPast = selectedFamilyAccountCategory === "past";
  const selectedFamilyIsProspective = selectedFamilyAccountCategory === "prospective";
  const selectedCenter = centers.find((center) => center.id === centerId) ?? null;
  const selectedCenterClassrooms = selectedCenter?.classrooms ?? [];
  const selectedCheckoutReadiness = selectedCenter?.checkoutReadiness ?? null;
  const selectedPlan = locationTuitionPlans.find((plan) => plan.id === tuitionPlanId) ?? null;
  const selectedProducts = selectedCenter?.isMissHoneysLearningCenter
    ? products.filter((product) => !isUniformShirtProduct(product))
    : products;
  const firstSelectedProductId = selectedProducts[0]?.id ?? "";
  const effectiveChargeSource: SingleInvoiceChargeSource = selectedFamilyIsProspective && chargeSource === "tuitionPlan"
    ? "custom"
    : chargeSource === "product" && selectedProducts.length === 0
      ? selectedFamilyIsProspective ? "custom" : "tuitionPlan"
      : chargeSource;
  const effectiveProductId = selectedProducts.find((product) => product.id === productId)?.id ?? firstSelectedProductId;
  const selectedProduct = selectedProducts.find((product) => product.id === effectiveProductId) ?? null;
  const effectiveBatchEnrollmentStatus = effectiveChargeSource === "tuitionPlan"
    && enrollmentStatus !== "all"
    && !isCurrentlyEnrolledStatus(enrollmentStatus)
      ? "enrolled"
      : enrollmentStatus;
  const selectedChildren = selectedFamily?.children ?? [];
  const effectiveAssignmentChildId = selectedChildren.some((child) => child.id === assignmentChildId) ? assignmentChildId : "";
  const selectedAssignmentChild = selectedChildren.find((child) => child.id === effectiveAssignmentChildId) ?? null;
  const selectedAssignmentChildIsCurrent = Boolean(selectedAssignmentChild && isCurrentlyEnrolledChildRecord(selectedAssignmentChild));
  const selectedAssignment = selectedAssignmentChild?.tuitionAssignment ?? null;
  const effectiveAssignmentCadence = assignmentCadence;
  const effectiveRateCadence = tuitionRateCadence(effectiveAssignmentCadence);
  const activeWeeklyTuitionAssignments = selectedChildren.filter(
    (child) => isCurrentlyEnrolledChildRecord(child)
      && child.tuitionAssignment?.enabled
      && typeof child.tuitionAssignment.amountCents === "number"
      && child.tuitionAssignment.amountCents >= 0
      && tuitionRateCadence(child.tuitionAssignment.cadence) === effectiveRateCadence,
  );
  const familyWeeklyTuitionCents = activeWeeklyTuitionAssignments.reduce(
    (total, child) => total + (child.tuitionAssignment?.netAmountCents ?? child.tuitionAssignment?.amountCents ?? 0),
    0,
  );
  const effectiveAssignmentPlanId = assignmentTuitionPlanId || selectedAssignment?.tuitionPlanId || "";
  const effectiveAssignmentPlan = locationTuitionPlans.find((plan) => plan.id === effectiveAssignmentPlanId) ?? null;
  const assignmentIsVoucherFunded = assignmentEnabled === "true" && (
    effectiveAssignmentPlan?.amountCents === 0
    || (effectiveAssignmentPlanId === planEditorId && planFundingType === "voucher")
  );
  const effectiveAssignmentBillingDay = effectiveAssignmentCadence === "monthly" ? assignmentBillingDay : "4";
  const effectiveAssignmentStartPeriod = assignmentStartPeriod || selectedAssignment?.startsPeriod || currentPeriodForCadence(effectiveAssignmentCadence);
  const effectiveAssignmentInvoiceDelayWeeks = effectiveAssignmentCadence === "biweekly" && assignmentInvoiceDelayWeeks === "1" ? 1 : 0;
  const assignmentTimingChanging = effectiveAssignmentInvoiceDelayWeeks !== (selectedAssignment?.invoiceDelayWeeks === 1 ? 1 : 0);
  const rateSaveAppliesToChild = Boolean(selectedFamily && selectedAssignmentChild && assignmentEnabled === "true" && selectedAssignmentChildIsCurrent);
  const rateSaveSchedule = tuitionScheduleAfterRateSave({
    assignmentCadence,
    startsPeriod: assignmentStartPeriod,
    savedRateCadence: planCadence,
    defaultPeriod: currentPeriodForCadence,
  });
  const rateSaveInvoiceDelayWeeks = rateSaveSchedule.cadence === "biweekly" && assignmentInvoiceDelayWeeks === "1" ? 1 : 0;
  const rateSaveTimingChanging = rateSaveAppliesToChild
    && rateSaveInvoiceDelayWeeks !== (selectedAssignment?.invoiceDelayWeeks === 1 ? 1 : 0);
  const nextAssignmentInvoiceDate = effectiveAssignmentCadence === "biweekly"
    ? nextBiweeklyInvoiceDate(effectiveAssignmentStartPeriod, effectiveAssignmentInvoiceDelayWeeks, new Date())
    : null;
  const effectiveAssignmentDescription = assignmentDescription || effectiveAssignmentPlan?.name || selectedAssignment?.description || selectedAssignment?.tuitionPlanName || "";
  const effectiveAssignmentCredits = TUITION_CREDIT_CATEGORIES.flatMap(({ id }) => {
    const amountCents = dollarsToCents(assignmentCredits[id]);
    return amountCents > 0 ? [{ category: id, amountCents }] : [];
  });
  const effectiveAssignmentAdditionalCharges = assignmentAdditionalCharges.flatMap((line) => {
    const description = line.description.trim();
    const amountCents = dollarsToCents(line.amountDollars);
    return description && amountCents > 0 ? [{ description, amountCents }] : [];
  });
  const effectiveAssignmentAdditionalChargesTotalCents = effectiveAssignmentAdditionalCharges.reduce((total, line) => total + line.amountCents, 0);
  const effectiveAssignmentCreditsTotalCents = effectiveAssignmentCredits.reduce((total, credit) => total + credit.amountCents, 0);
  const effectiveAssignmentGrossCents = effectiveAssignmentPlan?.amountCents ?? 0;
  const effectiveAssignmentNetCents = effectiveAssignmentGrossCents + effectiveAssignmentAdditionalChargesTotalCents - effectiveAssignmentCreditsTotalCents;
  const effectiveAssignmentInvoiceCents = Math.max(0, effectiveAssignmentNetCents) * (effectiveAssignmentCadence === "four_week" ? 4 : effectiveAssignmentCadence === "biweekly" ? 2 : 1);
  const savedSelectedWeeklyTuitionCents = selectedAssignment?.enabled
    && typeof selectedAssignment.amountCents === "number"
    && selectedAssignment.amountCents >= 0
    && tuitionRateCadence(selectedAssignment.cadence) === effectiveRateCadence
    ? selectedAssignment.netAmountCents ?? selectedAssignment.amountCents
    : 0;
  const selectedSavedRateIsActive = selectedAssignment?.enabled
    && typeof selectedAssignment.amountCents === "number"
    && selectedAssignment.amountCents >= 0
    && tuitionRateCadence(selectedAssignment.cadence) === effectiveRateCadence;
  const selectedDraftRateIsActive = assignmentEnabled === "true" && Boolean(effectiveAssignmentPlan);
  const draftSelectedWeeklyTuitionCents = selectedDraftRateIsActive ? Math.max(0, effectiveAssignmentNetCents) : 0;
  const projectedFamilyWeeklyTuitionCents = Math.max(
    0,
    familyWeeklyTuitionCents - savedSelectedWeeklyTuitionCents + draftSelectedWeeklyTuitionCents,
  );
  const projectedActiveRateCount = Math.max(
    0,
    activeWeeklyTuitionAssignments.length - (selectedSavedRateIsActive ? 1 : 0) + (selectedDraftRateIsActive ? 1 : 0),
  );
  const selectedBillingAccount = selectedFamily?.billingAccount ?? null;
  const selectedPaymentProgress = selectedBillingAccount?.paymentProgress;
  const selectedPaymentMethod = selectedBillingAccount?.paymentMethodManagement ?? null;
  const selectedAutopayStatus = selectedPaymentMethod?.autopayStatus ?? (selectedBillingAccount?.autopayPlaceholder ? "enabled" : "disabled");
  const selectedPaymentRequestEmailOptions = paymentRequestEmailOptions(selectedFamily);
  const selectedPaymentRequestAvailableEmails = selectedPaymentRequestEmailOptions.map((option) => option.email);
  const selectedPaymentRequestEmails = (
    paymentRequestEmailSelections[effectiveFamilyId] ?? selectedPaymentRequestAvailableEmails
  ).filter((email) => selectedPaymentRequestAvailableEmails.includes(email));
  const ageGroups = mergeAgeGroupOptions(
    selectedCenter?.dashboardOptions?.ageGroups,
    locationTuitionPlans.map((plan) => plan.ageGroup),
    families.flatMap((family) => family.children.map((child) => child.ageGroup)),
    planAgeGroup,
  );
  const familyBalanceCents = selectedFamily?.billingAccount?.balanceCents ?? 0;
  const accountOverview = useBillingAccountOverview({ familyId: effectiveFamilyId, centerId, billingAccountId: selectedBillingAccount?.id ?? "", balanceCents: familyBalanceCents, paymentStateKey: JSON.stringify(selectedPaymentProgress ?? null), refreshSource: selectedBillingAccount }, accountOverviewFixtures);
  const pendingPaymentCount = accountOverview.data?.pendingCount ?? selectedPaymentProgress?.count ?? 0;
  const pendingAchCreditCents = accountOverview.data?.provisionalAchCreditCents ?? selectedPaymentProgress?.provisionalAchCreditCents ?? 0;
  const selectedAdjustmentOption = oneTimeBillingAdjustmentOption(adjustmentReason) ?? ONE_TIME_BILLING_ADJUSTMENT_OPTIONS[0];
  const adjustmentAmountCents = dollarsToCents(adjustmentAmountDollars);
  const projectedAdjustmentBalanceCents = familyBalanceCents
    + (selectedAdjustmentOption.adjustmentType === "credit" ? -adjustmentAmountCents : adjustmentAmountCents);
  const openInvoices = selectedBillingAccount?.openInvoices ?? [];
  const hasHouseholdCreditAgainstInvoices = openInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0) > Math.max(0, familyBalanceCents);
  const refundablePayments = (selectedBillingAccount?.recentPayments ?? []).filter((payment) => payment.refundableCents > 0 && payment.stripePaymentIntentId);
  const canApproveRefunds = ["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER"].includes(currentRole);
  const selectedRefundPaymentIds = refundPaymentIds.filter((id) => refundablePayments.some((payment) => payment.id === id));
  const visibleRefundableCents = refundablePayments.reduce((total, payment) => total + payment.refundableCents, 0);
  const selectedPaymentInvoiceId = paymentTarget.startsWith("invoice:") ? paymentTarget.slice("invoice:".length) : "";
  const selectedPaymentInvoice = selectedPaymentInvoiceId
    ? openInvoices.find((invoice) => invoice.id === selectedPaymentInvoiceId) ?? null
    : null;
  const selectedInvoiceHasPendingPayment = selectedPaymentInvoice?.hasPendingPayment === true;
  const effectiveInvoiceEditorId = invoiceEditorId && openInvoices.some((invoice) => invoice.id === invoiceEditorId)
    ? invoiceEditorId
    : openInvoices[0]?.id ?? "";
  const selectedEditableInvoice = effectiveInvoiceEditorId
    ? openInvoices.find((invoice) => invoice.id === effectiveInvoiceEditorId) ?? null
    : null;
  const activeInvoiceEditDraft = invoiceEditDraft?.invoiceId === selectedEditableInvoice?.id
    ? invoiceEditDraft
    : invoiceEditDraftFromInvoice(selectedEditableInvoice);
  const invoiceEditAmountDollars = activeInvoiceEditDraft?.amountDollars ?? "";
  const invoiceEditDueDate = activeInvoiceEditDraft?.dueDate ?? todayDate();
  const invoiceEditDescription = activeInvoiceEditDraft?.description ?? "";
  const invoiceEditAmountCents = dollarsToCents(invoiceEditAmountDollars);
  const invoiceEditDeltaCents = selectedEditableInvoice ? invoiceEditAmountCents - selectedEditableInvoice.totalCents : 0;
  const effectivePaymentTarget = selectedPaymentInvoiceId && !selectedPaymentInvoice ? "balance" : paymentTarget;
  const directorPaymentAmountCents = effectivePaymentTarget === "custom"
    ? dollarsToCents(paymentAmountDollars)
    : effectivePaymentTarget.startsWith("invoice:")
      ? Math.min(selectedPaymentInvoice?.totalCents ?? 0, hasHouseholdCreditAgainstInvoices ? Math.max(0, familyBalanceCents) : Number.MAX_SAFE_INTEGER)
      : accountOverview.data?.collectibleCents ?? familyBalanceCents;
  const directorPaymentTargetLabel = effectivePaymentTarget === "custom"
    ? "custom amount"
    : effectivePaymentTarget.startsWith("invoice:")
      ? `invoice ${selectedPaymentInvoice?.number ?? ""}`.trim()
      : "collectible family balance";
  const selectedChildSummary = selectedChildren.length
    ? `${selectedChildren.length} child${selectedChildren.length === 1 ? "" : "ren"}`
    : selectedFamilyIsPast ? "Past family" : "No children";
  const savedAssignmentCadence = selectedAssignment?.cadence === "monthly"
    ? "monthly"
    : selectedAssignment?.cadence === "biweekly"
      ? "biweekly"
      : selectedAssignment?.cadence === "four_week"
        ? "four_week"
        : "weekly";
  const savedAssignmentStartPeriod = selectedAssignment?.startsPeriod && periodMatchesCadence(selectedAssignment.startsPeriod, selectedAssignment.cadence ?? "weekly")
    ? selectedAssignment.startsPeriod
    : currentPeriodForCadence(selectedAssignment?.cadence ?? "weekly");
  const assignmentTuitionDraftSignature = JSON.stringify({
    enabled: assignmentEnabled,
    cadence: assignmentCadence,
    billingDay: assignmentBillingDay,
    invoiceDelayWeeks: assignmentInvoiceDelayWeeks,
    tuitionPlanId: assignmentTuitionPlanId,
    startPeriod: assignmentStartPeriod,
    description: assignmentDescription,
    credits: assignmentCredits,
    additionalCharges: assignmentAdditionalCharges,
  });
  const persistedTuitionDraftSignature = JSON.stringify({
    enabled: selectedAssignment?.enabled === false ? "false" : "true",
    cadence: savedAssignmentCadence,
    billingDay: String(selectedAssignment?.billingDay ?? 1),
    invoiceDelayWeeks: selectedAssignment?.invoiceDelayWeeks === 1 ? "1" : "0",
    tuitionPlanId: locationTuitionPlans.find((plan) => plan.id === selectedAssignment?.tuitionPlanId)?.id ?? "",
    startPeriod: savedAssignmentStartPeriod,
    description: selectedAssignment?.description ?? selectedAssignment?.tuitionPlanName ?? "",
    credits: tuitionCreditInputs(selectedAssignment?.credits ?? []),
    additionalCharges: tuitionAdditionalChargeInputs(selectedAssignment?.additionalCharges),
  });
  const assignmentChildContextDraftSignature = JSON.stringify({
    program: assignmentChildProgram,
    classroomId: assignmentChildClassroomId,
    scheduledDays: assignmentChildScheduledDays,
    startDate: assignmentChildStartDate,
  });
  const persistedChildContextDraftSignature = JSON.stringify({
    program: selectedAssignmentChild?.ageGroup ?? defaultAgeGroupOptions[0],
    classroomId: selectedAssignmentChild?.classroomId ?? "",
    scheduledDays: scheduledDaysValue(selectedAssignmentChild),
    startDate: optionalDateInputValue(selectedAssignmentChild?.startDate),
  });
  const assignmentDraftIsDirty = Boolean(selectedAssignmentChild) && (
    assignmentTuitionDraftSignature !== (lastSavedTuitionDraftSignature ?? persistedTuitionDraftSignature)
    || assignmentChildContextDraftSignature !== (lastSavedChildContextDraftSignature ?? persistedChildContextDraftSignature)
  );
  const planBeingEdited = planEditorId === "new" ? null : locationTuitionPlans.find((plan) => plan.id === planEditorId) ?? null;
  const planDraftIsDirty = planBeingEdited
    ? planName !== planBeingEdited.name
      || planAgeGroup !== planBeingEdited.ageGroup
      || planCadence !== tuitionBillingCadence(planBeingEdited.cadence)
      || dollarsToCents(planAmountDollars) !== planBeingEdited.amountCents
      || planFundingType !== (planBeingEdited.amountCents === 0 ? "voucher" : "family")
    : Boolean(planName.trim() || planAmountDollars.trim());
  const invoiceDraftIsDirty = Boolean(
    invoiceEditDraft
    && selectedEditableInvoice
    && (
      invoiceEditAmountCents !== selectedEditableInvoice.totalCents
      || invoiceEditDueDate !== dateInputValue(selectedEditableInvoice.dueDate)
      || invoiceEditDescription !== invoiceLineDescription(selectedEditableInvoice)
    )
  );
  const hasUncommittedBillingInput = Boolean(
    amountDollars.trim()
    || description !== (selectedFamilyIsProspective ? "Enrollment fee" : "")
    || paymentDescription !== "Tuition payment"
    || paymentTarget !== "balance"
    || childId !== "none"
    || productQuantity !== "1"
    || productId !== (uniformShirtProduct?.id ?? products[0]?.id ?? "")
    || chargeSource !== (selectedFamilyIsProspective ? "custom" : "tuitionPlan")
    || batchTarget !== "child" || ageGroup !== "all" || enrollmentStatus !== "enrolled"
    || adjustmentReason !== "vacation_credit"
    || dueDate !== draftDates.date || adjustmentEffectiveDate !== draftDates.date
    || billingPeriod !== draftDates.month || weeklyRecoveryPeriod !== draftDates.week
    || payAheadMonthCount !== "1" || payAheadStartPeriod !== draftDates.month
    || checkPaidAt !== draftDates.localNow || cashPaidAt !== draftDates.localNow || payrollPaidAt !== draftDates.localNow
    || adjustmentAmountDollars.trim()
    || adjustmentNote.trim()
    || checkAmountDollars.trim()
    || checkNumber.trim()
    || checkNotes.trim()
    || cashAmountDollars.trim()
    || cashReference.trim()
    || cashNotes.trim()
    || payrollAmountDollars.trim()
    || payrollReference.trim()
    || payrollNotes.trim()
    || refundAmountDollars.trim()
    || refundReason.trim()
    || refundPaymentIds.length
    || paymentAmountDollars.trim()
    || invoiceVoidReason.trim()
    || invoiceDraftIsDirty
    || assignmentDraftIsDirty
    || planDraftIsDirty
  );

  useUnsavedChangesGuard(hasUncommittedBillingInput || isPending, isPending ? "A billing request is still in progress. Leaving does not cancel it. Review this account before retrying. Leave this page?" : "This billing workspace has unsaved input. Discard it and leave this page?");

  function billingContextDescription(childName?: string) {
    return [
      selectedFamily?.name ?? "selected family",
      selectedFamily ? billingFamilySecondaryLabel(selectedFamily) : undefined,
      selectedCenter ? centerLabel(selectedCenter) : "selected school",
      childName,
    ].filter(Boolean).join(" / ");
  }

  function confirmBillingAction(action: string, childName?: string) {
    if (!selectedFamily) return false;
    return window.confirm(`You are about to ${action} for ${billingContextDescription(childName)}. Continue?`);
  }

  function confirmDiscardBillingInput() {
    if (billingRequestInFlight.current) return false;
    return !hasUncommittedBillingInput
      || window.confirm("This billing workspace has unsaved input. Discard it and change the selected school, family, or child?");
  }

  function persistContext(nextFamilyId: string, nextCenterId: string, section = workspaceSection, resetChild = false, category = familyListMode) {
    const nextFamily = families.find(family => family.id === nextFamilyId && family.centerId === nextCenterId);
    window.history.replaceState(null, "", billingContextUrl(window.location.href, { familyId: nextFamilyId, centerId: nextCenterId, section, category: nextFamily ? billingFamilyAccountCategory(nextFamily) : category }, resetChild));
  }

  function changeWorkspaceSection(value: string) {
    if (billingRequestInFlight.current || isPending) return;
    const section = billingSection(value);
    setWorkspaceSection(section);
    if (section === "payments") setBillingAction("online");
    if (section === "tuition") setBillingAction(selectedFamilyIsPast ? "edit" : selectedFamilyIsProspective ? "single" : "recurring");
    setMoreBillingActionsExpanded(false);
    persistContext(effectiveFamilyId, centerId, section);
  }

  function updateInvoiceEditDraft(patch: Partial<Omit<InvoiceEditDraft, "invoiceId">>) {
    if (!selectedEditableInvoice) return;
    setInvoiceEditDraft((current) => ({
      ...(current?.invoiceId === selectedEditableInvoice.id ? current : invoiceEditDraftFromInvoice(selectedEditableInvoice)!),
      ...patch,
    }));
  }

  function paymentMethodLabel(method: DirectorPaymentMethod) {
    if (method === "autopay") return "Process invoice with autopay";
    if (method === "card_checkout") return "Open Digital Terminal on this device";
    if (method === "instant_bank_checkout") return "Open Link payment";
    return "Open bank account payment";
  }

  function paymentRouteSummary(method: DirectorPaymentMethod) {
    if (method === "autopay") return "Account credit is applied first, then any remaining invoice balance is charged to the family's parent-authorized autopay payment method.";
    if (method === "card_checkout") return "Opens a secure card payment form.";
    if (method === "instant_bank_checkout") return "Opens a secure Link payment form.";
    return "Opens a secure bank account payment form.";
  }

  function openPaymentReview(method: DirectorPaymentMethod) {
    if (billingRequestInFlight.current) return;
    if (effectivePaymentTarget === "balance" && (!accountOverview.data || accountOverview.data.responsibilityReviewRequired)) return setErrorMessage("Verify the collectible family amount before collecting a balance payment.");
    if (!selectedFamily || !selectedBillingAccount) {
      return setErrorMessage("Choose a family with a billing account before processing a payment.");
    }
    if (method === "autopay" && selectedFamilyIsPast) {
      return setErrorMessage("Autopay is unavailable for a past family account. Use a one-time payment method instead.");
    }
    if (method === "autopay" && !effectivePaymentTarget.startsWith("invoice:")) {
      return setErrorMessage("Choose an open invoice before running autopay.");
    }
    if (method === "autopay" && selectedInvoiceHasPendingPayment) {
      return setErrorMessage("This invoice already has a pending payment. Wait for it to finish before trying autopay again.");
    }
    if (directorPaymentAmountCents <= 0) {
      return setErrorMessage("Enter or choose a payment amount greater than zero.");
    }
    if (!selectedCheckoutReadiness?.canAcceptParentPayments) {
      return setErrorMessage(selectedCheckoutReadiness?.blockingReason || "Parent payments are not ready for this school.");
    }
    setStatusMessage("");
    setErrorMessage("");
    setPaymentReviewMethod(method);
  }

  function manageFamilyPaymentMethod(action: "setup" | "portal", paymentMethodCategory: "ach" | "card" | "link_bank" | "default" = "default") {
    if (!selectedFamily) return setErrorMessage("Choose a family before managing payment information.");
    runBillingTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/billing/payment-method-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingAccountId: selectedBillingAccount?.id,
          familyId: selectedFamily.id,
          action,
          paymentMethodCategory,
          returnPath: billingContextUrl(new URL("/billing-invoices", window.location.origin).href, { familyId: effectiveFamilyId, centerId, section: "payments", category: familyListMode }),
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; url?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Payment method management could not be opened.");
        return;
      }
      if (json?.url) {
        if (!billingViewActive.current) return;
        window.location.href = json.url;
        return;
      }
      setStatusMessage("Payment method settings updated. Autopay was not changed.");
      if (billingViewActive.current) router.refresh();
    });
  }

  function processParentPayment(method: DirectorPaymentMethod) {
    if (!selectedFamily || !selectedBillingAccount) {
      return setErrorMessage("Choose a family with a billing account before processing a payment.");
    }
    if (method === "autopay" && selectedFamilyIsPast) {
      return setErrorMessage("Autopay is unavailable for a past family account. Use a one-time payment method instead.");
    }
    if (method === "autopay" && !effectivePaymentTarget.startsWith("invoice:")) {
      return setErrorMessage("Choose an open invoice before running autopay.");
    }
    if (directorPaymentAmountCents <= 0) {
      return setErrorMessage("Enter or choose a payment amount greater than zero.");
    }
    if (!selectedCheckoutReadiness?.canAcceptParentPayments) {
      return setErrorMessage(selectedCheckoutReadiness?.blockingReason || "Parent payments are not ready for this school.");
    }

    const invoiceId = effectivePaymentTarget.startsWith("invoice:") ? selectedPaymentInvoice?.id ?? "" : "";
    setPaymentReviewMethod(null);

    runBillingTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");

      if (invoiceId && method === "autopay") {
        const response = await fetch("/api/billing/autopay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId,
            dryRun: false,
            mode: "charge",
            retryFailed: true,
            limit: 1,
          }),
        });
        const json = await response.json().catch(() => null) as {
          ok?: boolean;
          error?: string;
          paid?: number;
          processing?: number;
          failed?: number;
          skipped?: number;
          results?: Array<{ status: string; reason?: string | null; stripePaymentIntentId?: string | null }>;
        } | null;
        const first = json?.results?.[0];
        if (!response.ok || !json?.ok || !first || first.status === "failed" || first.status === "skipped") {
          setErrorMessage(json?.error || first?.reason || "The invoice could not be processed with the saved payment method.");
          return;
        }
        setStatusMessage(
          first?.status === "paid" && !first.stripePaymentIntentId
            ? selectedPaymentInvoice?.number
              ? `Invoice ${selectedPaymentInvoice.number} was paid with account credit.`
              : "The selected invoice was paid with account credit."
            : `Autopay payment ${first?.status === "paid" ? "recorded" : "is processing"} for ${selectedPaymentInvoice?.number ?? "the selected invoice"}.`,
        );
        if (billingViewActive.current) router.refresh();
        return;
      }

      if (invoiceId && !hasHouseholdCreditAgainstInvoices) {
        const response = await fetch("/api/billing/checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId,
            paymentMethodCategory: method === "card_checkout" ? "card" : method === "instant_bank_checkout" ? "link_bank" : "ach",
            collectionMode: method === "card_checkout" ? "director_card_terminal" : method === "instant_bank_checkout" ? "director_instant_bank_checkout" : "director_ach_checkout",
            source: "director_dashboard",
            returnPath: billingContextUrl(new URL("/billing-invoices", window.location.origin).href, { familyId: effectiveFamilyId, centerId, section: "payments", category: familyListMode }),
          }),
        });
        const json = await response.json().catch(() => null) as { error?: string; url?: string } | null;
        if (!response.ok || !json?.url) {
          setErrorMessage(json?.error || "The secure payment form could not be opened.");
          return;
        }
        if (!billingViewActive.current) return;
        window.location.href = json.url;
        return;
      }

      const response = await fetch("/api/billing/family-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingAccountId: selectedBillingAccount.id,
          familyId: selectedFamily.id,
          amountCents: directorPaymentAmountCents,
          ...(invoiceId ? { preferredInvoiceId: invoiceId } : {}),
          advancePayment: effectivePaymentTarget === "custom" && advancePayment,
          method,
          description: paymentDescription,
          collectionMode: method === "card_checkout" ? "director_card_terminal" : method === "instant_bank_checkout" ? "director_instant_bank_checkout" : "director_ach_checkout",
          source: "director_dashboard",
          returnPath: billingContextUrl(new URL("/billing-invoices", window.location.origin).href, { familyId: effectiveFamilyId, centerId, section: "payments", category: familyListMode }),
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; url?: string; status?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Payment could not be processed.");
        return;
      }
      if (json?.url) {
        if (!billingViewActive.current) return;
        window.location.href = json.url;
        return;
      }
      setStatusMessage(`Saved payment method charge ${json?.status === "paid" ? "recorded" : "submitted"} for the selected family balance.`);
      if (billingViewActive.current) router.refresh();
    });
  }
  function togglePaymentRequestEmail(email: string) {
    setPaymentRequestEmailSelections((current) => {
      const currentForFamily = current[effectiveFamilyId] ?? selectedPaymentRequestAvailableEmails;
      const nextForFamily = currentForFamily.includes(email)
        ? currentForFamily.filter((item) => item !== email)
        : [...currentForFamily, email];
      return { ...current, [effectiveFamilyId]: nextForFamily };
    });
  }

  function sendPaymentMethodRequest(intent: "payment_steps" | "instant_bank_verification" | "payment_method_reauthorization" = "payment_steps") {
    if (!selectedFamily) return setErrorMessage("Choose a family before sending a payment form.");
    if (selectedFamilyIsPast) return setErrorMessage("Payment method links are unavailable for a past family account. Use a one-time payment method instead.");
    const requestEmails = intent === "payment_method_reauthorization"
      ? selectedPaymentMethod?.paymentMethodReauthorizationRecipientEmails ?? []
      : selectedPaymentRequestEmails;
    if (!requestEmails.length) return setErrorMessage(intent === "payment_method_reauthorization"
      ? "The guardian who enabled autopay needs a linked family email before a replacement link can be sent."
      : "Choose at least one family email to receive the payment form.");
    runBillingTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      setManualPaymentEmailCopies([]);
      const response = await fetch("/api/billing/payment-method-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: selectedFamily.id,
          emails: requestEmails,
          intent,
        }),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        emailsSent?: number;
        notificationsCreated?: number;
        results?: Array<{ email: string; ok: boolean; error?: string }>;
        manualCopies?: Array<{ clipboardText: string }>;
      } | null;
      setManualPaymentEmailCopies(json?.manualCopies ?? []);
      if (!response.ok) {
        const firstFailure = json?.results?.find((result) => !result.ok);
        setErrorMessage(json?.error || firstFailure?.error || "Payment form could not be sent.");
        return;
      }
      const failed = json?.results?.filter((result) => !result.ok) ?? [];
      const label = intent === "instant_bank_verification"
        ? "bank verification email"
        : intent === "payment_method_reauthorization"
          ? "replacement payment method email"
          : "tuition payment link email";
      setStatusMessage(
        `${json?.emailsSent ?? 0} ${label}${json?.emailsSent === 1 ? "" : "s"} sent and ${json?.notificationsCreated ?? 0} Parent Portal notification${json?.notificationsCreated === 1 ? "" : "s"} created.${failed.length ? ` ${failed.length} email${failed.length === 1 ? "" : "s"} need attention.` : ""}`,
      );
    });
  }

  async function copyPaymentEmails() {
    if (!manualPaymentEmailCopies.length) return;
    try {
      await navigator.clipboard.writeText(manualPaymentEmailCopies.map((copy) => copy.clipboardText).join("\n\n---\n\n"));
      setStatusMessage(`${manualPaymentEmailCopies.length} payment email${manualPaymentEmailCopies.length === 1 ? "" : "s"} copied for manual sending.`);
      setErrorMessage("");
    } catch {
      setErrorMessage("The payment email copy is ready, but the browser blocked clipboard access.");
    }
  }

  function chargePayload() {
    return {
      chargeSource: effectiveChargeSource,
      tuitionPlanId: effectiveChargeSource === "tuitionPlan" ? tuitionPlanId : undefined,
      productId: effectiveChargeSource === "product" ? effectiveProductId : undefined,
      quantity: effectiveChargeSource === "product" ? productQuantity : undefined,
      description,
      amountDollars: effectiveChargeSource === "custom" ? amountDollars : undefined,
    };
  }

  function resetFamilyBoundBillingDrafts(nextFamily: BillingWorkbenchFamily | null, nextCenterId: string) {
    const dates = billingDraftDates(resolveSchoolTimeZone(nextCenterId));
    setDraftDates(dates);
    setChargeSource(nextFamily && billingFamilyAccountCategory(nextFamily) === "prospective" ? "custom" : "tuitionPlan");
    setProductId(uniformShirtProduct?.id ?? products[0]?.id ?? "");
    setProductQuantity("1");
    setChildId("none");
    setDescription(nextFamily && billingFamilyAccountCategory(nextFamily) === "prospective" ? "Enrollment fee" : "");
    setAmountDollars("");
    setDueDate(dates.date);
    setBillingPeriod(dates.month);
    setPayAheadMonthCount("1"); setPayAheadStartPeriod(dates.month);
    setBatchTarget("child");
    setAgeGroup("all");
    setEnrollmentStatus("enrolled");
    setAdjustmentReason("vacation_credit");
    setAdjustmentAmountDollars("");
    setAdjustmentEffectiveDate(dates.date);
    setAdjustmentNote("");
    setCheckAmountDollars(""); setCheckNumber(""); setCheckNotes(""); setCheckPaidAt(dates.localNow);
    setCashAmountDollars(""); setCashReference(""); setCashNotes(""); setCashPaidAt(dates.localNow);
    setPayrollAmountDollars(""); setPayrollReference(""); setPayrollNotes(""); setPayrollPaidAt(dates.localNow);
    setRefundPaymentIds([]); setRefundAmountDollars(""); setRefundReason("");
    setPaymentTarget("balance"); setPaymentAmountDollars(""); setAdvancePayment(false); setPaymentDescription("Tuition payment");
    setInvoiceEditorId(""); setInvoiceEditDraft(null); setInvoiceVoidReason("");
    setWeeklyRecoveryPeriod(dates.week); setWeeklyRecoveryPreview(null);
    setManualPaymentEmailCopies([]); setPaymentReviewMethod(null);
    setStatusMessage(""); setErrorMessage("");
    setBillingAction(workspaceSection === "payments" ? "online" : nextFamily && billingFamilyAccountCategory(nextFamily) === "past" ? "edit" : nextFamily && billingFamilyAccountCategory(nextFamily) === "prospective" ? "single" : "recurring");
    setMoreBillingActionsExpanded(false);
  }

  function handleCenterChange(value: string | null) {
    if (offlinePaymentOperationInFlight.current || isPending || !value || !centers.some((center) => center.id === value) || value === centerId || !confirmDiscardBillingInput()) return;
    const nextPlans = tuitionPlans.filter((plan) => plan.centerId === value);
    const nextFamily = families.find((family) => family.centerId === value) ?? null;
    resetFamilyBoundBillingDrafts(nextFamily, value);
    setCenterId(value);
    setSelectionError(null);
    setFamilyId(nextFamily?.id ?? "");
    persistContext(nextFamily?.id ?? "", value, workspaceSection, true);
    setFamilyListMode(nextFamily ? billingFamilyAccountCategory(nextFamily) : "current");
    applyFamilyTuitionContext(nextFamily, nextPlans);
  }

  function handleFamilyChange(value: string | null) {
    if (offlinePaymentOperationInFlight.current || isPending || !value || value === effectiveFamilyId || !filteredFamilies.some((family) => family.id === value) || !confirmDiscardBillingInput()) return;
    const nextFamily = filteredFamilies.find((family) => family.id === value) ?? null;
    resetFamilyBoundBillingDrafts(nextFamily, centerId);
    if (nextFamily) setFamilyListMode(billingFamilyAccountCategory(nextFamily));
    setFamilyId(value);
    persistContext(value, centerId, workspaceSection, true);
    setSelectionError(null);
    applyFamilyTuitionContext(nextFamily, locationTuitionPlans);
  }

  function handleTuitionPlanChange(value: string | null) {
    if (isPending || !value) return;
    setTuitionPlanId(value);
    const nextPlan = locationTuitionPlans.find((plan) => plan.id === value);
    if (nextPlan) setAgeGroup(nextPlan.ageGroup || "all");
  }

  function applyFamilyTuitionContext(
    family: BillingWorkbenchFamily | null,
    availablePlans: BillingWorkbenchTuitionPlan[],
    preferredChildId?: string,
  ) {
    const child = preferredTuitionChild(family, preferredChildId);
    const assignment = child?.tuitionAssignment ?? null;
    const assignedPlan = availablePlans.find((plan) => plan.id === assignment?.tuitionPlanId) ?? null;

    setLastSavedTuitionDraftSignature(null);
    setChildSelectionError(false);
    setLastSavedChildContextDraftSignature(null);
    setAssignmentChildId(child?.id ?? "");
    setAssignmentEnabled(assignment?.enabled === false ? "false" : "true");
    const nextCadence = assignment?.cadence === "monthly" ? "monthly" : assignment?.cadence === "biweekly" ? "biweekly" : assignment?.cadence === "four_week" ? "four_week" : "weekly";
    setAssignmentCadence(nextCadence);
    setAssignmentBillingDay(String(assignment?.billingDay ?? 1));
    setAssignmentInvoiceDelayWeeks(assignment?.invoiceDelayWeeks === 1 ? "1" : "0");
    setAssignmentTimingReason("");
    setAssignmentTuitionPlanId(assignedPlan?.id ?? "");
    setAssignmentStartPeriod(
      assignment?.startsPeriod && periodMatchesCadence(assignment.startsPeriod, assignment?.cadence ?? "weekly")
        ? assignment.startsPeriod
        : currentPeriodForCadence(assignment?.cadence ?? "weekly"),
    );
    setAssignmentDescription(assignment?.description ?? assignment?.tuitionPlanName ?? "");
    setAssignmentCredits(tuitionCreditInputs(assignment?.credits ?? []));
    setAssignmentAdditionalCharges(tuitionAdditionalChargeInputs(assignment?.additionalCharges));
    setAssignmentChildProgram(child?.ageGroup ?? defaultAgeGroupOptions[0]);
    setAssignmentChildClassroomId(child?.classroomId ?? "");
    setAssignmentChildScheduledDays(scheduledDaysValue(child));
    setAssignmentChildStartDate(optionalDateInputValue(child?.startDate));
    setTuitionPlanId(assignedPlan?.id ?? "");
    setPlanEditorId(assignedPlan?.id ?? "new");
    setPlanName(assignedPlan?.name ?? "");
    setPlanAgeGroup(assignedPlan?.ageGroup ?? child?.ageGroup ?? defaultAgeGroupOptions[0]);
    setPlanCadence(tuitionBillingCadence(assignedPlan?.cadence));
    setPlanAmountDollars(assignedPlan ? String(assignedPlan.amountCents / 100) : "");
    setPlanFundingType(assignedPlan?.amountCents === 0 ? "voucher" : "family");
  }

  function submit(payload: Record<string, unknown>) {
    if (billingRequestInFlight.current) return;
    const isOfflinePayment = payload.mode === "manualCashPayment" || payload.mode === "manualCheckPayment";
    // React's pending state is rendered asynchronously. Keep rapid repeated
    // submissions from racing to clear the same confirmed recovery marker.
    if (isOfflinePayment && offlinePaymentOperationInFlight.current) return;
    if (isOfflinePayment) offlinePaymentOperationInFlight.current = true;
    const submitRequest = async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        created?: number;
        skipped?: number;
        totalCents?: number;
        appliedInvoiceIds?: string[];
        warning?: string | null;
        pendingApproval?: boolean;
        partial?: boolean;
        adjustmentDescription?: string;
        balanceAfterCents?: number;
        alreadyRecorded?: boolean;
        receipt?: unknown;
      } | null;
      if (!response.ok) {
        if ((payload.mode === "manualCheckPayment" || payload.mode === "manualCashPayment") && json?.receipt) reviewOfflineReceipt(json.receipt, payload);
        setErrorMessage(json?.error || "Billing action could not be completed.");
        return;
      }
      if ((payload.mode === "manualCheckPayment" || payload.mode === "manualCashPayment")
        && !isConfirmedOfflinePaymentReceipt(json, payload)) {
        setErrorMessage("The payment receipt could not be confirmed. Keep this page open and retry the same payment to check its result safely.");
        return;
      }
      if (payload.mode === "manualCheckPayment") {
        if (!completeOfflineOperation(payload, json)) return;
        const total = typeof json?.totalCents === "number" ? money(json.totalCents) : money(0);
        const appliedCount = json?.appliedInvoiceIds?.length ?? 0;
        setStatusMessage(json?.alreadyRecorded
          ? `${total} check payment was already recorded. No duplicate payment was posted.`
          : `${total} check payment posted.${appliedCount ? ` ${appliedCount} open invoice${appliedCount === 1 ? " was" : "s were"} marked paid.` : " The family balance was updated."}`);
        setCheckAmountDollars("");
        setCheckNumber("");
        setCheckNotes("");
        setCheckPaidAt(currentLocalDateTime(timeZone));
        if (billingViewActive.current) router.refresh();
        return;
      }
      if (payload.mode === "manualCashPayment") {
        if (!completeOfflineOperation(payload, json)) return;
        const total = typeof json?.totalCents === "number" ? money(json.totalCents) : money(0);
        const appliedCount = json?.appliedInvoiceIds?.length ?? 0;
        setStatusMessage(json?.alreadyRecorded
          ? `${total} cash payment was already recorded. No duplicate payment was posted.`
          : `${total} cash payment posted.${appliedCount ? ` ${appliedCount} open invoice${appliedCount === 1 ? " was" : "s were"} marked paid.` : " The family balance was updated."}`);
        setCashAmountDollars("");
        setCashReference("");
        setCashNotes("");
        setCashPaidAt(currentLocalDateTime(timeZone));
        if (billingViewActive.current) router.refresh();
        return;
      }
      if (payload.mode === "payrollDeductionPayment") {
        const total = typeof json?.totalCents === "number" ? money(json.totalCents) : money(0);
        const appliedCount = json?.appliedInvoiceIds?.length ?? 0;
        setStatusMessage(`${total} verified payroll deduction posted.${appliedCount ? ` ${appliedCount} open invoice${appliedCount === 1 ? " was" : "s were"} marked paid.` : " The family balance was updated."}`);
        setPayrollAmountDollars("");
        setPayrollReference("");
        setPayrollNotes("");
        setPayrollPaidAt(currentLocalDateTime(timeZone));
        if (billingViewActive.current) router.refresh();
        return;
      }
      if (payload.mode === "refundPayment") {
        const total = typeof json?.totalCents === "number" ? money(json.totalCents) : money(0);
        setStatusMessage(
          json?.pendingApproval
            ? `${total} refund request submitted to executives for approval. No funds have been moved.`
            : json?.warning || `${total} family refund issued across the eligible original payment method(s).`,
        );
        if (!json?.partial) {
          setRefundAmountDollars(""); setRefundReason(""); setRefundPaymentIds([]); refundOperation.current = null;
        }
        if (billingViewActive.current) router.refresh();
        return;
      }
      if (payload.mode === "adjustment") {
        const updatedBalance = typeof json?.balanceAfterCents === "number"
          ? ` New family balance: ${money(json.balanceAfterCents)}.`
          : "";
        setStatusMessage(`${json?.adjustmentDescription || selectedAdjustmentOption.defaultDescription} posted once.${updatedBalance} Recurring tuition was not changed.`);
        setAdjustmentAmountDollars("");
        setAdjustmentEffectiveDate(currentLocalDate(timeZone));
        setAdjustmentNote("");
        if (billingViewActive.current) router.refresh();
        return;
      }
      const created = json?.created ?? 0;
      const skipped = json?.skipped ?? 0;
      const total = typeof json?.totalCents === "number" ? ` Total posted: ${money(json.totalCents)}.` : "";
      setStatusMessage(`${created} invoice${created === 1 ? "" : "s"} created. ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped.${total}`);
    };
    runBillingTransition(async () => {
      try {
        await submitRequest();
      } finally {
        if (isOfflinePayment) offlinePaymentOperationInFlight.current = false;
      }
    });
  }

  function submitSingle() {
    if (!selectedFamily) return setErrorMessage("Choose a family before creating an invoice.");
    const accountCategory = selectedFamily.accountCategory ?? "current";
    const familyEligibilityError = singleInvoiceFamilyEligibilityError(accountCategory, effectiveChargeSource);
    if (familyEligibilityError) return setErrorMessage(familyEligibilityError);
    const invoiceChild = selectedChildren.find((child) => child.id === childId);
    if (effectiveChargeSource === "tuitionPlan" && invoiceChild) {
      const childEligibilityError = childTuitionEligibilityError(invoiceChild);
      if (childEligibilityError) return setErrorMessage(childEligibilityError);
    }
    const childName = invoiceChild?.fullName;
    if (!confirmBillingAction("create an invoice", childName)) return;
    submit({
      mode: "single",
      familyId: selectedFamily.id,
      childId: childId === "none" ? undefined : childId,
      dueDate,
      billingPeriod,
      ...chargePayload(),
    });
  }

  function submitPayAhead() {
    if (!selectedFamily) return setErrorMessage("Choose a family before creating a pay-ahead invoice.");
    if (!selectedAssignmentChild || !effectiveAssignmentPlanId) return setErrorMessage("Choose a child with a saved tuition plan before creating a pay-ahead invoice.");
    const plan = locationTuitionPlans.find((item) => item.id === effectiveAssignmentPlanId);
    if (!plan || plan.cadence !== "monthly") return setErrorMessage("Choose a monthly tuition plan. Pay ahead never estimates a month as four weekly charges.");
    const months = Number.parseInt(payAheadMonthCount, 10);
    let totalCents = 0;
    try { totalCents = payAheadTotalCents(plan.amountCents, months); } catch (error) { return setErrorMessage(error instanceof Error ? error.message : "Choose a valid number of months."); }
    if (!confirmBillingAction(`create a ${money(totalCents)} pay-ahead invoice`, selectedAssignmentChild.fullName)) return;
    submit({ mode: "payAhead", familyId: selectedFamily.id, childId: selectedAssignmentChild.id, tuitionPlanId: plan.id, monthCount: months, startPeriod: payAheadStartPeriod, dueDate });
  }

  function submitAssignmentChargeNow() {
    if (!selectedFamily || !selectedAssignmentChild || !effectiveAssignmentPlanId) {
      return setErrorMessage("Choose a family, child, and tuition plan before creating the tuition invoice.");
    }
    const childEligibilityError = childTuitionEligibilityError(selectedAssignmentChild);
    if (childEligibilityError) return setErrorMessage(childEligibilityError);
    const confirmed = window.confirm(
      `Create one due-now tuition invoice for ${billingContextDescription(selectedAssignmentChild.fullName)}? This does not submit a payment immediately. If family autopay is enabled, the open invoice can be collected by the next autopay run.`,
    );
    if (!confirmed) return;
    submit({
      mode: "single",
      familyId: selectedFamily.id,
      childId: selectedAssignmentChild.id,
      dueDate: todayDate(),
      billingPeriod: currentPeriodForCadence(effectiveAssignmentCadence),
      chargeSource: "tuitionPlan",
      tuitionPlanId: effectiveAssignmentPlanId,
      description: effectiveAssignmentDescription,
    });
  }

  function submitBatch() {
    const confirmed = window.confirm(
      `Create batch invoices for ${selectedCenter ? centerLabel(selectedCenter) : "the selected school"} (${ageGroup === "all" ? "all age groups" : ageGroup}, ${effectiveBatchEnrollmentStatus})? This does not submit payments immediately. Do not continue if recurring tuition already covers this billing period; due invoices may be collected later by autopay.`,
    );
    if (!confirmed) return;
    submit({
      mode: "batch",
      centerId,
      dueDate,
      billingPeriod,
      batchTarget,
      ageGroup,
      enrollmentStatus: effectiveBatchEnrollmentStatus,
      ...chargePayload(),
    });
  }

  function runWeeklyRecovery(dryRun: boolean) {
    if (!centerId) return setErrorMessage("Choose a school before running weekly billing recovery.");
    const recoveryPreview = weeklyRecoveryPreview;
    let previewForCreate: typeof weeklyRecoveryPreview = null;
    if (!dryRun) {
      if (!recoveryPreview) {
        return setErrorMessage("Preview the weekly billing recovery before creating invoices.");
      }
      if (recoveryPreview.centerId !== centerId) {
        setWeeklyRecoveryPreview(null);
        return setErrorMessage("The selected school changed after preview. Run the weekly billing recovery preview again.");
      }
      previewForCreate = recoveryPreview;
      const confirmed = window.confirm(
        `Create weekly tuition invoices for ${selectedCenter ? centerLabel(selectedCenter) : "the selected school"} and billing period ${previewForCreate.billingPeriod}? This creates invoices only and suppresses automatic collection on these recovery invoices.`,
      );
      if (!confirmed) return;
    }
    runBillingTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/billing/tuition-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId,
          billingPeriod: weeklyRecoveryPeriod,
          dryRun,
          previewDueChildren: previewForCreate?.dueChildren,
          previewCenterId: previewForCreate?.centerId,
        }),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        dueChildren?: number;
        wouldCreate?: number;
        assignedChildren?: number;
        centerId?: string;
        billingPeriod?: string;
        created?: number;
        skipped?: number;
        failed?: number;
        totalCents?: number;
      } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Weekly billing recovery could not be completed.");
        if (typeof json?.dueChildren === "number") setWeeklyRecoveryPreview(null);
        return;
      }
      if (dryRun) {
        setWeeklyRecoveryPreview({
          centerId: json?.centerId ?? centerId,
          dueChildren: json?.dueChildren ?? 0,
          wouldCreate: json?.wouldCreate ?? 0,
          assignedChildren: json?.assignedChildren ?? 0,
          billingPeriod: json?.billingPeriod ?? weeklyRecoveryPeriod,
        });
        setStatusMessage(`${json?.wouldCreate ?? 0} weekly tuition invoice${json?.wouldCreate === 1 ? "" : "s"} ready for ${json?.billingPeriod ?? weeklyRecoveryPeriod}. No invoices were created.`);
        return;
      }
      const created = json?.created ?? 0;
      const skipped = json?.skipped ?? 0;
      const failed = json?.failed ?? 0;
      const total = typeof json?.totalCents === "number" ? ` Total posted: ${money(json.totalCents)}.` : "";
      setWeeklyRecoveryPreview(null);
      setStatusMessage(`${created} weekly tuition invoice${created === 1 ? "" : "s"} created. ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped. ${failed} failed.${total}`);
      if (billingViewActive.current) router.refresh();
    });
  }

  function submitAdjustment() {
    if (!selectedFamily) return setErrorMessage("Choose a family before posting an adjustment.");
    if (adjustmentAmountCents <= 0) return setErrorMessage("Enter a one-time fee or credit amount greater than zero.");
    if (!adjustmentEffectiveDate) return setErrorMessage("Choose the date this one-time fee or credit applies to.");
    if (oneTimeBillingAdjustmentNeedsNote(adjustmentReason) && !adjustmentNote.trim()) {
      return setErrorMessage("Add a statement note that explains this one-time adjustment.");
    }
    const balanceEffect = selectedAdjustmentOption.adjustmentType === "credit" ? "lower" : "increase";
    const confirmed = window.confirm(
      `Post a ${money(adjustmentAmountCents)} ${selectedAdjustmentOption.label.toLowerCase()} dated ${adjustmentEffectiveDate} to ${billingContextDescription()}? This will ${balanceEffect} the current family balance once and will not change saved recurring tuition or future weekly invoices.`,
    );
    if (!confirmed) return;
    submit({
      mode: "adjustment",
      familyId: selectedFamily.id,
      adjustmentReason,
      adjustmentType: selectedAdjustmentOption.adjustmentType,
      amountCents: adjustmentAmountCents,
      adjustmentEffectiveDate,
      adjustmentNote: adjustmentNote.trim(),
    });
  }

  function offlineOperationScope(selectedFamilyId: string): OfflinePaymentOperationScope {
    const family = families.find((candidate) => candidate.id === selectedFamilyId);
    if (!currentUserId || !family?.centerId) throw new Error("Refresh this billing page and choose a verified family before recording a payment.");
    return { userId: currentUserId, centerId: family.centerId, familyId: family.id };
  }

  function offlinePaymentRequestIdFor(selectedFamilyId: string) {
    try {
      return getOrCreateOfflinePaymentOperation(window.sessionStorage, offlineOperationScope(selectedFamilyId)).requestId;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Payment recovery storage is unavailable. No payment was submitted.");
      return null;
    }
  }

  function reviewOfflineReceipt(value: unknown, operation: Record<string, unknown>) {
    if (typeof operation.requestId !== "string" || typeof operation.familyId !== "string") return false;
    const receipt = readOfflinePaymentReceipt(value, { requestId: operation.requestId, familyId: operation.familyId });
    if (!receipt) return false;
    const scope = offlineOperationScope(operation.familyId);
    if (readOfflinePaymentOperation(window.sessionStorage, scope)?.requestId !== operation.requestId) return false;
    setOfflineReceiptReview({ scope, requestId: operation.requestId, receipt });
    return true;
  }

  function completeOfflineOperation(payload: Record<string, unknown>, successfulReceipt?: unknown) {
    if (typeof payload.familyId !== "string" || typeof payload.requestId !== "string") return false;
    try {
      const scope = offlineOperationScope(payload.familyId);
      const cleared = clearConfirmedOfflinePaymentOperation(window.sessionStorage, scope, {
        requestId: payload.requestId, receiptConfirmed: true,
      });
      // Another mounted view may already have completed this exact receipt.
      // Only a validated server success can accept a genuinely absent marker;
      // a newer, corrupted, or inaccessible operation must still fail closed.
      const alreadyCompleted = !cleared
        && isConfirmedOfflinePaymentReceipt(successfulReceipt, payload)
        && readOfflinePaymentOperation(window.sessionStorage, scope) === null;
      if (!cleared && !alreadyCompleted) throw new Error("Payment recorded, but its browser recovery marker changed. Review the existing receipt before another payment.");
      setOfflineReceiptReview(null);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Payment recorded. Review its receipt before another payment.");
      return false;
    }
  }

  function recoverOfflineReceipt() {
    if (billingRequestInFlight.current || offlinePaymentOperationInFlight.current || !selectedFamily) return;
    offlinePaymentOperationInFlight.current = true;
    const family = selectedFamily;
    const lookupReceipt = async () => {
      setStatusMessage(""); setErrorMessage(""); setOfflineReceiptReview(null);
      const scope = offlineOperationScope(family.id);
      const operation = readOfflinePaymentOperation(window.sessionStorage, scope);
      if (!operation) {
        setStatusMessage("This browser tab has no unresolved payment marker for this family. Check payment history for earlier receipts.");
        return;
      }
      const response = await fetch("/api/billing/invoices", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "offlinePaymentReceipt", familyId: family.id, requestId: operation.requestId }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; found?: boolean; error?: string; receipt?: unknown } | null;
      if (!response.ok || result?.ok !== true) { setErrorMessage(result?.error || "The receipt could not be checked. The saved request identity is retained."); return; }
      if (result.found === true && reviewOfflineReceipt(result.receipt, operation)) return;
      setErrorMessage("No confirmed receipt is available yet. The saved request identity is retained. No payment was submitted; re-enter the intended payment details to retry safely.");
    };
    runBillingTransition(async () => {
      try {
        await lookupReceipt();
      } finally {
        offlinePaymentOperationInFlight.current = false;
      }
    });
  }

  function currentOfflineReceiptReview() {
    if (!offlineReceiptReview || offlineReceiptReview.scope.familyId !== selectedFamily?.id
      || offlineReceiptReview.scope.userId !== currentUserId || offlineReceiptReview.scope.centerId !== selectedFamily.centerId) return null;
    try {
      return readOfflinePaymentOperation(window.sessionStorage, offlineReceiptReview.scope)?.requestId === offlineReceiptReview.requestId
        ? offlineReceiptReview : null;
    } catch { return null; }
  }

  function acknowledgeOfflineReceipt() {
    if (offlinePaymentOperationInFlight.current) return;
    const currentReview = currentOfflineReceiptReview();
    if (!currentReview) return;
    const { receipt, requestId, scope } = currentReview;
    if (!window.confirm(`I reviewed receipt ${receipt.paymentId} for ${money(receipt.amountCents)}. Start a separate new payment? Nothing will be posted until you submit again.`)) return;
    if (!completeOfflineOperation({ familyId: scope.familyId, requestId })) return;
    setCashAmountDollars(""); setCashReference(""); setCashNotes(""); setCashPaidAt(currentLocalDateTime(timeZone));
    setCheckAmountDollars(""); setCheckNumber(""); setCheckNotes(""); setCheckPaidAt(currentLocalDateTime(timeZone));
    setErrorMessage(""); setStatusMessage("Existing receipt reviewed. A separate payment can now be entered; no new payment was posted.");
    if (billingViewActive.current) router.refresh();
  }

  function submitManualCheckPayment() {
    if (!selectedFamily) return setErrorMessage("Choose a family before posting a check payment.");
    const amountCents = dollarsToCents(checkAmountDollars);
    if (amountCents <= 0 || !checkNumber.trim()) return setErrorMessage("Enter the check amount and check number.");
    const paidAt = manualPaymentTimestamp(checkPaidAt, timeZone);
    if (!paidAt) return setErrorMessage("Enter a valid check received date and time.");
    if (!confirmBillingAction(`post check #${checkNumber.trim()} as a payment`)) return;
    const requestId = offlinePaymentRequestIdFor(selectedFamily.id);
    if (!requestId) return;
    submit({
      mode: "manualCheckPayment",
      familyId: selectedFamily.id,
      requestId,
      amountCents,
      checkNumber: checkNumber.trim(),
      paidAt,
      description: `Check payment #${checkNumber.trim()}`,
      notes: checkNotes,
    });
  }

  function submitManualCashPayment() {
    if (!selectedFamily) return setErrorMessage("Choose a family before posting a cash payment.");
    const amountCents = dollarsToCents(cashAmountDollars);
    if (amountCents <= 0) return setErrorMessage("Enter a cash amount greater than zero.");
    const paidAt = manualPaymentTimestamp(cashPaidAt, timeZone);
    if (!paidAt) return setErrorMessage("Enter a valid cash received date and time.");
    if (!confirmBillingAction(`post ${money(amountCents)} received in cash`)) return;
    const requestId = offlinePaymentRequestIdFor(selectedFamily.id);
    if (!requestId) return;
    submit({
      mode: "manualCashPayment",
      familyId: selectedFamily.id,
      requestId,
      amountCents,
      paidAt,
      reference: cashReference.trim(),
      description: "Cash payment",
      notes: cashNotes.trim(),
    });
  }

  function submitPayrollDeductionPayment() {
    if (!selectedFamily) return setErrorMessage("Choose a family before posting a payroll deduction.");
    const amountCents = dollarsToCents(payrollAmountDollars);
    if (amountCents <= 0) return setErrorMessage("Enter a payroll deduction amount greater than zero.");
    if (!payrollReference.trim()) return setErrorMessage("Enter the payroll run or pay-period reference.");
    const paidAt = manualPaymentTimestamp(payrollPaidAt, timeZone);
    if (!paidAt) return setErrorMessage("Enter a valid withholding date and time.");
    if (!confirmBillingAction(`post ${money(amountCents)} already withheld through payroll`)) return;
    submit({
      mode: "payrollDeductionPayment",
      familyId: selectedFamily.id,
      amountCents,
      paidAt,
      payrollReference: payrollReference.trim(),
      notes: payrollNotes.trim(),
    });
  }

  function submitRefundPayment() {
    if (!selectedFamily) return setErrorMessage("Choose a family.");
    const refundCents = dollarsToCents(refundAmountDollars);
    if (refundCents <= 0) return setErrorMessage("Enter a refund amount greater than zero.");
    if (!refundReason.trim()) return setErrorMessage("Enter a reason for the refund.");
    const action = canApproveRefunds ? "issue" : "request executive approval for";
    if (!confirmBillingAction(`${action} a ${money(refundCents)} refund to ${selectedFamily.name}`)) return;
    const fingerprint = JSON.stringify({ familyId: selectedFamily.id, amountCents: refundCents, reason: refundReason.trim(), paymentIds: refundPaymentIds });
    if (refundOperation.current?.fingerprint !== fingerprint) refundOperation.current = { fingerprint, id: crypto.randomUUID(), paymentIds: [...selectedRefundPaymentIds] };
    submit({
      mode: "refundPayment",
      familyId: selectedFamily.id,
      paymentIds: refundOperation.current.paymentIds,
      operationId: refundOperation.current.id,
      amountDollars: refundAmountDollars,
      reason: refundReason.trim(),
    });
  }

  function submitInvoiceEdit() {
    if (!selectedFamily || !selectedEditableInvoice) {
      return setErrorMessage("Choose an open invoice before editing invoice details.");
    }
    if (invoiceEditAmountCents <= 0) {
      return setErrorMessage("Enter an invoice amount greater than zero.");
    }
    const trimmedDescription = invoiceEditDescription.trim();
    if (!trimmedDescription) {
      return setErrorMessage("Enter invoice details for the updated line item.");
    }
    const confirmed = window.confirm(
      `Update invoice ${selectedEditableInvoice.number} from ${money(selectedEditableInvoice.totalCents)} to ${money(invoiceEditAmountCents)} for ${billingContextDescription()}?`,
    );
    if (!confirmed) return;

    runBillingTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/billing/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: selectedEditableInvoice.id,
          familyId: selectedFamily.id,
          amountDollars: invoiceEditAmountDollars,
          dueDate: invoiceEditDueDate,
          description: trimmedDescription,
        }),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        updated?: boolean;
        deltaCents?: number;
        invoice?: {
          id: string;
          totalCents: number;
          dueDate: Date | string;
          items?: Array<{ description: string }>;
        };
      } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Invoice could not be updated.");
        return;
      }
      if (json?.invoice) {
        setInvoiceEditDraft({
          invoiceId: json.invoice.id || selectedEditableInvoice.id,
          amountDollars: centsToDollarsInput(json.invoice.totalCents),
          dueDate: dateInputValue(json.invoice.dueDate),
          description: json.invoice.items?.[0]?.description || trimmedDescription,
        });
      }
      const deltaCents = typeof json?.deltaCents === "number" ? json.deltaCents : 0;
      const balanceMessage = deltaCents
        ? ` Family balance ${deltaCents < 0 ? "reduced" : "increased"} by ${money(Math.abs(deltaCents))}.`
        : "";
      setStatusMessage(json?.updated === false ? "Invoice already matched those details." : `Invoice updated.${balanceMessage}`);
      if (billingViewActive.current) router.refresh();
    });
  }

  function submitInvoiceVoid() {
    if (!selectedFamily || !selectedEditableInvoice) return;
    const reason = invoiceVoidReason.trim();
    if (reason.length < 5) return setErrorMessage("Enter a reason for voiding this invoice.");
    const confirmed = window.confirm(
      `Void invoice ${selectedEditableInvoice.number} for ${money(selectedEditableInvoice.totalCents)} for ${billingContextDescription()}? This removes the charge from this family's balance and keeps an audit record.`,
    );
    if (!confirmed) return;

    runBillingTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/billing/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "void",
          invoiceId: selectedEditableInvoice.id,
          familyId: selectedFamily.id,
          reason,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; reversedCents?: number } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Invoice could not be voided.");
        return;
      }
      setInvoiceVoidReason("");
      setInvoiceEditorId("");
      setInvoiceEditDraft(null);
      setStatusMessage(`Invoice voided. ${money(json?.reversedCents ?? selectedEditableInvoice.totalCents)} was removed from the family balance.`);
      if (billingViewActive.current) router.refresh();
    });
  }

  function handleAssignmentChildChange(value: string | null) {
    if (isPending || !value || value === effectiveAssignmentChildId || !selectedChildren.some((child) => child.id === value)) return;
    if ((assignmentDraftIsDirty || planDraftIsDirty) && !window.confirm("Discard unsaved tuition and child-setup changes before selecting another child? Other family billing drafts stay as entered.")) return;
    applyFamilyTuitionContext(selectedFamily, locationTuitionPlans, value);
  }

  function handleAssignmentPlanChange(value: string | null) {
    if (isPending || !value) return;
    const plan = locationTuitionPlans.find((item) => item.id === value);
    setAssignmentTuitionPlanId(value);
    setTuitionPlanId(value);
    const nextCadence = tuitionBillingCadence(plan?.cadence);
    const nextSchedule = tuitionScheduleAfterRateSave({
      assignmentCadence,
      startsPeriod: assignmentStartPeriod,
      savedRateCadence: nextCadence,
      defaultPeriod: currentPeriodForCadence,
    });
    setAssignmentCadence(nextSchedule.cadence);
    setAssignmentStartPeriod(nextSchedule.startsPeriod);
    if (plan) {
      setPlanEditorId(plan.id);
      setPlanName(plan.name);
      setAssignmentDescription(plan.name);
      setPlanAgeGroup(plan.ageGroup);
      setPlanCadence(nextCadence);
      setPlanAmountDollars(String(plan.amountCents / 100));
      setPlanFundingType(plan.amountCents === 0 ? "voucher" : "family");
    }
  }

  function saveAssignmentChildContext() {
    if (!canManageEnrollment) return setErrorMessage("Ask a director to update the child’s program, classroom, or care schedule.");
    if (!selectedFamily || !selectedAssignmentChild) return setErrorMessage("Choose a family and child before saving child setup.");
    if (!assignmentChildProgram || !assignmentChildClassroomId) {
      return setErrorMessage("Choose a program and classroom before saving child setup.");
    }
    runBillingTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "child",
          updateScope: "enrollment_context",
          id: selectedAssignmentChild.id,
          familyId: selectedFamily.id,
          ageGroup: assignmentChildProgram,
          classroomId: assignmentChildClassroomId,
          scheduledDaysPerWeek: assignmentChildScheduledDays,
          startDate: assignmentChildStartDate,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Child program and classroom could not be saved.");
        return;
      }
      setLastSavedChildContextDraftSignature(assignmentChildContextDraftSignature);
      setStatusMessage(`Program, classroom, and care schedule saved for ${selectedAssignmentChild.fullName}. Tuition and ledger amounts were not changed.`);
      if (billingViewActive.current) router.refresh();
    });
  }

  function submitAssignment() {
    if (!selectedFamily || !selectedAssignmentChild) return setErrorMessage("Choose a family and child before saving tuition.");
    const selectedRateIsBeingEdited = planEditorId === effectiveAssignmentPlanId
      || (planEditorId === "new" && !effectiveAssignmentPlanId);
    if (planDraftIsDirty && assignmentEnabled === "true" && selectedRateIsBeingEdited) {
      saveTuitionPlan();
      return;
    }
    if (assignmentTimingChanging && assignmentTimingReason.trim().length < 5) return setErrorMessage("Enter a reason for changing invoice timing.");
    if (assignmentEnabled === "true") {
      const childEligibilityError = childTuitionEligibilityError(selectedAssignmentChild);
      if (childEligibilityError) return setErrorMessage(childEligibilityError);
    }
    if (!assignmentIsVoucherFunded && assignmentEnabled === "true" && effectiveAssignmentCreditsTotalCents >= effectiveAssignmentGrossCents + effectiveAssignmentAdditionalChargesTotalCents) {
      return setErrorMessage("Credits must be less than the gross recurring tuition rate.");
    }
    const action = assignmentIsVoucherFunded
      ? "save a $0 CCDF or voucher-funded tuition assignment"
      : "save recurring tuition";
    if (!confirmBillingAction(action, selectedAssignmentChild.fullName)) return;
    runBillingTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/billing/tuition-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: selectedFamily.id,
          childId: selectedAssignmentChild.id,
          enabled: assignmentEnabled === "true",
          tuitionPlanId: effectiveAssignmentPlanId,
          billingCadence: effectiveAssignmentCadence,
          billingDay: effectiveAssignmentBillingDay,
          billingStartPeriod: effectiveAssignmentStartPeriod,
          invoiceDelayWeeks: effectiveAssignmentInvoiceDelayWeeks,
          timingChangeReason: assignmentTimingReason,
          description: effectiveAssignmentDescription,
          tuitionAdditionalCharges: effectiveAssignmentAdditionalCharges,
          tuitionCredits: effectiveAssignmentCredits,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Recurring tuition could not be saved.");
        return;
      }
      setLastSavedTuitionDraftSignature(assignmentTuitionDraftSignature);
      setStatusMessage(
        assignmentIsVoucherFunded
          ? `$0.00 CCDF or voucher-funded tuition saved for ${selectedAssignmentChild.fullName}. No family invoice or autopay is scheduled.`
          : assignmentEnabled === "true"
          ? effectiveAssignmentCadence === "monthly"
            ? `Recurring tuition enabled for ${selectedAssignmentChild.fullName} at ${money(effectiveAssignmentNetCents)} per month. Monthly invoice creation is scheduled for day ${effectiveAssignmentBillingDay}.`
            : `Recurring tuition enabled for ${selectedAssignmentChild.fullName} at ${money(effectiveAssignmentNetCents)} net per week. ${effectiveAssignmentCadence === "four_week" ? `Each invoice will be ${money(effectiveAssignmentNetCents * 4)} and cover four weeks ahead.` : effectiveAssignmentCadence === "biweekly" ? `Each invoice will be ${money(effectiveAssignmentNetCents * 2)} and cover two weeks ahead.` : "Thursday invoice creation is scheduled for the following week."}`
          : `Recurring tuition disabled for ${selectedAssignmentChild.fullName}.`,
      );
      if (billingViewActive.current) router.refresh();
    });
  }

  function handlePlanEditorChange(value: string | null) {
    if (isPending || !value || value === planEditorId) return;
    const plan = value === "new" ? null : locationTuitionPlans.find((item) => item.id === value);
    if (value !== "new" && !plan) return;
    if (planDraftIsDirty && !window.confirm("Discard unsaved tuition-rate changes before selecting another rate? Other family billing drafts stay as entered.")) return;
    setPlanEditorId(value);
    if (value === "new") {
      setPlanName("");
      setPlanAgeGroup(ageGroups[0] ?? defaultAgeGroupOptions[0]);
      setPlanAmountDollars("");
      setPlanCadence("weekly");
      setPlanFundingType("family");
      return;
    }
    if (!plan) return;
    setPlanName(plan.name);
    setPlanAgeGroup(plan.ageGroup || ageGroups[0] || defaultAgeGroupOptions[0]);
    setPlanCadence(tuitionBillingCadence(plan.cadence));
    setPlanAmountDollars(String(plan.amountCents / 100));
    setPlanFundingType(plan.amountCents === 0 ? "voucher" : "family");
  }

  function handlePlanFundingTypeChange(value: string | null) {
    if (value !== "family" && value !== "voucher") return;
    setPlanFundingType(value);
    if (value === "voucher") {
      setPlanAmountDollars("0.00");
    } else if (dollarsToCents(planAmountDollars) <= 0) {
      setPlanAmountDollars("");
    }
  }

  function saveTuitionPlan() {
    if (rateSaveTimingChanging && assignmentTimingReason.trim().length < 5) return setErrorMessage("Enter a reason for changing invoice timing.");
    if (planBeingEdited?.archived) return setErrorMessage("Restore this archived rate before editing it.");
    if (!planName.trim() || !planAmountDollars.trim()) {
      return setErrorMessage("Tuition plan name and amount are required.");
    }
    const planAmountCents = dollarsToCents(planAmountDollars);
    if (planFundingType === "family" && planAmountCents <= 0) {
      return setErrorMessage("Family-paid tuition must be greater than $0. Choose No family charge to save a $0.00 rate.");
    }
    if (planFundingType === "voucher" && planAmountCents !== 0) {
      return setErrorMessage("No-family-charge tuition must be saved at $0.00 family responsibility.");
    }
    const applyToChild = rateSaveAppliesToChild;
    if (applyToChild && selectedAssignmentChild) {
      const eligibilityError = childTuitionEligibilityError(selectedAssignmentChild);
      if (eligibilityError) return setErrorMessage(eligibilityError);
      if (planFundingType !== "voucher" && effectiveAssignmentCreditsTotalCents >= planAmountCents + effectiveAssignmentAdditionalChargesTotalCents) {
        return setErrorMessage("Credits must be less than the gross recurring tuition rate.");
      }
      if (!confirmBillingAction("save this rate and recurring child tuition", selectedAssignmentChild.fullName)) return;
    }
    const nextSchedule = rateSaveSchedule;
    runBillingTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const existingRateId = planEditorId === "new" ? undefined : planEditorId;
      const rateDraft = {
        centerId,
        name: planName,
        ageGroup: planAgeGroup,
        cadence: planCadence,
        amountDollars: planAmountDollars,
        zeroDollarVoucher: planFundingType === "voucher",
      };
      const savedChildDescription = tuitionDescriptionAfterRateSave(effectiveAssignmentDescription, effectiveAssignmentPlan?.name, planName.trim());
      const credits = planFundingType === "voucher" ? [] : effectiveAssignmentCredits;
      const additionalCharges = planFundingType === "voucher" ? [] : effectiveAssignmentAdditionalCharges;
      const billingDay = nextSchedule.cadence === "monthly" ? assignmentBillingDay : "4";
      type RateSaveResponse = { ok?: boolean; code?: string; error?: string; record?: { id?: string }; rateVersionCreated?: boolean };
      let response: Response;
      let json: RateSaveResponse | null;
      let preserveAssignedChildren = false;
      if (applyToChild && selectedFamily && selectedAssignmentChild) {
        response = await fetch("/api/billing/tuition-assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId: selectedFamily.id, childId: selectedAssignmentChild.id, enabled: true,
            tuitionPlanDraft: { ...rateDraft, id: existingRateId },
            billingCadence: nextSchedule.cadence, billingDay,
            billingStartPeriod: nextSchedule.startsPeriod, description: savedChildDescription,
            invoiceDelayWeeks: rateSaveInvoiceDelayWeeks,
            timingChangeReason: assignmentTimingReason,
            tuitionCredits: credits, tuitionAdditionalCharges: additionalCharges,
          }),
        });
        json = await response.json().catch(() => null) as RateSaveResponse | null;
        if (!response.ok || json?.ok !== true) {
          setErrorMessage(json?.error || "Rate and recurring tuition could not be saved.");
          return;
        }
        preserveAssignedChildren = json.rateVersionCreated === true;
      } else {
        const persistRate = async (id?: string) => {
          const rateResponse = await fetch("/api/operations/records", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entity: "tuitionPlan", ...rateDraft, id }),
          });
          const rateJson = await rateResponse.json().catch(() => null) as RateSaveResponse | null;
          return { response: rateResponse, json: rateJson };
        };
        ({ response, json } = await persistRate(existingRateId));
        if (response.status === 409 && json?.code === "TUITION_PLAN_ASSIGNED_CREATE_NEW" && existingRateId) {
          ({ response, json } = await persistRate());
        }
        if (!response.ok) {
          setErrorMessage(json?.error || "Tuition plan could not be saved.");
          return;
        }
      }
      const savedRateId = json?.record?.id;
      if (!savedRateId) {
        setErrorMessage(applyToChild
          ? "The rate and tuition response was incomplete. Refresh and verify the saved rate and child assignment before retrying."
          : "The rate response was incomplete. Refresh and verify the saved rate before retrying.");
        return;
      }
      const savedRate = { id: savedRateId, centerId, name: planName.trim(), ageGroup: planAgeGroup, cadence: planCadence, amountCents: planAmountCents };
      setSavedRateRecords((current) => [...current.filter((rate) => rate.id !== savedRateId), savedRate]);
      setPlanName(savedRate.name);
      setPlanEditorId(savedRateId);
      setTuitionPlanId(savedRateId);
      setAssignmentTuitionPlanId(savedRateId);
      setAssignmentCadence(nextSchedule.cadence);
      setAssignmentStartPeriod(nextSchedule.startsPeriod);
      setAssignmentDescription(savedChildDescription);
      if (applyToChild && selectedFamily && selectedAssignmentChild) {
        const creditInputs = tuitionCreditInputs(credits);
        const additionalChargeInputs = tuitionAdditionalChargeInputs(additionalCharges);
        setAssignmentCredits(creditInputs);
        setAssignmentAdditionalCharges(additionalChargeInputs);
        setAssignmentBillingDay(billingDay);
        setLastSavedTuitionDraftSignature(JSON.stringify({
          enabled: "true", cadence: nextSchedule.cadence, billingDay, tuitionPlanId: savedRateId,
          invoiceDelayWeeks: assignmentInvoiceDelayWeeks,
          startPeriod: nextSchedule.startsPeriod, description: savedChildDescription,
          credits: creditInputs, additionalCharges: additionalChargeInputs,
        }));
        setStatusMessage(`Rate and recurring tuition saved for ${selectedAssignmentChild.fullName}.${preserveAssignedChildren ? " Previously saved children kept their existing rates." : ""}`);
      } else {
        setStatusMessage("Rate saved. Child tuition is not saved yet. Choose the intended child, enable recurring tuition, and select Save Tuition Assignment.");
      }
      setBillingAction("recurring");
      if (billingViewActive.current) router.refresh();
    });
  }

  function changeTuitionPlanArchive() {
    if (!planBeingEdited) return;
    const plan = planBeingEdited;
    runBillingTransition(async () => {
      setErrorMessage("");
      setStatusMessage("");
      const response = await fetch("/api/billing/tuition-plans/archive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId, planId: plan.id, archived: !plan.archived }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return setErrorMessage(json?.error || "Tuition rate could not be archived or restored.");
      setStatusMessage(plan.archived ? "Tuition rate restored for new assignments." : "Tuition rate archived. Existing child assignments, invoices and history are unchanged.");
      if (billingViewActive.current) router.refresh();
    });
  }

  function prepareEnrollmentFee() {
    setErrorMessage("");
    setStatusMessage("");
    setChargeSource("custom");
    setDescription("Enrollment fee");
    setAmountDollars("");
    setChildId("none");
    changeWorkspaceSection("tuition");
    setBillingAction("single");
    requestAnimationFrame(() => {
      document.getElementById("billing-actions")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }


  const currentOfflineReview = currentOfflineReceiptReview();

  return (
    <>
    <Dialog open={Boolean(paymentReviewMethod)} onOpenChange={(open) => {
      if (!open && !isPending) {
        setPaymentReviewMethod(null);
      }
    }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{paymentReviewMethod ? paymentMethodLabel(paymentReviewMethod) : "Review payment"}</DialogTitle>
          <DialogDescription>
            Review the family, payment method, amount, and invoice or balance before submitting.
          </DialogDescription>
        </DialogHeader>
        {paymentReviewMethod ? (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryMetric label="Family" value={selectedFamily?.name ?? "Not selected"} detail={selectedFamily ? billingFamilySecondaryLabel(selectedFamily) : "No billing email"} />
              <SummaryMetric label="School" value={selectedCenter ? centerLabel(selectedCenter) : "Not selected"} detail={selectedCheckoutReadiness?.canAcceptParentPayments ? "Online payments ready" : "Online payments unavailable"} />
              <SummaryMetric label="Apply payment to" value={directorPaymentTargetLabel} detail={selectedPaymentInvoice ? `Due ${formatInvoiceDueDate(selectedPaymentInvoice.dueDate)}` : "Family balance payment"} />
              <SummaryMetric label="Amount" value={money(directorPaymentAmountCents)} detail={effectivePaymentTarget === "custom" ? paymentDescription : selectedPaymentInvoice?.number ?? "Balance"} />
            </div>
            {paymentReviewMethod !== "autopay" && effectivePaymentTarget.startsWith("invoice:") && hasHouseholdCreditAgainstInvoices ? (
              <p className="rounded-lg border bg-background/45 p-3 text-sm text-muted-foreground">
                This is an account payment. The selected invoice is prioritized,
                and the payment may cover other open invoices. The current account
                balance already reflects recorded payments and credits.
              </p>
            ) : null}
            <div className="rounded-lg border bg-background/45 p-3">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Payment method</div>
              <div className="mt-2 text-sm font-medium">{paymentRouteSummary(paymentReviewMethod)}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <ContextBadge label="Online payments" value={selectedCheckoutReadiness?.label ?? "Unknown"} variant={selectedCheckoutReadiness?.canAcceptParentPayments ? "default" : "destructive"} />
              <ContextBadge label="Saved method" value={selectedPaymentMethod?.paymentMethodLabel ?? "None"} />
              {selectedFamilyIsPast
                ? <ContextBadge label="Account" value="Past family" variant="outline" />
                : selectedFamilyIsProspective
                  ? <ContextBadge label="Account" value="Pending / waitlisted" variant="outline" />
                  : <ContextBadge label="Autopay" value={selectedAutopayStatus} variant={selectedAutopayStatus === "enabled" ? "default" : "outline"} />}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => {
            setPaymentReviewMethod(null);
          }}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isPending || !paymentReviewMethod}
            onClick={() => paymentReviewMethod && processParentPayment(paymentReviewMethod)}
          >
            {paymentReviewMethod ? paymentMethodLabel(paymentReviewMethod) : "Submit payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Card id="billing-workbench" className="office-billing-workspace glass-panel overflow-visible scroll-mt-28" onFocusCapture={event => scheduleFocusedPortalControlReveal(event.target)}>
      <CardHeader className="pb-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle as="h2">Family billing</CardTitle>
            <CardDescription>Review the account, then choose a task.</CardDescription>
          </div>
          <Badge variant="outline" className="hidden sm:inline-flex">
            <BadgeDollarSign data-icon="inline-start" />
            Director tools
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset disabled={isPending} aria-busy={isPending} className="min-w-0 space-y-4">
        {childSelectionError || (assignmentChildId && !selectedAssignmentChild) ? <Alert variant="destructive"><AlertTitle>Child selection needed</AlertTitle><AlertDescription>The requested child is not available for this family. No other child has been selected. Choose the intended child before saving tuition or enrollment details.</AlertDescription></Alert> : null}
        {selectionError || (familyId && !selectedFamily) ? (
          <Alert variant="destructive">
            <AlertTitle>Family selection needed</AlertTitle>
            <AlertDescription>{selectionError || BILLING_TARGET_UNAVAILABLE}</AlertDescription>
          </Alert>
        ) : null}
        {statusMessage ? (
          <Alert role="status" aria-live="polite">
            <CheckCircle2 className="size-4" />
            <AlertTitle>Update complete</AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        ) : null}
        {errorMessage ? (
          <Alert role="alert" variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Action needed</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <Tabs value={workspaceSection} onValueChange={(value) => changeWorkspaceSection(String(value))} className="min-w-0 gap-4">
        <section className="billing-persistent-context sticky top-16 z-20 rounded-xl border bg-card p-3 shadow-sm" aria-label="Selected billing account" data-billing-context>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 basis-40">
              <div className="break-words font-semibold">{selectedFamily?.name ?? "Choose a family"}</div>
              <div className="text-xs text-muted-foreground">{selectedCenter ? centerLabel(selectedCenter) : "Choose a school"} · {effectiveFamilyListMode === "past" ? "Past account" : effectiveFamilyListMode === "prospective" ? "Pending" : "Current"}</div>
              {selectedFamily ? <div className="break-words text-xs text-muted-foreground">{billingFamilySecondaryLabel(selectedFamily)}</div> : null}
            </div>
            <div className="text-right"><div className="text-xs text-muted-foreground">Posted balance</div><div className="text-lg font-semibold tabular-nums">{selectedBillingAccount ? money(accountOverview.data?.postedBalanceCents ?? familyBalanceCents) : "No billing account"}</div></div>
          </div>
          <TabsList className="billing-section-tabs mt-3 grid w-full grid-cols-2 gap-1 sm:grid-cols-4" aria-label="Account sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tuition">Tuition &amp; Fees</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="ledger" disabled={!ledger}>Ledger &amp; Statements</TabsTrigger>
          </TabsList>
        </section>
        <details id="billing-family-picker" open={familyPickerOpen || !selectedFamily} onToggle={event => setFamilyPickerOpen(event.currentTarget.open)} className="scroll-mt-28 space-y-3 rounded-xl border bg-background/35 p-4">
          <summary className="min-h-11 cursor-pointer content-center font-medium">Choose or change family</summary>
        <div className="billing-family-picker-grid grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="billing-workbench-school">School</Label>
            <Select disabled={isPending} value={centerId} onValueChange={handleCenterChange}>
              <SelectTrigger id="billing-workbench-school"><SelectValue placeholder="Choose school" /></SelectTrigger>
              <SelectContent>
                {centers.map((center) => (
                  <SelectItem key={center.id} value={center.id}>{centerLabel(center)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="billing-workbench-family">Family</Label>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Family account type">
              {(["current", "past", "prospective"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={effectiveFamilyListMode === mode ? "default" : "outline"}
                  aria-pressed={effectiveFamilyListMode === mode}
                  disabled={isPending}
                  onClick={() => {
                    if (offlinePaymentOperationInFlight.current || isPending || mode === effectiveFamilyListMode || !confirmDiscardBillingInput()) return;
                    const nextFamily = scopedFamilies.find((family) => billingFamilyAccountCategory(family) === mode) ?? null;
                    resetFamilyBoundBillingDrafts(nextFamily, centerId);
                    setFamilyListMode(mode);
                    setFamilyId(nextFamily?.id ?? "");
                    persistContext(nextFamily?.id ?? "", centerId, workspaceSection, true, mode);
                    setSelectionError(null);
                    applyFamilyTuitionContext(nextFamily, locationTuitionPlans);
                  }}
                >
                  {mode === "current" ? "Current" : mode === "past" ? "Past accounts" : "Pending"} ({familyCounts[mode]})
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Counts show loaded households in this school. Use Search all accounts below if the intended family is missing.</p>
            <BillingFamilyPicker
              key={`${centerId}:${effectiveFamilyListMode}`}
              id="billing-workbench-family"
              disabled={isPending}
              value={effectiveFamilyId}
              families={filteredFamilies}
              onValueChange={handleFamilyChange}
            />
          </div>
        </div>

          <details open={Boolean(searchQuery?.trim())} className="rounded-lg border bg-background/35 p-3">
            <summary className="min-h-11 cursor-pointer content-center font-medium">Search all accounts by name or email</summary>
        <form action="/billing-invoices" method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="centerId" value={centerId} />
          <div className="min-w-0 flex-1 basis-48 space-y-1">
            <Label htmlFor="billing-family-search">Search families (optional)</Label>
            <Input id="billing-family-search" name="q" defaultValue={searchQuery ?? ""} maxLength={120} placeholder="Family, child, guardian, or email" />
            <p className="text-xs text-muted-foreground">Up to 1,000 matching households are loaded. Search includes current and withdrawn families.</p>
          </div>
          <Button type="submit" variant="outline"><Search data-icon="inline-start" />Search accounts</Button>
          {searchQuery?.trim() ? <Link href={`/billing-invoices?centerId=${encodeURIComponent(centerId)}#billing-family-picker`} className={buttonVariants({ variant: "outline" })}>Show all families</Link> : null}
        </form>
          </details>
        </details>

        <TabsContent value="overview" className="space-y-4">
        <div className="billing-account-metrics grid gap-3 sm:grid-cols-3">
          <SummaryMetric label="Posted balance" value={selectedBillingAccount ? money(accountOverview.data?.postedBalanceCents ?? familyBalanceCents) : "No billing account"} detail="Includes posted activity and any agency responsibility." />
          <SummaryMetric label="Pending payments" value={pendingPaymentCount ? `${pendingPaymentCount} in progress` : "None"} detail={pendingAchCreditCents ? `${money(pendingAchCreditCents)} ACH awaiting settlement; not deducted from the posted balance.` : "Check payment status before collecting again."} />
          <SummaryMetric label="Collectible family amount" value={!selectedBillingAccount ? "No billing account" : accountOverview.data?.responsibilityReviewRequired ? "Review required" : accountOverview.data ? money(accountOverview.data.collectibleCents) : accountOverview.error ? "Unavailable" : "Checking account…"} detail="Family responsibility after credits and provisional ACH. Rechecked at checkout; advance payments are separate." />
        </div>
        {accountOverview.error ? <Alert variant="destructive"><AlertTitle>Account summary unavailable</AlertTitle><AlertDescription>The collectible amount could not be verified. Retry before collecting a balance payment.<Button type="button" variant="outline" onClick={accountOverview.retry}>Retry account summary</Button></AlertDescription></Alert> : null}
        <p className="text-xs text-muted-foreground">Family details last updated {formatShortDate(selectedFamily?.updatedAt)}.</p>
        <section id="billing-family-overview" aria-label="Account details" className="billing-summary-grid grid gap-3 sm:grid-cols-3">
          <SummaryMetric label="Children" value={selectedChildSummary} detail={selectedChildren.map(child => child.fullName).join(", ") || "No child records"} />
          <SummaryMetric label={`Saved ${effectiveRateCadence} tuition`} value={activeWeeklyTuitionAssignments.length ? money(familyWeeklyTuitionCents) : "Not assigned"} detail="Review individual rates and other billing cycles in Tuition & Fees." />
          <SummaryMetric label="Autopay consent" value={selectedFamilyIsPast ? "Unavailable for past accounts" : selectedAutopayStatus} detail={selectedPaymentMethod?.paymentMethodLabel ?? "No saved payment method"} />
        </section>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!selectedFamily} onClick={() => changeWorkspaceSection("payments")}><CreditCard data-icon="inline-start" />Record or collect payment</Button>
          <Button type="button" variant="outline" disabled={!selectedFamily} onClick={() => changeWorkspaceSection("tuition")}><CalendarClock data-icon="inline-start" />Tuition &amp; fees</Button>
          <Button type="button" variant="outline" disabled={!ledger || !selectedFamily} onClick={() => changeWorkspaceSection("ledger")}><ReceiptText data-icon="inline-start" />Preview a statement</Button>
          {selectedFamily && canOpenFamilyProfile ? <Link href={familyProfileHref(selectedFamily)} className={buttonVariants({ variant: "outline" })}><ArrowUpRight data-icon="inline-start" />Open family</Link> : null}
        </div>
        </TabsContent>
        {selectedFamilyIsPast ? (
          <Alert className="border-sky-500/30 bg-sky-500/10">
            <ReceiptText className="size-4" />
            <AlertTitle>Past family payment access</AlertTitle>
            <AlertDescription>
              This family remains available so an existing balance or invoice can be paid. Recurring tuition, new invoices, saved-method changes, and autopay remain unavailable until enrollment is current.
            </AlertDescription>
          </Alert>
        ) : null}
        {selectedFamilyIsProspective ? (
          <Alert className="border-amber-500/30 bg-amber-500/10">
            <CalendarClock className="size-4" />
            <AlertTitle>Prospective family billing</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                This family is pending or waitlisted. Create a one-time enrollment or deposit fee without changing enrollment. Recurring tuition stays unavailable until a child is current and assigned to a classroom.
              </p>
              <Button type="button" size="sm" onClick={prepareEnrollmentFee}>
                <ReceiptText data-icon="inline-start" />
                Prepare Enrollment Fee
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {selectedPaymentProgress && selectedPaymentProgress.count === pendingPaymentCount && selectedPaymentProgress.provisionalAchCreditCents === pendingAchCreditCents ? (
          <Alert data-director-payment-progress>
            <AlertCircle className="size-4" />
            <AlertTitle>{directorPaymentProgressTitle(selectedPaymentProgress)}</AlertTitle>
            <AlertDescription className="space-y-1">
              <p>{selectedPaymentProgress.count} active payment attempt{selectedPaymentProgress.count === 1 ? "" : "s"}. Check the payment status before collecting again.</p>
              {selectedPaymentProgress.phase === "confirmation_unknown" ? <p>An earlier payment outcome is unconfirmed. An unknown outcome is not proof that a payment failed.</p> : null}
              {selectedPaymentProgress.provisionalAchCreditCents > 0 ? (
                <p>{money(selectedPaymentProgress.provisionalAchCreditCents)} in submitted ACH payments is awaiting bank settlement. Parent balances apply a provisional ACH credit. The ledger balance changes after settlement; a bank return restores the parent amount due.</p>
              ) : <p>No provisional ACH credit is included for these attempts.</p>}
            </AlertDescription>
          </Alert>
        ) : null}

        {workspaceSection === "payments" && selectedCheckoutReadiness?.canAcceptParentPayments ? (
          <Alert className="border-emerald-500/30 bg-emerald-500/10">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <AlertTitle>Online payments ready</AlertTitle>
            <AlertDescription>
              Parents can pay invoices online for {selectedCenter ? centerLabel(selectedCenter) : "this school"}.
            </AlertDescription>
          </Alert>
        ) : workspaceSection === "payments" && selectedCheckoutReadiness && !selectedCheckoutReadiness.canAcceptParentPayments ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Online payments unavailable</AlertTitle>
            <AlertDescription>
              {selectedCheckoutReadiness.blockingReason || "Finish payout setup before parents can pay invoices for this school."}
            </AlertDescription>
          </Alert>
        ) : null}

        {workspaceSection === "tuition" || workspaceSection === "payments" ? (
        <TabsContent value={workspaceSection} className="min-w-0 space-y-4">
        {selectedFamily && workspaceSection === "payments" ? <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer content-center font-medium">Recover an interrupted cash or check payment</summary><Alert>
          <AlertTitle>Interrupted cash or check payment?</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>Review the saved request after a reload or interrupted response. This only checks for an existing receipt and never submits a payment.</p>
            <Button type="button" variant="outline" disabled={isPending} onClick={recoverOfflineReceipt}>Review unresolved payment</Button>
            {currentOfflineReview ? <div className="space-y-2">
              <p>Recorded {currentOfflineReview.receipt.provider === "manual_cash" ? "cash" : "check"} payment: {money(currentOfflineReview.receipt.amountCents)}. Receipt {currentOfflineReview.receipt.paymentId}. No additional payment was posted.</p>
              <Button type="button" variant="outline" disabled={isPending} onClick={acknowledgeOfflineReceipt}>I reviewed this receipt; start a new payment</Button>
            </div> : null}
          </AlertDescription>
        </Alert></details> : null}

        {workspaceSection === "tuition" ? <>
        {!selectedFamilyIsProspective ? <><details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer content-center font-medium">School tuition rates · view or edit</summary><fieldset disabled={selectedFamilyIsPast} className="min-w-0">
        <div className="rounded-lg border bg-background/35 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">
                Tuition rate setup{selectedFamily ? ` · ${selectedFamily.name}` : ""}
              </div>
              <p className="text-xs text-muted-foreground">
                Choose or create a school rate, including an explicit $0.00 family rate for CCDF or voucher-funded care. Save Rate &amp; Child Tuition applies it to the selected child and preserves other children’s rates.
              </p>
            </div>
            <Badge variant="outline">{selectedFamily?.name ?? "Choose a family"}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-6">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="billing-rate-record">Rate record</Label>
              <Select value={planEditorId} onValueChange={handlePlanEditorChange}>
                <SelectTrigger id="billing-rate-record"><SelectValue placeholder="New or existing rate" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New tuition rate</SelectItem>
                  {locationTuitionPlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}{plan.archived ? " · Archived" : ""} · {plan.ageGroup} · {plan.cadence} · {money(plan.amountCents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="billing-rate-name">Rate name</Label>
              <Input id="billing-rate-name" value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="Infant weekly tuition" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="billing-rate-age-group">Age group</Label>
              <Select value={planAgeGroup} onValueChange={(value) => value && setPlanAgeGroup(value)}>
                <SelectTrigger id="billing-rate-age-group"><SelectValue placeholder="Choose age group" /></SelectTrigger>
                <SelectContent>
                  {ageGroups.map((group) => (
                    <SelectItem key={group} value={group}>{group}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="billing-rate-funding">Funding</Label>
              <Select value={planFundingType} onValueChange={handlePlanFundingTypeChange}>
                <SelectTrigger id="billing-rate-funding"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="family">Family-paid</SelectItem>
                  <SelectItem value="voucher">No family charge / CCDF / voucher-funded ($0.00)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="billing-rate-family-amount">Family {tuitionRateCadence(planCadence)} amount</Label>
              <Input
                id="billing-rate-family-amount"
                inputMode="decimal"
                value={planAmountDollars}
                disabled={planFundingType === "voucher"}
                onChange={(event) => setPlanAmountDollars(event.target.value)}
                placeholder="250.00"
              />
              {planFundingType === "voucher" ? <p className="text-xs text-muted-foreground">Directors can use this for any intentional $0.00 rate. It will not create family invoices or autopay attempts.</p> : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="billing-rate-cadence">Billing cadence</Label>
              <Select value={planCadence} onValueChange={(value) => {
                if (value === "weekly" || value === "biweekly" || value === "four_week" || value === "monthly") setPlanCadence(value);
              }}>
                <SelectTrigger id="billing-rate-cadence"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly · 1 week ahead</SelectItem>
                  <SelectItem value="biweekly">Biweekly · 2 weeks ahead</SelectItem>
                  <SelectItem value="four_week">Every 4 weeks · 4 weeks ahead</SelectItem>
                  <SelectItem value="monthly">Monthly · 1 month at a time</SelectItem>
                </SelectContent>
              </Select>
              {planCadence === "biweekly" ? <p className="text-xs text-muted-foreground">Enter the weekly rate. Each biweekly invoice will contain two weekly rates.</p> : null}
            </div>
            <div className="flex items-end">
              <Button disabled={isPending || Boolean(planBeingEdited?.archived)} onClick={saveTuitionPlan} className="w-full">
                {selectedAssignmentChildIsCurrent && assignmentEnabled === "true" ? "Save Rate & Child Tuition" : "Save Rate"}
              </Button>
            </div>
          </div>
          {rateSaveTimingChanging ? (
            <div className="mt-3 space-y-1">
              <Label htmlFor="billing-rate-timing-reason">Reason for timing change</Label>
              <Input id="billing-rate-timing-reason" value={assignmentTimingReason} onChange={(event) => setAssignmentTimingReason(event.target.value)} placeholder="For example, changing from prepaid biweekly to monthly tuition" />
              <p className="text-xs text-muted-foreground">Saving this rate for the selected child changes their invoice timing. Enter a reason before saving.</p>
            </div>
          ) : null}
          {planBeingEdited ? <div className="mt-3 flex flex-wrap items-center gap-3"><Button type="button" variant="outline" disabled={isPending} onClick={changeTuitionPlanArchive}>{planBeingEdited.archived ? "Restore rate" : "Archive rate"}</Button><p className="text-xs text-muted-foreground">Archiving removes a rate from new choices and preserves existing assignments and history.</p></div> : null}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">Set each child’s recurring tuition in Child tuition. Their saved rates combine with other rates using the same cadence.</p>
        </fieldset>{selectedFamilyIsPast ? <p className="text-sm text-muted-foreground">Tuition changes are unavailable for past accounts.</p> : null}</details></> : null}
        </> : null}
        <Tabs
          id="billing-actions"
          value={billingAction}
          onValueChange={(value) => {
            setBillingAction(value);
            if (["adjustment", "edit", "batch", "weekly-recovery", "payroll", "refund", "agency"].includes(value)) {
              setMoreBillingActionsExpanded(true);
            }
          }}
          className="scroll-mt-28"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Common billing tasks</div>
              <p className="mt-1 text-xs text-muted-foreground">Choose the routine change you need to make for this family.</p>
            </div>
            <div id="billing-more-actions" className="scroll-mt-28 text-right">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-expanded={moreBillingActionsExpanded}
                aria-controls="billing-action-tabs"
                onClick={() => setMoreBillingActionsExpanded((expanded) => !expanded)}
              >
                More actions
                <ChevronDown className={`size-4 transition-transform ${moreBillingActionsExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
              </Button>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">Invoice corrections, batch work, payroll deductions, refunds, and agency claims</p>
            </div>
          </div>
          <TabsList id="billing-action-tabs" className="flex flex-wrap justify-start gap-1 group-data-horizontal/tabs:h-auto" aria-label="Billing tasks">
            {workspaceSection === "payments" ? <TabsTrigger value="online" className="h-10 min-h-10"><CreditCard data-icon="inline-start" />Online payment</TabsTrigger> : null}
            {workspaceSection === "tuition" ? <TabsTrigger value="recurring" disabled={selectedFamilyIsProspective || selectedFamilyIsPast} className="h-10 min-h-10"><CalendarClock data-icon="inline-start" />Child tuition</TabsTrigger> : null}
            {workspaceSection === "tuition" ? <TabsTrigger value="pay-ahead" disabled={selectedFamilyIsProspective || selectedFamilyIsPast} className="h-10 min-h-10"><CalendarClock data-icon="inline-start" />Pay ahead</TabsTrigger> : null}
            {workspaceSection === "tuition" ? <TabsTrigger value="single" disabled={selectedFamilyIsPast} className="h-10 min-h-10"><ReceiptText data-icon="inline-start" />Family charge</TabsTrigger> : null}
            <TabsTrigger value="adjustment" className={`h-10 min-h-10 ${!moreBillingActionsExpanded && billingAction !== "adjustment" ? "hidden" : ""}`}><MinusCircle data-icon="inline-start" />One-time fee / credit</TabsTrigger>
            {workspaceSection === "payments" ? <TabsTrigger value="check" className="h-10 min-h-10"><Banknote data-icon="inline-start" />Check payment</TabsTrigger> : null}
            {workspaceSection === "payments" ? <TabsTrigger value="cash" className="h-10 min-h-10"><Banknote data-icon="inline-start" />Cash payment</TabsTrigger> : null}
            <TabsTrigger value="edit" className={`h-10 min-h-10 ${!moreBillingActionsExpanded && billingAction !== "edit" ? "hidden" : ""}`}><FilePenLine data-icon="inline-start" />Edit invoice</TabsTrigger>
            <TabsTrigger value="batch" className={`h-10 min-h-10 ${!moreBillingActionsExpanded && billingAction !== "batch" ? "hidden" : ""}`}><Rows3 data-icon="inline-start" />Batch tuition</TabsTrigger>
            <TabsTrigger value="weekly-recovery" className={`h-10 min-h-10 ${!moreBillingActionsExpanded && billingAction !== "weekly-recovery" ? "hidden" : ""}`}><Search data-icon="inline-start" />Weekly recovery</TabsTrigger>
            <TabsTrigger value="payroll" className={`h-10 min-h-10 ${!moreBillingActionsExpanded && billingAction !== "payroll" ? "hidden" : ""}`}><Banknote data-icon="inline-start" />Payroll deduction</TabsTrigger>
            <TabsTrigger value="refund" className={`h-10 min-h-10 ${!moreBillingActionsExpanded && billingAction !== "refund" ? "hidden" : ""}`}><RotateCcw data-icon="inline-start" />Refund</TabsTrigger>
            <TabsTrigger value="agency" className={`h-10 min-h-10 ${!moreBillingActionsExpanded && billingAction !== "agency" ? "hidden" : ""}`}><BadgeDollarSign data-icon="inline-start" />Agency claims</TabsTrigger>
          </TabsList>

          <TabsContent value="online" className="space-y-4">
        <div id="billing-payment-methods" className="scroll-mt-28 rounded-lg border bg-background/35 p-4">
          <details className="mb-3 rounded-lg border p-3"><summary className="min-h-11 cursor-pointer content-center font-medium">Saved method &amp; autopay consent</summary><div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                Family payment methods
                <InfoTip label="About family payment profiles">
                  Saving a method and enabling autopay are separate actions. Parents enable or disable autopay from their Parent Portal.
                </InfoTip>
              </div>
            </div>
            <Badge variant={!selectedFamilyIsPast && selectedAutopayStatus === "enabled" ? "default" : "outline"} className="capitalize">
              {selectedFamilyIsPast ? "Past family" : selectedPaymentMethod?.paymentMethodReauthorizationRequired ? "Reauthorization required" : selectedAutopayStatus}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="rounded-lg border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">Saved method</div>
              <div className="mt-1 text-sm font-medium">
                {selectedPaymentMethod?.hasSavedPaymentMethod
                  ? selectedPaymentMethod.paymentMethodLabel ?? "Saved securely"
                  : selectedPaymentMethod?.autopayStatus === "pending"
                    ? "Setup pending"
                    : "No saved payment method"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {selectedPaymentMethod?.paymentMethodReauthorizationRequired
                  ? "This method belongs to the school's prior payout account and is excluded from payment processing until the family replaces it."
                  : selectedPaymentMethod?.lastUpdatedAt ? `Updated ${formatZonedDateTime(selectedPaymentMethod.lastUpdatedAt, timeZone, { month: "short", day: "numeric", year: "numeric" })}` : "Families can also update this from the parent portal."}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="w-full sm:w-auto" disabled={isPending || !selectedFamily || selectedFamilyIsPast} onClick={() => manageFamilyPaymentMethod("setup", "link_bank")}>
                <Building2 data-icon="inline-start" />
                Connect bank account
              </Button>
              <Button className="w-full sm:w-auto" disabled={isPending || !selectedFamily || selectedFamilyIsPast} onClick={() => manageFamilyPaymentMethod("setup", "card")} variant="outline">
                <CreditCard data-icon="inline-start" />
                {selectedPaymentMethod?.hasSavedPaymentMethod ? "Replace saved card" : "Save card"}
              </Button>
              <Button className="w-full sm:w-auto" disabled={isPending || selectedFamilyIsPast || !selectedPaymentMethod?.hasStripeCustomer} onClick={() => manageFamilyPaymentMethod("portal")} variant="outline">
                Manage payment method
              </Button>
            </div>
          </div>
          </details>
          <div className="mt-4 rounded-lg border bg-background/40 p-3">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  Collect a family payment
                  <InfoTip label="About director payment actions">
                    Directors can run an open invoice with the saved method only after the parent enables autopay. In-person and secure checkout options remain available separately.
                  </InfoTip>
                </div>
              </div>
              <Badge variant="outline">{money(directorPaymentAmountCents)}</Badge>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Choose Custom amount and Advance payment to collect tuition early, including at a $0 balance. Excess remains household credit for future invoices. Review the amount in secure checkout; autopay consent stays unchanged.</p>
            <div className="grid gap-3 md:grid-cols-6">
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="billing-payment-target">Apply payment to</Label>
                <Select value={effectivePaymentTarget} onValueChange={(value) => value && setPaymentTarget(value)}>
                  <SelectTrigger id="billing-payment-target"><SelectValue placeholder="Choose balance or invoice" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="balance">Collectible family balance · {accountOverview.data ? money(accountOverview.data.collectibleCents) : "Checking"}</SelectItem>
                    {openInvoices.map((invoice) => (
                      <SelectItem key={invoice.id} value={`invoice:${invoice.id}`}>
                        {invoice.number} · {money(invoice.totalCents)} · due {formatInvoiceDueDate(invoice.dueDate)}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-payment-custom-amount">Custom amount</Label>
                {effectivePaymentTarget === "custom" ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={advancePayment} onChange={(event) => setAdvancePayment(event.target.checked)} />Advance payment for future tuition</label> : null}
                <Input
                  id="billing-payment-custom-amount"
                  disabled={effectivePaymentTarget !== "custom"}
                  inputMode="decimal"
                  value={paymentAmountDollars}
                  onChange={(event) => setPaymentAmountDollars(event.target.value)}
                  placeholder="250.00"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="billing-payment-description">Description</Label>
                <Input id="billing-payment-description" value={paymentDescription} onChange={(event) => setPaymentDescription(event.target.value)} placeholder="Tuition payment" />
              </div>
              <div className="rounded-lg border bg-background/50 p-3">
                <div className="text-xs text-muted-foreground">Charging</div>
                <div className="text-sm font-medium">{directorPaymentTargetLabel}</div>
              </div>
            </div>
            {hasHouseholdCreditAgainstInvoices ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Invoice totals show the amounts billed on each invoice. The current
                account balance includes recorded payments and credits.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {effectivePaymentTarget.startsWith("invoice:") && !selectedFamilyIsPast ? (
                <Button
                  disabled={isPending || selectedAutopayStatus !== "enabled" || !selectedBillingAccount || directorPaymentAmountCents <= 0 || selectedInvoiceHasPendingPayment}
                  onClick={() => openPaymentReview("autopay")}
                  variant="outline"
                >
                  <Play data-icon="inline-start" />
                  {selectedInvoiceHasPendingPayment ? "Autopay payment pending" : "Process invoice with autopay"}
                </Button>
              ) : null}
              {selectedCenter?.hardwareTerminalConfigured && selectedFamily && selectedBillingAccount ? (
                <StripeTerminalPayment
                  centerId={selectedCenter.id}
                  billingAccountId={selectedBillingAccount.id}
                  familyId={selectedFamily.id}
                  invoiceId={selectedPaymentInvoice?.id || null}
                  amountCents={directorPaymentAmountCents}
                  description={paymentDescription}
                  disabled={isPending || !selectedCheckoutReadiness?.canAcceptParentPayments}
                />
              ) : null}
              <Button
                disabled={isPending || !selectedBillingAccount || directorPaymentAmountCents <= 0 || (effectivePaymentTarget === "balance" && (!accountOverview.data || accountOverview.data.responsibilityReviewRequired))}
                onClick={() => openPaymentReview("card_checkout")}
              >
                <CreditCard data-icon="inline-start" />
                Digital Terminal
              </Button>
              <Button
                disabled={isPending || !selectedBillingAccount || directorPaymentAmountCents <= 0 || (effectivePaymentTarget === "balance" && (!accountOverview.data || accountOverview.data.responsibilityReviewRequired))} title="Link or card; bank funding is offered when eligible. No added parent processing fee."
                onClick={() => openPaymentReview("instant_bank_checkout")}
                variant="outline"
              >
                Link or card
              </Button>
              <Button
                disabled={isPending || !selectedBillingAccount || directorPaymentAmountCents <= 0 || (effectivePaymentTarget === "balance" && (!accountOverview.data || accountOverview.data.responsibilityReviewRequired))}
                onClick={() => openPaymentReview("ach_checkout")}
                variant="outline"
              >
                <Building2 data-icon="inline-start" />
                Bank account
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{!selectedBillingAccount ? "Choose a family with a billing account to collect a payment." : effectivePaymentTarget === "balance" && !accountOverview.data ? "Verify the account summary before collecting a balance payment." : accountOverview.data?.responsibilityReviewRequired ? "Family and agency responsibility must be reviewed before collecting the balance." : directorPaymentAmountCents <= 0 ? "There is no collectible balance. Use Custom amount and Advance payment for future tuition." : "The family and amount are reviewed before secure checkout opens."}</p>
            {accountOverview.error ? <Button type="button" variant="outline" onClick={accountOverview.retry}>Retry account summary</Button> : null}
            {effectivePaymentTarget.startsWith("invoice:") && selectedAutopayStatus !== "enabled" ? <p className="text-xs text-muted-foreground">Autopay requires the parent&apos;s consent for a saved payment method. Use a one-time checkout instead.</p> : null}
            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              Payment options
              <InfoTip label="Payment action help" side="right">
                Use Digital Terminal to open a secure card screen on this device for a parent who is present. A certified hardware reader appears only after that school has registered one.
              </InfoTip>
            </div>
          </div>
          <details id="billing-payment-reminder" className="mt-4 scroll-mt-24 rounded-lg border bg-background/40 p-3"><summary className="min-h-11 cursor-pointer content-center font-medium">Send a secure payment link</summary><div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="size-4 text-muted-foreground" />
                  Send a secure payment link
                  <InfoTip label="About secure payment links" side="right">
                    Send a secure payment form to email addresses saved on the family record. The form collects card or bank details securely.
                  </InfoTip>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedPaymentMethod?.paymentMethodReauthorizationRequired ? (
                  <Button disabled={isPending || !selectedFamily || selectedFamilyIsPast || !selectedPaymentMethod.paymentMethodReauthorizationRecipientEmails.length} onClick={() => sendPaymentMethodRequest("payment_method_reauthorization")}>
                    <Send data-icon="inline-start" />
                    Send replacement method link
                  </Button>
                ) : null}
                <Button disabled={isPending || !selectedFamily || selectedFamilyIsPast || !selectedPaymentRequestEmails.length} onClick={() => sendPaymentMethodRequest("instant_bank_verification")}>
                  <Building2 data-icon="inline-start" />
                  Send bank verification link
                </Button>
                <Button disabled={isPending || !selectedFamily || selectedFamilyIsPast || !selectedPaymentRequestEmails.length} onClick={() => sendPaymentMethodRequest("payment_steps")} variant="outline">
                  <Send data-icon="inline-start" />
                  Send payment link
                </Button>
                {manualPaymentEmailCopies.length ? (
                  <Button type="button" disabled={isPending} onClick={copyPaymentEmails} variant="outline">
                    <Copy data-icon="inline-start" />
                    Copy email{manualPaymentEmailCopies.length === 1 ? "" : "s"}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {selectedPaymentRequestEmailOptions.map((option) => {
                const id = `payment-request-${encodeURIComponent(option.email)}`;
                return (
                  <label key={option.email} htmlFor={id} className="flex min-h-12 items-start gap-2 rounded-lg border bg-background/50 p-2 text-sm">
                    <input
                      id={id}
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={selectedPaymentRequestEmails.includes(option.email)}
                      onChange={() => togglePaymentRequestEmail(option.email)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{option.label}</span>
                      <span className="block break-all text-xs text-muted-foreground">
                        {option.email}{option.hasPortalUser ? " · Parent Portal notification" : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
              {!selectedPaymentRequestEmailOptions.length ? (
                <div className="rounded-lg border bg-background/50 p-3 text-sm text-muted-foreground">
                  Add a parent or billing email to this family before sending the tuition payment link.
                </div>
              ) : null}
            </div>
          </div>
          </details>
        </div>

          </TabsContent>
          <TabsContent value="pay-ahead" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <div>
              <div className="text-sm font-medium">Create one monthly pay-ahead invoice</div>
              <p className="mt-1 text-xs text-muted-foreground">Use the child&apos;s saved monthly tuition rate and an exact number of future months. This replaces the weekly × 4 workaround and does not submit payment automatically.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1 md:col-span-2"><Label htmlFor="billing-pay-ahead-child">Child</Label><Select value={assignmentChildId} onValueChange={(value) => value && setAssignmentChildId(value)}><SelectTrigger id="billing-pay-ahead-child"><SelectValue placeholder="Choose child" /></SelectTrigger><SelectContent>{selectedChildren.map((child) => <SelectItem key={child.id} value={child.id}>{child.fullName} · {child.tuitionAssignment?.tuitionPlanName ?? "No saved plan"}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label htmlFor="billing-pay-ahead-months">Months paid ahead</Label><Input id="billing-pay-ahead-months" inputMode="numeric" min={1} max={PAY_AHEAD_MAX_MONTHS} value={payAheadMonthCount} onChange={(event) => setPayAheadMonthCount(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="billing-pay-ahead-start">First month</Label><Input id="billing-pay-ahead-start" type="month" value={payAheadStartPeriod} onChange={(event) => setPayAheadStartPeriod(event.target.value)} /></div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1"><Label htmlFor="billing-pay-ahead-due-date">Invoice due date</Label><Input id="billing-pay-ahead-due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
              <SummaryMetric label="Monthly rate" value={selectedAssignment?.cadence === "monthly" && selectedAssignment?.amountCents ? money(selectedAssignment.amountCents) : "Choose monthly plan"} detail="Saved child tuition rate" />
              <SummaryMetric label="Pay-ahead total" value={selectedAssignment?.cadence === "monthly" && selectedAssignment?.amountCents ? money(payAheadTotalCents(selectedAssignment.amountCents, Math.max(1, Number.parseInt(payAheadMonthCount, 10) || 1))) : "$0.00"} detail={`${payAheadMonthCount || 0} month${payAheadMonthCount === "1" ? "" : "s"}`} />
            </div>
            <Button disabled={isPending || !selectedFamily || !selectedAssignmentChild || !effectiveAssignmentPlanId} onClick={submitPayAhead}><CalendarClock data-icon="inline-start" />Create Pay-Ahead Invoice</Button>
          </TabsContent>

          <TabsContent value="single" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <ChargeFields
              idPrefix="billing-single-charge"
              chargeSource={effectiveChargeSource}
              setChargeSource={setChargeSource}
              tuitionPlanId={tuitionPlanId}
              setTuitionPlanId={handleTuitionPlanChange}
              productId={effectiveProductId}
              setProductId={setProductId}
              productQuantity={productQuantity}
              setProductQuantity={setProductQuantity}
              products={selectedProducts}
              tuitionPlans={locationTuitionPlans}
              amountDollars={amountDollars}
              setAmountDollars={setAmountDollars}
              selectedPlan={selectedPlan}
              selectedProduct={selectedProduct}
              allowTuitionPlan={!selectedFamilyIsProspective}
              customAmountPlaceholder={selectedFamilyIsProspective ? "Enter approved amount" : "250.00"}
            />
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="billing-single-child">Child</Label>
                <Select value={childId} onValueChange={(value) => value && setChildId(value)}>
                  <SelectTrigger id="billing-single-child"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Whole family (one-time charge only)</SelectItem>
                    {selectedChildren.map((child) => (
                      <SelectItem key={child.id} value={child.id}>{child.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DateFields idPrefix="billing-single" dueDate={dueDate} setDueDate={setDueDate} billingPeriod={billingPeriod} setBillingPeriod={setBillingPeriod} />
            </div>
            <DescriptionField id="billing-single-description" value={description} setValue={setDescription} />
            <Button disabled={isPending || !selectedFamily || selectedFamilyIsPast} onClick={submitSingle}>
              <ReceiptText data-icon="inline-start" />
              Create Invoice
            </Button>
          </TabsContent>

          <TabsContent value="edit" className="space-y-4 rounded-lg border bg-background/35 p-4">
            {selectedEditableInvoice ? (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="billing-invoice-editor">Open invoice</Label>
                    <Select
                      value={effectiveInvoiceEditorId}
                      onValueChange={(value) => {
                        if (isPending || !value || value === effectiveInvoiceEditorId || !openInvoices.some((invoice) => invoice.id === value)) return;
                        if ((invoiceDraftIsDirty || invoiceVoidReason.trim()) && !window.confirm("Discard unsaved invoice changes before selecting another invoice? Other family billing drafts stay as entered.")) return;
                        setInvoiceEditorId(value);
                        setInvoiceEditDraft(null);
                        setInvoiceVoidReason("");
                      }}
                    >
                      <SelectTrigger id="billing-invoice-editor"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {openInvoices.map((invoice) => (
                          <SelectItem key={invoice.id} value={invoice.id}>
                            {invoice.number} · {money(invoice.totalCents)} · due {formatInvoiceDueDate(invoice.dueDate)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="billing-invoice-amount">Invoice amount</Label>
                    <Input id="billing-invoice-amount" inputMode="decimal" value={invoiceEditAmountDollars} onChange={(event) => updateInvoiceEditDraft({ amountDollars: event.target.value })} placeholder="25.00" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="billing-invoice-due-date">Due date</Label>
                    <Input id="billing-invoice-due-date" type="date" value={invoiceEditDueDate} onChange={(event) => updateInvoiceEditDraft({ dueDate: event.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="billing-invoice-details">Invoice details</Label>
                  <Textarea value={invoiceEditDescription} id="billing-invoice-details" onChange={(event) => updateInvoiceEditDraft({ description: event.target.value })} placeholder="Tuition, fee, or correction note" />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <SummaryMetric label="Current total" value={money(selectedEditableInvoice.totalCents)} detail={selectedEditableInvoice.number} />
                  <SummaryMetric label="Updated total" value={invoiceEditAmountCents > 0 ? money(invoiceEditAmountCents) : "$0.00"} detail={formatInvoiceDueDate(invoiceEditDueDate)} />
                  <SummaryMetric label="Balance change" value={money(invoiceEditDeltaCents)} detail={invoiceEditDeltaCents < 0 ? "Credit to family balance" : invoiceEditDeltaCents > 0 ? "Debit to family balance" : "No balance change"} />
                </div>
                <Button disabled={isPending || !selectedFamily || invoiceEditAmountCents <= 0 || !invoiceEditDescription.trim()} onClick={submitInvoiceEdit}>
                  <FilePenLine data-icon="inline-start" />
                  Save Invoice Changes
                </Button>
                <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <div>
                    <Label htmlFor="invoice-void-reason">Void invoice</Label>
                    <p className="text-xs text-muted-foreground">Removes this unpaid charge from the family balance while preserving the invoice, ledger reversal, and audit history.</p>
                  </div>
                  <Textarea
                    id="invoice-void-reason"
                    value={invoiceVoidReason}
                    onChange={(event) => setInvoiceVoidReason(event.target.value)}
                    placeholder="Reason this invoice should be voided"
                  />
                  <Button type="button" variant="destructive" disabled={isPending || invoiceVoidReason.trim().length < 5} onClick={submitInvoiceVoid}>
                    <Ban data-icon="inline-start" />
                    Void Invoice
                  </Button>
                </div>
              </>
            ) : (
              <Alert>
                <AlertCircle data-icon="inline-start" />
                <AlertTitle>No open invoices</AlertTitle>
                <AlertDescription>Choose a family with an open invoice before editing billed details.</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="batch" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <ChargeFields
              idPrefix="billing-batch-charge"
              chargeSource={effectiveChargeSource}
              setChargeSource={setChargeSource}
              tuitionPlanId={tuitionPlanId}
              setTuitionPlanId={handleTuitionPlanChange}
              productId={effectiveProductId}
              setProductId={setProductId}
              productQuantity={productQuantity}
              setProductQuantity={setProductQuantity}
              products={selectedProducts}
              tuitionPlans={locationTuitionPlans}
              amountDollars={amountDollars}
              setAmountDollars={setAmountDollars}
              selectedPlan={selectedPlan}
              selectedProduct={selectedProduct}
              allowTuitionPlan
              customAmountPlaceholder="250.00"
            />
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1">
                <Label htmlFor="billing-batch-target">Batch target</Label>
                <Select value={batchTarget} onValueChange={(value) => value && setBatchTarget(value)}>
                  <SelectTrigger id="billing-batch-target"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="child">Per matching child</SelectItem>
                    <SelectItem value="family">Per matching family</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-batch-age-group">Age group</Label>
                <Select value={ageGroup} onValueChange={(value) => value && setAgeGroup(value)}>
                  <SelectTrigger id="billing-batch-age-group"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All age groups</SelectItem>
                    {ageGroups.map((group) => (
                      <SelectItem key={group} value={group}>{group}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-batch-status">Status</Label>
                <Select value={effectiveBatchEnrollmentStatus} onValueChange={(value) => value && setEnrollmentStatus(value)}>
                  <SelectTrigger id="billing-batch-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enrolled">Enrolled</SelectItem>
                    <SelectItem value="waitlisted" disabled={effectiveChargeSource === "tuitionPlan"}>Waitlisted</SelectItem>
                    <SelectItem value="pending" disabled={effectiveChargeSource === "tuitionPlan"}>Pending</SelectItem>
                    <SelectItem value="all">{effectiveChargeSource === "tuitionPlan" ? "All current statuses" : "All statuses"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DateFields idPrefix="billing-batch" dueDate={dueDate} setDueDate={setDueDate} billingPeriod={billingPeriod} setBillingPeriod={setBillingPeriod} />
            </div>
            <DescriptionField id="billing-batch-description" value={description} setValue={setDescription} />
            <Button disabled={isPending || !centerId} onClick={submitBatch}>
              <Rows3 data-icon="inline-start" />
              Create Batch Invoices
            </Button>
            <p className="text-xs text-muted-foreground">
              Batch creates invoices only. Never batch the same tuition period already handled by weekly recurring assignments. A due invoice can be collected later if that family separately has autopay enabled.
            </p>
          </TabsContent>

          <TabsContent value="weekly-recovery" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <div>
              <div className="text-sm font-medium">Weekly billing recovery</div>
              <p className="text-xs text-muted-foreground">
                Finds enabled weekly tuition assignments for this school, skips invoices that already exist for the child and period, and creates invoices only. Recovery invoices do not submit autopay.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="billing-weekly-recovery-period">Billing week</Label>
                <Input
                  id="billing-weekly-recovery-period"
                  value={weeklyRecoveryPeriod}
                  onChange={(event) => {
                    setWeeklyRecoveryPeriod(event.target.value);
                    setWeeklyRecoveryPreview(null);
                  }}
                  placeholder="2026-W34"
                />
              </div>
              <SummaryMetric
                label="Preview"
                value={weeklyRecoveryPreview ? String(weeklyRecoveryPreview.wouldCreate) : "Not run"}
                detail={weeklyRecoveryPreview ? `${weeklyRecoveryPreview.assignedChildren} enabled assignment${weeklyRecoveryPreview.assignedChildren === 1 ? "" : "s"}` : "Run preview first"}
              />
              <SummaryMetric
                label="Collection"
                value="Suppressed"
                detail="Invoices only; no payment submitted"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={isPending || !centerId || !weeklyRecoveryPeriod.trim()} onClick={() => runWeeklyRecovery(true)} variant="outline">
                <Search data-icon="inline-start" />
                Preview Weekly Run
              </Button>
              <Button disabled={isPending || !weeklyRecoveryPreview || weeklyRecoveryPreview.centerId !== centerId || weeklyRecoveryPreview.wouldCreate <= 0} onClick={() => runWeeklyRecovery(false)}>
                <Play data-icon="inline-start" />
                Create Weekly Invoices
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use this when the automatic weekly run was not set or did not run. If the preview changes before creation, Bee Suite stops and asks for a new preview.
            </p>
          </TabsContent>

          <TabsContent value="recurring" className="scroll-mt-4 space-y-4 rounded-lg border bg-background/35 p-4">
            <div id="child-tuition-setup">
              <div className="text-sm font-medium">Recurring tuition by child</div>
              <p className="text-xs text-muted-foreground">
                Select a child, choose that child’s rate, and save. Repeat for each sibling; the family ledger receives the combined total while each child keeps an individual rate.
              </p>
            </div>
            {selectedAssignmentChild && !selectedAssignmentChildIsCurrent ? (
              <Alert className="border-amber-500/30 bg-amber-500/10">
                <CalendarClock className="size-4" />
                <AlertTitle>Recurring tuition is not active yet</AlertTitle>
                <AlertDescription>
                  Keep this child pending or waitlisted. After enrollment is current and a classroom is assigned, recurring tuition can be saved here. Use Family charge for an enrollment fee.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {selectedChildren.map((child) => {
                const classroom = selectedCenterClassrooms.find((item) => item.id === child.classroomId);
                const selected = child.id === effectiveAssignmentChildId;
                return (
                  <button
                    key={child.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Select ${child.fullName} for recurring tuition setup`}
                    disabled={isPending}
                    onClick={() => handleAssignmentChildChange(child.id)}
                    className={`rounded-lg border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/10" : "bg-background/60 hover:border-primary/50"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{child.fullName}</span>
                      {selected ? <Badge>Selected</Badge> : null}
                    </div>
                    <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                      <span>Program: {child.ageGroup || "Not set"}</span>
                      <span>Classroom: {classroom?.name ?? "Not assigned"}</span>
                      <span>Schedule: {scheduledDaysLabel(child)}</span>
                      <span>Rate name: {child.tuitionAssignment?.description || child.tuitionAssignment?.tuitionPlanName || "Not assigned"}</span>
                      <span>Tuition: {child.tuitionAssignment?.enabled && typeof child.tuitionAssignment.amountCents === "number" ? `${money(child.tuitionAssignment.amountCents)}/${tuitionCadenceUnit(child.tuitionAssignment.cadence)}` : "Not assigned"}</span>
                      {child.tuitionAssignment?.additionalChargesTotalCents ? <span>Additional lines: {money(child.tuitionAssignment.additionalChargesTotalCents)}</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
            {canManageEnrollment ? <details name="billing-tuition-options" className="space-y-3 rounded-lg border bg-muted/20 p-3"><summary className="min-h-11 cursor-pointer content-center font-medium">Child setup: program, classroom and schedule</summary>
              <div>
                <div className="text-sm font-medium">Selected child setup</div>
                <p className="text-xs text-muted-foreground">
                  Set this child’s program, classroom, care schedule, and start date. This saves the child profile separately and does not change tuition or the family ledger.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor="billing-child-program">Program / age group</Label>
                  <Select value={assignmentChildProgram} onValueChange={(value) => value && setAssignmentChildProgram(value)}>
                    <SelectTrigger id="billing-child-program"><SelectValue placeholder="Choose program" /></SelectTrigger>
                    <SelectContent>
                      {ageGroups.map((group) => <SelectItem key={group} value={group}>{group}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="billing-child-classroom">Classroom</Label>
                  <Select value={assignmentChildClassroomId} onValueChange={(value) => value && setAssignmentChildClassroomId(value)}>
                    <SelectTrigger id="billing-child-classroom"><SelectValue placeholder="Choose classroom" /></SelectTrigger>
                    <SelectContent>
                      {selectedCenterClassrooms.map((classroom) => (
                        <SelectItem key={classroom.id} value={classroom.id}>{classroom.name} · {classroom.ageGroup}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="billing-child-scheduled-days">Days per week</Label>
                  <Select value={assignmentChildScheduledDays} onValueChange={(value) => value && setAssignmentChildScheduledDays(value)}>
                    <SelectTrigger id="billing-child-scheduled-days"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">Not set</SelectItem>
                      <SelectItem value="legacy_part_time">Part-time (exact days not set)</SelectItem>
                      <SelectItem value="2">2 days/week</SelectItem>
                      <SelectItem value="3">3 days/week</SelectItem>
                      <SelectItem value="4">4 days/week</SelectItem>
                      <SelectItem value="5">5 days/week</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="billing-child-start-date">Start date</Label>
                  <Input id="billing-child-start-date" type="date" value={assignmentChildStartDate} onChange={(event) => setAssignmentChildStartDate(event.target.value)} />
                </div>
              </div>
              <Button type="button" variant="outline" disabled={isPending || !selectedAssignmentChild || !assignmentChildProgram || !assignmentChildClassroomId} onClick={saveAssignmentChildContext}>
                <Save data-icon="inline-start" />
                Save child setup
              </Button>
            </details> : <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">Program, classroom, and care schedule are shown above. Ask a director to change enrollment details; authorized tuition changes remain available below.</p>}
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1">
                <Label htmlFor="billing-assignment-child">Child</Label>
                <Select disabled={isPending} value={effectiveAssignmentChildId} onValueChange={handleAssignmentChildChange}>
                  <SelectTrigger id="billing-assignment-child"><SelectValue placeholder="Choose child" /></SelectTrigger>
                  <SelectContent>
                    {selectedChildren.map((child) => (
                      <SelectItem key={child.id} value={child.id}>
                        {child.fullName}{child.tuitionAssignment?.enabled && typeof child.tuitionAssignment.amountCents === "number"
                          ? ` · ${money(child.tuitionAssignment.amountCents)}/${tuitionCadenceUnit(child.tuitionAssignment.cadence)}`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-assignment-status">Status</Label>
                <Select value={assignmentEnabled} onValueChange={(value) => value && setAssignmentEnabled(value)}>
                  <SelectTrigger id="billing-assignment-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="billing-assignment-plan">Tuition plan</Label>
                <Select value={effectiveAssignmentPlanId} onValueChange={handleAssignmentPlanChange}>
                  <SelectTrigger id="billing-assignment-plan"><SelectValue placeholder="Choose plan" /></SelectTrigger>
                  <SelectContent>
                    {locationTuitionPlans.filter(plan => !plan.archived || plan.id === selectedAssignmentChild?.tuitionAssignment?.tuitionPlanId).map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} · {plan.ageGroup} · {plan.cadence} · {money(plan.amountCents)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-assignment-cycle">Billing cycle</Label>
                <Select value={effectiveAssignmentCadence} onValueChange={(value) => {
                  if (!value) return;
                  setAssignmentCadence(value);
                  setAssignmentStartPeriod(currentPeriodForCadence(value));
                }} disabled={assignmentIsVoucherFunded}>
                  <SelectTrigger id="billing-assignment-cycle"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tuitionRateCadence(effectiveAssignmentPlan?.cadence) === "monthly" ? (
                      <SelectItem value="monthly">Monthly · 1 month at a time</SelectItem>
                    ) : (
                      <>
                        <SelectItem value="weekly">Weekly · 1 week ahead</SelectItem>
                        <SelectItem value="biweekly">Biweekly · 2 weeks ahead</SelectItem>
                        <SelectItem value="four_week">Every 4 weeks · 4 weeks ahead</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {effectiveAssignmentCadence === "monthly" ? (
                <div className="space-y-1">
                  <Label htmlFor="billing-assignment-invoice-day">Monthly invoice day</Label>
                  <Input
                    id="billing-assignment-invoice-day"
                    type="number"
                    min="1"
                    max="28"
                    value={assignmentBillingDay}
                    disabled={assignmentIsVoucherFunded}
                    onChange={(event) => setAssignmentBillingDay(event.target.value)}
                  />
                </div>
              ) : (
                <DisplayValue
                  label="Weekly invoice creation"
                  value={assignmentIsVoucherFunded ? "Not scheduled" : "Thursday"}
                  detail={assignmentIsVoucherFunded ? "$0 voucher assignment only" : "Creates the following week's invoice"}
                />
              )}
              <div className="space-y-1">
                <Label htmlFor="billing-assignment-start-period">{effectiveAssignmentCadence === "monthly" ? "Start month" : "Start week"}</Label>
                <Input
                  id="billing-assignment-start-period"
                  value={effectiveAssignmentStartPeriod}
                  onChange={(event) => setAssignmentStartPeriod(event.target.value)}
                  placeholder={effectiveAssignmentCadence === "monthly" ? "2026-08" : "2026-W23"}
                />
              </div>
              {effectiveAssignmentCadence === "biweekly" && !assignmentIsVoucherFunded ? (
                <div className="space-y-1">
                  <Label htmlFor="billing-assignment-invoice-timing">Biweekly invoice timing</Label>
                  <Select value={assignmentInvoiceDelayWeeks} onValueChange={(value) => { if (value) setAssignmentInvoiceDelayWeeks(value); }}>
                    <SelectTrigger id="billing-assignment-invoice-timing"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Standard schedule</SelectItem>
                      <SelectItem value="1">One week later · prepaid week</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Shifts future invoice dates by one week while keeping the saved tuition coverage and biweekly amount.</p>
                  {nextAssignmentInvoiceDate ? <p className="text-xs">Next scheduled invoice: {formatInvoiceDueDate(nextAssignmentInvoiceDate)}</p> : null}
                </div>
              ) : null}
            </div>
            {assignmentTimingChanging ? (
              <div className="space-y-1">
                <Label htmlFor="billing-assignment-timing-reason">Reason for timing change</Label>
                <Input id="billing-assignment-timing-reason" value={assignmentTimingReason} onChange={(event) => setAssignmentTimingReason(event.target.value)} placeholder="For example, one week paid ahead at enrollment" />
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <DisplayValue
                label={`Customer ${effectiveRateCadence} tuition`}
                value={selectedDraftRateIsActive ? money(draftSelectedWeeklyTuitionCents) : "Not assigned"}
                detail={effectiveAssignmentDescription || effectiveAssignmentPlan?.name || "Choose a rate for this child"}
              />
              <DisplayValue
                label={`Family ${effectiveRateCadence} total`}
                value={projectedActiveRateCount ? money(projectedFamilyWeeklyTuitionCents) : "Not assigned"}
                detail={`Auto-calculated from ${projectedActiveRateCount} child rate${projectedActiveRateCount === 1 ? "" : "s"}; save tuition to update the family ledger`}
              />
            </div>
            <details name="billing-tuition-options" className="space-y-3 rounded-lg border bg-muted/20 p-3"><summary className="min-h-11 cursor-pointer content-center font-medium">Additional invoice lines - {money(effectiveAssignmentAdditionalChargesTotalCents)}</summary>
              <div>
                <div className="text-sm font-medium">{effectiveRateCadence === "monthly" ? "Monthly" : "Weekly"} additional invoice lines</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use separate positive lines when state audit records need parent fees and gap tuition itemized on the invoice.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {assignmentAdditionalCharges.map((line, index) => (
                  <div key={index} className="billing-additional-line grid grid-cols-1 gap-2 rounded-md border bg-background/60 p-2">
                    <div className="space-y-1">
                      <Label htmlFor={`billing-tuition-additional-description-${index}`}>Line {index + 1} label</Label>
                      <Input
                        id={`billing-tuition-additional-description-${index}`}
                        value={line.description}
                        onChange={(event) => setAssignmentAdditionalCharges((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))}
                        placeholder={index === 0 ? "Parent fee" : "Gap tuition"}
                        disabled={assignmentIsVoucherFunded}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`billing-tuition-additional-amount-${index}`}>Amount</Label>
                      <Input
                        id={`billing-tuition-additional-amount-${index}`}
                        inputMode="decimal"
                        value={line.amountDollars}
                        onChange={(event) => setAssignmentAdditionalCharges((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amountDollars: event.target.value } : item))}
                        placeholder="0.00"
                        disabled={assignmentIsVoucherFunded}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <DisplayValue label={`Base ${effectiveRateCadence} tuition`} value={money(effectiveAssignmentGrossCents)} />
                <DisplayValue label="Additional lines" value={money(effectiveAssignmentAdditionalChargesTotalCents)} />
                <DisplayValue label={`Gross ${effectiveRateCadence} total`} value={money(effectiveAssignmentGrossCents + effectiveAssignmentAdditionalChargesTotalCents)} />
              </div>
            </details>
            <details name="billing-tuition-options" className="space-y-3 rounded-lg border bg-muted/20 p-3"><summary className="min-h-11 cursor-pointer content-center font-medium">Recurring invoice credits - {money(effectiveAssignmentCreditsTotalCents)}</summary>
              <div>
                <div className="text-sm font-medium">{effectiveRateCadence === "monthly" ? "Monthly" : "Weekly"} invoice credits</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter approved {effectiveRateCadence} amounts. Each credit appears as its own negative invoice line and categorized ledger entry.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {TUITION_CREDIT_CATEGORIES.map((category) => (
                  <div key={category.id} className="space-y-1">
                    <Label htmlFor={`billing-tuition-credit-${category.id}`}>{category.label}</Label>
                    <Input
                      id={`billing-tuition-credit-${category.id}`}
                      inputMode="decimal"
                      value={assignmentCredits[category.id]}
                      onChange={(event) => setAssignmentCredits((current) => ({ ...current, [category.id]: event.target.value }))}
                      placeholder="0.00"
                      disabled={assignmentIsVoucherFunded}
                    />
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <DisplayValue label={`Gross ${effectiveRateCadence} tuition`} value={money(effectiveAssignmentGrossCents + effectiveAssignmentAdditionalChargesTotalCents)} />
                <DisplayValue label={`${effectiveRateCadence === "monthly" ? "Monthly" : "Weekly"} credits`} value={`−${money(effectiveAssignmentCreditsTotalCents)}`} />
                <DisplayValue
                  label={effectiveAssignmentCadence === "four_week" ? "Every-4-weeks invoice" : effectiveAssignmentCadence === "biweekly" ? "Biweekly invoice" : `Net ${effectiveRateCadence} invoice`}
                  value={money(effectiveAssignmentInvoiceCents)}
                  detail={effectiveAssignmentCreditsTotalCents >= effectiveAssignmentGrossCents + effectiveAssignmentAdditionalChargesTotalCents && !assignmentIsVoucherFunded
                    ? "Credits must be less than gross tuition"
                    : "Amount added to the family ledger"}
                />
              </div>
            </details>
            <SummaryMetric label="Net recurring invoice" value={money(effectiveAssignmentInvoiceCents)} detail="Includes the selected rate, additional lines, recurring credits and billing-cycle multiplier." />
            <div className="space-y-1">
              <Label htmlFor="billing-assignment-description">Child tuition label</Label>
              <Input
                id="billing-assignment-description"
                value={assignmentDescription}
                onChange={(event) => setAssignmentDescription(event.target.value)}
                placeholder={effectiveAssignmentPlan?.name || `${selectedAssignmentChild?.fullName ?? "Child"} ${effectiveRateCadence} tuition`}
              />
              <p className="text-xs text-muted-foreground">
                Optional name for this child’s invoice and ledger line. Leave blank to use the selected rate name.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={isPending || !selectedFamily || !selectedAssignmentChild || (assignmentEnabled === "true" && (!selectedAssignmentChildIsCurrent || !effectiveAssignmentPlanId || (!assignmentIsVoucherFunded && effectiveAssignmentCreditsTotalCents >= effectiveAssignmentGrossCents + effectiveAssignmentAdditionalChargesTotalCents)))}
                onClick={submitAssignment}
              >
                <CalendarClock data-icon="inline-start" />
                Save Tuition Assignment
              </Button>
              <Button disabled={isPending || !selectedFamily || !selectedAssignmentChild || !selectedAssignmentChildIsCurrent || !effectiveAssignmentPlanId || assignmentIsVoucherFunded || effectiveAssignmentCadence !== "weekly"} onClick={submitAssignmentChargeNow} variant="outline">
                <ReceiptText data-icon="inline-start" />
                {effectiveAssignmentCadence === "weekly" ? "Create Invoice Now" : "First Invoice Scheduled"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Weekly billing creates one week-ahead invoices. Biweekly billing creates one invoice equal to two net weekly rates every two weeks. Every-4-weeks billing creates one invoice equal to four net weekly rates. Monthly billing creates one invoice for the saved monthly rate on the selected day (1–28). The opening balance remains unchanged; enter an opening balance only when the family already owes money. This does not enable family autopay. Explicit $0.00 CCDF or voucher-funded assignments never create a family invoice or autopay attempt.
            </p>
            <p className="text-xs text-muted-foreground">Save Tuition Assignment to apply future billing dates. To change an existing unpaid invoice&apos;s due date, open Edit invoice in this workbench. Existing invoices and payments are preserved when saving the recurring schedule.</p>
          </TabsContent>

          <TabsContent value="agency" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <div className="text-sm font-medium">Agency money stays separate from the family ledger</div>
            <p className="text-sm text-muted-foreground">
              Create each agency claim and record ACH, check, or portal remittance in the Agency Claim Queue. Claim remittances never credit a family balance or reduce what a parent owes.
            </p>
            <Button variant="outline" onClick={() => document.getElementById("agency-subsidy-billing")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              Open Agency Claim Queue
            </Button>
          </TabsContent>

          <TabsContent value="check" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <div>
              <div className="text-sm font-medium">Record a payment received by check</div>
              <p className="mt-1 text-xs text-muted-foreground">This posts a completed payment, reduces the family balance, and automatically marks fully covered oldest invoices paid. Keep the physical check according to the school&apos;s deposit policy.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="billing-check-amount">Amount</Label>
                <Input id="billing-check-amount" inputMode="decimal" value={checkAmountDollars} onChange={(event) => setCheckAmountDollars(event.target.value)} placeholder="250.00" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-check-reference">Check number / reference</Label>
                <Input id="billing-check-reference" value={checkNumber} onChange={(event) => setCheckNumber(event.target.value)} placeholder="1042" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-check-received-date">Received date and time</Label>
                <Input id="billing-check-received-date" type="datetime-local" value={checkPaidAt} onChange={(event) => setCheckPaidAt(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="billing-check-notes">Notes</Label>
              <Textarea id="billing-check-notes" value={checkNotes} onChange={(event) => setCheckNotes(event.target.value)} placeholder="Optional deposit, payer, or office notes" />
            </div>
            <Button disabled={isPending || !selectedFamily || !checkAmountDollars || !checkNumber.trim()} onClick={submitManualCheckPayment}>
              <Banknote data-icon="inline-start" />
              Post Check Payment
            </Button>
          </TabsContent>

          <TabsContent value="cash" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <div>
              <div className="text-sm font-medium">Record a payment received in cash</div>
              <p className="mt-1 text-xs text-muted-foreground">This posts a completed cash payment, reduces the family balance, and automatically marks fully covered oldest invoices paid. Only an amount beyond all outstanding charges remains as account credit.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="billing-cash-amount">Amount</Label>
                <Input id="billing-cash-amount" inputMode="decimal" value={cashAmountDollars} onChange={(event) => setCashAmountDollars(event.target.value)} placeholder="250.00" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-cash-reference">Receipt / reference <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="billing-cash-reference" value={cashReference} onChange={(event) => setCashReference(event.target.value)} placeholder="Front desk receipt 1042" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-cash-received-date">Received date and time</Label>
                <Input id="billing-cash-received-date" type="datetime-local" value={cashPaidAt} onChange={(event) => setCashPaidAt(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="billing-cash-notes">Notes</Label>
              <Textarea id="billing-cash-notes" value={cashNotes} onChange={(event) => setCashNotes(event.target.value)} placeholder="Optional payer, receipt, drawer, or deposit notes" />
            </div>
            <Button disabled={isPending || !selectedFamily || dollarsToCents(cashAmountDollars) <= 0} onClick={submitManualCashPayment}>
              <Banknote data-icon="inline-start" />
              Post Cash Payment
            </Button>
          </TabsContent>

          <TabsContent value="payroll" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <div>
              <div className="text-sm font-medium">Record childcare already withheld through payroll</div>
              <p className="mt-1 text-xs text-muted-foreground">Use this only after payroll confirms the deduction. It is an offline family payment—not a discount or employer benefit—and it reduces the family balance once, automatically marks fully covered oldest invoices paid, and keeps an auditable pay-period reference.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="billing-payroll-amount">Amount withheld</Label>
                <Input id="billing-payroll-amount" inputMode="decimal" value={payrollAmountDollars} onChange={(event) => setPayrollAmountDollars(event.target.value)} placeholder="250.00" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-payroll-reference">Payroll run / pay period</Label>
                <Input id="billing-payroll-reference" value={payrollReference} onChange={(event) => setPayrollReference(event.target.value)} placeholder="2026-08-16 to 2026-08-29" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-payroll-posted-date">Payroll posted date and time</Label>
                <Input id="billing-payroll-posted-date" type="datetime-local" value={payrollPaidAt} onChange={(event) => setPayrollPaidAt(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="billing-payroll-notes">Payroll confirmation notes</Label>
              <Textarea id="billing-payroll-notes" value={payrollNotes} onChange={(event) => setPayrollNotes(event.target.value)} placeholder="Optional payroll register or internal confirmation reference; do not enter bank credentials" />
            </div>
            <Button disabled={isPending || !selectedFamily || dollarsToCents(payrollAmountDollars) <= 0 || !payrollReference.trim()} onClick={submitPayrollDeductionPayment}>
              <Banknote data-icon="inline-start" />
              Post Payroll Deduction Payment
            </Button>
          </TabsContent>

          <TabsContent value="refund" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <div>
              <div className="text-sm font-medium">Issue a family refund</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {canApproveRefunds
                  ? "Executives can issue the approved total across eligible original payments. Payment references are optional and are used first for record keeping."
                  : "Enter the requested total and reason. Bee Suite will notify executives; no money moves until an executive approves the request and records an approval reason."}
              </p>
            </div>
            {refundablePayments.length ? (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="billing-refund-amount">Total refund amount</Label>
                    <Input id="billing-refund-amount" inputMode="decimal" value={refundAmountDollars} onChange={(event) => setRefundAmountDollars(event.target.value)} placeholder="0.00" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <div id="billing-refund-payment-references-label" className="text-sm font-medium">Payment references <span className="font-normal text-muted-foreground">(optional)</span></div>
                    <div role="group" aria-labelledby="billing-refund-payment-references-label" className="max-h-36 space-y-1 overflow-auto rounded-lg border bg-card/40 p-2">
                      {refundablePayments.map((payment) => {
                        const paymentInputId = `billing-refund-payment-${payment.id}`;
                        return (
                          <label key={payment.id} htmlFor={paymentInputId} className="flex min-h-10 cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/50">
                            <input
                              id={paymentInputId}
                              type="checkbox"
                              className="mt-0.5 size-5 shrink-0"
                              checked={selectedRefundPaymentIds.includes(payment.id)}
                              onChange={(event) => setRefundPaymentIds((current) => event.target.checked ? [...current, payment.id] : current.filter((id) => id !== payment.id))}
                            />
                            <span>{formatShortDate(payment.paidAt)} · {money(payment.amountCents)} paid · {money(payment.refundableCents)} available{payment.paymentMethodLabel ? ` · ${payment.paymentMethodLabel}` : ""}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="billing-refund-reason">Refund reason</Label>
                  <Textarea id="billing-refund-reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} placeholder="Duplicate payment, incorrect amount, enrollment change, or other approved reason" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={isPending || dollarsToCents(refundAmountDollars) <= 0 || !refundReason.trim()} onClick={submitRefundPayment} variant="destructive">
                    <RotateCcw data-icon="inline-start" />
                    {canApproveRefunds ? "Issue Refund" : "Request Refund Approval"}
                  </Button>
                  <Badge variant="outline">{money(visibleRefundableCents)} available through the original processor</Badge>
                </div>
              </>
            ) : (
              <Alert>
                <AlertCircle data-icon="inline-start" />
                <AlertTitle>No refundable online payments</AlertTitle>
                <AlertDescription>This family has no completed processor payment with a remaining refundable amount.</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="adjustment" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <div>
              <div className="text-sm font-medium">Post one fee or credit without changing weekly tuition</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Use this for a single approved late fee, vacation credit, or other balance adjustment. It posts once to the family ledger and leaves the child&apos;s saved recurring tuition and future weekly invoices unchanged.
              </p>
            </div>
            <Alert className="border-primary/25 bg-primary/5">
              <CheckCircle2 className="size-4" />
              <AlertTitle>One-time ledger entry</AlertTitle>
              <AlertDescription>
                A credit lowers the family balance. A fee or debit increases it. This action does not create or edit an invoice, submit a payment, or turn autopay on.
              </AlertDescription>
            </Alert>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="billing-adjustment-reason">One-time action</Label>
                <Select
                  value={adjustmentReason}
                  onValueChange={(value) => {
                    const option = oneTimeBillingAdjustmentOption(value);
                    if (option) {
                      setAdjustmentReason(option.id);
                      setAdjustmentNote("");
                    }
                  }}
                >
                  <SelectTrigger id="billing-adjustment-reason"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ONE_TIME_BILLING_ADJUSTMENT_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-adjustment-amount">Amount</Label>
                <Input
                  id="billing-adjustment-amount"
                  inputMode="decimal"
                  value={adjustmentAmountDollars}
                  onChange={(event) => setAdjustmentAmountDollars(event.target.value)}
                  placeholder="25.00"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-adjustment-effective-date">Applies to date</Label>
                <Input
                  id="billing-adjustment-effective-date"
                  type="date"
                  value={adjustmentEffectiveDate}
                  onChange={(event) => setAdjustmentEffectiveDate(event.target.value)}
                />
                <p className="text-xs leading-5 text-muted-foreground">The balance changes when you post; this date identifies the service or policy date in the ledger.</p>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="billing-adjustment-note">
                Statement note {oneTimeBillingAdjustmentNeedsNote(adjustmentReason) ? "(required)" : "(optional)"}
              </Label>
              <Textarea
                id="billing-adjustment-note"
                value={adjustmentNote}
                onChange={(event) => setAdjustmentNote(event.target.value)}
                placeholder={adjustmentReason === "vacation_credit" ? "Week of September 14" : adjustmentReason === "late_fee" ? "September 8 late-payment policy" : "Explain the approved reason"}
              />
              <p className="text-xs leading-5 text-muted-foreground">Shown in the family ledger. Include the service week or policy reason; do not enter sensitive child information.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryMetric label="Current balance" value={money(familyBalanceCents)} detail={selectedFamily?.name ?? "Choose a family"} />
              <SummaryMetric
                label={selectedAdjustmentOption.adjustmentType === "credit" ? "One-time credit" : "One-time fee"}
                value={`${selectedAdjustmentOption.adjustmentType === "credit" ? "−" : "+"}${money(adjustmentAmountCents)}`}
                detail={`${selectedAdjustmentOption.label} · ${adjustmentEffectiveDate || "Choose date"}`}
              />
              <SummaryMetric label="Projected balance" value={money(projectedAdjustmentBalanceCents)} detail="Recurring tuition unchanged" />
            </div>
            <Button
              disabled={isPending || !selectedFamily || adjustmentAmountCents <= 0 || !adjustmentEffectiveDate || (oneTimeBillingAdjustmentNeedsNote(adjustmentReason) && !adjustmentNote.trim())}
              onClick={submitAdjustment}
            >
              {selectedAdjustmentOption.adjustmentType === "credit"
                ? <MinusCircle data-icon="inline-start" />
                : <PlusCircle data-icon="inline-start" />}
              {selectedAdjustmentOption.buttonLabel}
            </Button>
          </TabsContent>
        </Tabs>
        </TabsContent>
        ) : null}
        <TabsContent value="ledger" keepMounted className="min-w-0">
          {ledger ? <FamilyLedgerCard {...ledger} families={families} selectedFamilyId={effectiveFamilyId} initialCenterId={centerId} canOpenFamilyProfile={canOpenFamilyProfile} /> : <p className="text-sm text-muted-foreground">Ledger history is unavailable in this preview.</p>}
        </TabsContent>
        </Tabs>
        </fieldset>
      </CardContent>
    </Card>
    </>
  );
}

function ChargeFields({
  idPrefix,
  chargeSource,
  setChargeSource,
  tuitionPlanId,
  setTuitionPlanId,
  productId,
  setProductId,
  products,
  productQuantity,
  setProductQuantity,
  tuitionPlans,
  amountDollars,
  setAmountDollars,
  selectedPlan,
  selectedProduct,
  allowTuitionPlan,
  customAmountPlaceholder,
}: {
  idPrefix: string;
  chargeSource: SingleInvoiceChargeSource;
  setChargeSource: (value: SingleInvoiceChargeSource) => void;
  tuitionPlanId: string;
  setTuitionPlanId: (value: string) => void;
  productId: string;
  setProductId: (value: string) => void;
  products: BillingWorkbenchProduct[];
  productQuantity: string;
  setProductQuantity: (value: string) => void;
  tuitionPlans: BillingWorkbenchTuitionPlan[];
  amountDollars: string;
  setAmountDollars: (value: string) => void;
  selectedPlan: BillingWorkbenchTuitionPlan | null;
  selectedProduct: BillingWorkbenchProduct | null;
  allowTuitionPlan: boolean;
  customAmountPlaceholder: string;
}) {
  const uniformProduct = selectedProduct?.type === STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE ? selectedProduct : null;
  const uniformQuantity = Math.max(1, Number.parseInt(productQuantity, 10) || 1);
  const uniformBundles = Math.floor(uniformQuantity / STUDENT_UNIFORM_SHIRT_BUNDLE_COUNT);
  const uniformSingles = uniformQuantity % STUDENT_UNIFORM_SHIRT_BUNDLE_COUNT;
  const uniformTotalCents = uniformBundles * STUDENT_UNIFORM_SHIRT_BUNDLE_PRICE_CENTS + uniformSingles * (uniformProduct?.amountCents ?? STUDENT_UNIFORM_SHIRT_SINGLE_PRICE_CENTS);
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-type`}>Charge type</Label>
        <Select value={chargeSource} onValueChange={(value) => {
          if (value === "tuitionPlan" || value === "product" || value === "custom") setChargeSource(value);
        }}>
          <SelectTrigger id={`${idPrefix}-type`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tuitionPlan" disabled={!allowTuitionPlan}>Tuition plan</SelectItem>
            {products.length ? <SelectItem value="product">Uniform shirt / product</SelectItem> : null}
            <SelectItem value="custom">Custom charge</SelectItem>
          </SelectContent>
        </Select>
        {!allowTuitionPlan ? <p className="text-xs text-muted-foreground">Pending and waitlisted families can receive one-time fees, not recurring tuition.</p> : null}
      </div>
      {chargeSource === "tuitionPlan" ? (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-tuition-plan`}>Tuition plan</Label>
          <Select value={tuitionPlanId} onValueChange={(value) => value && setTuitionPlanId(value)}>
            <SelectTrigger id={`${idPrefix}-tuition-plan`}><SelectValue placeholder="Choose plan" /></SelectTrigger>
            <SelectContent>
              {tuitionPlans.filter(plan => !plan.archived || plan.id === tuitionPlanId).map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.name} · {plan.ageGroup} · {plan.cadence} · {money(plan.amountCents)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPlan ? <div className="text-xs text-muted-foreground">Selected amount {money(selectedPlan.amountCents)}</div> : null}
        </div>
      ) : null}
      {chargeSource === "product" ? (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-product`}>Product / fee</Label>
          <Select value={productId} onValueChange={(value) => value && setProductId(value)}>
            <SelectTrigger id={`${idPrefix}-product`}><SelectValue placeholder="Choose product" /></SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.type === STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE ? STUDENT_UNIFORM_SHIRT_BASE_NAME : product.name} · {product.type === STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE ? "director quick invoice" : product.type} · {money(product.amountCents)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedProduct ? <div className="text-xs text-muted-foreground">Selected amount {money(selectedProduct.amountCents)}</div> : null}
        </div>
      ) : null}
      {chargeSource === "product" ? (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-quantity`}>Quantity</Label>
          <Input id={`${idPrefix}-quantity`} inputMode="numeric" min={1} value={productQuantity} onChange={(event) => setProductQuantity(event.target.value)} placeholder="1" />
          {uniformProduct ? (
            <div className="text-xs text-muted-foreground">
              Director quick invoice: {uniformQuantity} shirt{uniformQuantity === 1 ? "" : "s"} = {money(uniformTotalCents)} ({uniformBundles ? `${uniformBundles} five-pack${uniformBundles === 1 ? "" : "s"} at ${money(STUDENT_UNIFORM_SHIRT_BUNDLE_PRICE_CENTS)}` : "no five-pack"}{uniformSingles ? ` + ${uniformSingles} single${uniformSingles === 1 ? "" : "s"}` : ""}). Parents still choose size/color in the portal store.
            </div>
          ) : null}
        </div>
      ) : null}
      {chargeSource === "custom" ? (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-custom-amount`}>Custom amount</Label>
          <Input id={`${idPrefix}-custom-amount`} inputMode="decimal" value={amountDollars} onChange={(event) => setAmountDollars(event.target.value)} placeholder={customAmountPlaceholder} />
        </div>
      ) : null}
    </div>
  );
}

function DateFields({
  idPrefix,
  dueDate,
  setDueDate,
  billingPeriod,
  setBillingPeriod,
}: {
  idPrefix: string;
  dueDate: string;
  setDueDate: (value: string) => void;
  billingPeriod: string;
  setBillingPeriod: (value: string) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-due-date`}>Due date</Label>
        <Input id={`${idPrefix}-due-date`} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-billing-period`}>Billing period</Label>
        <Input id={`${idPrefix}-billing-period`} value={billingPeriod} onChange={(event) => setBillingPeriod(event.target.value)} placeholder="2026-06" />
      </div>
    </>
  );
}

function DescriptionField({ id, value, setValue }: { id: string; value: string; setValue: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Description override</Label>
      <Textarea id={id} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Optional statement memo shown in the ledger and invoice line item" />
    </div>
  );
}
