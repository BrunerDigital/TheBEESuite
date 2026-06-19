"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRightLeft, CheckCircle2, Pencil, UserMinus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { evaluateClassroomRatio } from "@/lib/classroom-ratios";

export type ClassroomAssignmentClassroom = {
  id: string;
  centerId: string;
  name: string;
  ageGroup: string;
  capacity: number;
  ratioRule: string | null;
  _count: { children: number; staff: number; dailyReports: number; incidents: number };
  center: { name: string; crmLocationId: string | null };
};

export type ClassroomAssignmentStaff = {
  id: string;
  centerId: string;
  classroomId: string | null;
  title: string;
  user: { name: string; email: string; isActive: boolean };
  classroom: { id: string; name: string } | null;
};

type Props = {
  classrooms: ClassroomAssignmentClassroom[];
  staff: ClassroomAssignmentStaff[];
  demoMode?: boolean;
};

const alertStatuses = new Set(["over_capacity", "over_ratio", "missing_staff"]);

function staffLabel(staff: ClassroomAssignmentStaff) {
  return `${staff.user.name} · ${staff.classroom?.name ?? "Unassigned"}`;
}

function openClassroomEditor(classroomId: string) {
  window.dispatchEvent(new CustomEvent("bee-suite:edit-classroom", { detail: { classroomId } }));
}

