"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClassroomPresenceData } from "@/lib/school-operations-data";
import { downloadOperationsCsv } from "@/lib/operations-csv";

function timeLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function ClassroomPresencePanel({
  data,
  error,
  selectedDate,
  selectedTime,
}: {
  data: ClassroomPresenceData;
  error?: string;
  selectedDate: string;
  selectedTime: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [room, setRoom] = useState("all");
  useEffect(() => {
    if (!data.live || error) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible")
        startTransition(() => router.refresh());
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [data.live, error, router]);
  const count = data.schools.reduce((sum, school) => sum + school.checkedIn, 0);
  function exportCsv() {
    downloadOperationsCsv("classroom-presence.csv", [
      [
        "School",
        "School date",
        "As of",
        "Time zone",
        "Classroom / area",
        "Recorded count",
        "Evidence",
        "Student",
        "Checked in",
        "Location recorded",
      ],
      ...data.schools.flatMap((school) =>
        school.groups
          .filter(
            (group) => room === "all" || room === `${school.id}:${group.id}`,
          )
          .filter(
            (group) =>
              !query ||
              group.children.some((child) =>
                child.name.toLowerCase().includes(query.toLowerCase()),
              ),
          )
          .flatMap((group) => {
            const prefix = [
              school.name,
              school.date,
              school.at,
              school.timeZone,
              group.name,
              group.children.length,
              school.recordedEvents
                ? `Saved check-in/out events; ${school.dailyOnly} daily-only attendance records excluded`
                : "No timestamped events; count unverified",
            ];
            return group.children.length
              ? group.children
                  .filter((child) =>
                    child.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((child) => [
                    ...prefix,
                    child.name,
                    child.checkedInAt,
                    child.locationRecordedAt,
                  ])
              : [[...prefix, "", "", ""]];
          }),
      ),
    ]);
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Classroom presence</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.live
              ? "Live view refreshes every 30 seconds."
              : "Historical snapshot from recorded check-ins, checkouts, and room transfers."}{" "}
            Times use each school’s time zone.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={Boolean(error) || !data.schools.length}
          >
            <Download />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => startTransition(() => router.refresh())}
            disabled={pending}
          >
            <RefreshCw className={pending ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="pt-5">
          <form
            action="/classroom-dashboard"
            className="flex flex-wrap items-end gap-3"
          >
            <input type="hidden" name="view" value="presence" />
            <label className="space-y-1 text-sm">
              School date
              <Input
                name="date"
                type="date"
                required
                defaultValue={selectedDate}
              />
            </label>
            <label className="space-y-1 text-sm">
              School time
              <Input
                name="time"
                type="time"
                required
                defaultValue={selectedTime}
              />
            </label>
            <Button type="submit">View history</Button>
            <Link
              href="/classroom-dashboard?view=presence"
              className={buttonVariants({ variant: "outline" })}
            >
              Live now
            </Link>
          </form>
        </CardContent>
      </Card>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive p-4 text-sm text-destructive"
        >
          {error}
        </p>
      ) : (
        <>
          <p className="text-sm" aria-live="polite">
            <strong className="text-xl">{count}</strong> recorded checked in
            across this workspace. {pending ? "Refreshing…" : ""}
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
              <label htmlFor="presence-room">Classroom or area</label>
              <select
                id="presence-room"
                className="mt-1 block h-10 max-w-full rounded-lg border bg-background px-3"
                value={room}
                onChange={(event) => setRoom(event.target.value)}
              >
                <option value="all">All classrooms and areas</option>
                {data.schools.flatMap((school) =>
                  school.groups.map((group) => (
                    <option
                      key={`${school.id}-${group.id}`}
                      value={`${school.id}:${group.id}`}
                    >
                      {school.name} · {group.name}
                    </option>
                  )),
                )}
              </select>
            </div>
          </div>
          {!data.schools.length ? (
            <p className="text-sm text-muted-foreground">
              No schools are available in this workspace.
            </p>
          ) : null}
          {data.schools.map((school) => (
            <section key={school.id} className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {school.name} · {school.checkedIn} checked in
                </h2>
                <p className="text-xs text-muted-foreground">
                  {school.date} at {timeLabel(school.at, school.timeZone)} ·{" "}
                  {school.timeZone}
                </p>
              </div>
              {!school.recordedEvents ? (
                <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                  No timestamped check-in/out records for this school day
                  through the selected time. Presence cannot be verified.
                </p>
              ) : null}
              {school.dailyOnly ? (
                <p className="text-sm text-muted-foreground">
                  {school.dailyOnly} student(s) have daily attendance for this
                  date without check-in/out events through the selected time.
                  Daily status does not establish an exact headcount.
                </p>
              ) : null}
              {school.unknown ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {school.unknown} checked-in student(s) have no recorded
                  classroom. Review the unassigned group below.
                </p>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {school.groups
                  .filter(
                    (group) =>
                      room === "all" || `${school.id}:${group.id}` === room,
                  )
                  .filter(
                    (group) =>
                      !query ||
                      group.children.some((child) =>
                        child.name.toLowerCase().includes(query.toLowerCase()),
                      ),
                  )
                  .map((group) => (
                    <Card key={group.id}>
                      <CardHeader>
                        <CardTitle
                          as="h3"
                          className="flex items-start justify-between gap-2"
                        >
                          <span>
                            {group.name}
                            {group.archived ? " (archived)" : ""}
                          </span>
                          <span>{group.children.length}</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {group.children.length ? (
                          <ul className="divide-y">
                            {group.children
                              .filter((child) =>
                                child.name
                                  .toLowerCase()
                                  .includes(query.toLowerCase()),
                              )
                              .map((child) => (
                                <li key={child.id} className="py-2 text-sm">
                                  <span className="font-medium">
                                    {child.name}
                                  </span>
                                  <p className="text-xs text-muted-foreground">
                                    Checked in{" "}
                                    {timeLabel(
                                      child.checkedInAt,
                                      school.timeZone,
                                    )}{" "}
                                    · Location recorded{" "}
                                    {timeLabel(
                                      child.locationRecordedAt,
                                      school.timeZone,
                                    )}
                                  </p>
                                </li>
                              ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            0 recorded checked in
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">
            Counts reflect saved events for the selected school day. Missing
            checkouts or transfers can affect accuracy. Historical rooms come
            from recorded events; a student’s current classroom is never
            substituted. Earlier ProCare history is available only where
            timestamped records were imported.
          </p>
        </>
      )}
    </div>
  );
}
