"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowUpRight, BadgeDollarSign, Ban, Banknote, Building2, CalendarClock, CheckCircle2, Copy, CreditCard, FilePenLine, Mail, MinusCircle, Play, ReceiptText, RotateCcw, Rows3, Save, Search, Send } from "lucide-react";
import { ContextBadge, EntityHeader, SummaryMetric, initialsFromName } from "@/components/entity-context";
import { useSchoolTimeZoneResolver } from "@/components/school-time-zone-context";
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
} from "@/lib/uniform-products";
import type { StripeCheckoutReadiness } from "@/lib/stripe-connect-readiness";
import { StripeTerminalPayment } from "@/components/stripe-terminal-payment";
import { TUITION_CREDIT_CATEGORIES, type TuitionCreditCategory } from "@/lib/tuition-credits";

export type BillingWorkbenchFamily = {
  id: string;
  centerId: string | null;
  name: string;
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
    autopayPlaceholder: boolean;
    paymentMethodManagement?: {
      autopayEnabled: boolean;
      autopayStatus: "enabled" | "disabled" | "pending";
      paymentMethodReauthorizationRequired: boolean;
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
      description: string | null;
    } | null;
  }>;
};

export type BillingWorkbenchCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  state?: string | null;
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
};

type Props = {
  families: BillingWorkbenchFamily[];
  centers: BillingWorkbenchCenter[];
  products: BillingWorkbenchProduct[];
  tuitionPlans: BillingWorkbenchTuitionPlan[];
  currentRole: string;
  initialFamilyId?: string;
  initialCenterId?: string;
  initialChildId?: string;
  searchQuery?: string;
};

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

