"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, BadgeDollarSign, CheckCircle2, MinusCircle, ReceiptText, Rows3 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export type BillingWorkbenchFamily = {
  id: string;
  centerId: string | null;
  name: string;
  billingEmail: string | null;
  billingAccount?: { balanceCents: number } | null;
  children: Array<{ id: string; fullName: string; ageGroup: string; enrollmentStatus: string }>;
};

export type BillingWorkbenchCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
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

function money(cents: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(cents / 100);
}

function centerLabel(center: BillingWorkbenchCenter) {
  return [center.crmLocationId, center.name].filter(Boolean).join(" · ");
}

export function BillingWorkbench({ families, centers, products, tuitionPlans }: Props) {
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
  const selectedPlan = tuitionPlans.find((plan) => plan.id === tuitionPlanId) ?? null;
  const selectedProduct = products.find((product) => product.id === productId) ?? null;
  const selectedChildren = selectedFamily?.children ?? [];
  const ageGroups = useMemo(
    () => Array.from(new Set([
      ...tuitionPlans.map((plan) => plan.ageGroup).filter(Boolean),
      ...families.flatMap((family) => family.children.map((child) => child.ageGroup)).filter(Boolean),
    ])).sort(),
    [families, tuitionPlans],
  );
  const familyBalanceCents = selectedFamily?.billingAccount?.balanceCents ?? 0;

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
  }

  function handleFamilyChange(value: string | null) {
    if (!value) return;
    setFamilyId(value);
    setChildId("none");
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
      const created = json?.created ?? 0;
      const skipped = json?.skipped ?? 0;
      const total = typeof json?.totalCents === "number" ? ` Total posted: ${money(json.totalCents)}.` : "";
      setStatusMessage(`${created} invoice${created === 1 ? "" : "s"} created. ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped.${total}`);
      if (payload.mode === "adjustment") setAmountDollars("");
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

        <Tabs defaultValue="single">
          <TabsList>
            <TabsTrigger value="single"><ReceiptText data-icon="inline-start" />Family charge</TabsTrigger>
            <TabsTrigger value="batch"><Rows3 data-icon="inline-start" />Batch tuition</TabsTrigger>
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
