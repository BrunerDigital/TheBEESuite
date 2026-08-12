"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedDateTime, zonedDateTimeLocalToUtc } from "@/lib/zoned-date-time";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clipboard,
  Download,
  GitMerge,
  GripVertical,
  Mail,
  MapPin,
  Paperclip,
  Phone,
  Plus,
  Printer,
  Search,
  Send,
  Save,
  TriangleAlert,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { EnrollmentStage } from "@prisma/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatPrintDateTime, PrintableReport, ReportPrintStyles, usePrintableReport } from "@/components/printable-report";
import { crmPipelineStageDisclosure, enrollmentStages, stageLabels } from "@/lib/crm";
import { registrationHandoffHref } from "@/lib/registration-handoff";
import {
  buildRegistrationLeadSuggestion,
  buildRegistrationShareUrl,
} from "@/lib/registration-sharing";
import type { WorkspaceBranding } from "@/lib/brand-assets";
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
  customFields?: unknown;
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

type LinkedEnrollment = {
  id: string;
  childId: string;
  stage: EnrollmentStage;
  updatedAt: string | Date;
};

type LeadDetails = CrmLead & {
  notes: LeadNote[];
  tasks: LeadTask[];
  tours: LeadTour[];
  enrollments: LinkedEnrollment[];
};

type LeadTimelineItem = {
  id: string;
  kind: "note" | "email" | "task" | "tour";
  title: string;
  body: string;
  at: string | Date | null;
};

type ScoreFilter = "all" | "high" | "medium" | "low";
type CreatedRangeFilter = "all" | "7" | "30" | "90";

type LeadEmailSuggestion = {
  label: string;
  subject: string;
  body: string;
};

type EmailComposerAttachment = {
  id: string;
  filename: string;
  type: string;
  size: number;
  content: string;
};

type CrmSavedView = {
  id: string;
  name: string;
  query: string;
  center: string;
  stage: EnrollmentStage | "all";
  score: ScoreFilter;
  createdRange: CreatedRangeFilter;
};

type Props = {
  initialLeads: CrmLead[];
  centers: CenterOption[];
  appBaseUrl: string;
  currentUser: {
    name: string;
    role: string;
    centerIds: string[];
    branding: WorkspaceBranding;
  };
};

const programOptions = [
  "Daycare",
  "Preschool",
  "Before & After School Care",
  "Summer Camp",
];

const crmSavedViewsStorageKey = "bee-suite.crm.savedViews.v1";
const crmSavedViewsEventName = "bee-suite-crm-saved-views";
const maxEmailAttachmentCount = 5;
const maxEmailAttachmentBytes = 8 * 1024 * 1024;
let crmSavedViewsRawSnapshot = "";
let crmSavedViewsSnapshot: CrmSavedView[] = [];

const scoreFilterLabels: Record<ScoreFilter, string> = {
  all: "All scores",
  high: "High intent 75+",
  medium: "Medium 50-74",
  low: "Needs review <50",
};

const createdRangeLabels: Record<CreatedRangeFilter, string> = {
  all: "All dates",
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
};