export function ClassroomRatioAssignmentPanel({ classrooms, staff, demoMode = false }: Props) {
  const router = useRouter();
  const ratioRows = useMemo(
    () => classrooms.map((classroom) => ({
      classroom,
      warning: evaluateClassroomRatio({
        children: classroom._count.children,
        staff: classroom._count.staff,
        capacity: classroom.capacity,
        ratioRule: classroom.ratioRule,
      }),
    })),
    [classrooms],
  );
  const firstActionRoom = ratioRows.find((row) => alertStatuses.has(row.warning.status)) ?? ratioRows.find((row) => row.warning.status === "near_limit") ?? ratioRows[0];
  const [selectedClassroomId, setSelectedClassroomId] = useState(firstActionRoom?.classroom.id ?? "");
  const selectedClassroom = classrooms.find((classroom) => classroom.id === selectedClassroomId) ?? firstActionRoom?.classroom ?? classrooms[0] ?? null;
  const selectedRatio = selectedClassroom
    ? evaluateClassroomRatio({
        children: selectedClassroom._count.children,
        staff: selectedClassroom._count.staff,
        capacity: selectedClassroom.capacity,
        ratioRule: selectedClassroom.ratioRule,
      })
    : null;
  const eligibleStaff = useMemo(
    () => staff.filter((teacher) => teacher.user.isActive && (!selectedClassroom || teacher.centerId === selectedClassroom.centerId)),
    [selectedClassroom, staff],
  );
  const assignedStaff = eligibleStaff.filter((teacher) => teacher.classroomId === selectedClassroom?.id);
  const suggestedStaff = eligibleStaff.find((teacher) => !teacher.classroomId) ?? eligibleStaff.find((teacher) => teacher.classroomId !== selectedClassroom?.id) ?? eligibleStaff[0];
  const [selectedStaffId, setSelectedStaffId] = useState(suggestedStaff?.id ?? "");
  const selectedStaff = eligibleStaff.find((teacher) => teacher.id === selectedStaffId) ?? suggestedStaff ?? null;
  const effectiveSelectedStaffId = selectedStaff?.id ?? "";
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveAssignment(nextClassroomId: string | null) {
    if (!selectedStaff) return;
    if (nextClassroomId && selectedStaff.classroomId && selectedStaff.classroomId !== nextClassroomId) {
      const confirmed = window.confirm(`${selectedStaff.user.name} is currently assigned to ${selectedStaff.classroom?.name ?? "another classroom"}. Move this teacher?`);
      if (!confirmed) return;
    }
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "staffAssignment",
          staffId: selectedStaff.id,
          classroomId: nextClassroomId ?? "",
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Teacher assignment could not be saved.");
        return;
      }
      setStatusMessage(nextClassroomId ? `${selectedStaff.user.name} assigned to ${selectedClassroom?.name ?? "classroom"}.` : `${selectedStaff.user.name} unassigned from classroom coverage.`);
      router.refresh();
    });
  }

  if (!classrooms.length) {
    return (
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Ratio Warnings And Staff Assignment</CardTitle>
          <CardDescription>Add classrooms before assigning teacher coverage.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button nativeButton={false} render={<Link href="/classroom-dashboard#classroom-editor" />}>
            <Pencil data-icon="inline-start" />
            Open classroom setup
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Ratio Warnings And Staff Assignment</CardTitle>
        <CardDescription>Review rooms that need coverage and move active teachers into the selected classroom.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {demoMode ? (
          <Alert>
            <AlertCircle className="size-4" />
            <AlertTitle>Demo view</AlertTitle>
            <AlertDescription>Assignment actions are disabled for demo classroom data.</AlertDescription>
          </Alert>
        ) : null}
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
        <div className="grid gap-3 md:grid-cols-3">
          {ratioRows.slice(0, 9).map(({ classroom, warning }) => (
            <button
              key={classroom.id}
              type="button"
              className={`rounded-xl border bg-background/45 p-3 text-left transition hover:bg-background/70 ${selectedClassroom?.id === classroom.id ? "border-foreground/60" : ""}`}
              onClick={() => {
                setSelectedClassroomId(classroom.id);
                const nextTeacher = staff.find((teacher) => teacher.user.isActive && teacher.centerId === classroom.centerId && !teacher.classroomId)
                  ?? staff.find((teacher) => teacher.user.isActive && teacher.centerId === classroom.centerId)
                  ?? null;
                setSelectedStaffId(nextTeacher?.id ?? "");
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{classroom.name}</div>
                  <div className="text-xs text-muted-foreground">{classroom.center.crmLocationId ?? classroom.center.name}</div>
                </div>
                <Badge variant={warning.tone}>{warning.label}</Badge>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">{warning.detail}</div>
            </button>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <div className="rounded-xl border bg-background/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{selectedClassroom?.name ?? "Classroom"}</div>
                <p className="text-xs text-muted-foreground">
                  {selectedClassroom?.ageGroup ?? "Age group"} · {selectedClassroom?.ratioRule ?? "ratio not set"}
                  {selectedClassroom && !selectedClassroom.ratioRule ? (
                    <Button type="button" variant="link" className="ml-1 h-auto p-0 text-xs" onClick={() => openClassroomEditor(selectedClassroom.id)}>
                      Add ratio
                    </Button>
                  ) : null}
                </p>
              </div>
              {selectedRatio ? <Badge variant={selectedRatio.tone}>{selectedRatio.label}</Badge> : null}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-card/50 p-3">
                <div className="text-xl font-semibold">{selectedClassroom?._count.children ?? 0}/{selectedClassroom?.capacity ?? 0}</div>
                <div className="text-xs text-muted-foreground">Children / seats</div>
              </div>
              <div className="rounded-lg border bg-card/50 p-3">
                <div className="text-xl font-semibold">{assignedStaff.length}</div>
                <div className="text-xs text-muted-foreground">Assigned teachers</div>
              </div>
              <div className="rounded-lg border bg-card/50 p-3">
                <div className="text-xl font-semibold">{selectedRatio?.requiredStaff ?? "-"}</div>
                <div className="text-xs text-muted-foreground">Required teachers</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {assignedStaff.length ? assignedStaff.map((teacher) => (
                <Badge key={teacher.id} variant="outline">{teacher.user.name}</Badge>
              )) : <span className="text-sm text-muted-foreground">No active teacher assigned.</span>}
            </div>
          </div>

          <div className="rounded-xl border bg-background/40 p-4">
            <div className="mb-3">
              <div className="text-sm font-medium">Assignment action</div>
              <p className="text-xs text-muted-foreground">Assign, move, or unassign one active teacher.</p>
            </div>
            <div className="grid gap-3">
              <div className="space-y-1">
                <Label>Classroom</Label>
                <Select value={selectedClassroom?.id ?? ""} onValueChange={(value) => value && setSelectedClassroomId(value)}>
                  <SelectTrigger><SelectValue placeholder="Choose classroom" /></SelectTrigger>
                  <SelectContent>
                    {classrooms.map((classroom) => (
                      <SelectItem key={classroom.id} value={classroom.id}>{classroom.name} · {classroom.ageGroup}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {eligibleStaff.length ? (
                <div className="space-y-1">
                  <Label>Teacher</Label>
                  <Select value={effectiveSelectedStaffId} onValueChange={(value) => value && setSelectedStaffId(value)}>
                    <SelectTrigger><SelectValue placeholder="Choose teacher" /></SelectTrigger>
                    <SelectContent>
                      {eligibleStaff.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>{staffLabel(teacher)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="rounded-lg border bg-card/50 p-3 text-sm text-muted-foreground">
                  No active teacher profiles are available for this school.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={demoMode || isPending || !selectedClassroom || !selectedStaff} onClick={() => saveAssignment(selectedClassroom?.id ?? null)}>
                  <ArrowRightLeft data-icon="inline-start" />
                  Assign to room
                </Button>
                <Button type="button" variant="outline" disabled={demoMode || isPending || !selectedStaff} onClick={() => saveAssignment(null)}>
                  <UserMinus data-icon="inline-start" />
                  Unassign
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
