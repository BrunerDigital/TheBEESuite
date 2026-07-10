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
};

export type FteReportRow = {
  id: string;
  centerId: string;
  centerName: string;
  weekStart: string;
  weekEnd: string | null;
  enrolledCount: number;
  fullTimeCount: number;
  partTimeCount: number;
  fteCount: number;
  infants: number;
  toddlers: number;
  twos: number;
  preschool: number;
  preK: number;
  schoolAge: number;
  status: string;
  source: string;
  payrollPercent?: number | null;
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
  enrolledCount: string;
  fullTimeCount: string;
  partTimeCount: string;
  fteCount: string;
  payrollPercent: string;
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

function emptyForm(centerId = "", prefill?: FteReportPrefill): FormState {
  const weekStart = defaultWeekStart();
  return {
    id: "",
    centerId,
    weekStart,
    weekEnd: defaultWeekEnd(weekStart),
    enrolledCount: prefill ? asInput(prefill.enrolledCount) : "",
    fullTimeCount: prefill?.fullTimeCount === null || prefill?.fullTimeCount === undefined ? "" : asInput(prefill.fullTimeCount),
    partTimeCount: prefill?.partTimeCount === null || prefill?.partTimeCount === undefined ? "" : asInput(prefill.partTimeCount),
    fteCount: "",
    payrollPercent: "",
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
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultCenterId, defaultValuesForCenter(defaultCenterId, prefills)));
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const { active: printActive, generatedAt: printGeneratedAt, print: printReport } = usePrintableReport();

  const calculatedFte = useMemo(() => {
    const full = Number(form.fullTimeCount || 0);
    const part = Number(form.partTimeCount || 0);
    return Number.isFinite(full + part) ? calculateFteCount(full, part) : 0;
  }, [form.fullTimeCount, form.partTimeCount]);
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
    setForm(emptyForm(value, defaultValuesForCenter(value, prefills)));
  }

  function applyPrefill() {
    const prefill = defaultValuesForCenter(form.centerId, prefills);
    if (!prefill) return;
    const next = emptyForm(form.centerId, prefill);
    setForm((current) => ({
      ...next,
      id: current.id,
      weekStart: current.weekStart,
      weekEnd: current.weekEnd,
      status: current.status,
      payrollPercent: current.payrollPercent,
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
      enrolledCount: asInput(report.enrolledCount),
      fullTimeCount: asInput(report.fullTimeCount),
      partTimeCount: asInput(report.partTimeCount),
      fteCount: report.fteCount ? String(report.fteCount) : "",
      payrollPercent: report.payrollPercent === null || report.payrollPercent === undefined ? "" : String(report.payrollPercent),
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
          source: form.id ? "manual_correction" : "prefilled_director_review",
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; report?: { centerName?: string; weekStart?: string } } | null;

      if (!response.ok) {
        setErrorMessage(json?.error || "FTE report could not be saved.");
        return;
      }

      setStatusMessage(`FTE report saved${json?.report?.centerName ? ` for ${json.report.centerName}` : ""}.`);
      setForm(emptyForm(form.centerId || defaultCenterId, defaultValuesForCenter(form.centerId || defaultCenterId, prefills)));
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
                <td>{report.status.replaceAll("_", " ")}</td>
                <td>{report.payrollPercent === null || report.payrollPercent === undefined ? "Not set" : `${report.payrollPercent}%`}</td>
                <td>{report.submittedBy ?? "Not set"}</td>
                <td>{dateInput(report.updatedAt)}</td>
              </tr>
            ))}
            {!reports.length ? <tr><td colSpan={9}>No FTE reports have been submitted for this scope yet.</td></tr> : null}
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

        <div className="grid gap-3 md:grid-cols-4">
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
              placeholder="Enter if not available"
            />
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
            <Button variant="outline" onClick={() => setForm(emptyForm(form.centerId || defaultCenterId, defaultValuesForCenter(form.centerId || defaultCenterId, prefills)))}>Cancel edit</Button>
          ) : null}
          {selectedPrefill ? (
            <Button variant="outline" onClick={applyPrefill}>Reset to school data</Button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            Prefilled values are editable. Calculated FTE uses full-time + half of part-time unless manually overridden. Directors can only submit for their assigned school.
          </span>
        </div>

        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>School</TableHead>
                <TableHead>FTE</TableHead>
                <TableHead>FT/PT</TableHead>
                <TableHead>Enrollment</TableHead>
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
                  <TableCell>{report.status.replaceAll("_", " ")}</TableCell>
                  <TableCell>{report.payrollPercent === null || report.payrollPercent === undefined ? "Not set" : `${report.payrollPercent}%`}</TableCell>
                  <TableCell>{report.submittedBy ?? "Not set"}</TableCell>
                  <TableCell>{dateInput(report.updatedAt)}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => editReport(report)}>Edit</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!reports.length ? (
                <TableRow>
                    <TableCell colSpan={10} className="text-muted-foreground">
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
