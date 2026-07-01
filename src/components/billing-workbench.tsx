"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowUpRight, BadgeDollarSign, Building2, CalendarClock, CheckCircle2, CreditCard, Mail, MinusCircle, Play, ReceiptText, Rows3, Send } from "lucide-react";
import { ContextBadge, EntityHeader, SummaryMetric, initialsFromName } from "@/components/entity-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { defaultAgeGroupOptions, mergeAgeGroupOptions, type DashboardOptions } from "@/lib/dashboard-options";
import { STUDENT_UNIFORM_SHIRT_BASE_NAME, STUDENT_UNIFORM_SHIRT_PRODUCT_TYPE, STUDENT_UNIFORM_SHIRT_SINGLE_PRICE_CENTS, STUDENT_UNIFORM_SHIRT_BUNDLE_PRICE_CENTS, STUDENT_UNIFORM_SHIRT_BUNDLE_COUNT } from "@/lib/uniform-products";
import type { StripeCheckoutReadiness } from "@/lib/stripe-connect-readiness";

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
    }>;
  } | null;
  children: Array<{
    id: string;
    fullName: string;
    ageGroup: string;
    enrollmentStatus: string;
    tuitionAssignment?: {
      enabled: boolean;
      tuitionPlanId: string | null;
      tuitionPlanName: string | null;
      cadence: string | null;
      amountCents: number | null;
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
  dashboardOptions?: DashboardOptions;
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
  initialFamilyId?: string;
  initialCenterId?: string;
  searchQuery?: string;
};

type DirectorPaymentMethod = "autopay" | "saved_method" | "card_checkout" | "instant_bank_checkout" | "ach_checkout";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
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

function normalizeCadence(value: string | null | undefined) {
  return value?.toLowerCase().startsWith("week") ? "weekly" : "monthly";
}

function currentPeriodForCadence(cadence: string) {
  return cadence === "weekly" ? currentWeeklyPeriod() : currentBillingPeriod();
}

function periodMatchesCadence(value: string, cadence: string) {
  return cadence === "weekly" ? /^\d{4}-W\d{2}$/i.test(value) : /^\d{4}-\d{2}$/.test(value);
}

function normalizeBillingDayForCadence(value: string | number | null | undefined, cadence: string) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return cadence === "weekly" ? "5" : "1";
  const max = cadence === "weekly" ? 7 : 28;
  return String(Math.min(Math.max(parsed, 1), max));
}

function money(cents: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(cents / 100);
}

