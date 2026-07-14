"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRightLeft, CheckCircle2, MapPin, Move, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { childLocationAreaOptions, childIsTransitioned, resolveCurrentClassroomId } from "@/lib/child-location";
import { evaluateClassroomRatio } from "@/lib/classroom-ratios";

export type ChildLocationTrackerClassroom = {
  id: string;
  centerId: string;
  centerName: string;
  name: string;
  ageGroup: string;
  capacity: number;
  ratioRule: string | null;
  assignedStaff: number;
};

export type ChildLocationTrackerChild = {
  id: string;
  fullName: string;
  ageGroup: string;
  centerId: string | null;
  assignedClassroomId: string | null;
  assignedClassroomName: string | null;
  currentClassroomId: string | null;
  currentClassroomName: string | null;
  areaName: string | null;
  status: string | null;
  movedAt: string | Date | null;
  movedByName: string | null;
  reason: string | null;
  attendanceStatus?: string | null;
};

type MoveTarget =
  | { type: "classroom"; classroomId: string }
  | { type: "area"; areaName: string };

type Props = {
  classrooms: ChildLocationTrackerClassroom[];
  trackedChildren: ChildLocationTrackerChild[];
  canMove?: boolean;
  compact?: boolean;
  title?: string;
  description?: string;
};

type LocalMove = Pick<
  ChildLocationTrackerChild,
  "currentClassroomId" | "currentClassroomName" | "areaName" | "status" | "movedAt" | "movedByName" | "reason"
>;

