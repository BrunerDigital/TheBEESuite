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
  { value: "MO", label: "M" },
  { value: "TU", label: "T" },
  { value: "WE", label: "W" },
  { value: "TH", label: "T" },
  { value: "FR", label: "F" },
  { value: "SA", label: "S" },
  { value: "SU", label: "S" },
];

function dateInputValue(offsetDays = 1) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function formatDateTime(value: string | null, allDay = false) {
  if (!value) return "Not set";
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", allDay ? {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  } : {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function formatLastSync(value: string | null) {
  if (!value) return "Not synced";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
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

function recurrenceLabel(rule: string | null | undefined) {
  if (!rule) return "One time";
  const frequency = rule.match(/FREQ=([^;]+)/)?.[1]?.toLowerCase() ?? "repeating";
  const interval = rule.match(/INTERVAL=([^;]+)/)?.[1] ?? "1";
  const byDay = rule.match(/BYDAY=([^;]+)/)?.[1];
  const cadence = interval === "1" ? frequency : `every ${interval} ${frequency}`;
  return byDay ? `${cadence} · ${byDay}` : cadence;
}

export function OperationalCalendar({ centers, events, generatedAt, canManageCalendar, googleCalendar }: Props) {
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
    startsAt: dateInputValue(),
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
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <CalendarDays data-icon="inline-start" />
          Operational calendar
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Calendar and Scheduling</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Tours, staffing, billing, compliance, birthdays, school closures, holidays, recurring events, and Google Calendar sync in one role-scoped view.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-panel"><CardHeader><CardDescription>Visible events</CardDescription><CardTitle>{filteredEvents.length}</CardTitle></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardDescription>Next 7 days</CardDescription><CardTitle>{nextSevenDays.length}</CardTitle></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardDescription>Closures and holidays</CardDescription><CardTitle>{closureAndHolidayCount}</CardTitle></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardDescription>Needs sync</CardDescription><CardTitle>{unsyncedCount}</CardTitle></CardHeader></Card>
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by center, event type, or keyword without leaving the page.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Center</Label>
            <Select value={centerId} onValueChange={(value) => value && setCenterId(value)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All visible centers</SelectItem>
                {centers.map((center) => (
                  <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(value) => value && setType(value)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All event types</SelectItem>
                {eventTypes.map((eventType) => (
                  <SelectItem key={eventType} value={eventType}>{eventType.replaceAll("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2 size-4 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" placeholder="Find events" />
            </div>
          </div>
        </CardContent>
      </Card>

      {canManageCalendar ? (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Create School Calendar Item</CardTitle>
              <CardDescription>Add recurring events, closures, and holidays with staff or parent visibility.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Center</Label>
                <Select value={draft.centerId} onValueChange={(value) => value && updateDraft("centerId", value)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {centers.map((center) => (
                      <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
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
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {eventTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Title</Label>
                <Input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} placeholder="Presidents Day closure" />
              </div>
              <label className="flex min-h-10 items-center gap-3 rounded-lg border bg-background/40 px-3 text-sm">
                <input type="checkbox" checked={draft.allDay} onChange={(event) => updateDraft("allDay", event.target.checked)} />
                <span>All day</span>
              </label>
              <div className="space-y-1">
                <Label>Visibility</Label>
                <Select value={draft.visibility} onValueChange={(value) => value && updateDraft("visibility", value)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff only</SelectItem>
                    <SelectItem value="parents">Parents and staff</SelectItem>
                    <SelectItem value="public">Public calendar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Starts</Label>
                <Input type={dateType} value={draft.startsAt} onChange={(event) => updateDraft("startsAt", event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Ends</Label>
                <Input type={dateType} value={draft.endsAt} onChange={(event) => updateDraft("endsAt", event.target.value)} placeholder={draft.allDay ? "Optional end date" : "Optional end time"} />
              </div>
              <div className="space-y-1">
                <Label>Repeats</Label>
                <Select value={draft.recurrenceFrequency} onValueChange={(value) => value && updateDraft("recurrenceFrequency", value)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {recurrenceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Every</Label>
                <Input type="number" min="1" max="52" value={draft.recurrenceInterval} onChange={(event) => updateDraft("recurrenceInterval", event.target.value)} disabled={draft.recurrenceFrequency === "none"} />
              </div>
              {draft.recurrenceFrequency === "weekly" ? (
                <div className="space-y-2 md:col-span-2">
                  <Label>Weekdays</Label>
                  <div className="flex flex-wrap gap-2">
                    {weekdayOptions.map((day) => (
                      <Button
                        key={day.value}
                        type="button"
                        size="sm"
                        variant={draft.recurrenceWeekdays.includes(day.value) ? "default" : "outline"}
                        className="h-8 w-8 p-0"
                        onClick={() => toggleWeekday(day.value)}
                      >
                        {day.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="space-y-1">
                <Label>Repeat until</Label>
                <Input type="date" value={draft.recurrenceUntil} onChange={(event) => updateDraft("recurrenceUntil", event.target.value)} disabled={draft.recurrenceFrequency === "none"} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Notes</Label>
                <Textarea value={draft.notes} onChange={(event) => updateDraft("notes", event.target.value)} placeholder="Details for staff, parent-facing context, or closure reason" />
              </div>
              {eventMessage ? <div className="rounded-lg border bg-background/50 p-3 text-sm text-muted-foreground md:col-span-2">{eventMessage}</div> : null}
              <div className="md:col-span-2">
                <Button type="button" onClick={createEvent} disabled={isPending || !draft.centerId || !draft.title}>
                  <Plus data-icon="inline-start" />
                  Add calendar item
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Google Calendar Sync</CardTitle>
              <CardDescription>Push local calendar items and import external Google events for the selected center.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="rounded-xl border bg-background/40 p-4">
                <div className="flex items-start gap-3">
                  <Cloud className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <div className="font-medium">{googleCalendar.status}</div>
                    <div className="mt-1 text-sm text-muted-foreground">Last sync: {formatLastSync(googleCalendar.lastSyncAt)}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {googleCalendar.configured ? <Badge>Configured</Badge> : <Badge variant="outline">Needs credentials</Badge>}
                      {googleCalendar.missingRequirements.map((requirement) => (
                        <Badge key={requirement} variant="secondary">{requirement}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <Button type="button" onClick={syncGoogleCalendar} disabled={isPending || !draft.centerId}>
                <RefreshCw data-icon="inline-start" />
                Sync Google Calendar
              </Button>
              {syncMessage ? <div className="rounded-lg border bg-background/50 p-3 text-sm text-muted-foreground">{syncMessage}</div> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>Sorted operational events for the current school scope.</CardDescription>
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
                      <div className="font-medium">{formatDateTime(event.startsAt, event.allDay)}</div>
                      {event.endsAt ? <div className="text-xs text-muted-foreground">Ends {formatDateTime(event.endsAt, event.allDay)}</div> : null}
                    </TableCell>
                    <TableCell><Badge variant={eventTone(event.type)}>{event.type.replaceAll("_", " ")}</Badge></TableCell>
                    <TableCell>
                      <div className="font-medium">{event.title}</div>
                      <div className="text-xs text-muted-foreground">{event.classroomName ? `${event.classroomName} · ` : ""}{event.detail}</div>
                      {event.recurrenceRule ? <div className="mt-1 text-xs text-muted-foreground"><CalendarCheck2 data-icon="inline-start" /> {recurrenceLabel(event.recurrenceRule)}</div> : null}
                    </TableCell>
                    <TableCell>{event.centerName}</TableCell>
                    <TableCell><Badge variant="outline">{event.visibility ?? "staff"}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{event.status}</Badge></TableCell>
                    <TableCell><Badge variant={syncTone(event.syncStatus)}>{event.syncStatus ?? event.source ?? "system"}</Badge></TableCell>
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
