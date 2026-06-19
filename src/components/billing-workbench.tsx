"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BadgeDollarSign, Building2, CalendarClock, CheckCircle2, CreditCard, MinusCircle, ReceiptText, Rows3 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { defaultAgeGroupOptions, mergeAgeGroupOptions, type DashboardOptions } from "@/lib/dashboard-options";

export type BillingWorkbenchFamily = {
  id: string;
  centerId: string | null;
  name: string;
  billingEmail: string | null;
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
};

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

function centerLabel(center: BillingWorkbenchCenter) {
  return [center.crmLocationId, center.name].filter(Boolean).join(" · ");
}

export function BillingWorkbench({ families, centers, products, tuitionPlans }: Props) {
  const router = useRouter();
  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
  const [familyId, setFamilyId] = useState("");
  const [chargeSource, setChargeSource] = useState("tuitionPlan");
  const [tuitionPlanId, setTuitionPlanId] = useState(tuitionPlans[0]?.id ?? "");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
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

  function manageFamilyPaymentMethod(action: "setup" | "portal" | "disable_autopay", paymentMethodCategory: "ach" | "card" | "default" = "default") {
    if (!selectedFamily) return setErrorMessage("Choose a family before managing payment information.");
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

  function chargePayload() {
    return {
      chargeSource,
      tuitionPlanId: chargeSource === "tuitionPlan" ? tuitionPlanId : undefined,
      productId: chargeSource === "product" ? productId : undefined,
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

  return (
    <Card className="glass-panel">
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

        <div className="rounded-lg border bg-background/35 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Family payment profile</div>
              <p className="text-xs text-muted-foreground">
                Add or update the family&apos;s saved payment method, enable autopay, or open Stripe&apos;s secure payment method manager.
              </p>
            </div>
            <Badge variant={selectedAutopayStatus === "enabled" ? "default" : "outline"} className="capitalize">{selectedAutopayStatus}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="rounded-lg border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">Saved method</div>
              <div className="mt-1 text-sm font-medium">
                {selectedPaymentMethod?.hasSavedPaymentMethod
                  ? selectedPaymentMethod.paymentMethodLabel ?? "Saved securely with Stripe"
                  : selectedPaymentMethod?.autopayStatus === "pending"
                    ? "Setup pending"
                    : "No saved payment method"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {selectedPaymentMethod?.lastUpdatedAt ? `Updated ${new Date(selectedPaymentMethod.lastUpdatedAt).toLocaleDateString()}` : "Families can also update this from the parent portal."}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="w-full sm:w-auto" disabled={isPending || !selectedFamily} onClick={() => manageFamilyPaymentMethod("setup", "ach")}>
                <Building2 data-icon="inline-start" />
                {selectedPaymentMethod?.hasSavedPaymentMethod ? "Replace Bank" : "Add Bank"}
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
  tuitionPlans: BillingWorkbenchTuitionPlan[];
  amountDollars: string;
  setAmountDollars: (value: string) => void;
  selectedPlan: BillingWorkbenchTuitionPlan | null;
  selectedProduct: BillingWorkbenchProduct | null;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="space-y-1">
        <Label>Charge type</Label>
        <Select value={chargeSource} onValueChange={(value) => value && setChargeSource(value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tuitionPlan">Tuition plan</SelectItem>
            <SelectItem value="product">Product / fee</SelectItem>
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
                  {product.name} · {product.type} · {money(product.amountCents)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedProduct ? <div className="text-xs text-muted-foreground">Selected amount {money(selectedProduct.amountCents)}</div> : null}
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
