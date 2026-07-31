"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Pencil, Plus, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { evaluateClassroomRatio } from "@/lib/classroom-ratios";
import { defaultAgeGroupOptions, mergeAgeGroupOptions } from "@/lib/dashboard-options";
import type { ClassroomAssignmentClassroom, ClassroomAssignmentStaff } from "@/components/classroom-ratio-assignment-panel";

type CenterOption = { id: string; name: string };

type Props = {
  centers: CenterOption[];
  classrooms: ClassroomAssignmentClassroom[];
  staff: ClassroomAssignmentStaff[];
  ageGroups?: string[];
  canManage?: boolean;
  demoMode?: boolean;
};

function classroomTeacherNames(staff: ClassroomAssignmentStaff[], classroomId: string) {
  return staff.filter((teacher) => teacher.classroomId === classroomId).map((teacher) => teacher.user.name).join(", ");
}

export function ClassroomSetupPanel({ centers, classrooms, staff, ageGroups: configuredAgeGroups, canManage = false, demoMode = false }: Props) {
  const router = useRouter();
  const [classroomOverrides, setClassroomOverrides] = useState<Record<string, ClassroomAssignmentClassroom>>({});
  const classroomRows = useMemo(() => {
    const overrideRows = Object.values(classroomOverrides);
    const sourceIds = new Set(classrooms.map((classroom) => classroom.id));
    return [
      ...classrooms.map((classroom) => classroomOverrides[classroom.id] ?? classroom),
      ...overrideRows.filter((classroom) => !sourceIds.has(classroom.id)),
    ];
  }, [classrooms, classroomOverrides]);
  const availableAgeGroups = useMemo(
    () => mergeAgeGroupOptions(configuredAgeGroups, classroomRows.map((classroom) => classroom.ageGroup)),
    [classroomRows, configuredAgeGroups],
  );
  const [selectedClassroomId, setSelectedClassroomId] = useState(classroomRows[0]?.id ?? "new");
  const selectedClassroom = classroomRows.find((classroom) => classroom.id === selectedClassroomId) ?? null;
  const [centerId, setCenterId] = useState(selectedClassroom?.centerId ?? centers[0]?.id ?? "");
  const [name, setName] = useState(selectedClassroom?.name ?? "");
  const [ageGroup, setAgeGroup] = useState(selectedClassroom?.ageGroup ?? defaultAgeGroupOptions[0]);
  const [capacity, setCapacity] = useState(selectedClassroom?.capacity ? String(selectedClassroom.capacity) : "");
  const [ratioRule, setRatioRule] = useState(selectedClassroom?.ratioRule ?? "");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const centerOptions = useMemo(() => centers.length ? centers : [], [centers]);
  const rows = useMemo(() => classroomRows.map((classroom) => ({
    classroom,
    warning: evaluateClassroomRatio({
      children: classroom._count.children,
      staff: classroom._count.staff,
      capacity: classroom.capacity,
      ratioRule: classroom.ratioRule,
    }),
  })), [classroomRows]);

  useEffect(() => {
    function selectClassroomForEditing(event: Event) {
      const classroomId = (event as CustomEvent<{ classroomId?: string }>).detail?.classroomId;
      const classroom = classroomRows.find((row) => row.id === classroomId);
      if (!classroom) return;
      setSelectedClassroomId(classroom.id);
      setCenterId(classroom.centerId);
      setName(classroom.name);
      setAgeGroup(classroom.ageGroup || availableAgeGroups[0] || defaultAgeGroupOptions[0]);
      setCapacity(classroom.capacity ? String(classroom.capacity) : "");
      setRatioRule(classroom.ratioRule ?? "");
      setStatusMessage("");
      setErrorMessage("");
      scrollToEditor();
    }

    window.addEventListener("bee-suite:edit-classroom", selectClassroomForEditing);
    return () => window.removeEventListener("bee-suite:edit-classroom", selectClassroomForEditing);
  }, [availableAgeGroups, classroomRows]);

  function scrollToEditor() {
    window.requestAnimationFrame(() => {
      document.getElementById("classroom-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function loadClassroom(classroom: ClassroomAssignmentClassroom | null) {
    setSelectedClassroomId(classroom?.id ?? "new");
    setCenterId(classroom?.centerId ?? centers[0]?.id ?? "");
    setName(classroom?.name ?? "");
    setAgeGroup(classroom?.ageGroup ?? availableAgeGroups[0] ?? defaultAgeGroupOptions[0]);
    setCapacity(classroom?.capacity ? String(classroom.capacity) : "");
    setRatioRule(classroom?.ratioRule ?? "");
    setStatusMessage("");
    setErrorMessage("");
    scrollToEditor();
  }

  function saveClassroom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "classroom",
          id: selectedClassroomId === "new" ? undefined : selectedClassroomId,
          centerId,
          name,
          ageGroup,
          capacity,
          ratioRule,
        }),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        mode?: string;
        record?: Partial<ClassroomAssignmentClassroom> & { id?: string };
      } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Classroom could not be saved.");
        return;
      }
      setStatusMessage(`Classroom ${json?.mode ?? "saved"}.`);
      if (json?.record?.id) {
        setSelectedClassroomId(json.record.id);
        const savedRatioRule = (json.record.ratioRule ?? ratioRule.trim()) || null;
        setRatioRule(savedRatioRule ?? "");
        setClassroomOverrides((current) => {
          const sourceIds = new Set(classrooms.map((classroom) => classroom.id));
          const currentRows = [
            ...classrooms.map((classroom) => current[classroom.id] ?? classroom),
            ...Object.values(current).filter((classroom) => !sourceIds.has(classroom.id)),
          ];
          const existing = currentRows.find((classroom) => classroom.id === json.record?.id);
          const nextRecord = !existing
            ? {
                id: json.record?.id ?? "",
                centerId,
                name: json.record?.name ?? name.trim(),
                ageGroup: json.record?.ageGroup ?? ageGroup,
                capacity: Number(json.record?.capacity ?? capacity) || 0,
                ratioRule: savedRatioRule,
                center: {
                  name: centers.find((row) => row.id === centerId)?.name ?? "Selected school",
                  crmLocationId: null,
                },
                _count: { children: 0, staff: 0, dailyReports: 0, incidents: 0 },
              }
            : {
                ...existing,
                centerId,
                name: json.record?.name ?? name.trim(),
                ageGroup: json.record?.ageGroup ?? ageGroup,
                capacity: Number(json.record?.capacity ?? capacity) || existing.capacity,
                ratioRule: savedRatioRule,
              };
          return { ...current, [nextRecord.id]: nextRecord };
        });
      }
      router.refresh();
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Classrooms</CardTitle>
        <CardDescription>
          {canManage
            ? "Set up each room with the school, age group, licensed seats, and staff-to-child ratio directors use for daily coverage."
            : "Classroom capacity and roster details are visible for daily operations. Room setup, capacity, and ratio changes are director-only."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Classroom</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Age group</TableHead>
                <TableHead>Children / seats</TableHead>
                <TableHead>Teachers</TableHead>
                <TableHead>Staff-to-child ratio</TableHead>
                <TableHead>Ratio status</TableHead>
                <TableHead>Incidents</TableHead>
                {canManage ? <TableHead>Action</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ classroom, warning }) => (
                <TableRow key={classroom.id}>
                  <TableCell className="font-medium">{classroom.name}</TableCell>
                  <TableCell>{classroom.center.crmLocationId ?? classroom.center.name}</TableCell>
                  <TableCell>{classroom.ageGroup}</TableCell>
                  <TableCell>{classroom._count.children}/{classroom.capacity}</TableCell>
                  <TableCell>
                    <div className="flex max-w-52 flex-col gap-1">
                      <span>{classroom._count.staff} assigned</span>
                      <span className="text-xs text-muted-foreground">
                        {classroomTeacherNames(staff, classroom.id) || "No active teacher names"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {classroom.ratioRule ? (
                      classroom.ratioRule
                    ) : canManage ? (
                      <Button type="button" variant="link" className="h-auto p-0" onClick={() => loadClassroom(classroom)}>
                        Add ratio
                      </Button>
                    ) : (
                      "Not set"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-64 flex-col gap-1">
                      {canManage && warning.status !== "healthy" ? (
                        <Badge
                          variant={warning.tone}
                          render={(
                            <button
                              type="button"
                              onClick={() => loadClassroom(classroom)}
                              aria-label={`Edit ${classroom.name} to resolve ${warning.label}`}
                            />
                          )}
                        >
                          {warning.label}
                        </Badge>
                      ) : (
                        <Badge variant={warning.tone}>{warning.label}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{warning.detail}</span>
                    </div>
                  </TableCell>
                  <TableCell>{classroom._count.incidents}</TableCell>
                  {canManage ? (
                  <TableCell>
                    <Button type="button" size="sm" variant="outline" onClick={() => loadClassroom(classroom)}>
                      <Pencil data-icon="inline-start" />
                      Edit
                    </Button>
                  </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 9 : 8} className="text-muted-foreground">
                    No classrooms have been added yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {canManage ? (
        <form id="classroom-editor" className="scroll-mt-24 rounded-xl border bg-background/40 p-4" onSubmit={saveClassroom}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{selectedClassroom ? "Edit classroom" : "Add classroom"}</div>
              <p className="text-xs text-muted-foreground">Saved changes update the same live classroom record used by kiosk, teacher, parent, and admin views.</p>
            </div>
            <Button type="button" variant="outline" onClick={() => loadClassroom(null)}>
              <Plus data-icon="inline-start" />
              New classroom
            </Button>
          </div>

          {statusMessage ? (
            <Alert className="mb-4">
              <CheckCircle2 className="size-4" />
              <AlertTitle>Saved</AlertTitle>
              <AlertDescription>{statusMessage}</AlertDescription>
            </Alert>
          ) : null}
          {errorMessage ? (
            <Alert className="mb-4" variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Needs attention</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1 xl:col-span-2">
              <Label>Classroom to edit</Label>
              <Select value={selectedClassroomId} onValueChange={(value) => {
                if (value === "new") loadClassroom(null);
                else loadClassroom(classroomRows.find((classroom) => classroom.id === value) ?? null);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New classroom</SelectItem>
                  {classroomRows.map((classroom) => (
                    <SelectItem key={classroom.id} value={classroom.id}>{classroom.name} · {classroom.ageGroup}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 xl:col-span-2">
              <Label>School</Label>
              <Select value={centerId} onValueChange={(value) => value && setCenterId(value)}>
                <SelectTrigger><SelectValue placeholder="Choose school" /></SelectTrigger>
                <SelectContent>
                  {centerOptions.map((center) => (
                    <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 xl:col-span-2">
              <Label>Classroom name</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Infants, Toddlers, Pre-K A" required />
            </div>
            <div className="space-y-1">
              <Label>Age group served</Label>
              <Select value={ageGroup} onValueChange={(value) => value && setAgeGroup(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableAgeGroups.map((group) => (
                    <SelectItem key={group} value={group}>{group}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Licensed seats in room</Label>
              <Input value={capacity} onChange={(event) => setCapacity(event.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="12" required />
            </div>
            <div className="space-y-1">
              <Label>Staff-to-child ratio</Label>
              <Input value={ratioRule} onChange={(event) => setRatioRule(event.target.value)} placeholder="1:4, 1:7, 2:12" />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={demoMode || isPending || !centerId || !name.trim()}>
              <Save data-icon="inline-start" />
              Save classroom
            </Button>
          </div>
        </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