function safeDate(value: string | Date, timeZone: string) {
  return formatZonedDateTime(value, timeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTourDate(value: string | Date, timeZone: string) {
  return formatZonedDateTime(value, timeZone, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
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

function displayStatusLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function getLeadOwner(lead?: CrmLead | null) {
  const fields = lead?.customFields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return "";
  const ownerName = "ownerName" in fields ? fields.ownerName : null;
  const ownerEmail = "ownerEmail" in fields ? fields.ownerEmail : null;
  return typeof ownerName === "string" && ownerName
    ? ownerName
    : typeof ownerEmail === "string" ? ownerEmail : "";
}

function makeMrBeeDraft(lead: CrmLead | undefined, brandName: string) {
  if (!lead) return "Choose a lead, then ask Mr. Bee to draft a follow-up for your review.";

  return `Hi ${lead.familyName}, this is ${brandName} following up on your ${lead.programInterest ?? "childcare"} inquiry for ${lead.center.name}. We would be happy to answer questions, confirm availability, or help schedule your next step.`;
}

function makeLeadEmailOptions(
  lead: CrmLead | undefined,
  appBaseUrl: string,
  brandName: string,
): LeadEmailSuggestion[] {
  if (!lead) return [];
  const program = lead.programInterest ?? "childcare";
  const childLine = lead.childName ? ` for ${lead.childName}` : "";
  const centerName = lead.center.crmLocationId ?? lead.center.name;
  const subject = `${brandName} ${program} follow-up`;

  const generalSuggestions = [
    {
      label: "Warm follow-up",
      subject,
      body: `Hi ${lead.familyName},\n\nThank you for your interest in ${program}${childLine} at ${centerName}. We would be happy to answer questions, confirm availability, or help schedule your next step.\n\nThank you,\n${brandName}`,
    },
    {
      label: "Tour next step",
      subject: `Tour availability for ${centerName}`,
      body: `Hi ${lead.familyName},\n\nI wanted to follow up on your ${program} inquiry${childLine}. If you would like to tour ${centerName}, reply with a few times that work well and our team can help coordinate the visit.\n\nThank you,\n${brandName}`,
    },
    {
      label: "Application help",
      subject: `Enrollment next steps for ${centerName}`,
      body: `Hi ${lead.familyName},\n\nThis is ${brandName} checking in to see if you need help with the next enrollment step for ${program}${childLine}. Our team can answer questions about availability, paperwork, or start dates.\n\nThank you,\n${brandName}`,
    },
  ];
  const registrationSuggestion = buildRegistrationLeadSuggestion({
    familyName: lead.familyName,
    childName: lead.childName,
    program: lead.programInterest,
    schoolLabel: centerName,
    registrationUrl: buildRegistrationShareUrl(appBaseUrl, lead.center.id),
    stage: lead.stage,
    customFields: lead.customFields,
    brandName,
  });
  return registrationSuggestion ? [registrationSuggestion, ...generalSuggestions] : generalSuggestions;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToEmailAttachment(file: File): Promise<EmailComposerAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const content = result.includes(",") ? result.split(",").pop() ?? "" : result;
      resolve({
        id: `${file.name}-${file.size}-${file.lastModified}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
        filename: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        content,
      });
    };
    reader.onerror = () => reject(new Error(`${file.name} could not be attached.`));
    reader.readAsDataURL(file);
  });
}

function getScoreFilterMatch(score: number, filter: ScoreFilter) {
  if (filter === "high") return score >= 75;
  if (filter === "medium") return score >= 50 && score < 75;
  if (filter === "low") return score < 50;
  return true;
}

function getCreatedRangeMatch(value: string | Date, filter: CreatedRangeFilter) {
  if (filter === "all") return true;
  const createdAt = new Date(value).getTime();
  if (Number.isNaN(createdAt)) return false;
  const days = Number(filter);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return createdAt >= cutoff;
}

function safeCsvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function normalizeMatchText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function normalizePhone(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function duplicateReasons(primary: CrmLead, candidate: CrmLead) {
  const reasons: string[] = [];
  const primaryEmail = normalizeMatchText(primary.email);
  const candidateEmail = normalizeMatchText(candidate.email);
  const primaryPhone = normalizePhone(primary.phone);
  const candidatePhone = normalizePhone(candidate.phone);
  const primaryFamily = normalizeMatchText(primary.familyName);
  const candidateFamily = normalizeMatchText(candidate.familyName);
  const primaryChild = normalizeMatchText(primary.childName);
  const candidateChild = normalizeMatchText(candidate.childName);

  if (primaryEmail && primaryEmail === candidateEmail) reasons.push("same email");
  if (primaryPhone && candidatePhone && primaryPhone.slice(-7) === candidatePhone.slice(-7)) reasons.push("same phone");
  if (primaryFamily && primaryFamily === candidateFamily) reasons.push("same family name");
  if (primaryChild && candidateChild && primaryChild === candidateChild) reasons.push("same child name");

  return reasons;
}

function leadTimeline(details: LeadDetails | null): LeadTimelineItem[] {
  if (!details) return [];

  const notes: LeadTimelineItem[] = details.notes.map((note) => ({
    id: note.id,
    kind: note.body.toLowerCase().includes("email sent") ? "email" : "note",
    title: note.body.toLowerCase().includes("email sent") ? "Reviewed email" : "Internal note",
    body: note.body,
    at: note.createdAt,
  }));
  const tasks: LeadTimelineItem[] = details.tasks.map((task) => ({
    id: task.id,
    kind: "task",
    title: task.title,
    body: task.status,
    at: task.dueAt,
  }));
  const tours: LeadTimelineItem[] = details.tours.map((tour) => ({
    id: tour.id,
    kind: "tour",
    title: "Tour",
    body: tour.notes || tour.status,
    at: tour.startsAt,
  }));

  return [...notes, ...tasks, ...tours].sort((left, right) => {
    const leftTime = left.at ? new Date(left.at).getTime() : 0;
    const rightTime = right.at ? new Date(right.at).getTime() : 0;
    return rightTime - leftTime;
  });
}

function makeCsvRows(leads: CrmLead[], timeZone: string) {
  const headers = [
    "Family Name",
    "Child Name",
    "Email",
    "Phone",
    "Program",
    "Age Group",
    "Pipeline Stage",
    "Lead Score",
    "Status",
    "Owner",
    "Lead Source",
    "Desired Start Date",
    "Created At",
    "School",
    "CRM Location ID",
    "City",
    "State",
  ];
  const rows = leads.map((lead) => [
    lead.familyName,
    lead.childName,
    lead.email,
    lead.phone,
    lead.programInterest,
    lead.ageGroupInterest,
    stageLabels[lead.stage],
    lead.score,
    lead.status,
    getLeadOwner(lead),
    lead.leadSource,
    dateInputValue(lead.desiredStartDate),
    safeDate(lead.createdAt, timeZone),
    lead.center.name,
    lead.center.crmLocationId,
    lead.center.city,
    lead.center.state,
  ]);
  return [headers, ...rows].map((row) => row.map(safeCsvCell).join(",")).join("\r\n");
}

function parseSavedViews(value: string | null): CrmSavedView[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as CrmSavedView[];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((view) => {
      if (!view?.id || !view?.name) return [];
      const stage =
        view.stage === "all" || enrollmentStages.includes(view.stage as EnrollmentStage)
          ? view.stage
          : "all";
      const score = view.score in scoreFilterLabels ? view.score : "all";
      const createdRange = view.createdRange in createdRangeLabels ? view.createdRange : "all";
      return [{
        id: String(view.id),
        name: String(view.name),
        query: String(view.query ?? ""),
        center: String(view.center ?? "all"),
        stage,
        score,
        createdRange,
      }];
    });
  } catch {
    return [];
  }
}

function getCrmSavedViewsSnapshot() {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(crmSavedViewsStorageKey) ?? "";
  if (raw !== crmSavedViewsRawSnapshot) {
    crmSavedViewsRawSnapshot = raw;
    crmSavedViewsSnapshot = parseSavedViews(raw);
  }
  return crmSavedViewsSnapshot;
}

function getServerCrmSavedViewsSnapshot() {
  return [];
}

function subscribeCrmSavedViews(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const listener = () => callback();
  window.addEventListener("storage", listener);
  window.addEventListener(crmSavedViewsEventName, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(crmSavedViewsEventName, listener);
  };
}

export function CrmWorkspace({ initialLeads, centers, appBaseUrl, currentUser }: Props) {
  const timeZone = useSchoolTimeZone();
  const controlId = useId();
  const emailSubjectId = `${controlId}-email-subject`;
  const emailPurposeId = `${controlId}-email-purpose`;
  const emailDraftId = `${controlId}-email-draft`;
  const emailAttachmentsId = `${controlId}-email-attachments`;
  const leadSearchId = `${controlId}-lead-search`;
  const centerFilterId = `${controlId}-center-filter`;
  const stageFilterId = `${controlId}-stage-filter`;
  const scoreFilterId = `${controlId}-score-filter`;
  const dateFilterId = `${controlId}-date-filter`;
  const savedViewNameId = `${controlId}-saved-view-name`;
  const newFamilyNameId = `${controlId}-new-family-name`;
  const newEmailId = `${controlId}-new-email`;
  const newPhoneId = `${controlId}-new-phone`;
  const newProgramId = `${controlId}-new-program`;
  const newSchoolId = `${controlId}-new-school`;
  const editFamilyNameId = `${controlId}-edit-family-name`;
  const editChildNameId = `${controlId}-edit-child-name`;
  const editEmailId = `${controlId}-edit-email`;
  const editPhoneId = `${controlId}-edit-phone`;
  const editProgramId = `${controlId}-edit-program`;
  const editAgeGroupId = `${controlId}-edit-age-group`;
  const editStartDateId = `${controlId}-edit-start-date`;
  const editSourceId = `${controlId}-edit-source`;
  const pipelineStageId = `${controlId}-pipeline-stage`;
  const leadNoteId = `${controlId}-lead-note`;
  const taskTitleId = `${controlId}-task-title`;
  const taskDueAtId = `${controlId}-task-due-at`;
  const tourStartsAtId = `${controlId}-tour-starts-at`;
  const tourNotesId = `${controlId}-tour-notes`;
  const brandName = currentUser.branding.name;
  const searchParams = useSearchParams();
  const routeQuery = searchParams.get("q") ?? "";
  const [leads, setLeads] = useState(initialLeads);
  const [selectedCenter, setSelectedCenter] = useState("all");
  const [queryState, setQueryState] = useState({ routeQuery, value: routeQuery });
  const query = queryState.routeQuery === routeQuery ? queryState.value : routeQuery;
  const [stageFilter, setStageFilter] = useState<EnrollmentStage | "all">("all");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [createdRange, setCreatedRange] = useState<CreatedRangeFilter>("all");
  const savedViews = useSyncExternalStore(
    subscribeCrmSavedViews,
    getCrmSavedViewsSnapshot,
    getServerCrmSavedViewsSnapshot,
  );
  const [savedViewName, setSavedViewName] = useState("");
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState(initialLeads[0]?.id ?? "");
  const [selectedLeadDetails, setSelectedLeadDetails] = useState<LeadDetails | null>(null);
  const [leadDetailsRefreshKey, setLeadDetailsRefreshKey] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
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
  const [emailSubject, setEmailSubject] = useState(`${brandName} enrollment follow-up`);
  const [emailDraft, setEmailDraft] = useState(makeMrBeeDraft(initialLeads[0], brandName));
  const [emailPurposePrompt, setEmailPurposePrompt] = useState("");
  const [emailSuggestions, setEmailSuggestions] = useState<LeadEmailSuggestion[]>(
    () => makeLeadEmailOptions(initialLeads[0], appBaseUrl, brandName),
  );
  const [emailAttachments, setEmailAttachments] = useState<EmailComposerAttachment[]>([]);
  const { active: printActive, generatedAt: printGeneratedAt, print: printReport } = usePrintableReport();
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
    const needle = query.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesCenter = selectedCenter === "all" || lead.center.id === selectedCenter;
      const matchesStage = stageFilter === "all" || lead.stage === stageFilter;
      const matchesScore = getScoreFilterMatch(lead.score, scoreFilter);
      const matchesCreatedRange = getCreatedRangeMatch(lead.createdAt, createdRange);
      const matchesQuery =
        !needle ||
        lead.familyName.toLowerCase().includes(needle) ||
        lead.childName?.toLowerCase().includes(needle) ||
        lead.email?.toLowerCase().includes(needle) ||
        lead.phone?.includes(needle) ||
        lead.programInterest?.toLowerCase().includes(needle) ||
        lead.center.name.toLowerCase().includes(needle) ||
        lead.center.crmLocationId?.toLowerCase().includes(needle);
      return matchesCenter && matchesStage && matchesScore && matchesCreatedRange && matchesQuery;
    });
  }, [createdRange, leads, query, scoreFilter, selectedCenter, stageFilter]);

  const byStage = useMemo(() => {
    return enrollmentStages.reduce<Record<EnrollmentStage, CrmLead[]>>((acc, stage) => {
      acc[stage] = filteredLeads.filter((lead) => lead.stage === stage).slice(0, 25);
      return acc;
    }, {} as Record<EnrollmentStage, CrmLead[]>);
  }, [filteredLeads]);

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? leads[0];
  const highIntent = filteredLeads.filter((lead) => lead.score >= 75).length;
  const selectedCenterOption = selectedCenter === "all" ? null : centers.find((center) => center.id === selectedCenter) ?? null;
  const printSchoolLabel = selectedCenterOption
    ? getCenterLabel(selectedCenterOption)
    : centers.length === 1
      ? getCenterLabel(centers[0])
      : "All visible schools";
  const printFilterSummary = [
    `School: ${printSchoolLabel}`,
    `Stage: ${stageFilter === "all" ? "All stages" : stageLabels[stageFilter]}`,
    `Score: ${scoreFilterLabels[scoreFilter]}`,
    `Created: ${createdRangeLabels[createdRange]}`,
    query.trim() ? `Search: ${query.trim()}` : null,
  ].filter(Boolean).join(" | ");
  const timeline = useMemo(() => leadTimeline(selectedLeadDetails), [selectedLeadDetails]);
  const duplicateCandidates = useMemo(() => {
    if (!selectedLead) return [];

    return leads
      .filter((lead) => (
        lead.id !== selectedLead.id &&
        lead.center.id === selectedLead.center.id &&
        lead.status !== "merged"
      ))
      .map((lead) => {
        const reasons = duplicateReasons(selectedLead, lead);
        const confidence = reasons.includes("same email") || reasons.includes("same phone")
          ? "high"
          : "medium";
        return { lead, reasons, confidence };
      })
      .filter(({ reasons }) => (
        reasons.includes("same email") ||
        reasons.includes("same phone") ||
        (reasons.includes("same family name") && reasons.includes("same child name"))
      ))
      .sort((left, right) => right.reasons.length - left.reasons.length)
      .slice(0, 4);
  }, [leads, selectedLead]);

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
  }, [leadDetailsRefreshKey, selectedLead?.id]);

  function selectLead(lead: CrmLead) {
    setSelectedLeadId(lead.id);
    setSelectedLeadDetails(null);
    setEmailSubject(`${brandName} ${lead.programInterest ?? "enrollment"} follow-up`);
    setEmailDraft(makeMrBeeDraft(lead, brandName));
    setEmailSuggestions(makeLeadEmailOptions(lead, appBaseUrl, brandName));
    setEmailAttachments([]);
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

  function persistSavedViews(nextViews: CrmSavedView[]) {
    window.localStorage.setItem(crmSavedViewsStorageKey, JSON.stringify(nextViews));
    window.dispatchEvent(new Event(crmSavedViewsEventName));
  }

  function saveCurrentView() {
    const fallbackName =
      selectedCenter === "all"
        ? `Enrollment view ${savedViews.length + 1}`
        : centers.find((center) => center.id === selectedCenter)?.name ?? `Enrollment view ${savedViews.length + 1}`;
    const view: CrmSavedView = {
      id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
      name: savedViewName.trim() || fallbackName,
      query,
      center: selectedCenter,
      stage: stageFilter,
      score: scoreFilter,
      createdRange,
    };
    persistSavedViews([view, ...savedViews].slice(0, 12));
    setSavedViewName("");
    showStatus("Enrollment view saved on this device.");
  }

  function applySavedView(view: CrmSavedView) {
    setQueryState({ routeQuery, value: view.query });
    setSelectedCenter(view.center === "all" || centers.some((center) => center.id === view.center) ? view.center : "all");
    setStageFilter(view.stage);
    setScoreFilter(view.score);
    setCreatedRange(view.createdRange);
    showStatus(`Applied saved view: ${view.name}.`);
  }

  function deleteSavedView(viewId: string) {
    persistSavedViews(savedViews.filter((view) => view.id !== viewId));
    showStatus("Enrollment view removed from this device.");
  }

  function exportVisibleLeads() {
    if (filteredLeads.length === 0) {
      showError("No visible leads to export.");
      return;
    }
    const csv = makeCsvRows(filteredLeads, timeZone);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bee-suite-crm-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showStatus(`Exported ${filteredLeads.length.toLocaleString()} visible lead records.`);
  }

  function printVisibleInquiries() {
    if (filteredLeads.length === 0) {
      showError("No visible inquiries to print.");
      return;
    }
    printReport();
  }

  function moveDraggedLead(stage: EnrollmentStage) {
    if (!draggingLeadId) return;
    const draggedLead = leads.find((lead) => lead.id === draggingLeadId);
    setDraggingLeadId(null);
    if (!draggedLead || draggedLead.stage === stage) return;
    updateLeadStage(draggedLead.id, stage);
  }

  function updateLeadStage(leadId: string, stage: EnrollmentStage) {
    const previous = leads;
    setLeads((current) =>
      current.map((lead) => (lead.id === leadId ? { ...lead, stage } : lead)),
    );

    setPendingAction("stage");
    startTransition(async () => {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!response.ok) {
        setLeads(previous);
        const json = await response.json().catch(() => null) as { error?: string } | null;
        showError(json?.error || "Pipeline stage could not be updated.");
        return;
      }
      const json = (await response.json()) as { lead: CrmLead };
      setLeads((current) => current.map((lead) => (lead.id === leadId ? json.lead : lead)));
      setLeadDetailsRefreshKey((current) => current + 1);
      showStatus("Pipeline stage updated and logged.");
    });
  }

  function saveLeadDetails() {
    if (!selectedLead) return;

    setPendingAction("lead-details");
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
      setEmailDraft(makeMrBeeDraft(json.lead, brandName));
      setEmailSuggestions(makeLeadEmailOptions(json.lead, appBaseUrl, brandName));
      showStatus("Lead details updated and audit logged.");
    });
  }

  function updateLeadOwner(ownerAction: "assign_self" | "clear") {
    if (!selectedLead) return;

    setPendingAction(ownerAction === "assign_self" ? "assign-owner" : "clear-owner");
    startTransition(async () => {
      const response = await fetch(`/api/leads/${selectedLead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerAction }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null) as { error?: string } | null;
        showError(json?.error || "Lead owner could not be updated.");
        return;
      }

      const json = (await response.json()) as { lead: CrmLead };
      setLeads((current) => current.map((lead) => (lead.id === selectedLead.id ? json.lead : lead)));
      setSelectedLeadDetails((current) => (current ? { ...current, ...json.lead } : current));
      showStatus(ownerAction === "assign_self" ? "Lead assigned to you." : "Lead owner cleared.");
    });
  }

  function createLead() {
    setPendingAction("create-lead");
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

    setPendingAction("note");
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

    setPendingAction("task");
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

    setPendingAction("tour");
    startTransition(async () => {
      const response = await fetch(`/api/leads/${selectedLead.id}/tours`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startsAt: zonedDateTimeLocalToUtc(tourStartsAt, timeZone)?.toISOString(), notes: tourNotes }),
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

  function mergeDuplicateLead(duplicateLeadId: string) {
    if (!selectedLead) return;

    setPendingAction(`merge-${duplicateLeadId}`);
    startTransition(async () => {
      const response = await fetch(`/api/leads/${selectedLead.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateLeadId }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null) as { error?: string } | null;
        showError(json?.error || "Duplicate lead could not be merged.");
        return;
      }

      const json = (await response.json()) as { lead: CrmLead; mergedLeadId: string };
      setLeads((current) =>
        current
          .map((lead) => (lead.id === json.lead.id ? json.lead : lead))
          .filter((lead) => lead.id !== json.mergedLeadId),
      );
      selectLead(json.lead);
      setLeadDetailsRefreshKey((current) => current + 1);
      showStatus("Duplicate merged, related activity moved, and audit log recorded.");
    });
  }

  function refreshMrBeeDraft() {
    if (!selectedLead) return;

    setPendingAction("refresh-draft");
    startTransition(async () => {
      const response = await fetch("/api/ai/mr-bee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: selectedLead.id, purpose: "follow_up", contextPrompt: emailPurposePrompt }),
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

  function generateEmailSuggestions() {
    if (!selectedLead) return;

    setPendingAction("email-options");
    startTransition(async () => {
      const response = await fetch("/api/ai/mr-bee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: selectedLead.id,
          purpose: "follow_up",
          contextPrompt: emailPurposePrompt,
          mode: "options",
        }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null) as { error?: string } | null;
        showError(json?.error || "Mr. Bee could not generate message options.");
        return;
      }

      const json = (await response.json()) as { suggestions?: LeadEmailSuggestion[]; guardrailNote?: string };
      const nextSuggestions = Array.isArray(json.suggestions) && json.suggestions.length
        ? json.suggestions
        : makeLeadEmailOptions(selectedLead, appBaseUrl, brandName);
      setEmailSuggestions(nextSuggestions);
      showStatus("Message options generated. Review one before sending.");
    });
  }

  function applyEmailSuggestion(suggestion: LeadEmailSuggestion) {
    setEmailSubject(suggestion.subject);
    setEmailDraft(suggestion.body);
    showStatus(`Loaded ${suggestion.label} into the reviewed email draft.`);
  }

  async function addEmailAttachments(files: FileList | null) {
    if (!files?.length) return;
    const nextFiles = Array.from(files);
    if (emailAttachments.length + nextFiles.length > maxEmailAttachmentCount) {
      showError(`Attach up to ${maxEmailAttachmentCount} files per email.`);
      return;
    }
    const nextTotalBytes = emailAttachments.reduce((sum, attachment) => sum + attachment.size, 0) +
      nextFiles.reduce((sum, file) => sum + file.size, 0);
    if (nextTotalBytes > maxEmailAttachmentBytes) {
      showError("Attachments must be 8 MB or less combined.");
      return;
    }

    try {
      const converted = await Promise.all(nextFiles.map(fileToEmailAttachment));
      setEmailAttachments((current) => [...current, ...converted]);
      showStatus(`${converted.length} attachment${converted.length === 1 ? "" : "s"} added.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Attachments could not be added.");
    }
  }

  function removeEmailAttachment(attachmentId: string) {
    setEmailAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  async function copyDraft() {
    if (!emailDraft) return;
    await navigator.clipboard.writeText(emailDraft);
    showStatus("Draft copied for review.");
  }

  function sendReviewedEmail() {
    if (!selectedLead) return;

    setPendingAction("send-email");
    startTransition(async () => {
      const response = await fetch(`/api/leads/${selectedLead.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: emailSubject,
          message: emailDraft,
          attachments: emailAttachments.map((attachment) => ({
            filename: attachment.filename,
            type: attachment.type,
            content: attachment.content,
          })),
        }),
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
      setEmailAttachments([]);
      showStatus("Reviewed email sent and logged on the lead.");
    });
  }

  function sendRegistrationForm() {
    if (!selectedLead) return;

    setPendingAction("send-registration");
    startTransition(async () => {
      const response = await fetch("/api/registration/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId: selectedLead.center.id,
          leadId: selectedLead.id,
        }),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        registrationUrl?: string;
        lead?: Pick<CrmLead, "id" | "stage" | "customFields"> | null;
        note?: LeadNote | null;
      } | null;

      if (!response.ok) {
        showError(json?.error || "The registration form could not be sent.");
        return;
      }

      const nextLead = json?.lead
        ? { ...selectedLead, stage: json.lead.stage, customFields: json.lead.customFields }
        : selectedLead;
      setLeads((current) => current.map((lead) => lead.id === nextLead.id ? nextLead : lead));
      setSelectedLeadDetails((current) => current
        ? {
            ...current,
            stage: nextLead.stage,
            customFields: nextLead.customFields,
            notes: json?.note ? [json.note, ...current.notes] : current.notes,
          }
        : current);
      setEmailSuggestions(makeLeadEmailOptions(nextLead, appBaseUrl, brandName));
      showStatus("Registration link sent and recorded on this family inquiry.");
    });
  }

  async function copyRegistrationLink() {
    if (!selectedLead) return;
    await navigator.clipboard.writeText(buildRegistrationShareUrl(appBaseUrl, selectedLead.center.id));
    showStatus("School-specific registration link copied.");
  }

  const activePendingAction = isPending ? pendingAction : null;

  return (
    <div className="flex flex-col gap-6" aria-busy={isPending}>
      <ReportPrintStyles />
      <PrintableReport active={printActive} label="Printable enrollment inquiry report">
          <header className="mb-4 flex items-start justify-between gap-6">
            <div>
              <h1 className="text-xl font-bold">Enrollment inquiry report</h1>
              <p className="mt-1 text-sm font-semibold">{printSchoolLabel}</p>
              <p className="mt-1 text-xs">{printFilterSummary}</p>
            </div>
            <div className="text-right text-xs">
              <p>Generated: {formatPrintDateTime(printGeneratedAt, timeZone)}</p>
              <p>{filteredLeads.length.toLocaleString()} inquiries</p>
              <p>Printed by: {currentUser.name}</p>
            </div>
          </header>
          <table>
            <thead>
              <tr>
                <th>Family</th>
                <th>Child</th>
                <th>Contact</th>
                <th>Program</th>
                <th>Stage</th>
                <th>Score</th>
                <th>Source</th>
                <th>Desired Start</th>
                <th>Received</th>
                <th>School</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.familyName}</td>
                  <td>{lead.childName || "Not provided"}</td>
                  <td>
                    <div>{lead.email || "No email"}</div>
                    <div>{lead.phone || "No phone"}</div>
                  </td>
                  <td>
                    <div>{lead.programInterest || "Not provided"}</div>
                    <div>{lead.ageGroupInterest || ""}</div>
                  </td>
                  <td>{stageLabels[lead.stage]}</td>
                  <td>{lead.score}</td>
                  <td>{lead.leadSource || "Unknown"}</td>
                  <td>{dateInputValue(lead.desiredStartDate) || "Not set"}</td>
                  <td>{safeDate(lead.createdAt, timeZone)}</td>
                  <td>{getCenterLabel(lead.center)}</td>
                </tr>
              ))}
            </tbody>
          </table>
      </PrintableReport>
      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="grid gap-0 xl:grid-cols-[1fr_22rem]">
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">{brandName} enrollment</Badge>
              <Badge variant="secondary">{filteredLeads.length.toLocaleString()} inquiries shown</Badge>
              <Badge variant="outline">
                {centers.length === 1
                  ? "1 school"
                  : `${centers.length.toLocaleString()} schools`}
              </Badge>
              <Badge variant="secondary">Signed in: {currentUser.name}</Badge>
            </div>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Enrollment pipeline
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Review new inquiries, route families to the correct school, schedule
                  follow-up, and track progress through enrollment.
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
            <div className="mt-4 grid gap-1.5">
              <Label htmlFor={emailSubjectId}>Email subject</Label>
              <Input
                id={emailSubjectId}
                value={emailSubject}
                onChange={(event) => setEmailSubject(event.target.value)}
                placeholder="Subject"
              />
            </div>
            <div className="mt-3 grid gap-1.5">
              <Label htmlFor={emailPurposeId}>Drafting instructions</Label>
              <Textarea
                id={emailPurposeId}
                className="min-h-20"
                value={emailPurposePrompt}
                onChange={(event) => setEmailPurposePrompt(event.target.value)}
                placeholder="Describe the purpose, such as inviting the family to tour, requesting paperwork, or following up after a call."
              />
            </div>
            <div className="mt-3 grid gap-2">
              <Button
                variant="outline"
                disabled={!selectedLead || isPending}
                onClick={generateEmailSuggestions}
                aria-label={selectedLead ? `Generate email options for ${selectedLead.familyName}` : "Generate email options for the selected inquiry"}
              >
                <Bot data-icon="inline-start" />
                {activePendingAction === "email-options" ? "Generating options…" : "Generate options"}
              </Button>
              {emailSuggestions.length ? (
                <div className="grid gap-2">
                  {emailSuggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.label}-${suggestion.subject}`}
                      type="button"
                      className="rounded-lg border bg-background p-3 text-left text-xs transition-colors hover:border-primary/50 hover:bg-muted/50"
                      onClick={() => applyEmailSuggestion(suggestion)}
                      disabled={isPending}
                    >
                      <span className="font-medium text-foreground">{suggestion.label}</span>
                      <span className="mt-1 block truncate text-muted-foreground">{suggestion.subject}</span>
                      <span className="mt-2 line-clamp-3 whitespace-pre-line text-muted-foreground">{suggestion.body}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-3 grid gap-1.5">
              <Label htmlFor={emailDraftId}>Reviewed email draft</Label>
              <Textarea
                id={emailDraftId}
                className="min-h-32"
                value={emailDraft}
                onChange={(event) => setEmailDraft(event.target.value)}
              />
            </div>
            <div className="mt-3 rounded-lg border bg-background/55 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-medium">Attachments</div>
                  <div className="text-xs text-muted-foreground">
                    {emailAttachments.length
                      ? `${emailAttachments.length} file${emailAttachments.length === 1 ? "" : "s"} attached`
                      : "Optional files for this email"}
                  </div>
                </div>
                <Label
                  htmlFor={emailAttachmentsId}
                  className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <Paperclip className="size-4" />
                  Add files
                </Label>
                <Input
                  id={emailAttachmentsId}
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    void addEmailAttachments(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>
              {emailAttachments.length ? (
                <div className="mt-3 grid gap-2">
                  {emailAttachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between gap-2 rounded-md border bg-card px-2 py-1.5 text-xs">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{attachment.filename}</div>
                        <div className="text-muted-foreground">{formatBytes(attachment.size)}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEmailAttachment(attachment.id)}
                        aria-label={`Remove attachment ${attachment.filename}`}
                        disabled={isPending}
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
              <Button
                variant="outline"
                disabled={!selectedLead || isPending}
                onClick={refreshMrBeeDraft}
                aria-label={selectedLead ? `Refresh email draft for ${selectedLead.familyName}` : "Refresh email draft for the selected inquiry"}
              >
                <Wand2 data-icon="inline-start" />
                {activePendingAction === "refresh-draft" ? "Refreshing draft…" : "Refresh draft"}
              </Button>
              <Button
                variant="outline"
                disabled={!selectedLead || !emailDraft}
                onClick={copyDraft}
                aria-label={selectedLead ? `Copy email draft for ${selectedLead.familyName}` : "Copy email draft for the selected inquiry"}
              >
                <Clipboard data-icon="inline-start" />
                Copy draft
              </Button>
              <Button
                disabled={!selectedLead?.email || !emailDraft || isPending}
                onClick={sendReviewedEmail}
                aria-label={selectedLead ? `Send reviewed email to ${selectedLead.familyName}` : "Send reviewed email to the selected inquiry"}
              >
                <Send data-icon="inline-start" />
                {activePendingAction === "send-email" ? "Sending email…" : "Send reviewed email"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {statusMessage ? (
        <Alert className="border-emerald-400/30 bg-emerald-400/10" role="status" aria-live="polite">
          <CheckCircle2 />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      ) : null}

      {errorMessage ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Action needed</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="grid gap-3 lg:grid-cols-[1fr_18rem]">
                <div className="relative">
                  <Label htmlFor={leadSearchId} className="sr-only">Search enrollment inquiries</Label>
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id={leadSearchId}
                    className="pl-10"
                    value={query}
                    onChange={(event) => setQueryState({ routeQuery, value: event.target.value })}
                    placeholder="Search parent, child, email, phone, program, or school..."
                  />
                </div>
                <div>
                  <Label htmlFor={centerFilterId} className="sr-only">Filter by school</Label>
                  <Select value={selectedCenter} onValueChange={(value) => value && setSelectedCenter(value)}>
                    <SelectTrigger id={centerFilterId}>
                      <SelectValue placeholder="All schools" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All available schools</SelectItem>
                      {centers.map((center) => (
                        <SelectItem key={center.id} value={center.id}>
                          {getCenterLabel(center)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-[13rem_12rem_12rem_1fr_auto]">
                <div>
                  <Label htmlFor={stageFilterId} className="sr-only">Filter by pipeline stage</Label>
                  <Select
                    value={stageFilter}
                    onValueChange={(value) => value && setStageFilter(value as EnrollmentStage | "all")}
                  >
                    <SelectTrigger id={stageFilterId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All stages</SelectItem>
                      {enrollmentStages.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {stageLabels[stage]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={scoreFilterId} className="sr-only">Filter by lead score</Label>
                  <Select
                    value={scoreFilter}
                    onValueChange={(value) => value && setScoreFilter(value as ScoreFilter)}
                  >
                    <SelectTrigger id={scoreFilterId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(scoreFilterLabels) as ScoreFilter[]).map((filter) => (
                        <SelectItem key={filter} value={filter}>
                          {scoreFilterLabels[filter]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={dateFilterId} className="sr-only">Filter by inquiry date</Label>
                  <Select
                    value={createdRange}
                    onValueChange={(value) => value && setCreatedRange(value as CreatedRangeFilter)}
                  >
                    <SelectTrigger id={dateFilterId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(createdRangeLabels) as CreatedRangeFilter[]).map((filter) => (
                        <SelectItem key={filter} value={filter}>
                          {createdRangeLabels[filter]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={savedViewNameId} className="sr-only">Saved enrollment view name</Label>
                  <Input
                    id={savedViewNameId}
                    value={savedViewName}
                    onChange={(event) => setSavedViewName(event.target.value)}
                    placeholder="Saved view name"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-3 xl:flex">
                  <Button variant="outline" onClick={saveCurrentView}>
                    <Save data-icon="inline-start" />
                    Save view
                  </Button>
                  <Button variant="outline" onClick={exportVisibleLeads}>
                    <Download data-icon="inline-start" />
                    Export CSV
                  </Button>
                  <Button variant="outline" onClick={printVisibleInquiries}>
                    <Printer data-icon="inline-start" />
                    Print inquiries
                  </Button>
                </div>
              </div>
              {savedViews.length > 0 ? (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {savedViews.map((view) => (
                    <div key={view.id} className="flex items-center gap-1 rounded-lg border bg-background/55 p-1">
                      <Button variant="ghost" onClick={() => applySavedView(view)}>
                        {view.name}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteSavedView(view.id)}
                        aria-label={`Delete saved view ${view.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-4">
            {enrollmentStages.slice(0, 8).map((stage) => (
              <Card
                key={stage}
                onDragOver={(event) => {
                  if (draggingLeadId) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  moveDraggedLead(stage);
                }}
                className={cn(
                  "min-h-72 border-primary/15 bg-card transition-colors",
                  draggingLeadId && "border-dashed border-primary/50 ring-1 ring-primary/25",
                )}
              >
                <CardHeader className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle as="h2" className="text-sm">{stageLabels[stage]}</CardTitle>
                    <Badge variant="secondary">{byStage[stage]?.length ?? 0}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 p-4 pt-0">
                  {(byStage[stage] ?? []).slice(0, 8).map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", lead.id);
                        setDraggingLeadId(lead.id);
                        selectLead(lead);
                      }}
                      onDragEnd={() => setDraggingLeadId(null)}
                      onClick={() => selectLead(lead)}
                      className={cn(
                        "cursor-grab rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/60 active:cursor-grabbing",
                        selectedLeadId === lead.id && "border-primary bg-primary/10",
                        draggingLeadId === lead.id && "opacity-60",
                      )}
                      aria-pressed={selectedLeadId === lead.id}
                      aria-label={`Review ${lead.familyName} inquiry in ${stageLabels[lead.stage]}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2">
                          <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{lead.familyName}</div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">
                              {lead.center.crmLocationId ?? lead.center.name}
                            </div>
                          </div>
                        </div>
                        <Badge variant={lead.score >= 75 ? "default" : "outline"}>{lead.score}</Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{lead.leadSource ?? "Unknown source"}</span>
                        <span>{safeDate(lead.createdAt, timeZone)}</span>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2 text-base">
                <Plus className="text-primary" />
                Add inquiry
              </CardTitle>
              <CardDescription>Manual entries route to the selected school profile.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid gap-2">
                <Label htmlFor={newFamilyNameId}>Parent / family name</Label>
                <Input
                  id={newFamilyNameId}
                  value={form.familyName}
                  onChange={(event) => setForm({ ...form, familyName: event.target.value })}
                  placeholder="Jane Parent"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={newEmailId}>Email</Label>
                <Input
                  id={newEmailId}
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="parent@example.com"
                  type="email"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={newPhoneId}>Phone</Label>
                <Input
                  id={newPhoneId}
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="555-555-1212"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={newProgramId}>Program</Label>
                <Select value={form.program} onValueChange={(program) => program && setForm({ ...form, program })}>
                  <SelectTrigger id={newProgramId}>
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
                <Label htmlFor={newSchoolId}>School</Label>
                <Select
                  value={form.locationId}
                  onValueChange={(locationId) => locationId && setForm({ ...form, locationId })}
                >
                  <SelectTrigger id={newSchoolId}>
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
              <Button onClick={createLead} disabled={isPending || !form.familyName.trim()}>
                {activePendingAction === "create-lead" ? "Adding inquiry…" : "Add inquiry"}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2 text-base">
                Selected inquiry
              </CardTitle>
              <CardDescription>Update the inquiry stage or contact this family.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {selectedLead ? (
                <>
                  <div>
                    <div className="text-lg font-semibold">{selectedLead.familyName}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge>{stageLabels[selectedLead.stage]}</Badge>
                      <Badge variant="outline">Score {selectedLead.score}</Badge>
                      <Badge variant={getLeadOwner(selectedLead) ? "secondary" : "outline"}>
                        {getLeadOwner(selectedLead) || "Unassigned"}
                      </Badge>
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
                  <div className="grid gap-2 rounded-xl border bg-background/50 p-3">
                    <div>
                      <div className="text-sm font-medium">Lead owner</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {getLeadOwner(selectedLead)
                          ? `${getLeadOwner(selectedLead)} owns the next follow-up.`
                          : "No owner is assigned yet."}
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        variant="outline"
                        onClick={() => updateLeadOwner("assign_self")}
                        disabled={isPending}
                        aria-label={`Assign ${selectedLead.familyName} inquiry to me`}
                      >
                        {activePendingAction === "assign-owner" ? "Assigning…" : "Assign to me"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => updateLeadOwner("clear")}
                        disabled={isPending || !getLeadOwner(selectedLead)}
                        aria-label={`Clear owner for ${selectedLead.familyName} inquiry`}
                      >
                        {activePendingAction === "clear-owner" ? "Clearing…" : "Clear owner"}
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
                    <div>
                      <div className="text-sm font-medium">Registration and enrollment form</div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Send this lead the form linked directly to {getCenterLabel(selectedLead.center)}.
                        The send is logged on the lead and moves early-stage leads to Application Sent.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        disabled={!selectedLead.email || isPending}
                        onClick={sendRegistrationForm}
                        aria-label={`Send ${getCenterLabel(selectedLead.center)} registration form to ${selectedLead.familyName}`}
                      >
                        <Send data-icon="inline-start" />
                        {activePendingAction === "send-registration" ? "Sending form…" : "Send registration form"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void copyRegistrationLink()}
                        disabled={isPending}
                        aria-label={`Copy registration link for ${selectedLead.familyName}`}
                      >
                        <Clipboard data-icon="inline-start" />
                        Copy registration link
                      </Button>
                      <Button
                        variant="ghost"
                        className="sm:col-span-2"
                        nativeButton={false}
                        render={(
                          <Link
                            href={registrationHandoffHref(selectedLead.center.id)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Preview ${getCenterLabel(selectedLead.center)} application for ${selectedLead.familyName}`}
                          />
                        )}
                      >
                        Preview school application
                        <ArrowRight data-icon="inline-end" />
                      </Button>
                    </div>
                    {!selectedLead.email ? (
                      <p className="text-xs text-destructive">
                        Add a valid lead email before sending. The link can still be copied.
                      </p>
                    ) : null}
                    <p className="text-xs leading-5 text-muted-foreground">
                      Submitting the form sends the packet to the director for confirmation. It does not confirm enrollment.
                    </p>
                  </div>
                  {duplicateCandidates.length ? (
                    <div className="rounded-xl border border-amber-400/35 bg-amber-400/10 p-3">
                      <div className="flex items-start gap-2">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
                        <div>
                          <div className="text-sm font-semibold">Possible duplicate lead</div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Review before merging. Merges stay inside this school and keep an audit trail.
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-col gap-2">
                        {duplicateCandidates.map(({ lead, reasons, confidence }) => (
                          <div key={lead.id} className="rounded-lg border bg-background/60 p-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold">{lead.familyName}</div>
                                <div className="mt-1 truncate text-[0.7rem] text-muted-foreground">
                                  {lead.email ?? lead.phone ?? "No contact"} · {stageLabels[lead.stage]}
                                </div>
                              </div>
                              <Badge variant={confidence === "high" ? "default" : "outline"}>
                                {confidence}
                              </Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {reasons.map((reason) => (
                                <Badge key={reason} variant="secondary" className="text-[0.65rem]">
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <Button
                                variant="outline"
                                onClick={() => selectLead(lead)}
                                aria-label={`Review possible duplicate ${lead.familyName}`}
                                disabled={isPending}
                              >
                                Review
                              </Button>
                              <Button
                                onClick={() => mergeDuplicateLead(lead.id)}
                                disabled={isPending}
                                aria-label={`Merge possible duplicate ${lead.familyName} into ${selectedLead.familyName}`}
                              >
                                <GitMerge data-icon="inline-start" />
                                {activePendingAction === `merge-${lead.id}` ? "Merging…" : "Merge"}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    <Label htmlFor={editFamilyNameId}>Parent / family name</Label>
                    <Input
                      id={editFamilyNameId}
                      value={editForm.familyName}
                      onChange={(event) => setEditForm({ ...editForm, familyName: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={editChildNameId}>Child name</Label>
                    <Input
                      id={editChildNameId}
                      value={editForm.childName}
                      onChange={(event) => setEditForm({ ...editForm, childName: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={editEmailId}>Email</Label>
                    <Input
                      id={editEmailId}
                      value={editForm.email}
                      onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                      type="email"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={editPhoneId}>Phone</Label>
                    <Input
                      id={editPhoneId}
                      value={editForm.phone}
                      onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={editProgramId}>Program interest</Label>
                    <Select
                      value={editForm.programInterest || "Preschool"}
                      onValueChange={(programInterest) => programInterest && setEditForm({ ...editForm, programInterest })}
                    >
                      <SelectTrigger id={editProgramId}>
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
                    <Label htmlFor={editAgeGroupId}>Age group interest</Label>
                    <Input
                      id={editAgeGroupId}
                      value={editForm.ageGroupInterest}
                      onChange={(event) => setEditForm({ ...editForm, ageGroupInterest: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={editStartDateId}>Desired start date</Label>
                    <Input
                      id={editStartDateId}
                      value={editForm.desiredStartDate}
                      onChange={(event) => setEditForm({ ...editForm, desiredStartDate: event.target.value })}
                      type="date"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={editSourceId}>Lead source</Label>
                    <Input
                      id={editSourceId}
                      value={editForm.leadSource}
                      onChange={(event) => setEditForm({ ...editForm, leadSource: event.target.value })}
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={saveLeadDetails}
                    disabled={isPending || !editForm.familyName.trim()}
                    aria-label={`Save lead details for ${selectedLead.familyName}`}
                  >
                    {activePendingAction === "lead-details" ? "Saving lead details…" : "Save lead details"}
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                  <div className="grid gap-2">
                    <Label htmlFor={pipelineStageId}>Move pipeline stage</Label>
                    <p className="text-xs leading-5 text-muted-foreground">{crmPipelineStageDisclosure}</p>
                    <div className="rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs leading-5">
                      {selectedLeadDetails?.enrollments.length
                        ? `${selectedLeadDetails.enrollments.length} director-approved linked enrollment record(s). Current onboarding record stage: ${stageLabels[selectedLeadDetails.enrollments[0].stage]}.`
                        : "No director-approved enrollment record is linked yet. The Enrolled stage remains unavailable until registration is approved."}
                    </div>
                    <Select
                      value={selectedLead.stage}
                      onValueChange={(stage) => updateLeadStage(selectedLead.id, stage as EnrollmentStage)}
                      disabled={isPending}
                    >
                      <SelectTrigger id={pipelineStageId}>
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
                    <Label htmlFor={leadNoteId}>Internal note</Label>
                    <Textarea
                      id={leadNoteId}
                      value={noteBody}
                      onChange={(event) => setNoteBody(event.target.value)}
                      placeholder="Add a school-visible follow-up note..."
                    />
                    <Button
                      variant="outline"
                      onClick={saveNote}
                      disabled={isPending || !noteBody.trim()}
                      aria-label={`Save internal note for ${selectedLead.familyName}`}
                    >
                      {activePendingAction === "note" ? "Saving note…" : "Save note"}
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={taskTitleId}>Follow-up task</Label>
                    <Input
                      id={taskTitleId}
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      placeholder="Call family tomorrow"
                    />
                    <Label htmlFor={taskDueAtId}>Due date</Label>
                    <Input
                      id={taskDueAtId}
                      value={taskDueAt}
                      onChange={(event) => setTaskDueAt(event.target.value)}
                      type="datetime-local"
                    />
                    <Button
                      variant="outline"
                      onClick={createTask}
                      disabled={isPending || !taskTitle.trim()}
                      aria-label={`Create follow-up task for ${selectedLead.familyName}`}
                    >
                      {activePendingAction === "task" ? "Creating task…" : "Create task"}
                      <Plus data-icon="inline-end" />
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={tourStartsAtId}>Tour date and time</Label>
                    <Input
                      id={tourStartsAtId}
                      value={tourStartsAt}
                      onChange={(event) => setTourStartsAt(event.target.value)}
                      type="datetime-local"
                    />
                    <Label htmlFor={tourNotesId}>Tour notes</Label>
                    <Textarea
                      id={tourNotesId}
                      value={tourNotes}
                      onChange={(event) => setTourNotes(event.target.value)}
                      placeholder="Tour notes, prep items, or family questions..."
                    />
                    <Button
                      variant="outline"
                      onClick={scheduleTour}
                      disabled={isPending || !tourStartsAt}
                      aria-label={`Schedule tour for ${selectedLead.familyName}`}
                    >
                      {activePendingAction === "tour" ? "Scheduling tour…" : "Schedule tour"}
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
                          <div className="text-xs font-medium">{formatTourDate(tour.startsAt, timeZone)}</div>
                          <div className="mt-1 text-[0.7rem] text-muted-foreground">
                            {displayStatusLabel(tour.status)}{tour.notes ? ` · ${tour.notes}` : ""}
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
                            {task.dueAt ? safeDate(task.dueAt, timeZone) : "No due date"} · {displayStatusLabel(task.status)}
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
                      <div className="text-sm font-medium">Activity timeline</div>
                      <Badge variant="secondary">{timeline.length}</Badge>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      {timeline.slice(0, 8).map((item) => (
                        <div key={`${item.kind}-${item.id}`} className="rounded-lg border bg-card/60 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-xs font-medium">{item.title}</div>
                            <Badge variant="outline" className="text-[0.65rem]">
                              {item.kind}
                            </Badge>
                          </div>
                          <div className="mt-1 line-clamp-3 text-[0.7rem] leading-5 text-muted-foreground">
                            {item.body}
                          </div>
                          <div className="mt-1 text-[0.65rem] text-muted-foreground">
                            {item.at ? (item.kind === "tour" ? formatTourDate(item.at, timeZone) : safeDate(item.at, timeZone)) : "No date"}
                          </div>
                        </div>
                      ))}
                      {timeline.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No activity logged yet.</p>
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
                            {note.user?.name ?? "System"} · {safeDate(note.createdAt, timeZone)}
                          </div>
                        </div>
                      ))}
                      {selectedLeadDetails?.notes?.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No notes logged yet.</p>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={refreshMrBeeDraft}
                    disabled={isPending}
                    aria-label={`Open a contact draft for ${selectedLead.familyName}`}
                  >
                    {activePendingAction === "refresh-draft" ? "Preparing draft…" : "Prepare contact draft"}
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
