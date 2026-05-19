"use client";

import Image from "next/image";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clipboard,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { EnrollmentStage } from "@prisma/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { enrollmentStages, stageLabels } from "@/lib/crm";
import { cn } from "@/lib/utils";

type CenterOption = {
  id: string;
  name: string;
  crmLocationId: string | null;
  locationId: string | null;
  city: string | null;
  state: string | null;
};

type CrmLead = {
  id: string;
  familyName: string;
  childName: string | null;
  email: string | null;
  phone: string | null;
  leadSource: string | null;
  programInterest: string | null;
  ageGroupInterest: string | null;
  desiredStartDate: string | Date | null;
  stage: EnrollmentStage;
  score: number;
  status: string;
  createdAt: string | Date;
  center: CenterOption;
};

type LeadNote = {
  id: string;
  body: string;
  restricted: boolean;
  createdAt: string | Date;
  user?: {
    name: string;
    email: string;
  } | null;
};

type LeadTask = {
  id: string;
  title: string;
  dueAt: string | Date | null;
  status: string;
};

type LeadTour = {
  id: string;
  startsAt: string | Date;
  status: string;
  notes: string | null;
};

type LeadDetails = CrmLead & {
  notes: LeadNote[];
  tasks: LeadTask[];
  tours: LeadTour[];
};

type Props = {
  initialLeads: CrmLead[];
  centers: CenterOption[];
  currentUser: {
    name: string;
    role: string;
    centerIds: string[];
  };
};

const programOptions = [
  "Daycare",
  "Preschool",
  "Before & After School Care",
  "Summer Camp",
];

