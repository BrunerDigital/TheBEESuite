"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";
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
  notes: string | null;
  submittedBy: string | null;
  updatedAt: string;
};

type Props = {
  centers: FteReportCenterOption[];
  reports: FteReportRow[];
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

function emptyForm(centerId = ""): FormState {
  const weekStart = defaultWeekStart();
  return {
    id: "",
    centerId,
    weekStart,
    weekEnd: defaultWeekEnd(weekStart),
    enrolledCount: "",
    fullTimeCount: "",
    partTimeCount: "",
    fteCount: "",
    infants: "",
    toddlers: "",
    twos: "",
    preschool: "",
    preK: "",
    schoolAge: "",
    status: "submitted",
    notes: "",
  };
}

function asInput(value: number) {
  return value ? String(value) : "";
}

export function FteReportForm({
  centers,
  reports,
  title = "Weekly FTE Report",
  description = "Submit or edit the weekly full-time-equivalent report for the selected school.",
  allowCenterSelect = false,
  mode = allowCenterSelect ? "executive" : "director",
}: Props) {
  const defaultCenterId = centers[0]?.id ?? "";
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultCenterId));
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

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
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; report?: { centerName?: string; weekStart?: string } } | null;

      if (!response.ok) {
        setErrorMessage(json?.error || "FTE report could not be saved.");
        return;
      }

      setStatusMessage(`FTE report saved${json?.report?.centerName ? ` for ${json.report.centerName}` : ""}.`);
      setForm(emptyForm(form.centerId || defaultCenterId));
      window.setTimeout(() => window.location.reload(), 750);
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
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

        <div className="grid gap-3 lg:grid-cols-4">
          <div className="space-y-1 lg:col-span-2">
            <Label>School</Label>
            <Select
              value={form.centerId}
              onValueChange={(value) => value && setField("centerId", value)}
              disabled={!allowCenterSelect || centers.length <= 1}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose school" /></SelectTrigger>
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
            <Button variant="outline" onClick={() => setForm(emptyForm(form.centerId || defaultCenterId))}>Cancel edit</Button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            Calculated FTE uses full-time + half of part-time unless manually overridden. Directors can only submit for their assigned school.
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
                  <TableCell>{report.submittedBy ?? "Not set"}</TableCell>
                  <TableCell>{dateInput(report.updatedAt)}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => editReport(report)}>Edit</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!reports.length ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground">
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
