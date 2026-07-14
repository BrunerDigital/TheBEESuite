"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Printer, Save } from "lucide-react";
import { formatPrintDateTime, PrintableReport, ReportPrintStyles, usePrintableReport } from "@/components/printable-report";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ageGroupTotal, calculateFteCount, dateInputString, defaultFteWeekEnd, startOfFteWeek } from "@/lib/fte-report-guardrails";

export type FteReportCenterOption = {
  id: string;
  name: string;
  licensedCapacity?: number;
  locationData?: string | null;
};

export type FteReportRow = {
  id: string;
  centerId: string;
  centerName: string;
  locationData?: string | null;
  weekStart: string;
  weekEnd: string | null;
  accountReceivableAmount?: number | null;
  selfPayerBillAmount?: number | null;
  subsidyBillAmount?: number | null;
  totalBilledAmount?: number | null;
  enrolledCount: number;
  fullTimeCount: number;
  partTimeCount: number;
  fteCount: number;
  licenseCapacity?: number | null;
  occupancyPercent?: number | null;
  payrollAmount?: number | null;
  infants: number;
  toddlers: number;
  twos: number;
  preschool: number;
  preK: number;
  schoolAge: number;
  status: string;
  source: string;
  payrollPercent?: number | null;
  newStarts?: number | null;
  withdrawals?: number | null;
  preregisteredChildren?: number | null;
  notes: string | null;
  submittedBy: string | null;
  updatedAt: string;
};

export type FteReportPrefill = {
  centerId: string;
  licensedCapacity: number | null;
  enrolledCount: number;
  fullTimeCount: number | null;
  partTimeCount: number | null;
  unknownScheduleCount: number;
  infants: number;
  toddlers: number;
  twos: number;
  preschool: number;
  preK: number;
  schoolAge: number;
  generatedAt: string;
  sourceLabel: string;
};

type Props = {
  centers: FteReportCenterOption[];
  reports: FteReportRow[];
  prefills?: FteReportPrefill[];
  title?: string;
  description?: string;
  allowCenterSelect?: boolean;
  mode?: "director" | "executive";
};

type FormState = {
  id: string;
  centerId: string;
  weekStart: string;
  weekEnd: string;
  locationData: string;
  accountReceivableAmount: string;
  selfPayerBillAmount: string;
  subsidyBillAmount: string;
  totalBilledAmount: string;
  enrolledCount: string;
  fullTimeCount: string;
  partTimeCount: string;
  fteCount: string;
  licenseCapacity: string;
  occupancyPercent: string;
  payrollAmount: string;
  payrollPercent: string;
  newStarts: string;
  withdrawals: string;
  preregisteredChildren: string;
  infants: string;
  toddlers: string;
  twos: string;
  preschool: string;
  preK: string;
  schoolAge: string;
  status: string;
  notes: string;
};

function dateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function defaultWeekStart() {
  return dateInputString(startOfFteWeek());
}

function defaultWeekEnd(weekStart: string) {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  return dateInputString(defaultFteWeekEnd(date));
}

function defaultValuesForCenter(centerId: string, prefills: FteReportPrefill[] = []) {
  return Array.isArray(prefills) ? prefills.find((item) => item.centerId === centerId) : undefined;
}

function emptyForm(centerId = "", prefill?: FteReportPrefill, center?: FteReportCenterOption): FormState {
  const weekStart = defaultWeekStart();
  return {
    id: "",
    centerId,
    weekStart,
    weekEnd: defaultWeekEnd(weekStart),
    locationData: center?.locationData ?? "",
    accountReceivableAmount: "",
    selfPayerBillAmount: "",
    subsidyBillAmount: "",
    totalBilledAmount: "",
    enrolledCount: prefill ? asInput(prefill.enrolledCount) : "",
    fullTimeCount: prefill?.fullTimeCount === null || prefill?.fullTimeCount === undefined ? "" : asInput(prefill.fullTimeCount),
    partTimeCount: prefill?.partTimeCount === null || prefill?.partTimeCount === undefined ? "" : asInput(prefill.partTimeCount),
    fteCount: "",
    licenseCapacity: asOptionalInput(prefill?.licensedCapacity ?? center?.licensedCapacity ?? null),
    occupancyPercent: "",
    payrollAmount: "",
    payrollPercent: "",
    newStarts: "",
    withdrawals: "",
    preregisteredChildren: "",
    infants: prefill ? asInput(prefill.infants) : "",
    toddlers: prefill ? asInput(prefill.toddlers) : "",
    twos: prefill ? asInput(prefill.twos) : "",
    preschool: prefill ? asInput(prefill.preschool) : "",
    preK: prefill ? asInput(prefill.preK) : "",
    schoolAge: prefill ? asInput(prefill.schoolAge) : "",
    status: "submitted",
    notes: prefill?.unknownScheduleCount
      ? `${prefill.unknownScheduleCount} enrolled child schedule(s) need full-time/part-time verification.`
      : "",
  };
}

