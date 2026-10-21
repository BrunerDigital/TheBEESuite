"use client";

import { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadOperationsCsv } from "@/lib/operations-csv";
import type { ClassroomMoveUpsData } from "@/lib/school-operations-data";

export function ClassroomMoveUpsPanel({
  data,
  canManageClassrooms = false,
}: {
  data: ClassroomMoveUpsData;
  canManageClassrooms?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [program, setProgram] = useState("six_month");
  const [horizon, setHorizon] = useState("180");
  const [room, setRoom] = useState("all");
  const rows = data.rows.filter(
    (row) =>
      (program === "all" ||
        row.program === program ||
        (program === "six_month" && row.program === "unmapped")) &&
      (room === "all" || row.classroomId === room) &&
      (!row.daysUntil ||
        horizon === "all" ||
        row.daysUntil <= Number(horizon)) &&
      row.name.toLowerCase().includes(query.toLowerCase()),
  );
  const schoolName = (id: string) =>
    data.schools.find((school) => school.id === id)?.name ?? "";
  const rooms = [
    ...new Map(data.rows.map((row) => [row.classroomId, row])).values(),
  ];
  const unmappedRooms = rooms.filter((row) => row.program === "unmapped");
  const dueSoon = data.rows.filter(
    (row) =>
      row.program === "six_month" &&
      row.daysUntil !== null &&
      row.daysUntil <= 30,
  ).length;
  const yearLong = data.rows.filter(
    (row) => row.program === "year_long",
  ).length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Move-ups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review toddler and 2’s age milestones every six months. 3’s and
            pre-K stay in their year-long programs.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            downloadOperationsCsv("classroom-move-ups.csv", [
              [
                "School",
                "Student",
                "Classroom",
                "Age in months",
                "Program",
                "Milestone in months",
                "Previous milestone",
                "Review date",
                "Status",
              ],
              ...rows.map((row) => [
                schoolName(row.centerId),
                row.name,
                row.classroom,
                row.ageMonths ?? "",
                row.program === "six_month"
                  ? "Six-month reviews"
                  : row.program === "year_long"
                    ? "Year-long program"
                    : row.program === "unmapped"
                      ? "Needs age-group setup"
                      : "Other program",
                row.milestone ?? "",
                row.previousMilestoneDate ?? "",
                row.dueDate ?? "",
                row.status,
              ]),
            ])
          }
        >
          <Download />
          Export CSV
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          [
            "Six-month program",
            data.rows.filter((row) => row.program === "six_month").length,
          ],
          ["Reviews within 30 days or overdue", dueSoon],
          ["Year-long program", yearLong],
          ["Classrooms needing setup", unmappedRooms.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      {unmappedRooms.length ? (
        <div
          className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm"
          role="status"
        >
          <p>
            <strong>
              {unmappedRooms.length} classroom(s) need an age-group mapping:
            </strong>{" "}
            {unmappedRooms
              .map((row) => `${schoolName(row.centerId)} · ${row.classroom}`)
              .join(", ")}
            . Their students remain visible below without a guessed review date.
          </p>
          <p>
            The director can set each room’s “Age group served” in Classrooms:
            Toddler for 18/24-month reviews, 2 Y/O for 30/36-month reviews, or
            Preschool / 3’s / Pre-K for a year-long program. The room’s themed
            name can stay the same.
          </p>
          {canManageClassrooms ? (
            <Link
              href="/classroom-dashboard#classroom-editor"
              className={buttonVariants({ variant: "outline" })}
            >
              Set classroom age groups
            </Link>
          ) : (
            <p>Ask your director to confirm the classroom age groups.</p>
          )}
        </div>
      ) : null}
      <p className="rounded-xl border bg-muted/30 p-4 text-sm">
        Review dates use birth dates and age milestones at 18, 24, 30, and 36
        months. The classroom’s age group determines its program. These are
        planning reminders; review readiness and room availability before
        updating a classroom in the child’s record.
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="min-w-48 flex-1 text-sm">
          Find a student
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Student name"
          />
        </label>
        <div className="min-w-0 text-sm">
          <label htmlFor="move-up-program">Program</label>
          <select
            id="move-up-program"
            className="mt-1 block h-10 rounded-lg border bg-background px-3"
            value={program}
            onChange={(event) => setProgram(event.target.value)}
          >
            <option value="six_month">Toddlers / 2’s + needs setup</option>
            <option value="year_long">3’s and pre-K · year-long</option>
            <option value="unmapped">Needs age-group setup</option>
            <option value="all">All programs</option>
          </select>
        </div>
        <div className="min-w-0 text-sm">
          <label htmlFor="move-up-window">Review window</label>
          <select
            id="move-up-window"
            className="mt-1 block h-10 rounded-lg border bg-background px-3"
            value={horizon}
            onChange={(event) => setHorizon(event.target.value)}
          >
            <option value="30">Next 30 days</option>
            <option value="60">Next 60 days</option>
            <option value="90">Next 90 days</option>
            <option value="180">Next six months</option>
            <option value="all">All dates</option>
          </select>
        </div>
        <div className="min-w-0 text-sm">
          <label htmlFor="move-up-room">Classroom</label>
          <select
            id="move-up-room"
            className="mt-1 block h-10 max-w-full rounded-lg border bg-background px-3"
            value={room}
            onChange={(event) => setRoom(event.target.value)}
          >
            <option value="all">All classrooms</option>
            {rooms.map((row) => (
              <option key={row.classroomId} value={row.classroomId ?? ""}>
                {schoolName(row.centerId)} · {row.classroom}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {rows.length} students in this view
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>School / classroom</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Previous milestone</TableHead>
            <TableHead>Next review</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell>
                {schoolName(row.centerId)}
                <div className="text-xs text-muted-foreground">
                  {row.classroom} · {row.ageGroup}
                </div>
              </TableCell>
              <TableCell>
                {row.ageMonths === null
                  ? "Check birth date"
                  : `${row.ageMonths} months`}
              </TableCell>
              <TableCell>{row.previousMilestoneDate ?? "—"}</TableCell>
              <TableCell>
                {row.dueDate ? (
                  <>
                    {row.dueDate}
                    <div className="text-xs text-muted-foreground">
                      {row.milestone}-month milestone
                    </div>
                  </>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>{row.status}</TableCell>
            </TableRow>
          ))}
          {!rows.length ? (
            <TableRow>
              <TableCell colSpan={6}>
                No students match these filters.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