function formatTime(value: string | Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function liveLocationFor(child: ChildLocationTrackerChild) {
  return {
    currentClassroomId: child.currentClassroomId,
    areaName: child.areaName,
    status: child.status,
  };
}

function currentLocationLabel(child: ChildLocationTrackerChild) {
  if (child.areaName) return child.areaName;
  return child.currentClassroomName ?? child.assignedClassroomName ?? "Unassigned";
}

function targetLabel(target: MoveTarget, classrooms: ChildLocationTrackerClassroom[]) {
  if (target.type === "area") return target.areaName;
  return classrooms.find((classroom) => classroom.id === target.classroomId)?.name ?? "selected classroom";
}

function childCardTone(child: ChildLocationTrackerChild) {
  return childIsTransitioned({
    assignedClassroomId: child.assignedClassroomId,
    liveLocation: liveLocationFor(child),
  })
    ? "border-primary/60 bg-primary/10"
    : "bg-card/55";
}

export function ChildLocationTrackerPanel({
  classrooms,
  trackedChildren,
  canMove = false,
  compact = false,
  title = "Live Child Location Tracker",
  description = "Move children between current classrooms or school areas without changing their enrolled classroom.",
}: Props) {
  const router = useRouter();
  const [localMoves, setLocalMoves] = useState<Record<string, LocalMove>>({});
  const [selectedChildId, setSelectedChildId] = useState(trackedChildren[0]?.id ?? "");
  const [draggedChildId, setDraggedChildId] = useState("");
  const [reason, setReason] = useState("Combination / coverage");
  const [customAreaName, setCustomAreaName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const rows = useMemo(() => trackedChildren.map((child) => ({
    ...child,
    ...(localMoves[child.id] ?? {}),
  })), [localMoves, trackedChildren]);
  const effectiveSelectedChildId = rows.some((child) => child.id === selectedChildId)
    ? selectedChildId
    : rows[0]?.id ?? "";
  const selectedChild = rows.find((child) => child.id === effectiveSelectedChildId) ?? null;
  const areaNames = useMemo(() => {
    const values = new Set<string>([...childLocationAreaOptions]);
    for (const child of rows) {
      if (child.areaName) values.add(child.areaName);
    }
    if (customAreaName.trim()) values.add(customAreaName.trim());
    return Array.from(values);
  }, [customAreaName, rows]);
  const roomRows = useMemo(() => classrooms.map((classroom) => {
    const roomChildren = rows.filter((child) =>
      resolveCurrentClassroomId({
        assignedClassroomId: child.assignedClassroomId,
        liveLocation: liveLocationFor(child),
      }) === classroom.id,
    );
    return {
      classroom,
      children: roomChildren,
      warning: evaluateClassroomRatio({
        children: roomChildren.length,
        staff: classroom.assignedStaff,
        capacity: classroom.capacity,
        ratioRule: classroom.ratioRule,
      }),
      assignedCount: rows.filter((child) => child.assignedClassroomId === classroom.id).length,
    };
  }), [classrooms, rows]);
  const areaRows = areaNames.map((areaName) => ({
    areaName,
    children: rows.filter((child) => child.areaName === areaName),
  }));
  const transitionedCount = rows.filter((child) =>
    childIsTransitioned({
      assignedClassroomId: child.assignedClassroomId,
      liveLocation: liveLocationFor(child),
    }),
  ).length;

  function applyLocalMove(childId: string, target: MoveTarget, movedByName: string | null = null) {
    const targetClassroom = target.type === "classroom"
      ? classrooms.find((classroom) => classroom.id === target.classroomId) ?? null
      : null;
    setLocalMoves((current) => ({
      ...current,
      [childId]: {
        currentClassroomId: targetClassroom?.id ?? null,
        currentClassroomName: targetClassroom?.name ?? null,
        areaName: target.type === "area" ? target.areaName : null,
        status: target.type === "classroom" ? "in_classroom" : "in_area",
        movedAt: new Date().toISOString(),
        movedByName,
        reason,
      },
    }));
  }

  function moveChild(childId: string, target: MoveTarget) {
    if (!canMove || !childId) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/children/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId,
          reason,
          classroomId: target.type === "classroom" ? target.classroomId : null,
          areaName: target.type === "area" ? target.areaName : null,
        }),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        child?: { fullName?: string };
        liveLocation?: { movedBy?: { name?: string | null } | null };
      } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Child location could not be updated.");
        return;
      }
      applyLocalMove(childId, target, json?.liveLocation?.movedBy?.name ?? null);
      setSelectedChildId(childId);
      setStatusMessage(`${json?.child?.fullName ?? "Child"} moved to ${targetLabel(target, classrooms)}.`);
      router.refresh();
    });
  }

  function handleDrop(event: DragEvent<HTMLElement>, target: MoveTarget) {
    event.preventDefault();
    const childId = event.dataTransfer.getData("text/plain") || draggedChildId;
    moveChild(childId, target);
    setDraggedChildId("");
  }

  function renderChild(child: ChildLocationTrackerChild) {
    const transitioned = childIsTransitioned({
      assignedClassroomId: child.assignedClassroomId,
      liveLocation: liveLocationFor(child),
    });
    return (
      <button
        key={child.id}
        type="button"
        draggable={canMove}
        className={`w-full rounded-lg border p-2 text-left text-sm transition hover:bg-background/80 ${effectiveSelectedChildId === child.id ? "border-foreground/60" : ""} ${childCardTone(child)}`}
        onClick={() => setSelectedChildId(child.id)}
        onDragStart={(event) => {
          setDraggedChildId(child.id);
          event.dataTransfer.setData("text/plain", child.id);
          event.dataTransfer.effectAllowed = "move";
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate font-medium">{child.fullName}</span>
            <span className="text-xs text-muted-foreground">{child.ageGroup}</span>
          </span>
          {transitioned ? <Badge variant="secondary">Moved</Badge> : null}
        </div>
        <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
          <span>Assigned: {child.assignedClassroomName ?? "Unassigned"}</span>
          <span>Now: {currentLocationLabel(child)}{child.movedAt ? ` · ${formatTime(child.movedAt)}` : ""}</span>
          {child.reason ? <span>Reason: {child.reason}</span> : null}
        </div>
      </button>
    );
  }

  return (
    <Card id="child-location-tracker" className="glass-panel scroll-mt-28">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="text-primary" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Badge variant="outline">{rows.length} children tracked</Badge>
            <Badge variant={transitionedCount ? "secondary" : "default"}>{transitionedCount} transitioned</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {statusMessage ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Location updated</AlertTitle>
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
        {canMove ? (
          <div className="grid gap-3 rounded-xl border bg-background/40 p-3 lg:grid-cols-[minmax(220px,0.7fr)_minmax(220px,0.7fr)_1fr]">
            <div className="space-y-1">
              <Label>Selected child</Label>
              <Select value={selectedChild?.id ?? ""} onValueChange={(value) => value && setSelectedChildId(value)}>
                <SelectTrigger><SelectValue placeholder="Choose child" /></SelectTrigger>
                <SelectContent>
                  {rows.map((child) => (
                    <SelectItem key={child.id} value={child.id}>{child.fullName} · {currentLocationLabel(child)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="location-reason">Reason</Label>
              <Input id="location-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Combination, playground, coverage" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="custom-area">Custom school area</Label>
              <div className="flex gap-2">
                <Input id="custom-area" value={customAreaName} onChange={(event) => setCustomAreaName(event.target.value)} placeholder="Library, hallway, bus loop" />
                <Button type="button" variant="outline" disabled={isPending || !selectedChild || !customAreaName.trim()} onClick={() => selectedChild && moveChild(selectedChild.id, { type: "area", areaName: customAreaName.trim() })}>
                  Move
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          {roomRows.map(({ classroom, children: roomChildren, warning, assignedCount }) => (
            <section
              key={classroom.id}
              className="rounded-xl border bg-background/35 p-3"
              onDragOver={(event) => {
                if (!canMove) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => handleDrop(event, { type: "classroom", classroomId: classroom.id })}
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Users className="size-4 text-primary" />
                    {classroom.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {roomChildren.length} current · {assignedCount} assigned · {classroom.centerName}
                  </div>
                </div>
                {warning.status !== "healthy" ? (
                  <Badge
                    variant={warning.tone}
                    render={(
                      <Link
                        href="/classroom-dashboard#classroom-editor"
                        aria-label={`Open classroom setup to resolve ${warning.label} for ${classroom.name}`}
                      />
                    )}
                  >
                    {warning.label}
                  </Badge>
                ) : (
                  <Badge variant={warning.tone}>{warning.label}</Badge>
                )}
              </div>
              <div className="mb-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <span className="rounded-md border bg-card/45 px-2 py-1">{roomChildren.length}/{classroom.capacity} current</span>
                <span className="rounded-md border bg-card/45 px-2 py-1">{classroom.assignedStaff} teachers</span>
                <span className="rounded-md border bg-card/45 px-2 py-1">{classroom.ratioRule ?? "ratio not set"}</span>
              </div>
              {warning.status !== "healthy" ? (
                <p className="mb-3 rounded-lg border bg-card/40 px-3 py-2 text-xs text-muted-foreground">{warning.detail}</p>
              ) : null}
              {canMove && selectedChild ? (
                <Button className="mb-3 w-full" size="sm" variant="outline" disabled={isPending} onClick={() => moveChild(selectedChild.id, { type: "classroom", classroomId: classroom.id })}>
                  <Move data-icon="inline-start" />
                  Move selected here
                </Button>
              ) : null}
              <div className={`grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
                {roomChildren.map(renderChild)}
                {!roomChildren.length ? (
                  <div className="rounded-lg border border-dashed bg-card/30 p-3 text-sm text-muted-foreground">
                    Drop a child here or use Move selected here.
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>

        <section className="rounded-xl border bg-background/35 p-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <ArrowRightLeft className="size-4 text-primary" />
                School areas
              </div>
              <p className="text-xs text-muted-foreground">Areas do not count as enrolled classroom assignment or classroom ratio occupancy.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {areaRows.map(({ areaName, children: areaChildren }) => (
              <div
                key={areaName}
                className="rounded-xl border bg-card/35 p-3"
                onDragOver={(event) => {
                  if (!canMove) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => handleDrop(event, { type: "area", areaName })}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{areaName}</div>
                  <Badge variant="outline">{areaChildren.length}</Badge>
                </div>
                {canMove && selectedChild ? (
                  <Button className="mb-3 w-full" size="sm" variant="outline" disabled={isPending} onClick={() => moveChild(selectedChild.id, { type: "area", areaName })}>
                    <Move data-icon="inline-start" />
                    Move selected here
                  </Button>
                ) : null}
                <div className="grid gap-2">
                  {areaChildren.map(renderChild)}
                  {!areaChildren.length ? (
                    <div className="rounded-lg border border-dashed bg-background/30 p-3 text-sm text-muted-foreground">
                      Drop a child here.
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