function asInput(value: number) {
  return value ? String(value) : "";
}

function asOptionalInput(value?: number | null) {
  return value === null || value === undefined ? "" : String(value);
}

function roundedNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMoney(value?: number | null) {
  return value === null || value === undefined ? "Not set" : `$${value.toLocaleString()}`;
}

function formatPercent(value?: number | null) {
  return value === null || value === undefined ? "Not set" : `${value.toLocaleString()}%`;
}

export function FteReportForm({
  centers,
  reports,
  prefills = [],
  title = "Weekly FTE Report",
  description = "Submit or edit the weekly full-time-equivalent report for the selected school.",
  allowCenterSelect = false,
  mode = allowCenterSelect ? "executive" : "director",
}: Props) {
  const defaultCenterId = centers[0]?.id ?? "";
  const defaultCenter = centers[0];
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultCenterId, defaultValuesForCenter(defaultCenterId, prefills), defaultCenter));
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const { active: printActive, generatedAt: printGeneratedAt, print: printReport } = usePrintableReport();

  const calculatedFte = useMemo(() => {
    const full = Number(form.fullTimeCount || 0);
    const part = Number(form.partTimeCount || 0);
    return Number.isFinite(full + part) ? calculateFteCount(full, part) : 0;
  }, [form.fullTimeCount, form.partTimeCount]);
  const calculatedTotalBilled = useMemo(() => {
    const selfPayer = Number(form.selfPayerBillAmount || 0);
    const subsidy = Number(form.subsidyBillAmount || 0);
    return Number.isFinite(selfPayer + subsidy) && (selfPayer || subsidy) ? roundedNumber(selfPayer + subsidy) : 0;
  }, [form.selfPayerBillAmount, form.subsidyBillAmount]);
  const ageGroupCount = useMemo(() => ageGroupTotal({
    infants: Number(form.infants || 0),
    toddlers: Number(form.toddlers || 0),
    twos: Number(form.twos || 0),
    preschool: Number(form.preschool || 0),
    preK: Number(form.preK || 0),
    schoolAge: Number(form.schoolAge || 0),
  }), [form.infants, form.toddlers, form.twos, form.preschool, form.preK, form.schoolAge]);
  const selectedCenter = centers.find((center) => center.id === form.centerId);
  const selectedPrefill = defaultValuesForCenter(form.centerId, prefills);
  const calculatedOccupancyPercent = useMemo(() => {
    const enrolled = Number(form.enrolledCount || 0);
    const capacity = Number(form.licenseCapacity || selectedPrefill?.licensedCapacity || selectedCenter?.licensedCapacity || 0);
    return capacity > 0 ? roundedNumber((enrolled / capacity) * 100) : 0;
  }, [form.enrolledCount, form.licenseCapacity, selectedCenter?.licensedCapacity, selectedPrefill?.licensedCapacity]);
  const calculatedPayrollPercent = useMemo(() => {
    const payrollAmount = Number(form.payrollAmount || 0);
    const totalBilled = Number(form.totalBilledAmount || calculatedTotalBilled || 0);
    return totalBilled > 0 ? roundedNumber((payrollAmount / totalBilled) * 100) : 0;
  }, [calculatedTotalBilled, form.payrollAmount, form.totalBilledAmount]);
  const currentWeekReport = reports.find((report) => (
    report.centerId === form.centerId && dateInput(report.weekStart) === form.weekStart
  ));

  function setField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setWeekStart(value: string) {
    setForm((current) => ({
      ...current,
      weekStart: value,
      weekEnd: defaultWeekEnd(value),
    }));
  }

  function setCenter(value: string | null) {
    if (!value) return;
    setStatusMessage("");
    setErrorMessage("");
    setForm(emptyForm(value, defaultValuesForCenter(value, prefills), centers.find((center) => center.id === value)));
  }

  function applyPrefill() {
    const prefill = defaultValuesForCenter(form.centerId, prefills);
    if (!prefill) return;
    const next = emptyForm(form.centerId, prefill, selectedCenter);
    setForm((current) => ({
      ...next,
      id: current.id,
      weekStart: current.weekStart,
      weekEnd: current.weekEnd,
      status: current.status,
      locationData: current.locationData,
      accountReceivableAmount: current.accountReceivableAmount,
      selfPayerBillAmount: current.selfPayerBillAmount,
      subsidyBillAmount: current.subsidyBillAmount,
      totalBilledAmount: current.totalBilledAmount,
      occupancyPercent: current.occupancyPercent,
      payrollAmount: current.payrollAmount,
      payrollPercent: current.payrollPercent,
      newStarts: current.newStarts,
      withdrawals: current.withdrawals,
      preregisteredChildren: current.preregisteredChildren,
    }));
  }

  function editReport(report: FteReportRow) {
    setStatusMessage("");
    setErrorMessage("");
    setForm({
      id: report.id,
      centerId: report.centerId,
      weekStart: dateInput(report.weekStart),
      weekEnd: dateInput(report.weekEnd) || defaultWeekEnd(dateInput(report.weekStart)),
      locationData: report.locationData ?? "",
      accountReceivableAmount: asOptionalInput(report.accountReceivableAmount),
      selfPayerBillAmount: asOptionalInput(report.selfPayerBillAmount),
      subsidyBillAmount: asOptionalInput(report.subsidyBillAmount),
      totalBilledAmount: asOptionalInput(report.totalBilledAmount),
      enrolledCount: asInput(report.enrolledCount),
      fullTimeCount: asInput(report.fullTimeCount),
      partTimeCount: asInput(report.partTimeCount),
      fteCount: report.fteCount ? String(report.fteCount) : "",
      licenseCapacity: asOptionalInput(report.licenseCapacity),
      occupancyPercent: asOptionalInput(report.occupancyPercent),
      payrollAmount: asOptionalInput(report.payrollAmount),
      payrollPercent: report.payrollPercent === null || report.payrollPercent === undefined ? "" : String(report.payrollPercent),
      newStarts: asOptionalInput(report.newStarts),
      withdrawals: asOptionalInput(report.withdrawals),
      preregisteredChildren: asOptionalInput(report.preregisteredChildren),
      infants: asInput(report.infants),
      toddlers: asInput(report.toddlers),
      twos: asInput(report.twos),
      preschool: asInput(report.preschool),
      preK: asInput(report.preK),
      schoolAge: asInput(report.schoolAge),
      status: mode === "executive" ? report.status : "submitted",
      notes: report.notes ?? "",
    });
  }

  function submit() {
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");

      const response = await fetch("/api/fte-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          status: mode === "executive" ? form.status : undefined,
          fteCount: form.fteCount || calculatedFte,
          totalBilledAmount: form.totalBilledAmount || calculatedTotalBilled || "",
          licenseCapacity: form.licenseCapacity || selectedPrefill?.licensedCapacity || selectedCenter?.licensedCapacity || "",
          occupancyPercent: form.occupancyPercent || calculatedOccupancyPercent || "",
          payrollPercent: form.payrollPercent || calculatedPayrollPercent || "",
          source: form.id ? "manual_correction" : "prefilled_director_review",
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; report?: { centerName?: string; weekStart?: string } } | null;

      if (!response.ok) {
        setErrorMessage(json?.error || "FTE report could not be saved.");
        return;
      }

      setStatusMessage(`FTE report saved${json?.report?.centerName ? ` for ${json.report.centerName}` : ""}.`);
      const nextCenterId = form.centerId || defaultCenterId;
      setForm(emptyForm(nextCenterId, defaultValuesForCenter(nextCenterId, prefills), centers.find((center) => center.id === nextCenterId)));
      window.setTimeout(() => window.location.reload(), 750);
    });
  }

  return (
    <Card className="glass-panel">
      <ReportPrintStyles />
      <PrintableReport active={printActive} label="Printable FTE report history">
        <header>
          <h1>{title}</h1>
          <p>Scope: {centers.length === 1 ? centers[0].name : `${centers.length.toLocaleString()} visible schools`}</p>
          <p>Selected school: {selectedCenter?.name ?? "Choose school"}</p>
          <p>Generated: {formatPrintDateTime(printGeneratedAt)}</p>
        </header>
        <h2>Current Entry Summary</h2>
        <table>
          <tbody>
            <tr><th>This week</th><td>{currentWeekReport ? "Submitted" : "Not submitted"}</td></tr>
            <tr><th>Calculated FTE</th><td>{calculatedFte.toLocaleString()}</td></tr>
            <tr><th>Age group total</th><td>{ageGroupCount.toLocaleString()}</td></tr>
            <tr><th>Total billed</th><td>{formatMoney(Number(form.totalBilledAmount || calculatedTotalBilled || 0) || null)}</td></tr>
            <tr><th>Payroll amount</th><td>{formatMoney(Number(form.payrollAmount || 0) || null)}</td></tr>
            <tr><th>Occupancy</th><td>{formatPercent(Number(form.occupancyPercent || calculatedOccupancyPercent || 0) || null)}</td></tr>
            <tr><th>Week</th><td>{form.weekStart || "Not set"} to {form.weekEnd || "Not set"}</td></tr>
          </tbody>
        </table>
        <h2>FTE Report History</h2>
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th>School</th>
              <th>FTE</th>
              <th>FT/PT</th>
              <th>Enrollment</th>
              <th>Total billed</th>
              <th>Payroll amount</th>
              <th>Status</th>
              <th>Payroll %</th>
              <th>Submitted by</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td>{dateInput(report.weekStart)}</td>
                <td>{report.centerName}</td>
                <td>{report.fteCount.toLocaleString()}</td>
                <td>{report.fullTimeCount.toLocaleString()} / {report.partTimeCount.toLocaleString()}</td>
                <td>{report.enrolledCount.toLocaleString()}</td>
                <td>{formatMoney(report.totalBilledAmount)}</td>
                <td>{formatMoney(report.payrollAmount)}</td>
                <td>{report.status.replaceAll("_", " ")}</td>
                <td>{formatPercent(report.payrollPercent)}</td>
                <td>{report.submittedBy ?? "Not set"}</td>
                <td>{dateInput(report.updatedAt)}</td>
              </tr>
            ))}
            {!reports.length ? <tr><td colSpan={11}>No FTE reports have been submitted for this scope yet.</td></tr> : null}
          </tbody>
        </table>
      </PrintableReport>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button variant="outline" onClick={printReport}>
            <Printer data-icon="inline-start" />
            Print FTE history
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {statusMessage ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Saved</AlertTitle>
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

        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
          <div className="rounded-xl border bg-background/50 p-4">
            <div className="text-xs text-muted-foreground">Selected school</div>
            <div className="mt-1 text-sm font-semibold">{selectedCenter?.name ?? "Choose school"}</div>
          </div>
          <div className="rounded-xl border bg-background/50 p-4">
            <div className="text-xs text-muted-foreground">This week</div>
            <div className="mt-1 text-sm font-semibold">{currentWeekReport ? "Submitted" : "Not submitted"}</div>
          </div>
          <div className="rounded-xl border bg-background/50 p-4">
            <div className="text-xs text-muted-foreground">Calculated FTE</div>
            <div className="mt-1 text-sm font-semibold">{calculatedFte.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border bg-background/50 p-4">
            <div className="text-xs text-muted-foreground">Age group total</div>
            <div className="mt-1 text-sm font-semibold">{ageGroupCount.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border bg-background/50 p-4">
            <div className="text-xs text-muted-foreground">Total billed</div>
            <div className="mt-1 text-sm font-semibold">{formatMoney(Number(form.totalBilledAmount || calculatedTotalBilled || 0) || null)}</div>
          </div>
          <div className="rounded-xl border bg-background/50 p-4">
            <div className="text-xs text-muted-foreground">Occupancy</div>
            <div className="mt-1 text-sm font-semibold">{formatPercent(Number(form.occupancyPercent || calculatedOccupancyPercent || 0) || null)}</div>
          </div>
        </div>

        {selectedPrefill ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Prefilled from current school records</AlertTitle>
            <AlertDescription>
              Enrollment and age groups were prefilled from active child records for {selectedCenter?.name ?? "this school"}.
              Licensed capacity is {selectedPrefill.licensedCapacity ?? selectedCenter?.licensedCapacity ?? "not set"}.
              {selectedPrefill.unknownScheduleCount
                ? ` ${selectedPrefill.unknownScheduleCount} child schedule(s) could not be classified as full-time or part-time, so verify those fields before submitting.`
                : " Verify the fields, enter payroll percentage if required, and submit."}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-4">
          <div className="space-y-1 lg:col-span-2">
            <Label>School</Label>
            <Select
              value={form.centerId}
              onValueChange={setCenter}
              disabled={!allowCenterSelect || centers.length <= 1}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose school">{selectedCenter?.name ?? "Choose school"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {centers.map((center) => (
                  <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fte-week-start">Week start</Label>
            <Input id="fte-week-start" type="date" value={form.weekStart} onChange={(event) => setWeekStart(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fte-week-end">Week end</Label>
            <Input id="fte-week-end" type="date" value={form.weekEnd} onChange={(event) => setField("weekEnd", event.target.value)} />
          </div>
          <div className="space-y-1 lg:col-span-2">
            <Label>Location data</Label>
            <Input value={form.locationData} onChange={(event) => setField("locationData", event.target.value)} placeholder="ABee Schools, franchised location, owner group..." />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>Enrolled children</Label>
            <Input value={form.enrolledCount} onChange={(event) => setField("enrolledCount", event.target.value)} inputMode="numeric" />
          </div>
          <div className="space-y-1">
            <Label>Full-time children</Label>
            <Input value={form.fullTimeCount} onChange={(event) => setField("fullTimeCount", event.target.value)} inputMode="numeric" />
          </div>
          <div className="space-y-1">
            <Label>Part-time children</Label>
            <Input value={form.partTimeCount} onChange={(event) => setField("partTimeCount", event.target.value)} inputMode="numeric" />
          </div>
          <div className="space-y-1">
            <Label>FTE count</Label>
            <Input
              value={form.fteCount}
              onChange={(event) => setField("fteCount", event.target.value)}
              inputMode="decimal"
              placeholder={calculatedFte ? `Calculated ${calculatedFte}` : "Optional"}
            />
          </div>
          <div className="space-y-1">
            <Label>Payroll %</Label>
            <Input
              value={form.payrollPercent}
              onChange={(event) => setField("payrollPercent", event.target.value)}
              inputMode="decimal"
              placeholder={calculatedPayrollPercent ? `Calculated ${calculatedPayrollPercent}` : "Enter if not available"}
            />
          </div>
        </div>

        <div className="grid gap-3 rounded-xl border bg-background/35 p-4">
          <div>
            <div className="text-sm font-semibold">Legacy FTE report fields</div>
            <p className="text-xs text-muted-foreground">
              These match the pre-Bee Suite report columns: receivables, billed amounts, capacity, occupancy, payroll, starts, withdrawals, and preregistration.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label>Accounts receivable</Label>
              <Input value={form.accountReceivableAmount} onChange={(event) => setField("accountReceivableAmount", event.target.value)} inputMode="decimal" placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>Self-payer billed</Label>
              <Input value={form.selfPayerBillAmount} onChange={(event) => setField("selfPayerBillAmount", event.target.value)} inputMode="decimal" placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>Subsidy billed</Label>
              <Input value={form.subsidyBillAmount} onChange={(event) => setField("subsidyBillAmount", event.target.value)} inputMode="decimal" placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>Total billed</Label>
              <Input
                value={form.totalBilledAmount}
                onChange={(event) => setField("totalBilledAmount", event.target.value)}
                inputMode="decimal"
                placeholder={calculatedTotalBilled ? `Calculated ${calculatedTotalBilled}` : "0.00"}
              />
            </div>
            <div className="space-y-1">
              <Label>License capacity</Label>
              <Input value={form.licenseCapacity} onChange={(event) => setField("licenseCapacity", event.target.value)} inputMode="numeric" placeholder="Capacity" />
            </div>
            <div className="space-y-1">
              <Label>Occupancy %</Label>
              <Input
                value={form.occupancyPercent}
                onChange={(event) => setField("occupancyPercent", event.target.value)}
                inputMode="decimal"
                placeholder={calculatedOccupancyPercent ? `Calculated ${calculatedOccupancyPercent}` : "0"}
              />
            </div>
            <div className="space-y-1">
              <Label>Payroll amount</Label>
              <Input value={form.payrollAmount} onChange={(event) => setField("payrollAmount", event.target.value)} inputMode="decimal" placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>New starts</Label>
              <Input value={form.newStarts} onChange={(event) => setField("newStarts", event.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <Label>Withdrawals</Label>
              <Input value={form.withdrawals} onChange={(event) => setField("withdrawals", event.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <Label>Children preregistered</Label>
              <Input value={form.preregisteredChildren} onChange={(event) => setField("preregisteredChildren", event.target.value)} inputMode="numeric" />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["infants", "Infants"],
            ["toddlers", "Toddlers"],
            ["twos", "Twos"],
            ["preschool", "Preschool"],
            ["preK", "Pre-K"],
            ["schoolAge", "School age"],
          ].map(([field, label]) => (
            <div key={field} className="space-y-1">
              <Label>{label}</Label>
              <Input
                value={form[field as keyof FormState]}
                onChange={(event) => setField(field as keyof FormState, event.target.value)}
                inputMode="numeric"
              />
            </div>
          ))}
        </div>

        <div className={mode === "executive" ? "grid gap-3 md:grid-cols-[14rem_1fr]" : "grid gap-3"}>
          {mode === "executive" ? (
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => value && setField("status", value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="corrected">Corrected</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="Optional context or correction notes" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={isPending || !form.centerId || !form.weekStart} onClick={submit}>
            <Save data-icon="inline-start" />
            {form.id ? "Save FTE Correction" : "Submit FTE Report"}
          </Button>
          {form.id ? (
            <Button
              variant="outline"
              onClick={() => {
                const nextCenterId = form.centerId || defaultCenterId;
                setForm(emptyForm(nextCenterId, defaultValuesForCenter(nextCenterId, prefills), centers.find((center) => center.id === nextCenterId)));
              }}
            >
              Cancel edit
            </Button>
          ) : null}
          {selectedPrefill ? (
            <Button variant="outline" onClick={applyPrefill}>Reset to school data</Button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            Prefilled values are editable. Calculated FTE uses full-time + half of part-time unless manually overridden. Directors can only submit for their assigned school.
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>School</TableHead>
                <TableHead>FTE</TableHead>
                <TableHead>FT/PT</TableHead>
                <TableHead>Enrollment</TableHead>
                <TableHead>Total billed</TableHead>
                <TableHead>Payroll amount</TableHead>
                <TableHead>Starts/withdrawn</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payroll %</TableHead>
                <TableHead>Submitted by</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.slice(0, 12).map((report) => (
                <TableRow key={report.id}>
                  <TableCell>{dateInput(report.weekStart)}</TableCell>
                  <TableCell>{report.centerName}</TableCell>
                  <TableCell>{report.fteCount.toLocaleString()}</TableCell>
                  <TableCell>{report.fullTimeCount.toLocaleString()} / {report.partTimeCount.toLocaleString()}</TableCell>
                  <TableCell>{report.enrolledCount.toLocaleString()}</TableCell>
                  <TableCell>{formatMoney(report.totalBilledAmount)}</TableCell>
                  <TableCell>{formatMoney(report.payrollAmount)}</TableCell>
                  <TableCell>{report.newStarts ?? 0} / {report.withdrawals ?? 0}</TableCell>
                  <TableCell>{report.status.replaceAll("_", " ")}</TableCell>
                  <TableCell>{formatPercent(report.payrollPercent)}</TableCell>
                  <TableCell>{report.submittedBy ?? "Not set"}</TableCell>
                  <TableCell>{dateInput(report.updatedAt)}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => editReport(report)}>Edit</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!reports.length ? (
                <TableRow>
                    <TableCell colSpan={13} className="text-muted-foreground">
                    No FTE reports have been submitted for this scope yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
