"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
};

type Props = {
  centers: Array<{ id: string; name: string }>;
  events: CalendarEventRow[];
  generatedAt: string;
};

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function eventTone(type: string) {
  if (type === "tour") return "default";
  if (type === "staff") return "secondary";
  if (type === "billing") return "outline";
  if (type === "compliance") return "destructive";
  return "outline";
}

export function OperationalCalendar({ centers, events, generatedAt }: Props) {
  const [centerId, setCenterId] = useState("all");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const eventTypes = useMemo(() => Array.from(new Set(events.map((event) => event.type))).sort(), [events]);
  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      const centerMatch = centerId === "all" || event.centerId === centerId;
      const typeMatch = type === "all" || event.type === type;
      const searchMatch = !query || `${event.title} ${event.centerName} ${event.classroomName ?? ""} ${event.status} ${event.detail}`.toLowerCase().includes(query);
      return centerMatch && typeMatch && searchMatch;
    });
  }, [centerId, type, search, events]);

  const nextSevenDays = filteredEvents.filter((event) => {
    const start = new Date(event.startsAt).getTime();
    const now = new Date(generatedAt).getTime();
    return start >= now && start <= now + 7 * 24 * 60 * 60 * 1000;
  });

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <CalendarDays data-icon="inline-start" />
          Operational calendar
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Calendar and Scheduling</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Tours, staff schedules, billing due dates, compliance reminders, birthdays, and enrollment starts in one role-scoped view.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-panel"><CardHeader><CardDescription>Visible events</CardDescription><CardTitle>{filteredEvents.length}</CardTitle></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardDescription>Next 7 days</CardDescription><CardTitle>{nextSevenDays.length}</CardTitle></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardDescription>Centers</CardDescription><CardTitle>{centers.length}</CardTitle></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardDescription>Event types</CardDescription><CardTitle>{eventTypes.length}</CardTitle></CardHeader></Card>
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

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>Sorted operational events for the current school scope.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Center</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEvents.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <div className="font-medium">{formatDateTime(event.startsAt)}</div>
                    {event.endsAt ? <div className="text-xs text-muted-foreground">Ends {formatDateTime(event.endsAt)}</div> : null}
                  </TableCell>
                  <TableCell><Badge variant={eventTone(event.type)}>{event.type.replaceAll("_", " ")}</Badge></TableCell>
                  <TableCell>
                    <div className="font-medium">{event.title}</div>
                    <div className="text-xs text-muted-foreground">{event.classroomName ? `${event.classroomName} · ` : ""}{event.detail}</div>
                  </TableCell>
                  <TableCell>{event.centerName}</TableCell>
                  <TableCell><Badge variant="outline">{event.status}</Badge></TableCell>
                </TableRow>
              ))}
              {!filteredEvents.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">No events match these filters.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
