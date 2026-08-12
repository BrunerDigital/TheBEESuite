"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, CalendarDays, Cloud, Plus, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedDateTime, zonedDateKey } from "@/lib/zoned-date-time";

export type CalendarEventRow = {
  id: string;
  type: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  centerId: string | null;
  centerName: string;
  classroomName: string | null;
  status: string;
  detail: string;
  allDay?: boolean;
  recurrenceRule?: string | null;
  visibility?: string | null;
  syncStatus?: string | null;
  source?: string | null;
};

type GoogleCalendarState = {
  configured: boolean;
  status: string;
  lastSyncAt: string | null;
  missingRequirements: string[];
};

type Props = {
  centers: Array<{ id: string; name: string }>;
  events: CalendarEventRow[];
  generatedAt: string;
  canManageCalendar: boolean;
  googleCalendar: GoogleCalendarState;
};

const eventTypeOptions = [
  { value: "event", label: "Event" },
  { value: "closure", label: "Closure" },
  { value: "holiday", label: "Holiday" },
];

const recurrenceOptions = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const weekdayOptions = [
  { value: "MO", label: "Mo", accessibleLabel: "Monday" },
  { value: "TU", label: "Tu", accessibleLabel: "Tuesday" },
  { value: "WE", label: "We", accessibleLabel: "Wednesday" },
  { value: "TH", label: "Th", accessibleLabel: "Thursday" },
  { value: "FR", label: "Fr", accessibleLabel: "Friday" },
  { value: "SA", label: "Sa", accessibleLabel: "Saturday" },
  { value: "SU", label: "Su", accessibleLabel: "Sunday" },
];

