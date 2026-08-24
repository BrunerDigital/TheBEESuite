"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Printer, RefreshCw, Save } from "lucide-react";
import { formatPrintDateTime, PrintableReport, ReportPrintStyles, usePrintableReport } from "@/components/printable-report";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ageGroupTotal,
  calculateScheduledDaysFte,
  dateInputString,
  defaultFteWeekEnd,
  scheduledDayBreakdownTotal,
  startOfFteWeek,
} from "@/lib/fte-report-guardrails";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";

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
  twoDayCount?: number | null;
  threeDayCount?: number | null;
  fourDayCount?: number | null;
  fiveDayCount?: number | null;
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
  twoDayCount: number;
  threeDayCount: number;
  fourDayCount: number;
  fiveDayCount: number;
  unknownScheduleCount: number;
  missingScheduleChildren: Array<{
    id: string;
    fullName: string;
    classroomName: string | null;
  }>;
  infants: number;
  toddlers: number;
  twos: number;
  preschool: number;
  preK: number;
  schoolAge: number;
  accountReceivableAmount: number | null;
  accountReceivableReviewRequired: boolean;
  selfPayerBillAmount: number;
  subsidyBillAmount: number;
  totalBilledAmount: number;
  payrollAmount: number | null;
  payrollPercent: number | null;
  newStarts: number;
  withdrawals: number;
  preregisteredChildren: number;
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
  twoDayCount: string;
  threeDayCount: string;
  fourDayCount: string;
  fiveDayCount: string;
  scheduledDayBreakdown: boolean;
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
    accountReceivableAmount: asOptionalInput(prefill?.accountReceivableAmount),
    selfPayerBillAmount: asOptionalInput(prefill?.selfPayerBillAmount),
    subsidyBillAmount: asOptionalInput(prefill?.subsidyBillAmount),
    totalBilledAmount: asOptionalInput(prefill?.totalBilledAmount),
    enrolledCount: prefill ? asInput(prefill.enrolledCount) : "",
    fullTimeCount: prefill?.fullTimeCount === null || prefill?.fullTimeCount === undefined ? "" : asInput(prefill.fullTimeCount),
    partTimeCount: prefill?.partTimeCount === null || prefill?.partTimeCount === undefined ? "" : asInput(prefill.partTimeCount),
    twoDayCount: prefill ? asInput(prefill.twoDayCount) : "",
    threeDayCount: prefill ? asInput(prefill.threeDayCount) : "",
    fourDayCount: prefill ? asInput(prefill.fourDayCount) : "",
    fiveDayCount: prefill ? asInput(prefill.fiveDayCount) : "",
    scheduledDayBreakdown: Boolean(prefill),
    fteCount: "",
    licenseCapacity: asOptionalInput(prefill?.licensedCapacity ?? center?.licensedCapacity ?? null),
    occupancyPercent: "",
    payrollAmount: asOptionalInput(prefill?.payrollAmount),
    payrollPercent: asOptionalInput(prefill?.payrollPercent),
    newStarts: asOptionalInput(prefill?.newStarts),
    withdrawals: asOptionalInput(prefill?.withdrawals),
    preregisteredChildren: asOptionalInput(prefill?.preregisteredChildren),
    infants: prefill ? asInput(prefill.infants) : "",
    toddlers: prefill ? asInput(prefill.toddlers) : "",
    twos: prefill ? asInput(prefill.twos) : "",
    preschool: prefill ? asInput(prefill.preschool) : "",
    preK: prefill ? asInput(prefill.preK) : "",
    schoolAge: prefill ? asInput(prefill.schoolAge) : "",
    status: "submitted",
    notes: prefill?.unknownScheduleCount
      ? `${prefill.unknownScheduleCount} child schedule(s) need a 2–5 day weekly schedule verification.`
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