function dollarsToCents(value: string) {
  const amount = Number.parseFloat(value.replace(/[$,]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function centerLabel(center: BillingWorkbenchCenter) {
  return [center.crmLocationId, center.name].filter(Boolean).join(" · ");
}

function stripeAccountLabel(accountId: string | null | undefined) {
  if (!accountId) return "No payout account";
  if (accountId.length <= 12) return accountId;
  return `${accountId.slice(0, 8)}...${accountId.slice(-4)}`;
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

export function BillingWorkbench({ families, centers, products, tuitionPlans, initialFamilyId, initialCenterId, searchQuery }: Props) {
  const router = useRouter();
  const initialFamily = useMemo(
    () => pickInitialBillingFamily(families, initialFamilyId, searchQuery),
    [families, initialFamilyId, searchQuery],
  );
  const initialCenter = initialCenterId && centers.some((center) => center.id === initialCenterId)
    ? initialCenterId
    : initialFamily?.centerId ?? centers[0]?.id ?? "";
  const [centerId, setCenterId] = useState(initialCenter);
  const [familyId, setFamilyId] = useState(initialFamily?.id ?? "");
  const [chargeSource, setChargeSource] = useState("tuitionPlan");
  const [tuitionPlanId, setTuitionPlanId] = useState(tuitionPlans[0]?.id ?? "");
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
  const [agencyName, setAgencyName] = useState("");
  const [agencyAuthorizationNumber, setAgencyAuthorizationNumber] = useState("");
  const [agencyReference, setAgencyReference] = useState("");
  const [agencyAmountDollars, setAgencyAmountDollars] = useState("");
  const [agencyPaidAt, setAgencyPaidAt] = useState(todayDate());
  const [agencyCoverageStart, setAgencyCoverageStart] = useState("");
  const [agencyCoverageEnd, setAgencyCoverageEnd] = useState("");
  const [agencyChildId, setAgencyChildId] = useState("none");
  const [agencyNotes, setAgencyNotes] = useState("");
  const [paymentTarget, setPaymentTarget] = useState("balance");
  const [paymentAmountDollars, setPaymentAmountDollars] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("Tuition payment");
  const [assignmentChildId, setAssignmentChildId] = useState("");
  const [assignmentEnabled, setAssignmentEnabled] = useState("true");
  const [assignmentTuitionPlanId, setAssignmentTuitionPlanId] = useState("");
  const [assignmentBillingDay, setAssignmentBillingDay] = useState("");
  const [assignmentStartPeriod, setAssignmentStartPeriod] = useState("");
  const [assignmentDescription, setAssignmentDescription] = useState("");
  const [planEditorId, setPlanEditorId] = useState(tuitionPlans[0]?.id ?? "new");
  const [planName, setPlanName] = useState(tuitionPlans[0]?.name ?? "");
  const [planAgeGroup, setPlanAgeGroup] = useState(tuitionPlans[0]?.ageGroup ?? defaultAgeGroupOptions[0]);
  const [planCadence, setPlanCadence] = useState(normalizeCadence(tuitionPlans[0]?.cadence));
  const [planAmountDollars, setPlanAmountDollars] = useState(tuitionPlans[0] ? String(tuitionPlans[0].amountCents / 100) : "");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [paymentRequestEmailSelections, setPaymentRequestEmailSelections] = useState<Record<string, string[]>>({});
  const [paymentReviewMethod, setPaymentReviewMethod] = useState<DirectorPaymentMethod | null>(null);
  const [cardRecoveryAccepted, setCardRecoveryAccepted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filteredFamilies = useMemo(
    () => families.filter((family) => !centerId || family.centerId === centerId),
    [centerId, families],
  );
  const effectiveFamilyId = familyId && filteredFamilies.some((family) => family.id === familyId)
    ? familyId
    : filteredFamilies[0]?.id ?? "";
  const selectedFamily = filteredFamilies.find((family) => family.id === effectiveFamilyId) ?? null;
  const selectedCenter = centers.find((center) => center.id === centerId) ?? centers[0] ?? null;
  const selectedCheckoutReadiness = selectedCenter?.checkoutReadiness ?? null;
  const selectedPlan = tuitionPlans.find((plan) => plan.id === tuitionPlanId) ?? null;
  const selectedProduct = products.find((product) => product.id === productId) ?? null;
  const selectedChildren = selectedFamily?.children ?? [];
  const effectiveAssignmentChildId = assignmentChildId && selectedChildren.some((child) => child.id === assignmentChildId)
    ? assignmentChildId
    : selectedChildren[0]?.id ?? "";
  const selectedAssignmentChild = selectedChildren.find((child) => child.id === effectiveAssignmentChildId) ?? null;
  const selectedAssignment = selectedAssignmentChild?.tuitionAssignment ?? null;
  const effectiveAssignmentPlanId = assignmentTuitionPlanId || selectedAssignment?.tuitionPlanId || tuitionPlans[0]?.id || "";
  const selectedAssignmentPlan = tuitionPlans.find((plan) => plan.id === effectiveAssignmentPlanId) ?? null;
  const effectiveAssignmentCadence = normalizeCadence(selectedAssignmentPlan?.cadence || selectedAssignment?.cadence);
  const effectiveAssignmentBillingDay = normalizeBillingDayForCadence(assignmentBillingDay || selectedAssignment?.billingDay, effectiveAssignmentCadence);
  const effectiveAssignmentStartPeriod = assignmentStartPeriod || selectedAssignment?.startsPeriod || currentPeriodForCadence(effectiveAssignmentCadence);
  const effectiveAssignmentDescription = assignmentDescription || selectedAssignment?.description || selectedAssignment?.tuitionPlanName || "";
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
      tuitionPlans.map((plan) => plan.ageGroup),
      families.flatMap((family) => family.children.map((child) => child.ageGroup)),
      planAgeGroup,
    ),
    [families, planAgeGroup, selectedCenter, tuitionPlans],
  );
  const familyBalanceCents = selectedFamily?.billingAccount?.balanceCents ?? 0;
  const openInvoices = selectedBillingAccount?.openInvoices ?? [];
  const selectedPaymentInvoiceId = paymentTarget.startsWith("invoice:") ? paymentTarget.slice("invoice:".length) : "";
  const selectedPaymentInvoice = selectedPaymentInvoiceId
    ? openInvoices.find((invoice) => invoice.id === selectedPaymentInvoiceId) ?? null
    : null;
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
  const selectedBillingAccountLabel = selectedBillingAccount?.id ? `${selectedBillingAccount.id.slice(0, 8)}...` : "No account";

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

  function paymentMethodLabel(method: DirectorPaymentMethod) {
    if (method === "autopay") return "Run autopay";
    if (method === "saved_method") return "Charge saved method";
    if (method === "card_checkout") return "Open card terminal";
    if (method === "instant_bank_checkout") return "Instant bank checkout";
    return "ACH bank checkout";
  }

  function paymentRouteSummary(method: DirectorPaymentMethod) {
    if (method === "autopay") return "The BEE Suite submits an off-session processor charge using the family autopay method on the selected invoice.";
    if (method === "saved_method") return "The BEE Suite submits an off-session processor charge using the saved family payment method.";
    if (method === "card_checkout") return "The BEE Suite opens a secure card-entry handoff for phone payments.";
    if (method === "instant_bank_checkout") return "The BEE Suite opens a secure instant bank verification handoff.";
    return "The BEE Suite opens a secure ACH bank-account collection handoff.";
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
    setCardRecoveryAccepted(false);
    setPaymentReviewMethod(method);
  }

  function manageFamilyPaymentMethod(action: "setup" | "portal" | "disable_autopay", paymentMethodCategory: "ach" | "card" | "link_bank" | "default" = "default") {
    if (!selectedFamily) return setErrorMessage("Choose a family before managing payment information.");
    if (action === "disable_autopay" && !confirmBillingAction("disable autopay")) return;
    if (action === "setup" && paymentMethodCategory === "card") {
      const accepted = window.confirm(
        "Card autopay may include the approved card processing recovery when a payment is charged. Continue with card setup?",
      );
      if (!accepted) return;
    }
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
          processingRecoveryAccepted: action === "setup" && paymentMethodCategory === "card",
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
      setStatusMessage(action === "disable_autopay" ? "Autopay disabled for the selected family." : "Payment method settings updated.");
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
    const processingRecoveryAccepted = method === "saved_method" && selectedPaymentMethod?.paymentMethodType === "card";
    if (processingRecoveryAccepted && !cardRecoveryAccepted) {
      return setErrorMessage("Confirm the approved card processing recovery disclosure before charging a saved card.");
    }
    setPaymentReviewMethod(null);

    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");

      if (invoiceId && (method === "autopay" || method === "saved_method")) {
        const response = await fetch("/api/billing/autopay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId,
            dryRun: false,
            mode: "charge",
            retryFailed: true,
            limit: 1,
            processStoredMethod: method === "saved_method",
            cardProcessingRecoveryAccepted: processingRecoveryAccepted,
          }),
        });
        const json = await response.json().catch(() => null) as {
          ok?: boolean;
          error?: string;
          processing?: number;
          failed?: number;
          skipped?: number;
          results?: Array<{ status: string; reason?: string | null; stripePaymentIntentId?: string | null }>;
        } | null;
        const first = json?.results?.[0];
        if (!response.ok || !json?.ok || first?.status === "failed" || first?.status === "skipped") {
          setErrorMessage(json?.error || first?.reason || "Saved payment method could not be charged.");
          return;
        }
        setStatusMessage(`${method === "autopay" ? "Autopay" : "Saved payment method charge"} submitted for ${selectedPaymentInvoice?.number ?? "the selected invoice"}.`);
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
          setErrorMessage(json?.error || "Payment checkout could not be opened.");
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
          processingRecoveryAccepted,
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
      setStatusMessage("Saved payment method charge submitted for the selected family balance.");
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

  function sendPaymentMethodRequest(intent: "payment_steps" | "instant_bank_verification" = "payment_steps") {
    if (!selectedFamily) return setErrorMessage("Choose a family before sending a payment form.");
    if (!selectedPaymentRequestEmails.length) return setErrorMessage("Choose at least one family email to receive the payment form.");
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
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
      } | null;
      if (!response.ok) {
        const firstFailure = json?.results?.find((result) => !result.ok);
        setErrorMessage(json?.error || firstFailure?.error || "Payment form could not be sent.");
        return;
      }
      const failed = json?.results?.filter((result) => !result.ok) ?? [];
      const label = intent === "instant_bank_verification" ? "instant bank verification email" : "tuition payment link email";
      setStatusMessage(
        `${json?.emailsSent ?? 0} ${label}${json?.emailsSent === 1 ? "" : "s"} sent and ${json?.notificationsCreated ?? 0} profile notification${json?.notificationsCreated === 1 ? "" : "s"} created.${failed.length ? ` ${failed.length} email${failed.length === 1 ? "" : "s"} need attention.` : ""}`,
      );
    });
  }

  function chargePayload() {
    return {
      chargeSource,
      tuitionPlanId: chargeSource === "tuitionPlan" ? tuitionPlanId : undefined,
      productId: chargeSource === "product" ? productId : undefined,
      quantity: chargeSource === "product" ? productQuantity : undefined,
      description,
      amountDollars: chargeSource === "custom" ? amountDollars : undefined,
    };
  }

  function handleCenterChange(value: string | null) {
    if (!value) return;
    setCenterId(value);
    setFamilyId("");
    setChildId("none");
    setAgencyChildId("none");
    setAssignmentChildId("");
  }

  function handleFamilyChange(value: string | null) {
    if (!value) return;
    setFamilyId(value);
    setChildId("none");
    setAgencyChildId("none");
    setAssignmentChildId("");
  }

  function handleTuitionPlanChange(value: string | null) {
    if (!value) return;
    setTuitionPlanId(value);
    const nextPlan = tuitionPlans.find((plan) => plan.id === value);
    if (nextPlan) setAgeGroup(nextPlan.ageGroup || "all");
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
      } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Billing action could not be completed.");
        return;
      }
      if (payload.mode === "agencyPayment") {
        const total = typeof json?.totalCents === "number" ? money(json.totalCents) : money(0);
        setStatusMessage(`Agency payment posted as a ${total} family balance credit.`);
        setAgencyAmountDollars("");
        setAgencyReference("");
        setAgencyNotes("");
        return;
      }
      if (payload.mode === "adjustment") {
        setStatusMessage("Ledger adjustment posted to the selected family account.");
        setAmountDollars("");
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
      return setErrorMessage("Choose a family, child, and tuition plan before charging tuition.");
    }
    if (!confirmBillingAction("charge recurring tuition now", selectedAssignmentChild.fullName)) return;
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
      `You are about to run batch billing for ${selectedCenter ? centerLabel(selectedCenter) : "the selected school"} (${ageGroup === "all" ? "all age groups" : ageGroup}, ${enrollmentStatus}). Continue?`,
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

  function submitAgencyPayment() {
    if (!selectedFamily) return setErrorMessage("Choose a family before posting an agency payment.");
    const childName = selectedChildren.find((child) => child.id === agencyChildId)?.fullName;
    if (!confirmBillingAction("post an agency payment", childName)) return;
    submit({
      mode: "agencyPayment",
      familyId: selectedFamily.id,
      childId: agencyChildId === "none" ? undefined : agencyChildId,
      agencyName,
      authorizationNumber: agencyAuthorizationNumber,
      externalReference: agencyReference,
      amountDollars: agencyAmountDollars,
      paidAt: agencyPaidAt,
      coverageStart: agencyCoverageStart,
      coverageEnd: agencyCoverageEnd,
      description,
      notes: agencyNotes,
    });
  }

  function handleAssignmentChildChange(value: string | null) {
    if (!value) return;
    const child = selectedChildren.find((item) => item.id === value);
    const assignment = child?.tuitionAssignment;
    setAssignmentChildId(value);
    setAssignmentTuitionPlanId(assignment?.tuitionPlanId || tuitionPlans[0]?.id || "");
    const plan = tuitionPlans.find((item) => item.id === (assignment?.tuitionPlanId || tuitionPlans[0]?.id || ""));
    const cadence = normalizeCadence(plan?.cadence || assignment?.cadence);
    setAssignmentBillingDay(normalizeBillingDayForCadence(assignment?.billingDay, cadence));
    setAssignmentStartPeriod(assignment?.startsPeriod || currentPeriodForCadence(cadence));
    setAssignmentDescription(assignment?.description || assignment?.tuitionPlanName || "");
    setAssignmentEnabled(assignment?.enabled === false ? "false" : "true");
  }

  function handleAssignmentPlanChange(value: string | null) {
    if (!value) return;
    const plan = tuitionPlans.find((item) => item.id === value);
    const cadence = normalizeCadence(plan?.cadence);
    setAssignmentTuitionPlanId(value);
    setAssignmentBillingDay((current) => normalizeBillingDayForCadence(current, cadence));
    setAssignmentStartPeriod((current) => periodMatchesCadence(current, cadence) ? current : currentPeriodForCadence(cadence));
  }

  function submitAssignment() {
    if (!selectedFamily || !selectedAssignmentChild) return setErrorMessage("Choose a family and child before saving recurring tuition.");
    if (!confirmBillingAction("save recurring tuition", selectedAssignmentChild.fullName)) return;
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
          billingDay: effectiveAssignmentBillingDay,
          billingStartPeriod: effectiveAssignmentStartPeriod,
          description: effectiveAssignmentDescription,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Recurring tuition could not be saved.");
        return;
      }
      setStatusMessage(`Recurring tuition ${assignmentEnabled === "true" ? "enabled" : "disabled"} for ${selectedAssignmentChild.fullName}.`);
    });
  }

  function handlePlanEditorChange(value: string | null) {
    if (!value) return;
    setPlanEditorId(value);
    if (value === "new") {
      setPlanName("");
      setPlanAgeGroup(ageGroups[0] ?? defaultAgeGroupOptions[0]);
      setPlanCadence("weekly");
      setPlanAmountDollars("");
      return;
    }
    const plan = tuitionPlans.find((item) => item.id === value);
    if (!plan) return;
    setPlanName(plan.name);
    setPlanAgeGroup(plan.ageGroup || ageGroups[0] || defaultAgeGroupOptions[0]);
    setPlanCadence(normalizeCadence(plan.cadence));
    setPlanAmountDollars(String(plan.amountCents / 100));
  }

  function saveTuitionPlan() {
    if (!planName.trim() || !planAmountDollars.trim()) {
      return setErrorMessage("Tuition plan name and amount are required.");
    }
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "tuitionPlan",
          id: planEditorId === "new" ? undefined : planEditorId,
          name: planName,
          ageGroup: planAgeGroup,
          cadence: planCadence,
          amountDollars: planAmountDollars,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; record?: { id?: string } } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Tuition plan could not be saved.");
        return;
      }
      setStatusMessage(`Tuition plan ${planEditorId === "new" ? "created" : "updated"}.`);
      if (json?.record?.id) {
        setPlanEditorId(json.record.id);
        setTuitionPlanId(json.record.id);
        setAssignmentTuitionPlanId(json.record.id);
      }
      router.refresh();
    });
  }

  const paymentReviewRequiresCardRecovery =
    paymentReviewMethod === "saved_method" && selectedPaymentMethod?.paymentMethodType === "card";

  return (
    <>
    <Dialog open={Boolean(paymentReviewMethod)} onOpenChange={(open) => {
      if (!open && !isPending) {
        setPaymentReviewMethod(null);
        setCardRecoveryAccepted(false);
      }
    }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{paymentReviewMethod ? paymentMethodLabel(paymentReviewMethod) : "Review payment"}</DialogTitle>
          <DialogDescription>
            Confirm the family, target, Bee Suite payment route, and fee disclosure before submitting the payment.
          </DialogDescription>
        </DialogHeader>
        {paymentReviewMethod ? (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryMetric label="Family" value={selectedFamily?.name ?? "Not selected"} detail={selectedFamily?.billingEmail ?? "No billing email"} />
              <SummaryMetric label="School" value={selectedCenter ? centerLabel(selectedCenter) : "Not selected"} detail={stripeAccountLabel(selectedCheckoutReadiness?.accountId)} />
              <SummaryMetric label="Payment target" value={directorPaymentTargetLabel} detail={selectedPaymentInvoice ? `Due ${formatShortDate(selectedPaymentInvoice.dueDate)}` : "Family balance payment"} />
              <SummaryMetric label="Amount to submit" value={money(directorPaymentAmountCents)} detail={effectivePaymentTarget === "custom" ? paymentDescription : selectedPaymentInvoice?.number ?? "Balance"} />
            </div>
            <div className="rounded-lg border bg-background/45 p-3">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">The BEE Suite route</div>
              <div className="mt-2 text-sm font-medium">{paymentRouteSummary(paymentReviewMethod)}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                Hosted handoffs and saved-method charges are created server-side with invoice, family, center, payment, payout-account, and collection-mode metadata for webhook reconciliation.
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <ContextBadge label="Readiness" value={selectedCheckoutReadiness?.label ?? "Unknown"} variant={selectedCheckoutReadiness?.canAcceptParentPayments ? "default" : "destructive"} />
              <ContextBadge label="Saved method" value={selectedPaymentMethod?.paymentMethodLabel ?? "None"} />
              <ContextBadge label="Autopay" value={selectedAutopayStatus} variant={selectedAutopayStatus === "enabled" ? "default" : "outline"} />
            </div>
            {paymentReviewRequiresCardRecovery ? (
              <label className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm leading-5">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={cardRecoveryAccepted}
                  onChange={(event) => setCardRecoveryAccepted(event.target.checked)}
                />
                <span>
                  I confirm this saved-card charge may include the approved card processing recovery and should be recorded before charging this family.
                </span>
              </label>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => {
            setPaymentReviewMethod(null);
            setCardRecoveryAccepted(false);
          }}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isPending || !paymentReviewMethod || (paymentReviewRequiresCardRecovery && !cardRecoveryAccepted)}
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
            <CardTitle>Billing Workbench</CardTitle>
            <CardDescription>Post tuition, fees, and account adjustments to family ledgers.</CardDescription>
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
            <AlertTitle>Billing saved</AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        ) : null}
        {errorMessage ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <EntityHeader
          sticky
          eyebrow="Currently editing billing data"
          title={selectedFamily?.name ?? "Choose a family"}
          subtitle={`Billing account context: ${billingContextDescription()}`}
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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryMetric label="School" value={selectedCenter ? centerLabel(selectedCenter) : "Not selected"} />
            <SummaryMetric label="Billing account" value={selectedBillingAccountLabel} detail={`Updated ${formatShortDate(selectedFamily?.updatedAt)}`} />
            <SummaryMetric label="Balance" value={money(familyBalanceCents)} detail={selectedPaymentMethod?.hasSavedPaymentMethod ? "Saved method on file" : "No saved method"} />
            <SummaryMetric label="Family contacts" value={`${selectedPaymentRequestEmailOptions.length} billing emails`} detail={selectedFamily?.billingEmail ?? "No billing email"} />
            <SummaryMetric label="Children" value={selectedChildSummary} detail={selectedChildren.map((child) => child.fullName).slice(0, 2).join(", ") || "No child records"} />
          </div>
        </EntityHeader>

        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <Label>School</Label>
            <Select value={centerId} onValueChange={handleCenterChange}>
              <SelectTrigger><SelectValue placeholder="Choose school" /></SelectTrigger>
              <SelectContent>
                {centers.map((center) => (
                  <SelectItem key={center.id} value={center.id}>{centerLabel(center)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Family</Label>
            <Select value={effectiveFamilyId} onValueChange={handleFamilyChange}>
              <SelectTrigger><SelectValue placeholder="Choose family" /></SelectTrigger>
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
            <AlertTitle>Parent payments connected</AlertTitle>
            <AlertDescription>
              Invoices for {selectedCenter ? centerLabel(selectedCenter) : "this school"} route through{" "}
              {stripeAccountLabel(selectedCheckoutReadiness.accountId)}.
            </AlertDescription>
          </Alert>
        ) : selectedCheckoutReadiness ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Parent payments blocked</AlertTitle>
            <AlertDescription>
              {selectedCheckoutReadiness.blockingReason || "Finish payout setup before parents can pay invoices for this school."}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="rounded-lg border bg-background/35 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Family payment profile</div>
              <p className="text-xs text-muted-foreground">
                Add or update the family&apos;s saved payment method, enable autopay, or open The BEE Suite secure payment method manager.
              </p>
            </div>
            <Badge variant={selectedAutopayStatus === "enabled" ? "default" : "outline"} className="capitalize">{selectedAutopayStatus}</Badge>
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
                {selectedPaymentMethod?.lastUpdatedAt ? `Updated ${new Date(selectedPaymentMethod.lastUpdatedAt).toLocaleDateString()}` : "Families can also update this from the parent portal."}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="w-full sm:w-auto" disabled={isPending || !selectedFamily} onClick={() => manageFamilyPaymentMethod("setup", "link_bank")}>
                <Building2 data-icon="inline-start" />
                {selectedPaymentMethod?.hasSavedPaymentMethod ? "Verify Bank Instantly" : "Instant Bank Login"}
              </Button>
              <Button className="w-full sm:w-auto" disabled={isPending || !selectedFamily} onClick={() => manageFamilyPaymentMethod("setup", "card")} variant="outline">
                <CreditCard data-icon="inline-start" />
                {selectedPaymentMethod?.hasSavedPaymentMethod ? "Replace Card" : "Add Card"}
              </Button>
              <Button className="w-full sm:w-auto" disabled={isPending || !selectedPaymentMethod?.hasStripeCustomer} onClick={() => manageFamilyPaymentMethod("portal")} variant="outline">
                Manage Saved
              </Button>
              <Button className="w-full sm:w-auto" disabled={isPending || selectedAutopayStatus === "disabled" || !selectedBillingAccount} onClick={() => manageFamilyPaymentMethod("disable_autopay")} variant="outline">
                Disable Autopay
              </Button>
            </div>
          </div>
          <div className="mt-4 rounded-lg border bg-background/40 p-3">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Director payment terminal</div>
                <p className="text-xs text-muted-foreground">
                  Choose total balance, an open invoice, or a custom amount, then charge a saved method or open The BEE Suite secure phone card terminal.
                </p>
              </div>
              <Badge variant="outline">{money(directorPaymentAmountCents)}</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-6">
              <div className="space-y-1 md:col-span-2">
                <Label>Payment target</Label>
                <Select value={effectivePaymentTarget} onValueChange={(value) => value && setPaymentTarget(value)}>
                  <SelectTrigger><SelectValue placeholder="Choose target" /></SelectTrigger>
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
                <Label>Custom amount</Label>
                <Input
                  disabled={effectivePaymentTarget !== "custom"}
                  inputMode="decimal"
                  value={paymentAmountDollars}
                  onChange={(event) => setPaymentAmountDollars(event.target.value)}
                  placeholder="250.00"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Description</Label>
                <Input value={paymentDescription} onChange={(event) => setPaymentDescription(event.target.value)} placeholder="Tuition payment" />
              </div>
              <div className="rounded-lg border bg-background/50 p-3">
                <div className="text-xs text-muted-foreground">Charging</div>
                <div className="text-sm font-medium">{directorPaymentTargetLabel}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={isPending || !selectedPaymentMethod?.hasSavedPaymentMethod || !selectedBillingAccount || directorPaymentAmountCents <= 0}
                onClick={() => openPaymentReview("saved_method")}
              >
                <CreditCard data-icon="inline-start" />
                Charge Selected Method
              </Button>
              {effectivePaymentTarget.startsWith("invoice:") ? (
                <Button
                  disabled={isPending || selectedAutopayStatus !== "enabled" || !selectedBillingAccount || directorPaymentAmountCents <= 0}
                  onClick={() => openPaymentReview("autopay")}
                  variant="outline"
                >
                  <Play data-icon="inline-start" />
                  Run Autopay
                </Button>
              ) : null}
              <Button
                disabled={isPending || !selectedBillingAccount || directorPaymentAmountCents <= 0}
                onClick={() => openPaymentReview("card_checkout")}
              >
                <CreditCard data-icon="inline-start" />
                Open Card Terminal
              </Button>
              <Button
                disabled={isPending || !selectedBillingAccount || directorPaymentAmountCents <= 0}
                onClick={() => openPaymentReview("instant_bank_checkout")}
                variant="outline"
              >
                <Building2 data-icon="inline-start" />
                Instant Bank
              </Button>
              <Button
                disabled={isPending || !selectedBillingAccount || directorPaymentAmountCents <= 0}
                onClick={() => openPaymentReview("ach_checkout")}
                variant="outline"
              >
                <Building2 data-icon="inline-start" />
                ACH Bank Checkout
              </Button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Use Open Card Terminal when a parent gives card details by phone. The BEE Suite sends the director to a secure processor card-entry page, so card numbers are never typed into or stored by The BEE Suite.
            </div>
          </div>
          <div className="mt-4 rounded-lg border bg-background/40 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="size-4 text-muted-foreground" />
                  Branded parent payment and bank verification links
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Email a secure form branded for The BEE Suite. Parents start in the school-branded portal; Stripe appears only during the secure processor handoff when required.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={isPending || !selectedFamily || !selectedPaymentRequestEmails.length} onClick={() => sendPaymentMethodRequest("instant_bank_verification")}>
                  <Building2 data-icon="inline-start" />
                  Send Instant Bank Verification
                </Button>
                <Button disabled={isPending || !selectedFamily || !selectedPaymentRequestEmails.length} onClick={() => sendPaymentMethodRequest("payment_steps")} variant="outline">
                  <Send data-icon="inline-start" />
                  Send Payment Link
                </Button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {selectedPaymentRequestEmailOptions.map((option) => {
                const id = `payment-request-${option.email.replace(/[^a-z0-9]+/gi, "-")}`;
                return (
                  <label key={option.email} className="flex min-h-12 items-start gap-2 rounded-lg border bg-background/50 p-2 text-sm">
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
                        {option.email}{option.hasPortalUser ? " · profile notification" : ""}
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
              <div className="text-sm font-medium">Tuition rate setup</div>
              <p className="text-xs text-muted-foreground">
                School users can add or edit weekly/monthly rates here, then assign them to children for scheduled billing or charge a family manually.
              </p>
            </div>
            <Badge variant="outline">School-managed rates</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-6">
            <div className="space-y-1 md:col-span-2">
              <Label>Rate record</Label>
              <Select value={planEditorId} onValueChange={handlePlanEditorChange}>
                <SelectTrigger><SelectValue placeholder="New or existing rate" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New tuition rate</SelectItem>
                  {tuitionPlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} · {plan.ageGroup} · {plan.cadence} · {money(plan.amountCents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Plan name</Label>
              <Input value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="Infant weekly tuition" />
            </div>
            <div className="space-y-1">
              <Label>Age group</Label>
              <Select value={planAgeGroup} onValueChange={(value) => value && setPlanAgeGroup(value)}>
                <SelectTrigger><SelectValue placeholder="Choose age group" /></SelectTrigger>
                <SelectContent>
                  {ageGroups.map((group) => (
                    <SelectItem key={group} value={group}>{group}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input inputMode="decimal" value={planAmountDollars} onChange={(event) => setPlanAmountDollars(event.target.value)} placeholder="250.00" />
            </div>
            <div className="space-y-1">
              <Label>Cadence</Label>
              <Select value={planCadence} onValueChange={(value) => value && setPlanCadence(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button disabled={isPending} onClick={saveTuitionPlan} className="w-full">
                Save Rate
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="single">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="single"><ReceiptText data-icon="inline-start" />Family charge</TabsTrigger>
            <TabsTrigger value="batch"><Rows3 data-icon="inline-start" />Batch tuition</TabsTrigger>
            <TabsTrigger value="recurring"><CalendarClock data-icon="inline-start" />Recurring</TabsTrigger>
            <TabsTrigger value="agency"><BadgeDollarSign data-icon="inline-start" />Agency payment</TabsTrigger>
            <TabsTrigger value="adjustment"><MinusCircle data-icon="inline-start" />Credit / debit</TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <ChargeFields
              chargeSource={chargeSource}
              setChargeSource={setChargeSource}
              tuitionPlanId={tuitionPlanId}
              setTuitionPlanId={handleTuitionPlanChange}
              productId={productId}
              setProductId={setProductId}
              productQuantity={productQuantity}
              setProductQuantity={setProductQuantity}
              products={products}
              tuitionPlans={tuitionPlans}
              amountDollars={amountDollars}
              setAmountDollars={setAmountDollars}
              selectedPlan={selectedPlan}
              selectedProduct={selectedProduct}
            />
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Child</Label>
                <Select value={childId} onValueChange={(value) => value && setChildId(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Whole family</SelectItem>
                    {selectedChildren.map((child) => (
                      <SelectItem key={child.id} value={child.id}>{child.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DateFields dueDate={dueDate} setDueDate={setDueDate} billingPeriod={billingPeriod} setBillingPeriod={setBillingPeriod} />
            </div>
            <DescriptionField value={description} setValue={setDescription} />
            <Button disabled={isPending || !selectedFamily} onClick={submitSingle}>
              <ReceiptText data-icon="inline-start" />
              Create Invoice
            </Button>
          </TabsContent>

          <TabsContent value="batch" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <ChargeFields
              chargeSource={chargeSource}
              setChargeSource={setChargeSource}
              tuitionPlanId={tuitionPlanId}
              setTuitionPlanId={handleTuitionPlanChange}
              productId={productId}
              setProductId={setProductId}
              productQuantity={productQuantity}
              setProductQuantity={setProductQuantity}
              products={products}
              tuitionPlans={tuitionPlans}
              amountDollars={amountDollars}
              setAmountDollars={setAmountDollars}
              selectedPlan={selectedPlan}
              selectedProduct={selectedProduct}
            />
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1">
                <Label>Batch target</Label>
                <Select value={batchTarget} onValueChange={(value) => value && setBatchTarget(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="child">Per matching child</SelectItem>
                    <SelectItem value="family">Per matching family</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Age group</Label>
                <Select value={ageGroup} onValueChange={(value) => value && setAgeGroup(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All age groups</SelectItem>
                    {ageGroups.map((group) => (
                      <SelectItem key={group} value={group}>{group}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={enrollmentStatus} onValueChange={(value) => value && setEnrollmentStatus(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enrolled">Enrolled</SelectItem>
                    <SelectItem value="waitlisted">Waitlisted</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="all">All statuses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DateFields dueDate={dueDate} setDueDate={setDueDate} billingPeriod={billingPeriod} setBillingPeriod={setBillingPeriod} />
            </div>
            <DescriptionField value={description} setValue={setDescription} />
            <Button disabled={isPending || !centerId} onClick={submitBatch}>
              <Rows3 data-icon="inline-start" />
              Run Batch
            </Button>
          </TabsContent>

          <TabsContent value="recurring" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1">
                <Label>Child</Label>
                <Select value={effectiveAssignmentChildId} onValueChange={handleAssignmentChildChange}>
                  <SelectTrigger><SelectValue placeholder="Choose child" /></SelectTrigger>
                  <SelectContent>
                    {selectedChildren.map((child) => (
                      <SelectItem key={child.id} value={child.id}>
                        {child.fullName}{child.tuitionAssignment?.enabled ? " · active" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={assignmentEnabled} onValueChange={(value) => value && setAssignmentEnabled(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Tuition plan</Label>
                <Select value={effectiveAssignmentPlanId} onValueChange={handleAssignmentPlanChange}>
                  <SelectTrigger><SelectValue placeholder="Choose plan" /></SelectTrigger>
                  <SelectContent>
                    {tuitionPlans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} · {plan.ageGroup} · {plan.cadence} · {money(plan.amountCents)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{effectiveAssignmentCadence === "weekly" ? "Bill weekday" : "Bill day"}</Label>
                {effectiveAssignmentCadence === "weekly" ? (
                  <Select value={effectiveAssignmentBillingDay} onValueChange={(value) => value && setAssignmentBillingDay(value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Monday</SelectItem>
                      <SelectItem value="2">Tuesday</SelectItem>
                      <SelectItem value="3">Wednesday</SelectItem>
                      <SelectItem value="4">Thursday</SelectItem>
                      <SelectItem value="5">Friday</SelectItem>
                      <SelectItem value="6">Saturday</SelectItem>
                      <SelectItem value="7">Sunday</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    inputMode="numeric"
                    min={1}
                    max={28}
                    type="number"
                    value={effectiveAssignmentBillingDay}
                    onChange={(event) => setAssignmentBillingDay(event.target.value)}
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label>{effectiveAssignmentCadence === "weekly" ? "Start week" : "Start period"}</Label>
                <Input
                  value={effectiveAssignmentStartPeriod}
                  onChange={(event) => setAssignmentStartPeriod(event.target.value)}
                  placeholder={effectiveAssignmentCadence === "weekly" ? "2026-W23" : "2026-06"}
                />
              </div>
            </div>
            <DescriptionField value={effectiveAssignmentDescription} setValue={setAssignmentDescription} />
            <div className="flex flex-wrap gap-2">
              <Button disabled={isPending || !selectedFamily || !selectedAssignmentChild} onClick={submitAssignment}>
                <CalendarClock data-icon="inline-start" />
                Save Recurring Tuition
              </Button>
              <Button disabled={isPending || !selectedFamily || !selectedAssignmentChild || !effectiveAssignmentPlanId} onClick={submitAssignmentChargeNow} variant="outline">
                <ReceiptText data-icon="inline-start" />
                Charge This Child Now
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Weekly tuition bills on the selected weekday for the following week and is due before Monday drop-off. Charge now posts the selected rate immediately to the family balance and parent portal.
            </p>
          </TabsContent>

          <TabsContent value="agency" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Agency payer</Label>
                <Input value={agencyName} onChange={(event) => setAgencyName(event.target.value)} placeholder="ELC, DHS, scholarship fund" />
              </div>
              <div className="space-y-1">
                <Label>Authorization #</Label>
                <Input value={agencyAuthorizationNumber} onChange={(event) => setAgencyAuthorizationNumber(event.target.value)} placeholder="Optional authorization" />
              </div>
              <div className="space-y-1">
                <Label>Payment reference</Label>
                <Input value={agencyReference} onChange={(event) => setAgencyReference(event.target.value)} placeholder="EFT/check/reference" />
              </div>
              <div className="space-y-1">
                <Label>Amount</Label>
                <Input inputMode="decimal" value={agencyAmountDollars} onChange={(event) => setAgencyAmountDollars(event.target.value)} placeholder="250.00" />
              </div>
              <div className="space-y-1">
                <Label>Paid date</Label>
                <Input type="date" value={agencyPaidAt} onChange={(event) => setAgencyPaidAt(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Child</Label>
                <Select value={agencyChildId} onValueChange={(value) => value && setAgencyChildId(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Whole family</SelectItem>
                    {selectedChildren.map((child) => (
                      <SelectItem key={child.id} value={child.id}>{child.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Coverage start</Label>
                <Input type="date" value={agencyCoverageStart} onChange={(event) => setAgencyCoverageStart(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Coverage end</Label>
                <Input type="date" value={agencyCoverageEnd} onChange={(event) => setAgencyCoverageEnd(event.target.value)} />
              </div>
            </div>
            <DescriptionField value={description} setValue={setDescription} />
            <div className="space-y-1">
              <Label>Agency notes</Label>
              <Textarea value={agencyNotes} onChange={(event) => setAgencyNotes(event.target.value)} placeholder="Eligibility period, copay notes, authorization limits, or office follow-up" />
            </div>
            <Button disabled={isPending || !selectedFamily || !agencyName || !agencyAmountDollars} onClick={submitAgencyPayment}>
              <BadgeDollarSign data-icon="inline-start" />
              Post Agency Payment
            </Button>
          </TabsContent>

          <TabsContent value="adjustment" className="space-y-4 rounded-lg border bg-background/35 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Adjustment</Label>
                <Select value={adjustmentType} onValueChange={(value) => value && setAdjustmentType(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Credit family balance</SelectItem>
                    <SelectItem value="debit">Add balance debit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Amount</Label>
                <Input inputMode="decimal" value={amountDollars} onChange={(event) => setAmountDollars(event.target.value)} placeholder="125.00" />
              </div>
            </div>
            <DescriptionField value={description} setValue={setDescription} />
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
        <Label>Charge type</Label>
        <Select value={chargeSource} onValueChange={(value) => value && setChargeSource(value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tuitionPlan">Tuition plan</SelectItem>
            <SelectItem value="product">Uniform shirt / product</SelectItem>
            <SelectItem value="custom">Custom charge</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {chargeSource === "tuitionPlan" ? (
        <div className="space-y-1">
          <Label>Tuition plan</Label>
          <Select value={tuitionPlanId} onValueChange={(value) => value && setTuitionPlanId(value)}>
            <SelectTrigger><SelectValue placeholder="Choose plan" /></SelectTrigger>
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
          <Label>Product / fee</Label>
          <Select value={productId} onValueChange={(value) => value && setProductId(value)}>
            <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
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
          <Label>Quantity</Label>
          <Input inputMode="numeric" min={1} value={productQuantity} onChange={(event) => setProductQuantity(event.target.value)} placeholder="1" />
          {uniformProduct ? (
            <div className="text-xs text-muted-foreground">
              Director quick invoice: {uniformQuantity} shirt{uniformQuantity === 1 ? "" : "s"} = {money(uniformTotalCents)} ({uniformBundles ? `${uniformBundles} five-pack${uniformBundles === 1 ? "" : "s"} at ${money(STUDENT_UNIFORM_SHIRT_BUNDLE_PRICE_CENTS)}` : "no five-pack"}{uniformSingles ? ` + ${uniformSingles} single${uniformSingles === 1 ? "" : "s"}` : ""}). Parents still choose size/color in the portal store.
            </div>
          ) : null}
        </div>
      ) : null}
      {chargeSource === "custom" ? (
        <div className="space-y-1">
          <Label>Custom amount</Label>
          <Input inputMode="decimal" value={amountDollars} onChange={(event) => setAmountDollars(event.target.value)} placeholder="250.00" />
        </div>
      ) : null}
    </div>
  );
}

function DateFields({
  dueDate,
  setDueDate,
  billingPeriod,
  setBillingPeriod,
}: {
  dueDate: string;
  setDueDate: (value: string) => void;
  billingPeriod: string;
  setBillingPeriod: (value: string) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label>Due date</Label>
        <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Billing period</Label>
        <Input value={billingPeriod} onChange={(event) => setBillingPeriod(event.target.value)} placeholder="2026-06" />
      </div>
    </>
  );
}

function DescriptionField({ value, setValue }: { value: string; setValue: (value: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>Description override</Label>
      <Textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder="Optional statement memo shown in the ledger and invoice line item" />
    </div>
  );
}