function dateInputValue(timeZone: string, offsetDays = 1) {
  const today = zonedDateKey(new Date(), timeZone);
  const value = new Date(`${today}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function formatDateTime(value: string | null, timeZone: string, allDay = false) {
  if (!value) return "Not set";
  return formatZonedDateTime(value, allDay ? "UTC" : timeZone, allDay ? {
    month: "short",
    day: "numeric",
    year: "numeric",
  } : {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatLastSync(value: string | null, timeZone: string) {
  return formatZonedDateTime(value, timeZone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }, "Not synced");
}

function eventTone(type: string) {
  if (type === "tour") return "default";
  if (type === "staff" || type === "holiday") return "secondary";
  if (type === "billing" || type === "event") return "outline";
  if (type === "compliance" || type === "closure") return "destructive";
  return "outline";
}

function syncTone(status: string | null | undefined) {
  if (status === "synced") return "default";
  if (status === "failed") return "destructive";
  if (status === "not_synced") return "secondary";
  return "outline";
}

const CALENDAR_LABEL_ACRONYMS: Record<string, string> = {
  ach: "ACH",
  api: "API",
  ein: "EIN",
  id: "ID",
  qr: "QR",
  sms: "SMS",
  url: "URL",
};

function calendarDisplayLabel(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const normalized = value.trim();
  if (!normalized) return fallback;
  if (!normalized.includes("_") && !normalized.includes("-")) {
    const acronym = CALENDAR_LABEL_ACRONYMS[normalized.toLocaleLowerCase("en-US")];
    if (acronym) return acronym;
    return normalized === normalized.toLocaleLowerCase("en-US")
      ? normalized.charAt(0).toLocaleUpperCase("en-US") + normalized.slice(1)
      : normalized;
  }
  const words = normalized
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLocaleLowerCase("en-US")
    .split(/\s+/);
  return words.map((word, index) => {
    const acronym = CALENDAR_LABEL_ACRONYMS[word];
    if (acronym) return acronym;
    return index === 0 ? word.charAt(0).toLocaleUpperCase("en-US") + word.slice(1) : word;
  }).join(" ");
}

function recurrenceLabel(rule: string | null | undefined) {
  if (!rule) return "One time";
  const frequency = rule.match(/FREQ=([^;]+)/)?.[1]?.toLowerCase() ?? "repeating";
  const interval = rule.match(/INTERVAL=([^;]+)/)?.[1] ?? "1";
  const byDay = rule.match(/BYDAY=([^;]+)/)?.[1];
  const cadence = interval === "1" ? frequency : `every ${interval} ${frequency}`;
  return byDay ? `${cadence} · ${byDay}` : cadence;
}

export function OperationalCalendar({ centers, events, generatedAt, canManageCalendar, googleCalendar }: Props) {
  const timeZone = useSchoolTimeZone();
  const router = useRouter();
  const [centerId, setCenterId] = useState("all");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [eventMessage, setEventMessage] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const defaultCenterId = centers[0]?.id ?? "";
  const [draft, setDraft] = useState({
    centerId: defaultCenterId,
    eventType: "closure",
    title: "",
    startsAt: dateInputValue(timeZone),
    endsAt: "",
    allDay: true,
    recurrenceFrequency: "none",
    recurrenceInterval: "1",
    recurrenceWeekdays: ["MO"],
    recurrenceUntil: "",
    visibility: "parents",
    notes: "",
  });

  const eventTypes = useMemo(() => Array.from(new Set(events.map((event) => event.type))).sort(), [events]);
  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      const centerMatch = centerId === "all" || event.centerId === centerId;
      const typeMatch = type === "all" || event.type === type;
      const searchMatch = !query || `${event.title} ${event.centerName} ${event.classroomName ?? ""} ${event.status} ${event.detail} ${event.visibility ?? ""}`.toLowerCase().includes(query);
      return centerMatch && typeMatch && searchMatch;
    });
  }, [centerId, type, search, events]);

  const nextSevenDays = filteredEvents.filter((event) => {
    const start = new Date(event.startsAt).getTime();
    const now = new Date(generatedAt).getTime();
    return start >= now && start <= now + 7 * 24 * 60 * 60 * 1000;
  });
  const closureAndHolidayCount = filteredEvents.filter((event) => event.type === "closure" || event.type === "holiday").length;
  const unsyncedCount = events.filter((event) => event.syncStatus === "not_synced" || event.syncStatus === "failed").length;

  function updateDraft(key: string, value: string | boolean | string[]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleWeekday(day: string) {
    setDraft((current) => {
      const selected = new Set(current.recurrenceWeekdays);
      if (selected.has(day)) selected.delete(day);
      else selected.add(day);
      return { ...current, recurrenceWeekdays: Array.from(selected) };
    });
  }

  function createEvent() {
    if (!canManageCalendar) return;
    startTransition(async () => {
      setEventMessage("");
      const response = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !json?.ok) {
        setEventMessage(json?.error || "Calendar event could not be saved.");
        return;
      }
      setDraft((current) => ({
        ...current,
        title: "",
        notes: "",
        endsAt: "",
        recurrenceFrequency: "none",
        recurrenceUntil: "",
      }));
      setEventMessage("Calendar item saved.");
      router.refresh();
    });
  }

  function syncGoogleCalendar() {
    if (!canManageCalendar) return;
    const targetCenterId = centerId === "all" ? draft.centerId : centerId;
    startTransition(async () => {
      setSyncMessage("");
      const response = await fetch("/api/calendar/google-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId: targetCenterId, pullGoogleEvents: true }),
      });
      const json = await response.json().catch(() => null) as {
        ok?: boolean;
        configured?: boolean;
        pushed?: number;
        failed?: number;
        imported?: number;
        updated?: number;
        error?: string;
        importError?: string | null;
      } | null;
      if (!response.ok || !json?.configured) {
        setSyncMessage(json?.error || "Google Calendar is not configured.");
        return;
      }
      setSyncMessage(`Synced ${json.pushed ?? 0}, imported ${json.imported ?? 0}, updated ${json.updated ?? 0}${json.failed ? `, failed ${json.failed}` : ""}${json.importError ? ` · ${json.importError}` : ""}.`);
      router.refresh();
    });
  }

  const dateType = draft.allDay ? "date" : "datetime-local";

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <Badge className="mb-4">
          <CalendarDays data-icon="inline-start" />
          Operational calendar
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Calendar and scheduling</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Review tours, staffing, billing, compliance, birthdays, closures, holidays, and recurring events for the schools you can access.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardDescription>Visible events</CardDescription><CardTitle as="div">{filteredEvents.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Next 7 days</CardDescription><CardTitle as="div">{nextSevenDays.length}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Closures and holidays</CardDescription><CardTitle as="div">{closureAndHolidayCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Needs sync</CardDescription><CardTitle as="div">{unsyncedCount}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Filters</CardTitle>
          <CardDescription>Filter by center, event type, or keyword without leaving the page.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="calendar-filter-center">Center</Label>
            <Select value={centerId} onValueChange={(value) => value && setCenterId(value)}>
              <SelectTrigger id="calendar-filter-center" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All visible centers</SelectItem>
                {centers.map((center) => (
                  <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="calendar-filter-type">Type</Label>
            <Select value={type} onValueChange={(value) => value && setType(value)}>
              <SelectTrigger id="calendar-filter-type" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All event types</SelectItem>
                {eventTypes.map((eventType) => (
                  <SelectItem key={eventType} value={eventType}>{calendarDisplayLabel(eventType, "Event")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="calendar-filter-search">Search</Label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="calendar-filter-search" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" placeholder="Find events" />
            </div>
          </div>
        </CardContent>
      </Card>

      {canManageCalendar ? (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Create school calendar item</CardTitle>
              <CardDescription>Add recurring events, closures, and holidays with staff or parent visibility.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="calendar-event-center">Center</Label>
                <Select value={draft.centerId} onValueChange={(value) => value && updateDraft("centerId", value)}>
                  <SelectTrigger id="calendar-event-center" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {centers.map((center) => (
                      <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="calendar-event-type">Type</Label>
                <Select
                  value={draft.eventType}
                  onValueChange={(value) => {
                    if (!value) return;
                    updateDraft("eventType", value);
                    if (value === "event") updateDraft("visibility", "staff");
                    if (value === "closure" || value === "holiday") {
                      updateDraft("visibility", "parents");
                      updateDraft("allDay", true);
                    }
                  }}
                >
                  <SelectTrigger id="calendar-event-type" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {eventTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="calendar-event-title">Title</Label>
                <Input id="calendar-event-title" value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} placeholder="Presidents Day closure" />
              </div>
              <label htmlFor="calendar-event-all-day" className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 text-sm">
                <input id="calendar-event-all-day" className="size-5 shrink-0 accent-primary" type="checkbox" checked={draft.allDay} onChange={(event) => updateDraft("allDay", event.target.checked)} />
                <span>All day</span>
              </label>
              <div className="space-y-1">
                <Label htmlFor="calendar-event-visibility">Visibility</Label>
                <Select value={draft.visibility} onValueChange={(value) => value && updateDraft("visibility", value)}>
                  <SelectTrigger id="calendar-event-visibility" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff only</SelectItem>
                    <SelectItem value="parents">Parents and staff</SelectItem>
                    <SelectItem value="public">Public calendar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="calendar-event-starts">Starts</Label>
                <Input id="calendar-event-starts" type={dateType} value={draft.startsAt} onChange={(event) => updateDraft("startsAt", event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="calendar-event-ends">Ends</Label>
                <Input id="calendar-event-ends" type={dateType} value={draft.endsAt} onChange={(event) => updateDraft("endsAt", event.target.value)} placeholder={draft.allDay ? "Optional end date" : "Optional end time"} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="calendar-event-repeats">Repeats</Label>
                <Select value={draft.recurrenceFrequency} onValueChange={(value) => value && updateDraft("recurrenceFrequency", value)}>
                  <SelectTrigger id="calendar-event-repeats" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {recurrenceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="calendar-event-interval">Every</Label>
                <Input id="calendar-event-interval" type="number" min="1" max="52" value={draft.recurrenceInterval} onChange={(event) => updateDraft("recurrenceInterval", event.target.value)} disabled={draft.recurrenceFrequency === "none"} />
              </div>
              {draft.recurrenceFrequency === "weekly" ? (
                <fieldset className="space-y-2 md:col-span-2">
                  <legend className="text-sm font-medium">Weekdays</legend>
                  <div className="flex flex-wrap gap-2">
                    {weekdayOptions.map((day) => (
                      <Button
                        key={day.value}
                        type="button"
                        size="sm"
                        variant={draft.recurrenceWeekdays.includes(day.value) ? "default" : "outline"}
                        className="size-11 p-0"
                        aria-label={day.accessibleLabel}
                        aria-pressed={draft.recurrenceWeekdays.includes(day.value)}
                        onClick={() => toggleWeekday(day.value)}
                      >
                        {day.label}
                      </Button>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="calendar-event-repeat-until">Repeat until</Label>
                <Input id="calendar-event-repeat-until" type="date" value={draft.recurrenceUntil} onChange={(event) => updateDraft("recurrenceUntil", event.target.value)} disabled={draft.recurrenceFrequency === "none"} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="calendar-event-notes">Notes</Label>
                <Textarea id="calendar-event-notes" value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} placeholder="Details for staff, parent-facing context, or closure reason" />
              </div>
              {eventMessage ? <div role="status" aria-live="polite" className="rounded-lg border bg-background p-3 text-sm text-muted-foreground md:col-span-2">{eventMessage}</div> : null}
              <div className="md:col-span-2">
                <Button type="button" aria-busy={isPending} onClick={createEvent} disabled={isPending || !draft.centerId || !draft.title}>
                  <Plus data-icon="inline-start" />
                  Add calendar item
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Google Calendar sync</CardTitle>
              <CardDescription>Push local calendar items and import external Google events for the selected center.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="rounded-xl border bg-background p-4">
                <div className="flex items-start gap-3">
                  <Cloud className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <div className="font-medium">{calendarDisplayLabel(googleCalendar.status, "Status unavailable")}</div>
                    <div className="mt-1 text-sm text-muted-foreground">Last sync: {formatLastSync(googleCalendar.lastSyncAt, timeZone)}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {googleCalendar.configured ? <Badge>Configured</Badge> : <Badge variant="outline">Needs credentials</Badge>}
                      {googleCalendar.missingRequirements.map((requirement) => (
                        <Badge key={requirement} variant="secondary">{calendarDisplayLabel(requirement, "Setup required")}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <Button type="button" aria-busy={isPending} onClick={syncGoogleCalendar} disabled={isPending || !draft.centerId}>
                <RefreshCw data-icon="inline-start" />
                Sync Google Calendar
              </Button>
              {syncMessage ? <div role="status" aria-live="polite" className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">{syncMessage}</div> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Schedule</CardTitle>
          <CardDescription>Events for the schools shown above, sorted by date and time.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Center</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div className="font-medium">{formatDateTime(event.startsAt, timeZone, event.allDay)}</div>
                      {event.endsAt ? <div className="text-xs text-muted-foreground">Ends {formatDateTime(event.endsAt, timeZone, event.allDay)}</div> : null}
                    </TableCell>
                    <TableCell><Badge variant={eventTone(event.type)}>{calendarDisplayLabel(event.type, "Event")}</Badge></TableCell>
                    <TableCell>
                      <div className="font-medium">{event.title}</div>
                      <div className="text-xs text-muted-foreground">{event.classroomName ? `${event.classroomName} · ` : ""}{event.detail}</div>
                      {event.recurrenceRule ? <div className="mt-1 text-xs text-muted-foreground"><CalendarCheck2 data-icon="inline-start" /> {recurrenceLabel(event.recurrenceRule)}</div> : null}
                    </TableCell>
                    <TableCell>{event.centerName}</TableCell>
                    <TableCell><Badge variant="outline">{calendarDisplayLabel(event.visibility, "Staff")}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{calendarDisplayLabel(event.status, "Status unavailable")}</Badge></TableCell>
                    <TableCell><Badge variant={syncTone(event.syncStatus)}>{calendarDisplayLabel(event.syncStatus ?? event.source, "The BEE Suite")}</Badge></TableCell>
                  </TableRow>
                ))}
                {!filteredEvents.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">No events match these filters.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