function countInputValue(value: string) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
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
  const router = useRouter();
  const timeZone = useSchoolTimeZone();
  const fieldIdPrefix = useId();
  const defaultCenterId = centers[0]?.id ?? "";
  const defaultCenter = centers[0];
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultCenterId, defaultValuesForCenter(defaultCenterId, prefills), defaultCenter));
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isRefreshingLiveData, startLiveDataRefresh] = useTransition();
  const liveDataRefresh = useRef<{ centerId: string; generatedAt: string | null } | null>(null);
  const { active: printActive, generatedAt: printGeneratedAt, print: printReport } = usePrintableReport();

  const scheduledDayCounts = useMemo(() => ({
    twoDayCount: countInputValue(form.twoDayCount),
    threeDayCount: countInputValue(form.threeDayCount),
    fourDayCount: countInputValue(form.fourDayCount),
    fiveDayCount: countInputValue(form.fiveDayCount),
  }), [form.twoDayCount, form.threeDayCount, form.fourDayCount, form.fiveDayCount]);
  const hasScheduledDayBreakdown = form.scheduledDayBreakdown;
  const calculatedFte = useMemo(() => {
    const values = Object.values(scheduledDayCounts);
    return values.every(Number.isFinite) ? calculateScheduledDaysFte(scheduledDayCounts) : 0;
  }, [scheduledDayCounts]);
  const scheduledChildrenCount = useMemo(
    () => scheduledDayBreakdownTotal(scheduledDayCounts),
    [scheduledDayCounts],
  );
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
  const isHistoricalReportingWeek = form.weekStart !== defaultWeekStart();

  useEffect(() => {
    const requested = liveDataRefresh.current;
    if (!requested) return;
    const refreshedPrefill = defaultValuesForCenter(requested.centerId, prefills);
    if (!refreshedPrefill || refreshedPrefill.generatedAt === requested.generatedAt) return;
    const refreshedCenter = centers.find((center) => center.id === requested.centerId);
    if (form.centerId !== requested.centerId || form.weekStart !== defaultWeekStart()) {
      liveDataRefresh.current = null;
      setStatusMessage("Live data refresh was canceled because the school or reporting week changed.");
      return;
    }
    setForm((current) => {
      if (current.centerId !== requested.centerId) return current;
      if (current.weekStart !== defaultWeekStart()) return current;
      const refreshed = emptyForm(requested.centerId, refreshedPrefill, refreshedCenter);
      return {
        ...refreshed,
        id: current.id,
        weekStart: current.weekStart,
        weekEnd: current.weekEnd,
        fteCount: "",
        status: current.status,
        locationData: current.locationData,
        notes: current.notes,
      };
    });
    liveDataRefresh.current = null;
    setStatusMessage(`Live school data refreshed for ${refreshedCenter?.name ?? "the selected school"}.`);
  }, [centers, form.centerId, form.weekStart, prefills]);

  function setField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setScheduledDayField(field: "twoDayCount" | "threeDayCount" | "fourDayCount" | "fiveDayCount", value: string) {
    setForm((current) => ({ ...current, [field]: value, scheduledDayBreakdown: true, fteCount: "" }));
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
      twoDayCount: report.twoDayCount === null || report.twoDayCount === undefined ? "" : asInput(report.twoDayCount),
      threeDayCount: report.threeDayCount === null || report.threeDayCount === undefined ? "" : asInput(report.threeDayCount),
      fourDayCount: report.fourDayCount === null || report.fourDayCount === undefined ? "" : asInput(report.fourDayCount),
      fiveDayCount: report.fiveDayCount === null || report.fiveDayCount === undefined ? "" : asInput(report.fiveDayCount),
      scheduledDayBreakdown: [report.twoDayCount, report.threeDayCount, report.fourDayCount, report.fiveDayCount]
        .some((value) => value !== null && value !== undefined),
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
    if (isRefreshingLiveData) {
      setStatusMessage("");
      setErrorMessage("Wait for the live school data refresh to finish before submitting.");
      return;
    }
    const reviewedAccountReceivable = Number(form.accountReceivableAmount);
    if (selectedPrefill?.accountReceivableReviewRequired
      && (!form.accountReceivableAmount.trim() || !Number.isFinite(reviewedAccountReceivable) || reviewedAccountReceivable < 0)) {
      setStatusMessage("");
      setErrorMessage("Past-due accounts receivable could not be safely prefilled. Enter a verified nonnegative AR amount before submitting.");
      return;
    }
    if (hasScheduledDayBreakdown && scheduledChildrenCount !== Number(form.enrolledCount)) {
      setStatusMessage("");
      setErrorMessage("The 2–5 day schedule counts must account for every enrolled child before submitting.");
      return;
    }
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");

      const response = await fetch("/api/fte-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          accountReceivableReviewRequired: selectedPrefill?.accountReceivableReviewRequired === true,
          twoDayCount: hasScheduledDayBreakdown ? scheduledDayCounts.twoDayCount : "",
          threeDayCount: hasScheduledDayBreakdown ? scheduledDayCounts.threeDayCount : "",
          fourDayCount: hasScheduledDayBreakdown ? scheduledDayCounts.fourDayCount : "",
          fiveDayCount: hasScheduledDayBreakdown ? scheduledDayCounts.fiveDayCount : "",
          fullTimeCount: hasScheduledDayBreakdown ? scheduledDayCounts.fiveDayCount : form.fullTimeCount,
          partTimeCount: hasScheduledDayBreakdown
            ? scheduledDayCounts.twoDayCount + scheduledDayCounts.threeDayCount + scheduledDayCounts.fourDayCount
            : form.partTimeCount,
          status: mode === "executive" ? form.status : undefined,
          fteCount: form.fteCount || (hasScheduledDayBreakdown ? calculatedFte : ""),
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

      setStatusMessage(
        `FTE report saved${json?.report?.centerName ? ` for ${json.report.centerName}` : ""}`
        + `${json?.report?.weekStart ? ` for the selected week of ${dateInput(json.report.weekStart)}` : ""}.`,
      );
      const nextCenterId = form.centerId || defaultCenterId;
      setForm(emptyForm(nextCenterId, defaultValuesForCenter(nextCenterId, prefills), centers.find((center) => center.id === nextCenterId)));
      window.setTimeout(() => window.location.reload(), 750);
    });
  }

  function refreshLiveSchoolData() {
    if (isHistoricalReportingWeek) return;
    liveDataRefresh.current = {
      centerId: form.centerId,
      generatedAt: selectedPrefill?.generatedAt ?? null,
    };
    startLiveDataRefresh(() => router.refresh());
  }

  return (
    <Card>
      <ReportPrintStyles />
      <PrintableReport active={printActive} label="Printable FTE report history">
        <header>
          <h1>{title}</h1>
          <p>Scope: {centers.length === 1 ? centers[0].name : `${centers.length.toLocaleString()} visible schools`}</p>
          <p>Selected school: {selectedCenter?.name ?? "Choose school"}</p>
          <p>Generated: {formatPrintDateTime(printGeneratedAt, timeZone)}</p>
        </header>
        <h2>Current Entry Summary</h2>
        <table>
          <tbody>
            <tr><th>This week</th><td>{currentWeekReport ? "Submitted" : "Not submitted"}</td></tr>
            <tr><th>Calculated FTE</th><td>{calculatedFte.toLocaleString()}</td></tr>
            <tr><th>Scheduled days</th><td>2-day: {scheduledDayCounts.twoDayCount}; 3-day: {scheduledDayCounts.threeDayCount}; 4-day: {scheduledDayCounts.fourDayCount}; 5-day: {scheduledDayCounts.fiveDayCount}</td></tr>
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
            <CardTitle as="h2">{title}</CardTitle>
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
              Enrollment, age groups, weekly billing, receivables, payroll estimates, and enrollment movement were prefilled from live school records for {selectedCenter?.name ?? "this school"}.
              Licensed capacity is {selectedPrefill.licensedCapacity ?? selectedCenter?.licensedCapacity ?? "not set"}.
              {selectedPrefill.unknownScheduleCount
                ? ` ${selectedPrefill.unknownScheduleCount} child schedule(s) need an exact 2–5 day weekly schedule, so verify the day counts before submitting.`
                : " Verify the fields, enter payroll percentage if required, and submit."}
              {selectedPrefill.missingScheduleChildren.length ? (
                <span className="mt-2 block">
                  Missing weekly day counts: {selectedPrefill.missingScheduleChildren
                    .map((child) => `${child.fullName}${child.classroomName ? ` (${child.classroomName})` : ""}`)
                    .join(", ")}.
                </span>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={isRefreshingLiveData || isHistoricalReportingWeek}
                onClick={refreshLiveSchoolData}
                title={isHistoricalReportingWeek ? "Live data refresh is available only for the current reporting week." : undefined}
              >
                <RefreshCw className={isRefreshingLiveData ? "animate-spin" : ""} data-icon="inline-start" />
                {isRefreshingLiveData ? "Refreshing live data…" : "Refresh live school data"}
              </Button>
              {isHistoricalReportingWeek ? (
                <span className="mt-2 block">Live data refresh is disabled while editing a historical report.</span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {selectedPrefill?.accountReceivableReviewRequired ? (
          <Alert variant="destructive">
            <AlertTitle>Past-due AR must be verified</AlertTitle>
            <AlertDescription>
              Ledger history exceeded the safe prefill limit. Enter the verified past-due current-family AR amount before submitting this report.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-4">
          <div className="space-y-1 lg:col-span-2">
            <Label htmlFor={`${fieldIdPrefix}-school`}>School</Label>
            <Select
              value={form.centerId}
              onValueChange={setCenter}
              disabled={!allowCenterSelect || centers.length <= 1}
            >
              <SelectTrigger id={`${fieldIdPrefix}-school`} className="w-full">
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
            <Label htmlFor={`${fieldIdPrefix}-week-start`}>Week start</Label>
            <Input id={`${fieldIdPrefix}-week-start`} type="date" value={form.weekStart} onChange={(event) => setWeekStart(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${fieldIdPrefix}-week-end`}>Week end</Label>
            <Input id={`${fieldIdPrefix}-week-end`} type="date" value={form.weekEnd} onChange={(event) => setField("weekEnd", event.target.value)} />
          </div>
          <div className="space-y-1 lg:col-span-2">
            <Label htmlFor={`${fieldIdPrefix}-location-data`}>Location data</Label>
            <Input id={`${fieldIdPrefix}-location-data`} value={form.locationData} onChange={(event) => setField("locationData", event.target.value)} placeholder="ABee Schools, franchised location, owner group..." />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1">
            <Label htmlFor={`${fieldIdPrefix}-enrolled-count`}>Enrolled children</Label>
            <Input id={`${fieldIdPrefix}-enrolled-count`} value={form.enrolledCount} onChange={(event) => setField("enrolledCount", event.target.value)} inputMode="numeric" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${fieldIdPrefix}-two-day-count`}>2 days/week</Label>
            <Input id={`${fieldIdPrefix}-two-day-count`} value={form.twoDayCount} onChange={(event) => setScheduledDayField("twoDayCount", event.target.value)} type="number" inputMode="numeric" min="0" step="1" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${fieldIdPrefix}-three-day-count`}>3 days/week</Label>
            <Input id={`${fieldIdPrefix}-three-day-count`} value={form.threeDayCount} onChange={(event) => setScheduledDayField("threeDayCount", event.target.value)} type="number" inputMode="numeric" min="0" step="1" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${fieldIdPrefix}-four-day-count`}>4 days/week</Label>
            <Input id={`${fieldIdPrefix}-four-day-count`} value={form.fourDayCount} onChange={(event) => setScheduledDayField("fourDayCount", event.target.value)} type="number" inputMode="numeric" min="0" step="1" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${fieldIdPrefix}-five-day-count`}>5 days/week</Label>
            <Input id={`${fieldIdPrefix}-five-day-count`} value={form.fiveDayCount} onChange={(event) => setScheduledDayField("fiveDayCount", event.target.value)} type="number" inputMode="numeric" min="0" step="1" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${fieldIdPrefix}-fte-count`}>FTE count</Label>
            <Input
              id={`${fieldIdPrefix}-fte-count`}
              value={form.fteCount}
              onChange={(event) => setField("fteCount", event.target.value)}
              inputMode="decimal"
              placeholder={calculatedFte ? `Calculated ${calculatedFte}` : "Optional"}
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-6">
            {scheduledChildrenCount.toLocaleString()} children have a selected weekly day count. Each child contributes scheduled days ÷ 5: two days = 0.4, three = 0.6, four = 0.8, and five = 1.0 FTE.
          </p>
          <div className="space-y-1">
            <Label htmlFor={`${fieldIdPrefix}-payroll-percent`}>Payroll %</Label>
            <Input
              id={`${fieldIdPrefix}-payroll-percent`}
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
              These match the pre-Bee Suite report columns. Accounts receivable includes only remaining past-due amounts for currently enrolled families; invoices due today or later and past-family debt are excluded.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor={`${fieldIdPrefix}-accounts-receivable`}>Past-due current-family AR</Label>
              <Input id={`${fieldIdPrefix}-accounts-receivable`} value={form.accountReceivableAmount} onChange={(event) => setField("accountReceivableAmount", event.target.value)} inputMode="decimal" placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${fieldIdPrefix}-self-payer-billed`}>Self-payer billed</Label>
              <Input id={`${fieldIdPrefix}-self-payer-billed`} value={form.selfPayerBillAmount} onChange={(event) => setField("selfPayerBillAmount", event.target.value)} inputMode="decimal" placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${fieldIdPrefix}-subsidy-billed`}>Subsidy billed</Label>
              <Input id={`${fieldIdPrefix}-subsidy-billed`} value={form.subsidyBillAmount} onChange={(event) => setField("subsidyBillAmount", event.target.value)} inputMode="decimal" placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${fieldIdPrefix}-total-billed`}>Total billed</Label>
              <Input
                id={`${fieldIdPrefix}-total-billed`}
                value={form.totalBilledAmount}
                onChange={(event) => setField("totalBilledAmount", event.target.value)}
                inputMode="decimal"
                placeholder={calculatedTotalBilled ? `Calculated ${calculatedTotalBilled}` : "0.00"}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${fieldIdPrefix}-license-capacity`}>License capacity</Label>
              <Input id={`${fieldIdPrefix}-license-capacity`} value={form.licenseCapacity} onChange={(event) => setField("licenseCapacity", event.target.value)} inputMode="numeric" placeholder="Capacity" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${fieldIdPrefix}-occupancy-percent`}>Occupancy %</Label>
              <Input
                id={`${fieldIdPrefix}-occupancy-percent`}
                value={form.occupancyPercent}
                onChange={(event) => setField("occupancyPercent", event.target.value)}
                inputMode="decimal"
                placeholder={calculatedOccupancyPercent ? `Calculated ${calculatedOccupancyPercent}` : "0"}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${fieldIdPrefix}-payroll-amount`}>Payroll amount</Label>
              <Input id={`${fieldIdPrefix}-payroll-amount`} value={form.payrollAmount} onChange={(event) => setField("payrollAmount", event.target.value)} inputMode="decimal" placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${fieldIdPrefix}-new-starts`}>New starts</Label>
              <Input id={`${fieldIdPrefix}-new-starts`} value={form.newStarts} onChange={(event) => setField("newStarts", event.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${fieldIdPrefix}-withdrawals`}>Withdrawals</Label>
              <Input id={`${fieldIdPrefix}-withdrawals`} value={form.withdrawals} onChange={(event) => setField("withdrawals", event.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${fieldIdPrefix}-preregistered`}>Children preregistered</Label>
              <Input id={`${fieldIdPrefix}-preregistered`} value={form.preregisteredChildren} onChange={(event) => setField("preregisteredChildren", event.target.value)} inputMode="numeric" />
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
              <Label htmlFor={`${fieldIdPrefix}-${field}`}>{label}</Label>
              <Input
                id={`${fieldIdPrefix}-${field}`}
                value={String(form[field as keyof FormState])}
                onChange={(event) => setField(field as keyof FormState, event.target.value)}
                inputMode="numeric"
              />
            </div>
          ))}
        </div>

        <div className={mode === "executive" ? "grid gap-3 md:grid-cols-[14rem_1fr]" : "grid gap-3"}>
          {mode === "executive" ? (
            <div className="space-y-1">
              <Label htmlFor={`${fieldIdPrefix}-status`}>Status</Label>
              <Select value={form.status} onValueChange={(value) => value && setField("status", value)}>
                <SelectTrigger id={`${fieldIdPrefix}-status`} className="w-full"><SelectValue /></SelectTrigger>
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
            <Label htmlFor={`${fieldIdPrefix}-notes`}>Notes</Label>
            <Textarea id={`${fieldIdPrefix}-notes`} value={form.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="Optional context or correction notes" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button aria-busy={isPending} disabled={isPending || isRefreshingLiveData || !form.centerId || !form.weekStart} onClick={submit}>
            <Save data-icon="inline-start" />
            {isPending ? "Saving FTE report..." : form.id ? "Save FTE Correction" : "Submit FTE Report"}
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
            Prefilled values are editable. Calculated FTE uses scheduled days ÷ 5 unless manually overridden. Directors can only submit for their assigned school.
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-10"
                      aria-label={`Edit FTE report for ${report.centerName}, week of ${dateInput(report.weekStart)}`}
                      onClick={() => editReport(report)}
                    >
                      Edit
                    </Button>
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