function safeDate(value: string | Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatTourDate(value: string | Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function dateInputValue(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function getCenterLabel(center: CenterOption) {
  const place = [center.city, center.state].filter(Boolean).join(", ");
  return place ? `${center.name} (${place})` : center.name;
}

function makeMrBeeDraft(lead?: CrmLead) {
  if (!lead) return "Choose a lead and Mr. Bee will draft a warm, human-reviewed follow-up.";

  return `Hi ${lead.familyName}, this is Kid City USA following up on your ${lead.programInterest ?? "childcare"} inquiry for ${lead.center.name}. We would be happy to answer questions, confirm availability, or help schedule your next step.`;
}

export function CrmWorkspace({ initialLeads, centers, currentUser }: Props) {
  const [leads, setLeads] = useState(initialLeads);
  const [selectedCenter, setSelectedCenter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState(initialLeads[0]?.id ?? "");
  const [selectedLeadDetails, setSelectedLeadDetails] = useState<LeadDetails | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    familyName: "",
    email: "",
    phone: "",
    program: "Preschool",
    locationId: centers[0]?.crmLocationId ?? centers[0]?.id ?? "",
  });
  const [noteBody, setNoteBody] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [tourStartsAt, setTourStartsAt] = useState("");
  const [tourNotes, setTourNotes] = useState("");
  const [emailSubject, setEmailSubject] = useState("Kid City USA enrollment follow-up");
  const [emailDraft, setEmailDraft] = useState(makeMrBeeDraft(initialLeads[0]));
  const [editForm, setEditForm] = useState({
    familyName: initialLeads[0]?.familyName ?? "",
    childName: initialLeads[0]?.childName ?? "",
    email: initialLeads[0]?.email ?? "",
    phone: initialLeads[0]?.phone ?? "",
    programInterest: initialLeads[0]?.programInterest ?? "Preschool",
    ageGroupInterest: initialLeads[0]?.ageGroupInterest ?? "",
    desiredStartDate: dateInputValue(initialLeads[0]?.desiredStartDate),
    leadSource: initialLeads[0]?.leadSource ?? "",
  });

  const filteredLeads = useMemo(() => {
    const needle = query.toLowerCase();
    return leads.filter((lead) => {
      const matchesCenter = selectedCenter === "all" || lead.center.id === selectedCenter;
      const matchesQuery =
        !needle ||
        lead.familyName.toLowerCase().includes(needle) ||
        lead.email?.toLowerCase().includes(needle) ||
        lead.phone?.includes(needle) ||
        lead.center.name.toLowerCase().includes(needle);
      return matchesCenter && matchesQuery;
    });
  }, [leads, query, selectedCenter]);

  const byStage = useMemo(() => {
    return enrollmentStages.reduce<Record<EnrollmentStage, CrmLead[]>>((acc, stage) => {
      acc[stage] = filteredLeads.filter((lead) => lead.stage === stage).slice(0, 25);
      return acc;
    }, {} as Record<EnrollmentStage, CrmLead[]>);
  }, [filteredLeads]);

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? leads[0];
  const highIntent = filteredLeads.filter((lead) => lead.score >= 75).length;

  useEffect(() => {
    let cancelled = false;

    if (!selectedLead?.id) {
      return;
    }

    fetch(`/api/leads/${selectedLead.id}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { lead?: LeadDetails } | null) => {
        if (!cancelled) setSelectedLeadDetails(json?.lead ?? null);
      })
      .catch(() => {
        if (!cancelled) setSelectedLeadDetails(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedLead?.id]);

  function selectLead(lead: CrmLead) {
    setSelectedLeadId(lead.id);
    setSelectedLeadDetails(null);
    setEmailSubject(`Kid City USA ${lead.programInterest ?? "enrollment"} follow-up`);
    setEmailDraft(makeMrBeeDraft(lead));
    setEditForm({
      familyName: lead.familyName,
      childName: lead.childName ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      programInterest: lead.programInterest ?? "Preschool",
      ageGroupInterest: lead.ageGroupInterest ?? "",
      desiredStartDate: dateInputValue(lead.desiredStartDate),
      leadSource: lead.leadSource ?? "",
    });
  }

  function showStatus(message: string) {
    setErrorMessage("");
    setStatusMessage(message);
  }

  function showError(message: string) {
    setStatusMessage("");
    setErrorMessage(message);
  }

  function updateLeadStage(leadId: string, stage: EnrollmentStage) {
    const previous = leads;
    setLeads((current) =>
      current.map((lead) => (lead.id === leadId ? { ...lead, stage } : lead)),
    );

    startTransition(async () => {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!response.ok) {
        setLeads(previous);
        showError("Pipeline stage could not be updated.");
        return;
      }
      const json = (await response.json()) as { lead: CrmLead };
      setLeads((current) => current.map((lead) => (lead.id === leadId ? json.lead : lead)));
      showStatus("Pipeline stage updated and logged.");
    });
  }

  function saveLeadDetails() {
    if (!selectedLead) return;

    startTransition(async () => {
      const response = await fetch(`/api/leads/${selectedLead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null) as { error?: string; errors?: Record<string, string> } | null;
        showError(json?.error || Object.values(json?.errors || {})[0] || "Lead details could not be updated.");
        return;
      }

      const json = (await response.json()) as { lead: CrmLead };
      setLeads((current) => current.map((lead) => (lead.id === selectedLead.id ? json.lead : lead)));
      setSelectedLeadDetails((current) => (current ? { ...current, ...json.lead } : current));
      setEmailDraft(makeMrBeeDraft(json.lead));
      showStatus("Lead details updated and audit logged.");
    });
  }

  function createLead() {
    startTransition(async () => {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null) as { error?: string; errors?: Record<string, string> } | null;
        showError(json?.error || Object.values(json?.errors || {})[0] || "Lead could not be created.");
        return;
      }
      const json = (await response.json()) as { lead: CrmLead };
      setLeads((current) => [json.lead, ...current]);
      selectLead(json.lead);
      setForm((current) => ({ ...current, familyName: "", email: "", phone: "" }));
      showStatus("Lead created, follow-up task added, and audit log recorded.");
    });
  }

  function saveNote() {
    if (!selectedLead || !noteBody.trim()) return;

    startTransition(async () => {
      const response = await fetch(`/api/leads/${selectedLead.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody }),
      });

      if (!response.ok) {
        showError("Note could not be saved.");
        return;
      }

      const json = (await response.json()) as { note: LeadNote };
      setSelectedLeadDetails((current) =>
        current ? { ...current, notes: [json.note, ...current.notes] } : current,
      );
      setNoteBody("");
      showStatus("Internal note saved and audit logged.");
    });
  }

  function createTask() {
    if (!selectedLead || !taskTitle.trim()) return;

    startTransition(async () => {
      const response = await fetch(`/api/leads/${selectedLead.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskTitle, dueAt: taskDueAt }),
      });

      if (!response.ok) {
        showError("Task could not be created.");
        return;
      }

      const json = (await response.json()) as { task: LeadTask };
      setSelectedLeadDetails((current) =>
        current ? { ...current, tasks: [json.task, ...current.tasks] } : current,
      );
      setTaskTitle("");
      setTaskDueAt("");
      showStatus("Follow-up task created and audit logged.");
    });
  }

  function scheduleTour() {
    if (!selectedLead || !tourStartsAt) return;

    startTransition(async () => {
      const response = await fetch(`/api/leads/${selectedLead.id}/tours`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startsAt: tourStartsAt, notes: tourNotes }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null) as { error?: string } | null;
        showError(json?.error || "Tour could not be scheduled.");
        return;
      }

      const json = (await response.json()) as { tour: LeadTour; lead: CrmLead };
      setLeads((current) => current.map((lead) => (lead.id === selectedLead.id ? json.lead : lead)));
      setSelectedLeadDetails((current) =>
        current ? { ...current, ...json.lead, tours: [json.tour, ...current.tours] } : current,
      );
      setTourStartsAt("");
      setTourNotes("");
      showStatus("Tour scheduled, pipeline updated, and audit logged.");
    });
  }

  function refreshMrBeeDraft() {
    if (!selectedLead) return;

    startTransition(async () => {
      const response = await fetch("/api/ai/mr-bee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: selectedLead.id, purpose: "follow_up" }),
      });

      if (!response.ok) {
        showError("Mr. Bee could not refresh the draft.");
        return;
      }

      const json = (await response.json()) as { suggestion: string };
      setEmailDraft(json.suggestion);
      showStatus("Mr. Bee draft refreshed. Human review is still required.");
    });
  }

  async function copyDraft() {
    if (!emailDraft) return;
    await navigator.clipboard.writeText(emailDraft);
    showStatus("Draft copied for review.");
  }

  function sendReviewedEmail() {
    if (!selectedLead) return;

    startTransition(async () => {
      const response = await fetch(`/api/leads/${selectedLead.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: emailSubject, message: emailDraft }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null) as { error?: string } | null;
        showError(json?.error || "Reviewed email could not be sent.");
        return;
      }

      const json = (await response.json()) as { note: LeadNote };
      setSelectedLeadDetails((current) =>
        current ? { ...current, notes: [json.note, ...current.notes] } : current,
      );
      showStatus("Reviewed email sent and logged on the lead.");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-2xl border bg-card/80 shadow-2xl shadow-black/20">
        <div className="grid gap-0 xl:grid-cols-[1fr_22rem]">
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">Kid City USA Live CRM</Badge>
              <Badge variant="outline">SaaS tenant-ready</Badge>
              <Badge variant="secondary">{filteredLeads.length.toLocaleString()} visible leads</Badge>
              <Badge variant="outline">
                {centers.length === 1
                  ? "School-scoped access"
                  : `${centers.length.toLocaleString()} school access`}
              </Badge>
              <Badge variant="secondary">Signed in: {currentUser.name}</Badge>
            </div>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Enrollment CRM Command Center
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Live lead intake, school routing, manual lead entry, pipeline movement,
                  and Mr. Bee communication support for Kid City USA’s first rollout.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border bg-background/55 p-3">
                  <div className="text-xs text-muted-foreground">Total leads</div>
                  <div className="text-2xl font-semibold">{leads.length.toLocaleString()}</div>
                </div>
                <div className="rounded-xl border bg-background/55 p-3">
                  <div className="text-xs text-muted-foreground">High intent</div>
                  <div className="text-2xl font-semibold">{highIntent.toLocaleString()}</div>
                </div>
                <div className="rounded-xl border bg-background/55 p-3">
                  <div className="text-xs text-muted-foreground">Schools</div>
                  <div className="text-2xl font-semibold">{centers.length.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t bg-primary/10 p-5 xl:border-l xl:border-t-0">
            <div className="flex items-center gap-3">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl border bg-black">
                <Image src="/mr-bee.png" alt="Mr. Bee" fill className="object-contain p-1" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Bot className="text-primary" />
                  Mr. Bee
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  AI communication assistant. Drafts only, with human approval required.
                </p>
              </div>
            </div>
            <Input
              className="mt-4"
              value={emailSubject}
              onChange={(event) => setEmailSubject(event.target.value)}
              aria-label="Reviewed email subject"
            />
            <Textarea
              className="mt-3 min-h-32"
              value={emailDraft}
              onChange={(event) => setEmailDraft(event.target.value)}
              aria-label="Mr. Bee reviewed draft"
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
              <Button variant="outline" disabled={!selectedLead || isPending} onClick={refreshMrBeeDraft}>
                <Wand2 data-icon="inline-start" />
                Refresh draft
              </Button>
              <Button variant="outline" disabled={!selectedLead || !emailDraft} onClick={copyDraft}>
                <Clipboard data-icon="inline-start" />
                Copy draft
              </Button>
              <Button disabled={!selectedLead?.email || !emailDraft || isPending} onClick={sendReviewedEmail}>
                <Send data-icon="inline-start" />
                Send reviewed email
              </Button>
            </div>
          </div>
        </div>
      </section>

      {statusMessage ? (
        <Alert className="border-emerald-400/30 bg-emerald-400/10">
          <CheckCircle2 />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      ) : null}

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Action needed</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          <Card className="glass-panel">
            <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_18rem]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-10"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search parent, email, phone, or school..."
                />
              </div>
              <Select value={selectedCenter} onValueChange={(value) => value && setSelectedCenter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All schools" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Kid City USA schools</SelectItem>
                  {centers.map((center) => (
                    <SelectItem key={center.id} value={center.id}>
                      {getCenterLabel(center)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-4">
            {enrollmentStages.slice(0, 8).map((stage) => (
              <Card key={stage} className="min-h-72 border-primary/15 bg-card/75">
                <CardHeader className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm">{stageLabels[stage]}</CardTitle>
                    <Badge variant="secondary">{byStage[stage]?.length ?? 0}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 p-4 pt-0">
                  {(byStage[stage] ?? []).slice(0, 8).map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => selectLead(lead)}
                      className={cn(
                        "rounded-xl border bg-background/55 p-3 text-left transition hover:border-primary/60",
                        selectedLeadId === lead.id && "border-primary bg-primary/10",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{lead.familyName}</div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {lead.center.crmLocationId ?? lead.center.name}
                          </div>
                        </div>
                        <Badge variant={lead.score >= 75 ? "default" : "outline"}>{lead.score}</Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{lead.leadSource ?? "Unknown source"}</span>
                        <span>{safeDate(lead.createdAt)}</span>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="text-primary" />
                Add Lead
              </CardTitle>
              <CardDescription>Manual entries route to the selected school profile.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid gap-2">
                <Label htmlFor="familyName">Parent / family name</Label>
                <Input
                  id="familyName"
                  value={form.familyName}
                  onChange={(event) => setForm({ ...form, familyName: event.target.value })}
                  placeholder="Jane Parent"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="parent@example.com"
                  type="email"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="555-555-1212"
                />
              </div>
              <div className="grid gap-2">
                <Label>Program</Label>
                <Select value={form.program} onValueChange={(program) => program && setForm({ ...form, program })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {programOptions.map((program) => (
                      <SelectItem key={program} value={program}>
                        {program}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>School</Label>
                <Select
                  value={form.locationId}
                  onValueChange={(locationId) => locationId && setForm({ ...form, locationId })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {centers.map((center) => (
                      <SelectItem key={center.id} value={center.crmLocationId ?? center.id}>
                        {getCenterLabel(center)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={createLead} disabled={isPending || !form.familyName}>
                Add to CRM
                <ArrowRight data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="text-primary" />
                Selected Lead
              </CardTitle>
              <CardDescription>School users can update stage and follow up from here.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {selectedLead ? (
                <>
                  <div>
                    <div className="text-lg font-semibold">{selectedLead.familyName}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge>{stageLabels[selectedLead.stage]}</Badge>
                      <Badge variant="outline">Score {selectedLead.score}</Badge>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Mail className="size-4" />
                      {selectedLead.email ?? "No email"}
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="size-4" />
                      {selectedLead.phone ?? "No phone"}
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="size-4" />
                      {getCenterLabel(selectedLead.center)}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-family-name">Parent / family name</Label>
                    <Input
                      id="edit-family-name"
                      value={editForm.familyName}
                      onChange={(event) => setEditForm({ ...editForm, familyName: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-child-name">Child name</Label>
                    <Input
                      id="edit-child-name"
                      value={editForm.childName}
                      onChange={(event) => setEditForm({ ...editForm, childName: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input
                      id="edit-email"
                      value={editForm.email}
                      onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                      type="email"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-phone">Phone</Label>
                    <Input
                      id="edit-phone"
                      value={editForm.phone}
                      onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Program interest</Label>
                    <Select
                      value={editForm.programInterest || "Preschool"}
                      onValueChange={(programInterest) => programInterest && setEditForm({ ...editForm, programInterest })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {programOptions.map((program) => (
                          <SelectItem key={program} value={program}>
                            {program}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-age-group">Age group interest</Label>
                    <Input
                      id="edit-age-group"
                      value={editForm.ageGroupInterest}
                      onChange={(event) => setEditForm({ ...editForm, ageGroupInterest: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-start-date">Desired start date</Label>
                    <Input
                      id="edit-start-date"
                      value={editForm.desiredStartDate}
                      onChange={(event) => setEditForm({ ...editForm, desiredStartDate: event.target.value })}
                      type="date"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-source">Lead source</Label>
                    <Input
                      id="edit-source"
                      value={editForm.leadSource}
                      onChange={(event) => setEditForm({ ...editForm, leadSource: event.target.value })}
                    />
                  </div>
                  <Button variant="outline" onClick={saveLeadDetails} disabled={isPending || !editForm.familyName.trim()}>
                    Save lead details
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                  <div className="grid gap-2">
                    <Label>Move pipeline stage</Label>
                    <Select
                      value={selectedLead.stage}
                      onValueChange={(stage) => updateLeadStage(selectedLead.id, stage as EnrollmentStage)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {enrollmentStages.map((stage) => (
                          <SelectItem key={stage} value={stage}>
                            {stageLabels[stage]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="lead-note">Internal note</Label>
                    <Textarea
                      id="lead-note"
                      value={noteBody}
                      onChange={(event) => setNoteBody(event.target.value)}
                      placeholder="Add a school-visible follow-up note..."
                    />
                    <Button variant="outline" onClick={saveNote} disabled={isPending || !noteBody.trim()}>
                      Save note
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="task-title">Follow-up task</Label>
                    <Input
                      id="task-title"
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      placeholder="Call family tomorrow"
                    />
                    <Input
                      value={taskDueAt}
                      onChange={(event) => setTaskDueAt(event.target.value)}
                      type="datetime-local"
                      aria-label="Task due date"
                    />
                    <Button variant="outline" onClick={createTask} disabled={isPending || !taskTitle.trim()}>
                      Create task
                      <Plus data-icon="inline-end" />
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tour-starts-at">Schedule tour</Label>
                    <Input
                      id="tour-starts-at"
                      value={tourStartsAt}
                      onChange={(event) => setTourStartsAt(event.target.value)}
                      type="datetime-local"
                    />
                    <Textarea
                      value={tourNotes}
                      onChange={(event) => setTourNotes(event.target.value)}
                      placeholder="Tour notes, prep items, or family questions..."
                    />
                    <Button variant="outline" onClick={scheduleTour} disabled={isPending || !tourStartsAt}>
                      Schedule tour
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  </div>
                  <div className="rounded-xl border bg-background/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">Tours</div>
                      <Badge variant="secondary">{selectedLeadDetails?.tours?.length ?? 0}</Badge>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      {(selectedLeadDetails?.tours ?? []).slice(0, 4).map((tour) => (
                        <div key={tour.id} className="rounded-lg border bg-card/60 p-2">
                          <div className="text-xs font-medium">{formatTourDate(tour.startsAt)}</div>
                          <div className="mt-1 text-[0.7rem] text-muted-foreground">
                            {tour.status}{tour.notes ? ` - ${tour.notes}` : ""}
                          </div>
                        </div>
                      ))}
                      {selectedLeadDetails?.tours?.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No tours scheduled yet.</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-xl border bg-background/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">Open tasks</div>
                      <Badge variant="secondary">{selectedLeadDetails?.tasks?.length ?? 0}</Badge>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      {(selectedLeadDetails?.tasks ?? []).slice(0, 4).map((task) => (
                        <div key={task.id} className="rounded-lg border bg-card/60 p-2">
                          <div className="text-xs font-medium">{task.title}</div>
                          <div className="mt-1 text-[0.7rem] text-muted-foreground">
                            {task.dueAt ? safeDate(task.dueAt) : "No due date"} · {task.status}
                          </div>
                        </div>
                      ))}
                      {selectedLeadDetails?.tasks?.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No tasks logged yet.</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-xl border bg-background/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">Recent notes</div>
                      <Badge variant="secondary">{selectedLeadDetails?.notes?.length ?? 0}</Badge>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      {(selectedLeadDetails?.notes ?? []).slice(0, 4).map((note) => (
                        <div key={note.id} className="rounded-lg border bg-card/60 p-2">
                          <div className="text-xs leading-5">{note.body}</div>
                          <div className="mt-1 text-[0.7rem] text-muted-foreground">
                            {note.user?.name ?? "System"} · {safeDate(note.createdAt)}
                          </div>
                        </div>
                      ))}
                      {selectedLeadDetails?.notes?.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No notes logged yet.</p>
                      ) : null}
                    </div>
                  </div>
                  <Button variant="outline" onClick={refreshMrBeeDraft} disabled={isPending}>
                    Contact with Mr. Bee
                    <Bot data-icon="inline-end" />
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No leads are available yet.</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