function pickInitialBillingFamily(families: BillingWorkbenchFamily[], initialFamilyId?: string, searchQuery?: string) {
  const byId = initialFamilyId ? families.find((family) => family.id === initialFamilyId) : null;
  if (byId) return byId;
  const query = searchQuery?.trim().toLowerCase();
  if (query) {
    const bySearch = families.find((family) => billingFamilySearchText(family).includes(query));
    if (bySearch) return bySearch;
  }
  return families[0] ?? null;
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

export function BillingWorkbench({ families, centers, products, tuitionPlans, currentRole, initialFamilyId, initialCenterId, initialChildId, searchQuery }: Props) {
  const router = useRouter();
  const initialFamily = useMemo(
    () => pickInitialBillingFamily(families, initialFamilyId, searchQuery),
    [families, initialFamilyId, searchQuery],
  );
  const initialCenter = initialCenterId && centers.some((center) => center.id === initialCenterId)
    ? initialCenterId
    : initialFamily?.centerId ?? centers[0]?.id ?? "";
  const initialLocationTuitionPlans = tuitionPlans.filter((plan) => plan.centerId === initialCenter);
  const initialAssignmentChild = initialFamily?.children.find((child) => child.id === initialChildId)
    ?? initialFamily?.children[0]
    ?? null;
  const initialAssignment = initialAssignmentChild?.tuitionAssignment ?? null;
  const initialAssignedPlan = initialLocationTuitionPlans.find((plan) => plan.id === initialAssignment?.tuitionPlanId) ?? null;
  const [centerId, setCenterId] = useState(initialCenter);
  const resolveSchoolTimeZone = useSchoolTimeZoneResolver();
  const timeZone = resolveSchoolTimeZone(centerId);
  const [familyId, setFamilyId] = useState(initialFamily?.id ?? "");
  const [chargeSource, setChargeSource] = useState("tuitionPlan");
  const [tuitionPlanId, setTuitionPlanId] = useState(initialAssignedPlan?.id ?? "");
  const uniformShirtProduct = products.find((product) => product.type === STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE) ?? null;
  const [productId, setProductId] = useState(uniformShirtProduct?.id ?? products[0]?.id ?? "");
  const [productQuantity, setProductQuantity] = useState("1");
  const [childId, setChildId] = useState("none");
  const [description, setDescription] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [dueDate, setDueDate] = useState(todayDate());
  const [billingPeriod, setBillingPeriod] = useState(currentBillingPeriod());
  const [batchTarget, setBatchTarget] = useState("child");
  const [ageGroup, setAgeGroup] = useState("all");
  const [enrollmentStatus, setEnrollmentStatus] = useState("enrolled");
  const [adjustmentType, setAdjustmentType] = useState("credit");
  const [checkAmountDollars, setCheckAmountDollars] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [checkPaidAt, setCheckPaidAt] = useState(() => currentLocalDateTime(timeZone));
  const [checkNotes, setCheckNotes] = useState("");
  const [cashAmountDollars, setCashAmountDollars] = useState("");
  const [cashPaidAt, setCashPaidAt] = useState(() => currentLocalDateTime(timeZone));
  const [cashReference, setCashReference] = useState("");
  const [cashNotes, setCashNotes] = useState("");
  const [payrollAmountDollars, setPayrollAmountDollars] = useState("");
  const [payrollPaidAt, setPayrollPaidAt] = useState(() => currentLocalDateTime(timeZone));
  const [payrollReference, setPayrollReference] = useState("");
  const [payrollNotes, setPayrollNotes] = useState("");
  const [refundPaymentIds, setRefundPaymentIds] = useState<string[]>([]);
  const [refundAmountDollars, setRefundAmountDollars] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [paymentTarget, setPaymentTarget] = useState("balance");
  const [paymentAmountDollars, setPaymentAmountDollars] = useState("");
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
  const [assignmentTuitionPlanId, setAssignmentTuitionPlanId] = useState(initialAssignedPlan?.id ?? "");
  const [assignmentStartPeriod, setAssignmentStartPeriod] = useState(initialAssignment?.startsPeriod ?? "");
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
  const [planEditorId, setPlanEditorId] = useState(initialAssignedPlan?.id ?? "new");
  const [planName, setPlanName] = useState(initialAssignedPlan?.name ?? "");
  const [planAgeGroup, setPlanAgeGroup] = useState(initialAssignedPlan?.ageGroup ?? initialAssignmentChild?.ageGroup ?? defaultAgeGroupOptions[0]);
  const [planCadence, setPlanCadence] = useState(tuitionBillingCadence(initialAssignedPlan?.cadence));
  const [planAmountDollars, setPlanAmountDollars] = useState(initialAssignedPlan ? String(initialAssignedPlan.amountCents / 100) : "");
  const [planFundingType, setPlanFundingType] = useState<TuitionFundingType>(initialAssignedPlan?.amountCents === 0 ? "voucher" : "family");
  const [billingAction, setBillingAction] = useState("recurring");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [weeklyRecoveryPeriod, setWeeklyRecoveryPeriod] = useState(currentWeeklyPeriod());
  const [weeklyRecoveryPreview, setWeeklyRecoveryPreview] = useState<{ centerId: string; dueChildren: number; wouldCreate: number; assignedChildren: number; billingPeriod: string } | null>(null);
  const [manualPaymentEmailCopies, setManualPaymentEmailCopies] = useState<Array<{ clipboardText: string }>>([]);
  const [paymentRequestEmailSelections, setPaymentRequestEmailSelections] = useState<Record<string, string[]>>({});
  const [paymentReviewMethod, setPaymentReviewMethod] = useState<DirectorPaymentMethod | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredFamilies = useMemo(
    () => families.filter((family) => !centerId || family.centerId === centerId),
    [centerId, families],
  );
  const locationTuitionPlans = useMemo(
    () => tuitionPlans.filter((plan) => plan.centerId === centerId),
    [centerId, tuitionPlans],
  );
  const effectiveFamilyId = familyId && filteredFamilies.some((family) => family.id === familyId)
    ? familyId
    : filteredFamilies[0]?.id ?? "";
  const selectedFamily = filteredFamilies.find((family) => family.id === effectiveFamilyId) ?? null;
  const selectedCenter = centers.find((center) => center.id === centerId) ?? centers[0] ?? null;
  const selectedCenterClassrooms = selectedCenter?.classrooms ?? [];
  const selectedCheckoutReadiness = selectedCenter?.checkoutReadiness ?? null;
  const selectedPlan = locationTuitionPlans.find((plan) => plan.id === tuitionPlanId) ?? null;
  const selectedProducts = selectedCenter?.isMissHoneysLearningCenter
    ? products.filter((product) => !isUniformShirtProduct(product))
    : products;
  const firstSelectedProductId = selectedProducts[0]?.id ?? "";
  const effectiveChargeSource = chargeSource === "product" && selectedProducts.length === 0 ? "tuitionPlan" : chargeSource;
  const effectiveProductId = selectedProducts.find((product) => product.id === productId)?.id ?? firstSelectedProductId;
  const selectedProduct = selectedProducts.find((product) => product.id === effectiveProductId) ?? null;
  const selectedChildren = selectedFamily?.children ?? [];
  const effectiveAssignmentChildId = assignmentChildId && selectedChildren.some((child) => child.id === assignmentChildId)
    ? assignmentChildId
    : selectedChildren[0]?.id ?? "";
  const selectedAssignmentChild = selectedChildren.find((child) => child.id === effectiveAssignmentChildId) ?? null;
  const selectedAssignment = selectedAssignmentChild?.tuitionAssignment ?? null;
  const effectiveAssignmentCadence = assignmentCadence;
  const effectiveRateCadence = tuitionRateCadence(effectiveAssignmentCadence);
  const activeWeeklyTuitionAssignments = selectedChildren.filter(
    (child) => child.tuitionAssignment?.enabled
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
  const selectedPaymentMethod = selectedBillingAccount?.paymentMethodManagement ?? null;
  const selectedAutopayStatus = selectedPaymentMethod?.autopayStatus ?? (selectedBillingAccount?.autopayPlaceholder ? "enabled" : "disabled");
  const selectedPaymentRequestEmailOptions = paymentRequestEmailOptions(selectedFamily);
  const selectedPaymentRequestAvailableEmails = selectedPaymentRequestEmailOptions.map((option) => option.email);
  const selectedPaymentRequestEmails = (
    paymentRequestEmailSelections[effectiveFamilyId] ?? selectedPaymentRequestAvailableEmails
  ).filter((email) => selectedPaymentRequestAvailableEmails.includes(email));
  const ageGroups = useMemo(
    () => mergeAgeGroupOptions(
      selectedCenter?.dashboardOptions?.ageGroups,
      locationTuitionPlans.map((plan) => plan.ageGroup),
      families.flatMap((family) => family.children.map((child) => child.ageGroup)),
      planAgeGroup,
    ),
    [families, locationTuitionPlans, planAgeGroup, selectedCenter],
  );
  const familyBalanceCents = selectedFamily?.billingAccount?.balanceCents ?? 0;
  const openInvoices = selectedBillingAccount?.openInvoices ?? [];
  const refundablePayments = (selectedBillingAccount?.recentPayments ?? []).filter((payment) => payment.refundableCents > 0 && payment.stripePaymentIntentId);
  const canApproveRefunds = ["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER"].includes(currentRole);
  const selectedRefundPaymentIds = refundPaymentIds.filter((id) => refundablePayments.some((payment) => payment.id === id));
  const visibleRefundableCents = refundablePayments.reduce((total, payment) => total + payment.refundableCents, 0);
  const selectedPaymentInvoiceId = paymentTarget.startsWith("invoice:") ? paymentTarget.slice("invoice:".length) : "";
  const selectedPaymentInvoice = selectedPaymentInvoiceId
    ? openInvoices.find((invoice) => invoice.id === selectedPaymentInvoiceId) ?? null
    : null;
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
      ? selectedPaymentInvoice?.totalCents ?? 0
      : familyBalanceCents;
  const directorPaymentTargetLabel = effectivePaymentTarget === "custom"
    ? "custom amount"
    : effectivePaymentTarget.startsWith("invoice:")
      ? `invoice ${selectedPaymentInvoice?.number ?? ""}`.trim()
      : "total balance";
  const selectedFamilyProfileHref = familyProfileHref(selectedFamily);
  const selectedChildSummary = selectedChildren.length
    ? `${selectedChildren.length} child${selectedChildren.length === 1 ? "" : "ren"}`
    : "No children";

  function billingContextDescription(childName?: string) {
    return [
      selectedFamily?.name ?? "selected family",
      selectedCenter ? centerLabel(selectedCenter) : "selected school",
      childName,
    ].filter(Boolean).join(" / ");
  }

  function confirmBillingAction(action: string, childName?: string) {
    if (!selectedFamily) return false;
    return window.confirm(`You are about to ${action} for ${billingContextDescription(childName)}. Continue?`);
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
    if (!selectedFamily || !selectedBillingAccount) {
      return setErrorMessage("Choose a family with a billing account before processing a payment.");
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
    setStatusMessage("");
    setErrorMessage("");
    setPaymentReviewMethod(method);
  }

  function manageFamilyPaymentMethod(action: "setup" | "portal", paymentMethodCategory: "ach" | "card" | "link_bank" | "default" = "default") {
    if (!selectedFamily) return setErrorMessage("Choose a family before managing payment information.");
    startTransition(async () => {
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
          returnPath: "/billing-invoices",
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; url?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Payment method management could not be opened.");
        return;
      }
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      setStatusMessage("Payment method settings updated. Autopay was not changed.");
      router.refresh();
    });
  }

  function processParentPayment(method: DirectorPaymentMethod) {
    if (!selectedFamily || !selectedBillingAccount) {
      return setErrorMessage("Choose a family with a billing account before processing a payment.");
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

    startTransition(async () => {
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
        router.refresh();
        return;
      }

      if (invoiceId) {
        const response = await fetch("/api/billing/checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId,
            paymentMethodCategory: method === "card_checkout" ? "card" : method === "instant_bank_checkout" ? "link_bank" : "ach",
            collectionMode: method === "card_checkout" ? "director_card_terminal" : method === "instant_bank_checkout" ? "director_instant_bank_checkout" : "director_ach_checkout",
            source: "director_dashboard",
            returnPath: "/billing-invoices",
          }),
        });
        const json = await response.json().catch(() => null) as { error?: string; url?: string } | null;
        if (!response.ok || !json?.url) {
          setErrorMessage(json?.error || "The secure payment form could not be opened.");
          return;
        }
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
          method,
          description: paymentDescription,
          collectionMode: method === "card_checkout" ? "director_card_terminal" : method === "instant_bank_checkout" ? "director_instant_bank_checkout" : "director_ach_checkout",
          source: "director_dashboard",
          returnPath: "/billing-invoices",
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; url?: string; status?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Payment could not be processed.");
        return;
      }
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      setStatusMessage(`Saved payment method charge ${json?.status === "paid" ? "recorded" : "submitted"} for the selected family balance.`);
      router.refresh();
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
    if (!selectedPaymentRequestEmails.length) return setErrorMessage("Choose at least one family email to receive the payment form.");
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      setManualPaymentEmailCopies([]);
      const response = await fetch("/api/billing/payment-method-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: selectedFamily.id,
          emails: selectedPaymentRequestEmails,
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

  function handleCenterChange(value: string | null) {
    if (!value) return;
    const nextPlans = tuitionPlans.filter((plan) => plan.centerId === value);
    const nextFamily = families.find((family) => family.centerId === value) ?? null;
    const localNow = currentLocalDateTime(resolveSchoolTimeZone(value));
    setCenterId(value);
    setCheckPaidAt(localNow);
    setCashPaidAt(localNow);
    setPayrollPaidAt(localNow);
    setWeeklyRecoveryPreview(null);
    setFamilyId(nextFamily?.id ?? "");
    setChildId("none");
    setRefundPaymentIds([]);
    setRefundAmountDollars("");
    setInvoiceEditorId("");
    setInvoiceEditDraft(null);
    applyFamilyTuitionContext(nextFamily, nextPlans);
  }

  function handleFamilyChange(value: string | null) {
    if (!value) return;
    const nextFamily = filteredFamilies.find((family) => family.id === value) ?? null;
    setFamilyId(value);
    setChildId("none");
    setRefundPaymentIds([]);
    setRefundAmountDollars("");
    setInvoiceEditorId("");
    setInvoiceEditDraft(null);
    applyFamilyTuitionContext(nextFamily, locationTuitionPlans);
  }

  function handleTuitionPlanChange(value: string | null) {
    if (!value) return;
    setTuitionPlanId(value);
    const nextPlan = locationTuitionPlans.find((plan) => plan.id === value);
    if (nextPlan) setAgeGroup(nextPlan.ageGroup || "all");
  }

  function applyFamilyTuitionContext(
    family: BillingWorkbenchFamily | null,
    availablePlans: BillingWorkbenchTuitionPlan[],
    preferredChildId?: string,
  ) {
    const child = family?.children.find((item) => item.id === preferredChildId)
      ?? family?.children[0]
      ?? null;
    const assignment = child?.tuitionAssignment ?? null;
    const assignedPlan = availablePlans.find((plan) => plan.id === assignment?.tuitionPlanId) ?? null;

    setAssignmentChildId(child?.id ?? "");
    setAssignmentEnabled(assignment?.enabled === false ? "false" : "true");
    const nextCadence = assignment?.cadence === "monthly" ? "monthly" : assignment?.cadence === "biweekly" ? "biweekly" : assignment?.cadence === "four_week" ? "four_week" : "weekly";
    setAssignmentCadence(nextCadence);
    setAssignmentBillingDay(String(assignment?.billingDay ?? 1));
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
    startTransition(async () => {
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
        warning?: string | null;
        pendingApproval?: boolean;
      } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Billing action could not be completed.");
        return;
      }
      if (payload.mode === "manualCheckPayment") {
        const total = typeof json?.totalCents === "number" ? money(json.totalCents) : money(0);
        setStatusMessage(`${total} check payment posted to the family ledger.`);
        setCheckAmountDollars("");
        setCheckNumber("");
        setCheckNotes("");
        setCheckPaidAt(currentLocalDateTime(timeZone));
        router.refresh();
        return;
      }
      if (payload.mode === "manualCashPayment") {
        const total = typeof json?.totalCents === "number" ? money(json.totalCents) : money(0);
        setStatusMessage(`${total} cash payment posted to the family ledger.`);
        setCashAmountDollars("");
        setCashReference("");
        setCashNotes("");
        setCashPaidAt(currentLocalDateTime(timeZone));
        router.refresh();
        return;
      }
      if (payload.mode === "payrollDeductionPayment") {
        const total = typeof json?.totalCents === "number" ? money(json.totalCents) : money(0);
        setStatusMessage(`${total} verified payroll deduction posted to the family ledger.`);
        setPayrollAmountDollars("");
        setPayrollReference("");
        setPayrollNotes("");
        setPayrollPaidAt(currentLocalDateTime(timeZone));
        router.refresh();
        return;
      }
      if (payload.mode === "refundPayment") {
        const total = typeof json?.totalCents === "number" ? money(json.totalCents) : money(0);
        setStatusMessage(
          json?.pendingApproval
            ? `${total} refund request submitted to executives for approval. No funds have been moved.`
            : json?.warning || `${total} family refund issued across the eligible original payment method(s).`,
        );
        setRefundAmountDollars("");
        setRefundReason("");
        setRefundPaymentIds([]);
        router.refresh();
        return;
      }
      if (payload.mode === "adjustment") {
        setStatusMessage("Ledger adjustment posted to the selected family account.");
        setAmountDollars("");
        router.refresh();
        return;
      }
      const created = json?.created ?? 0;
      const skipped = json?.skipped ?? 0;
      const total = typeof json?.totalCents === "number" ? ` Total posted: ${money(json.totalCents)}.` : "";
      setStatusMessage(`${created} invoice${created === 1 ? "" : "s"} created. ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped.${total}`);
    });
  }

  function submitSingle() {
    if (!selectedFamily) return setErrorMessage("Choose a family before creating an invoice.");
    const childName = selectedChildren.find((child) => child.id === childId)?.fullName;
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

  function submitAssignmentChargeNow() {
    if (!selectedFamily || !selectedAssignmentChild || !effectiveAssignmentPlanId) {
      return setErrorMessage("Choose a family, child, and tuition plan before creating the tuition invoice.");
    }
    const confirmed = window.confirm(
      `Create one due-now tuition invoice for ${selectedAssignmentChild.fullName}? This does not submit a payment immediately. If family autopay is enabled, the open invoice can be collected by the next autopay run.`,
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
      `Create batch invoices for ${selectedCenter ? centerLabel(selectedCenter) : "the selected school"} (${ageGroup === "all" ? "all age groups" : ageGroup}, ${enrollmentStatus})? This does not submit payments immediately. Do not continue if recurring tuition already covers this billing period; due invoices may be collected later by autopay.`,
    );
    if (!confirmed) return;
    submit({
      mode: "batch",
      centerId,
      dueDate,
      billingPeriod,
      batchTarget,
      ageGroup,
      enrollmentStatus,
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
    startTransition(async () => {
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
      router.refresh();
    });
  }

  function submitAdjustment() {
    if (!selectedFamily) return setErrorMessage("Choose a family before posting an adjustment.");
    if (!confirmBillingAction(`post a ${adjustmentType} adjustment`)) return;
    submit({
      mode: "adjustment",
      familyId: selectedFamily.id,
      adjustmentType,
      amountDollars,
      description,
    });
  }

  function submitManualCheckPayment() {
    if (!selectedFamily) return setErrorMessage("Choose a family before posting a check payment.");
    if (!checkAmountDollars || !checkNumber.trim()) return setErrorMessage("Enter the check amount and check number.");
    const paidAt = manualPaymentTimestamp(checkPaidAt, timeZone);
    if (!paidAt) return setErrorMessage("Enter a valid check received date and time.");
    if (!confirmBillingAction(`post check #${checkNumber.trim()} as a payment`)) return;
    submit({
      mode: "manualCheckPayment",
      familyId: selectedFamily.id,
      amountDollars: checkAmountDollars,
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
    submit({
      mode: "manualCashPayment",
      familyId: selectedFamily.id,
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
    submit({
      mode: "refundPayment",
      familyId: selectedFamily.id,
      paymentIds: selectedRefundPaymentIds,
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
      `Update invoice ${selectedEditableInvoice.number} from ${money(selectedEditableInvoice.totalCents)} to ${money(invoiceEditAmountCents)} for ${selectedFamily.name}?`,
    );
    if (!confirmed) return;

    startTransition(async () => {
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
      router.refresh();
    });
  }

  function submitInvoiceVoid() {
    if (!selectedFamily || !selectedEditableInvoice) return;
    const reason = invoiceVoidReason.trim();
    if (reason.length < 5) return setErrorMessage("Enter a reason for voiding this invoice.");
    const confirmed = window.confirm(
      `Void invoice ${selectedEditableInvoice.number} for ${money(selectedEditableInvoice.totalCents)}? This removes the charge from ${selectedFamily.name}'s balance and keeps an audit record.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
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
      router.refresh();
    });
  }

  function handleAssignmentChildChange(value: string | null) {
    if (!value) return;
    applyFamilyTuitionContext(selectedFamily, locationTuitionPlans, value);
  }

  function handleAssignmentPlanChange(value: string | null) {
    if (!value) return;
    const plan = locationTuitionPlans.find((item) => item.id === value);
    setAssignmentTuitionPlanId(value);
    setTuitionPlanId(value);
    const nextCadence = tuitionBillingCadence(plan?.cadence);
    setAssignmentCadence(nextCadence);
    setAssignmentStartPeriod((current) => periodMatchesCadence(current, nextCadence) ? current : currentPeriodForCadence(nextCadence));
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
    if (!selectedFamily || !selectedAssignmentChild) return setErrorMessage("Choose a family and child before saving child setup.");
    if (!assignmentChildProgram || !assignmentChildClassroomId) {
      return setErrorMessage("Choose a program and classroom before saving child setup.");
    }
    startTransition(async () => {
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
      setStatusMessage(`Program, classroom, and care schedule saved for ${selectedAssignmentChild.fullName}. Tuition and ledger amounts were not changed.`);
      router.refresh();
    });
  }

  function submitAssignment() {
    if (!selectedFamily || !selectedAssignmentChild) return setErrorMessage("Choose a family and child before saving tuition.");
    if (!assignmentIsVoucherFunded && assignmentEnabled === "true" && effectiveAssignmentCreditsTotalCents >= effectiveAssignmentGrossCents + effectiveAssignmentAdditionalChargesTotalCents) {
      return setErrorMessage("Credits must be less than the gross recurring tuition rate.");
    }
    const action = assignmentIsVoucherFunded
      ? "save a $0 CCDF or voucher-funded tuition assignment"
      : "save recurring tuition";
    if (!confirmBillingAction(action, selectedAssignmentChild.fullName)) return;
    startTransition(async () => {
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
      setStatusMessage(
        assignmentIsVoucherFunded
          ? `$0.00 CCDF or voucher-funded tuition saved for ${selectedAssignmentChild.fullName}. No family invoice or autopay is scheduled.`
          : assignmentEnabled === "true"
          ? effectiveAssignmentCadence === "monthly"
            ? `Recurring tuition enabled for ${selectedAssignmentChild.fullName} at ${money(effectiveAssignmentNetCents)} per month. Monthly invoice creation is scheduled for day ${effectiveAssignmentBillingDay}.`
            : `Recurring tuition enabled for ${selectedAssignmentChild.fullName} at ${money(effectiveAssignmentNetCents)} net per week. ${effectiveAssignmentCadence === "four_week" ? `Each invoice will be ${money(effectiveAssignmentNetCents * 4)} and cover four weeks ahead.` : effectiveAssignmentCadence === "biweekly" ? `Each invoice will be ${money(effectiveAssignmentNetCents * 2)} and cover two weeks ahead.` : "Thursday invoice creation is scheduled for the following week."}`
          : `Recurring tuition disabled for ${selectedAssignmentChild.fullName}.`,
      );
    });
  }

  function handlePlanEditorChange(value: string | null) {
    if (!value) return;
    setPlanEditorId(value);
    if (value === "new") {
      setPlanName("");
      setPlanAgeGroup(ageGroups[0] ?? defaultAgeGroupOptions[0]);
      setPlanAmountDollars("");
      setPlanCadence("weekly");
      setPlanFundingType("family");
      return;
    }
    const plan = locationTuitionPlans.find((item) => item.id === value);
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
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const persistRate = async (id?: string) => {
        const response = await fetch("/api/operations/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity: "tuitionPlan",
            id,
            centerId,
            name: planName,
            ageGroup: planAgeGroup,
            cadence: planCadence,
            amountDollars: planAmountDollars,
            zeroDollarVoucher: planFundingType === "voucher",
          }),
        });
        const json = await response.json().catch(() => null) as { code?: string; error?: string; record?: { id?: string } } | null;
        return { response, json };
      };
      const existingRateId = planEditorId === "new" ? undefined : planEditorId;
      let { response, json } = await persistRate(existingRateId);
      const preserveAssignedChildren = response.status === 409
        && json?.code === "TUITION_PLAN_ASSIGNED_CREATE_NEW"
        && Boolean(existingRateId);
      if (preserveAssignedChildren) {
        ({ response, json } = await persistRate());
      }
      if (!response.ok) {
        setErrorMessage(json?.error || "Tuition plan could not be saved.");
        return;
      }
      setStatusMessage(
        preserveAssignedChildren
          ? `New child-specific ${planCadence === "monthly" ? "monthly" : "weekly"} rate created. Previously saved children kept their existing rates.`
          : planFundingType === "voucher"
          ? `$0.00 no-family-charge rate ${planEditorId === "new" ? "created" : "updated"}. Assign it to the intended child under Recurring.`
          : `${planCadence === "monthly" ? "Monthly" : "Weekly"} tuition rate ${planEditorId === "new" ? "created" : "updated"}.`,
      );
      if (json?.record?.id) {
        setPlanEditorId(json.record.id);
        setTuitionPlanId(json.record.id);
        setAssignmentTuitionPlanId(json.record.id);
        setAssignmentCadence(planCadence);
        setAssignmentStartPeriod(currentPeriodForCadence(planCadence));
        setAssignmentDescription(planName.trim());
      }
      setBillingAction("recurring");
      router.refresh();
    });
  }

  function showChildTuitionSetup() {
    setBillingAction("recurring");
    requestAnimationFrame(() => {
      document.getElementById("child-tuition-setup")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }


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
              <SummaryMetric label="Family" value={selectedFamily?.name ?? "Not selected"} detail={selectedFamily?.billingEmail ?? "No billing email"} />
              <SummaryMetric label="School" value={selectedCenter ? centerLabel(selectedCenter) : "Not selected"} detail={selectedCheckoutReadiness?.canAcceptParentPayments ? "Online payments ready" : "Online payments unavailable"} />
              <SummaryMetric label="Apply payment to" value={directorPaymentTargetLabel} detail={selectedPaymentInvoice ? `Due ${formatShortDate(selectedPaymentInvoice.dueDate)}` : "Family balance payment"} />
              <SummaryMetric label="Amount" value={money(directorPaymentAmountCents)} detail={effectivePaymentTarget === "custom" ? paymentDescription : selectedPaymentInvoice?.number ?? "Balance"} />
            </div>
            <div className="rounded-lg border bg-background/45 p-3">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Payment method</div>
              <div className="mt-2 text-sm font-medium">{paymentRouteSummary(paymentReviewMethod)}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <ContextBadge label="Online payments" value={selectedCheckoutReadiness?.label ?? "Unknown"} variant={selectedCheckoutReadiness?.canAcceptParentPayments ? "default" : "destructive"} />
              <ContextBadge label="Saved method" value={selectedPaymentMethod?.paymentMethodLabel ?? "None"} />
              <ContextBadge label="Autopay" value={selectedAutopayStatus} variant={selectedAutopayStatus === "enabled" ? "default" : "outline"} />
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

    <Card id="billing-workbench" className="glass-panel scroll-mt-28">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle as="h2">Family billing</CardTitle>
            <CardDescription>Create charges, record payments, and manage account adjustments.</CardDescription>
          </div>
          <Badge variant="outline">
            <BadgeDollarSign data-icon="inline-start" />
            Director tools
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {statusMessage ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Update complete</AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        ) : null}
        {errorMessage ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Action needed</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <EntityHeader
          sticky
          eyebrow="Family billing"
          title={selectedFamily?.name ?? "Choose a family"}
          subtitle={billingContextDescription()}
          initials={initialsFromName(selectedFamily?.name)}
          status={<ContextBadge label="Autopay" value={selectedAutopayStatus} variant={selectedAutopayStatus === "enabled" ? "default" : "outline"} />}
          actions={
            selectedFamily ? (
              <Link href={selectedFamilyProfileHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ArrowUpRight data-icon="inline-start" />
                Open family
              </Link>
            ) : null
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryMetric label="School" value={selectedCenter ? centerLabel(selectedCenter) : "Not selected"} />
            <SummaryMetric label="Last updated" value={formatShortDate(selectedFamily?.updatedAt)} detail="Family billing information" />
            <SummaryMetric label="Balance" value={money(familyBalanceCents)} detail={selectedPaymentMethod?.hasSavedPaymentMethod ? "Saved method on file" : "No saved method"} />
            <SummaryMetric label="Payment contacts" value={`${selectedPaymentRequestEmailOptions.length} contact${selectedPaymentRequestEmailOptions.length === 1 ? "" : "s"}`} detail={selectedFamily?.billingEmail ?? "No billing email"} />
            <SummaryMetric label="Children" value={selectedChildSummary} detail={selectedChildren.map((child) => child.fullName).slice(0, 2).join(", ") || "No child records"} />
            <SummaryMetric
              label="Weekly tuition"
              value={activeWeeklyTuitionAssignments.length ? money(familyWeeklyTuitionCents) : "Not assigned"}
              detail={activeWeeklyTuitionAssignments.length
                ? activeWeeklyTuitionAssignments.map((child) => `${child.fullName} ${money(child.tuitionAssignment?.amountCents ?? 0)}`).join(" · ")
                : "No saved child rate"}
            />
          </div>
        </EntityHeader>

        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <Label htmlFor="billing-workbench-school">School</Label>
            <Select value={centerId} onValueChange={handleCenterChange}>
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
            <Select value={effectiveFamilyId} onValueChange={handleFamilyChange}>
              <SelectTrigger id="billing-workbench-family"><SelectValue placeholder="Choose family" /></SelectTrigger>
              <SelectContent>
                {filteredFamilies.map((family) => (
                  <SelectItem key={family.id} value={family.id}>
                    {family.name}{family.billingEmail ? ` · ${family.billingEmail}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Selected balance</div>
            <div className="text-lg font-semibold">{money(familyBalanceCents)}</div>
          </div>
        </div>

        {selectedCheckoutReadiness?.canAcceptParentPayments ? (
          <Alert className="border-emerald-500/30 bg-emerald-500/10">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <AlertTitle>Online payments ready</AlertTitle>
            <AlertDescription>
              Parents can pay invoices online for {selectedCenter ? centerLabel(selectedCenter) : "this school"}.
            </AlertDescription>
          </Alert>
        ) : selectedCheckoutReadiness ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Online payments unavailable</AlertTitle>
            <AlertDescription>
              {selectedCheckoutReadiness.blockingReason || "Finish payout setup before parents can pay invoices for this school."}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="rounded-lg border bg-background/35 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                Family payment methods
                <InfoTip label="About family payment profiles">
                  Saving a method and enabling autopay are separate actions. Parents enable or disable autopay from their Parent Portal.
                </InfoTip>
              </div>
            </div>
            <Badge variant={selectedAutopayStatus === "enabled" ? "default" : "outline"} className="capitalize">
              {selectedPaymentMethod?.paymentMethodReauthorizationRequired ? "Reauthorization required" : selectedAutopayStatus}
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
              <Button className="w-full sm:w-auto" disabled={isPending || !selectedFamily} onClick={() => manageFamilyPaymentMethod("setup", "link_bank")}>
                <Building2 data-icon="inline-start" />
                Connect bank account
              </Button>
              <Button className="w-full sm:w-auto" disabled={isPending || !selectedFamily} onClick={() => manageFamilyPaymentMethod("setup", "card")} variant="outline">
                <CreditCard data-icon="inline-start" />
                {selectedPaymentMethod?.hasSavedPaymentMethod ? "Replace saved card" : "Save card"}
              </Button>
              <Button className="w-full sm:w-auto" disabled={isPending || !selectedPaymentMethod?.hasStripeCustomer} onClick={() => manageFamilyPaymentMethod("portal")} variant="outline">
                Manage payment method
              </Button>
            </div>
          </div>
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
            <div className="grid gap-3 md:grid-cols-6">
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="billing-payment-target">Apply payment to</Label>
                <Select value={effectivePaymentTarget} onValueChange={(value) => value && setPaymentTarget(value)}>
                  <SelectTrigger id="billing-payment-target"><SelectValue placeholder="Choose balance or invoice" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="balance">Total balance · {money(familyBalanceCents)}</SelectItem>
                    {openInvoices.map((invoice) => (
                      <SelectItem key={invoice.id} value={`invoice:${invoice.id}`}>
                        {invoice.number} · {money(invoice.totalCents)} · due {formatShortDate(invoice.dueDate)}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-payment-custom-amount">Custom amount</Label>
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
            <div className="mt-3 flex flex-wrap gap-2">
              {effectivePaymentTarget.startsWith("invoice:") ? (
                <Button
                  disabled={isPending || selectedAutopayStatus !== "enabled" || !selectedBillingAccount || directorPaymentAmountCents <= 0}
                  onClick={() => openPaymentReview("autopay")}
                  variant="outline"
                >
                  <Play data-icon="inline-start" />
                  Process invoice with autopay
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
                disabled={isPending || !selectedBillingAccount || directorPaymentAmountCents <= 0}
                onClick={() => openPaymentReview("card_checkout")}
              >
                <CreditCard data-icon="inline-start" />
                Digital Terminal
              </Button>
              <Button
                disabled={isPending || !selectedBillingAccount || directorPaymentAmountCents <= 0}
                onClick={() => openPaymentReview("instant_bank_checkout")}
                variant="outline"
              >
                <CreditCard data-icon="inline-start" />
                Pay with Link
              </Button>
              <Button
                disabled={isPending || !selectedBillingAccount || directorPaymentAmountCents <= 0}
                onClick={() => openPaymentReview("ach_checkout")}
                variant="outline"
              >
                <Building2 data-icon="inline-start" />
                Bank account
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              Payment options
              <InfoTip label="Payment action help" side="right">
                Use Digital Terminal to open a secure card screen on this device for a parent who is present. A certified hardware reader appears only after that school has registered one.
              </InfoTip>
            </div>
          </div>
          <div className="mt-4 rounded-lg border bg-background/40 p-3">
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
                  <Button disabled={isPending || !selectedFamily || !selectedPaymentRequestEmails.length} onClick={() => sendPaymentMethodRequest("payment_method_reauthorization")}>
                    <Send data-icon="inline-start" />
                    Send replacement method link
                  </Button>
                ) : null}
                <Button disabled={isPending || !selectedFamily || !selectedPaymentRequestEmails.length} onClick={() => sendPaymentMethodRequest("instant_bank_verification")}>
                  <Building2 data-icon="inline-start" />
                  Send bank verification link
                </Button>
                <Button disabled={isPending || !selectedFamily || !selectedPaymentRequestEmails.length} onClick={() => sendPaymentMethodRequest("payment_steps")} variant="outline">
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
        </div>

        <div className="rounded-lg border bg-background/35 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">
                Tuition rate setup{selectedFamily ? ` · ${selectedFamily.name}` : ""}
              </div>
              <p className="text-xs text-muted-foreground">
                Choose or create a weekly or monthly school rate, including an explicit $0.00 family rate for CCDF or voucher-funded care, then save it to the intended child under Recurring.
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
                      {plan.name} · {plan.ageGroup} · {plan.cadence} · {money(plan.amountCents)}
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
              <Button disabled={isPending} onClick={saveTuitionPlan} className="w-full">
                Save Rate
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 p-4">
          <div>
            <div className="text-sm font-medium">Set each child’s recurring tuition</div>
            <p className="text-xs text-muted-foreground">
              Choose one child at a time. Their saved rates stay visible separately and combine with other rates using the same cadence.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={showChildTuitionSetup}>
            <CalendarClock data-icon="inline-start" />
            Open child tuition
          </Button>
        </div>

        <Tabs value={billingAction} onValueChange={setBillingAction}>
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="recurring"><CalendarClock data-icon="inline-start" />Child tuition</TabsTrigger>
            <TabsTrigger value="single"><ReceiptText data-icon="inline-start" />Family charge</TabsTrigger>
            <TabsTrigger value="edit"><FilePenLine data-icon="inline-start" />Edit invoice</TabsTrigger>
            <TabsTrigger value="batch"><Rows3 data-icon="inline-start" />Batch tuition</TabsTrigger>
            <TabsTrigger value="weekly-recovery"><Search data-icon="inline-start" />Weekly recovery</TabsTrigger>
            <TabsTrigger value="check"><Banknote data-icon="inline-start" />Check payment</TabsTrigger>
            <TabsTrigger value="cash"><Banknote data-icon="inline-start" />Cash payment</TabsTrigger>
            <TabsTrigger value="payroll"><Banknote data-icon="inline-start" />Payroll deduction</TabsTrigger>
            <TabsTrigger value="refund"><RotateCcw data-icon="inline-start" />Refund</TabsTrigger>
            <TabsTrigger value="agency"><BadgeDollarSign data-icon="inline-start" />Agency claims</TabsTrigger>
            <TabsTrigger value="adjustment"><MinusCircle data-icon="inline-start" />Credit / adjustment</TabsTrigger>
          </TabsList>

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
            <Button disabled={isPending || !selectedFamily} onClick={submitSingle}>
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
                        if (!value) return;
                        setInvoiceEditorId(value);
                        setInvoiceEditDraft(null);
                        setInvoiceVoidReason("");
                      }}
                    >
                      <SelectTrigger id="billing-invoice-editor"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {openInvoices.map((invoice) => (
                          <SelectItem key={invoice.id} value={invoice.id}>
                            {invoice.number} · {money(invoice.totalCents)} · due {formatShortDate(invoice.dueDate)}
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
                  <SummaryMetric label="Updated total" value={invoiceEditAmountCents > 0 ? money(invoiceEditAmountCents) : "$0.00"} detail={formatShortDate(invoiceEditDueDate)} />
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
                <Select value={enrollmentStatus} onValueChange={(value) => value && setEnrollmentStatus(value)}>
                  <SelectTrigger id="billing-batch-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enrolled">Enrolled</SelectItem>
                    <SelectItem value="waitlisted">Waitlisted</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="all">All statuses</SelectItem>
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

          <TabsContent id="child-tuition-setup" value="recurring" className="scroll-mt-4 space-y-4 rounded-lg border bg-background/35 p-4">
            <div>
              <div className="text-sm font-medium">Recurring tuition by child</div>
              <p className="text-xs text-muted-foreground">
                Select a child, choose that child’s rate, and save. Repeat for each sibling; the family ledger receives the combined total while each child keeps an individual rate.
              </p>
            </div>
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
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
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
            </div>
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1">
                <Label htmlFor="billing-assignment-child">Child</Label>
                <Select value={effectiveAssignmentChildId} onValueChange={handleAssignmentChildChange}>
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
                    {locationTuitionPlans.map((plan) => (
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
            </div>
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
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div>
                <div className="text-sm font-medium">{effectiveRateCadence === "monthly" ? "Monthly" : "Weekly"} additional invoice lines</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use separate positive lines when state audit records need parent fees and gap tuition itemized on the invoice.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {assignmentAdditionalCharges.map((line, index) => (
                  <div key={index} className="grid gap-2 rounded-md border bg-background/60 p-2 sm:grid-cols-[1fr_9rem]">
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
            </div>
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
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
                  value={money(Math.max(0, effectiveAssignmentNetCents) * (effectiveAssignmentCadence === "four_week" ? 4 : effectiveAssignmentCadence === "biweekly" ? 2 : 1))}
                  detail={effectiveAssignmentCreditsTotalCents >= effectiveAssignmentGrossCents + effectiveAssignmentAdditionalChargesTotalCents && !assignmentIsVoucherFunded
                    ? "Credits must be less than gross tuition"
                    : "Amount added to the family ledger"}
                />
              </div>
            </div>
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
                disabled={isPending || !selectedFamily || !selectedAssignmentChild || (assignmentEnabled === "true" && (!effectiveAssignmentPlanId || (!assignmentIsVoucherFunded && effectiveAssignmentCreditsTotalCents >= effectiveAssignmentGrossCents + effectiveAssignmentAdditionalChargesTotalCents)))}
                onClick={submitAssignment}
              >
                <CalendarClock data-icon="inline-start" />
                Save Tuition Assignment
              </Button>
              <Button disabled={isPending || !selectedFamily || !selectedAssignmentChild || !effectiveAssignmentPlanId || assignmentIsVoucherFunded || effectiveAssignmentCadence !== "weekly"} onClick={submitAssignmentChargeNow} variant="outline">
                <ReceiptText data-icon="inline-start" />
                {effectiveAssignmentCadence === "weekly" ? "Create Invoice Now" : "First Invoice Scheduled"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Weekly billing creates one week-ahead invoices. Biweekly billing creates one invoice equal to two net weekly rates every two weeks. Every-4-weeks billing creates one invoice equal to four net weekly rates. Monthly billing creates one invoice for the saved monthly rate on the selected day (1–28). The opening balance remains unchanged; enter an opening balance only when the family already owes money. This does not enable family autopay. Explicit $0.00 CCDF or voucher-funded assignments never create a family invoice or autopay attempt.
            </p>
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
              <p className="mt-1 text-xs text-muted-foreground">This posts a completed manual payment and reduces the family ledger balance. Keep the physical check according to the school&apos;s deposit policy.</p>
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
              <p className="mt-1 text-xs text-muted-foreground">This posts a completed cash payment, immediately reduces the selected family balance, and adds an auditable ledger credit.</p>
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
              <p className="mt-1 text-xs text-muted-foreground">Use this only after payroll confirms the deduction. It is an offline family payment—not a discount or employer benefit—and it reduces the family ledger once with an auditable pay-period reference.</p>
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
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="billing-adjustment-type">Adjustment</Label>
                <Select value={adjustmentType} onValueChange={(value) => value && setAdjustmentType(value)}>
                  <SelectTrigger id="billing-adjustment-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Add family credit</SelectItem>
                    <SelectItem value="debit">Add balance debit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="billing-adjustment-amount">Amount</Label>
                <Input id="billing-adjustment-amount" inputMode="decimal" value={amountDollars} onChange={(event) => setAmountDollars(event.target.value)} placeholder="125.00" />
              </div>
            </div>
            <DescriptionField id="billing-adjustment-description" value={description} setValue={setDescription} />
            <Button disabled={isPending || !selectedFamily || !amountDollars} onClick={submitAdjustment}>
              <MinusCircle data-icon="inline-start" />
              Post Adjustment
            </Button>
          </TabsContent>
        </Tabs>
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
}: {
  idPrefix: string;
  chargeSource: string;
  setChargeSource: (value: string) => void;
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
        <Select value={chargeSource} onValueChange={(value) => value && setChargeSource(value)}>
          <SelectTrigger id={`${idPrefix}-type`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tuitionPlan">Tuition plan</SelectItem>
            {products.length ? <SelectItem value="product">Uniform shirt / product</SelectItem> : null}
            <SelectItem value="custom">Custom charge</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {chargeSource === "tuitionPlan" ? (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-tuition-plan`}>Tuition plan</Label>
          <Select value={tuitionPlanId} onValueChange={(value) => value && setTuitionPlanId(value)}>
            <SelectTrigger id={`${idPrefix}-tuition-plan`}><SelectValue placeholder="Choose plan" /></SelectTrigger>
            <SelectContent>
              {tuitionPlans.map((plan) => (
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
          <Input id={`${idPrefix}-custom-amount`} inputMode="decimal" value={amountDollars} onChange={(event) => setAmountDollars(event.target.value)} placeholder="250.00" />
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
