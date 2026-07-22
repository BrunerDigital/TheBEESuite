"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Baby, BookOpen, Camera, CheckCircle2, ClipboardCheck, Clock, ExternalLink, KeyRound, LogIn, LogOut, MapPin, Moon, Palette, Plus, QrCode, Save, ShieldAlert, Trash2, UserX, Users, Utensils } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SetupChecklistPanel } from "@/components/setup-checklist-panel";
import { UserAvatar } from "@/components/user-avatar";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { evaluateClassroomRatio } from "@/lib/classroom-ratios";
import {
  CLASSROOM_OFFLINE_QUEUE_KEY,
  classroomOfflineQueueStorageKey,
  classifyClassroomReplayStatus,
  createClassroomOfflineAction,
  decryptClassroomOfflineQueue,
  encryptClassroomOfflineQueue,
  parseEncryptedClassroomOfflineQueue,
  type ClassroomOfflineAction,
} from "@/lib/classroom-offline-queue";
import { CUSTODY_WARNING_LABEL, custodyWarningPreview, custodyWarningSummary, hasCustodyWarning } from "@/lib/custody-visibility";
import { teacherProfileChecklistTasks } from "@/lib/setup-checklists";
import { formatZonedDateTime, zonedDateKey, zonedDateTimeLocalToUtc, zonedDateTimeLocalValue } from "@/lib/zoned-date-time";

type ChildOption = {
  id: string;
  fullName: string;
  ageGroup: string;
  enrollmentStatus: string;
  photoVideoPermission: boolean;
  classroom: { id: string; name: string } | null;
  liveLocation?: { currentClassroomId: string | null; areaName: string | null; status: string; movedAt: string | Date; currentClassroom: { id: string; name: string } | null } | null;
  family?: { custodyNotes: string | null } | null;
  attendance?: AttendanceSnapshot;
  dailyReport?: DailyReportSnapshot | null;
};

type Props = {
  roster: ChildOption[];
  teacherName: string;
  teacherProfile?: TeacherProfileSetup | null;
  classroomOptions?: TeacherClassroomOption[];
  kioskAccess?: TeacherKioskAccess | null;
  classroomRatios?: ClassroomRatioSnapshot[];
  teacherChecklistCompletedIds?: string[];
};

type TeacherProfileSetup = {
  name: string;
  loginEmail: string;
  contactEmail: string | null;
  phone: string | null;
  title: string;
  centerId: string | null;
  centerName: string;
  classroomId: string | null;
  hasStaffKioskCode: boolean;
  profilePhotoUrl?: string | null;
};

type TeacherClassroomOption = {
  id: string;
  name: string;
  ageGroup: string;
};

type TeacherKioskAccess = {
  centerId: string;
  centerName: string;
  kioskPath: string;
  hasStaffKioskCode: boolean;
  clockStatus: "clocked_in" | "clocked_out";
  lastActionAt: string | null;
  timeClockSummary: {
    totalMinutes: number;
    closedShiftCount: number;
    openShiftMinutes: number;
    openShiftStartedAt: string | null;
  };
};

type ClassroomRatioSnapshot = {
  classroomId: string;
  name: string;
  capacity: number;
  ratioRule: string | null;
  assignedStaff: number;
};

type AttendanceSnapshot = {
  status: string;
  latestLogType: string | null;
  latestLogAt: string | Date | null;
  lastMarkedAt: string | Date | null;
};

type DailyReportSnapshot = {
  status: "not_started" | "draft" | "sent" | "queued";
  latestReportAt: string | Date | null;
  sentAt: string | Date | null;
  entries: {
    meals: number;
    naps: number;
    diapers: number;
    activities: number;
  };
};

const emptyAttendance: AttendanceSnapshot = {
  status: "not_marked",
  latestLogType: null,
  latestLogAt: null,
  lastMarkedAt: null,
};

const emptyDailyReport: DailyReportSnapshot = {
  status: "not_started",
  latestReportAt: null,
  sentAt: null,
  entries: { meals: 0, naps: 0, diapers: 0, activities: 0 },
};

type MealDraft = {
  id: string;
  mealType: string;
  food: string;
  amount: string;
  quickLog?: boolean;
  touched?: boolean;
};

type NapDraft = {
  id: string;
  startsAt: string;
  endsAt: string;
};

type DiaperDraft = {
  id: string;
  type: string;
  occurredAt: string;
  notes: string;
  touched?: boolean;
};

type ActivityDraft = {
  id: string;
  title: string;
  notes: string;
  touched?: boolean;
};

function draftId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function dateInputValue(date = new Date(), timeZone = "America/New_York") {
  return zonedDateKey(date, timeZone);
}

function timeInputValue(date = new Date()) {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function normalizeReportTime(reportDate: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{2}:\d{2}(?::\d{2})?$/.test(trimmed)) return `${reportDate}T${trimmed}`;
  return trimmed;
}

function formatTime(value: string | Date | null, timeZone: string) {
  return formatZonedDateTime(value, timeZone, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }, "");
}

function formatHours(minutes: number) {
  return `${(Math.max(0, minutes) / 60).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`;
}

function attendanceLabel(snapshot: AttendanceSnapshot) {
  if (snapshot.latestLogType === "check_in") return "Checked in";
  if (snapshot.latestLogType === "check_out" || snapshot.status === "checked_out") return "Checked out";
  if (snapshot.status === "absent") return "Absent";
  if (snapshot.status === "present") return "Present";
  return "Not marked";
}

function attendanceDetail(snapshot: AttendanceSnapshot, timeZone: string) {
  const time = formatTime(snapshot.latestLogAt ?? snapshot.lastMarkedAt, timeZone);
  if (!time) return "No time logged";
  if (snapshot.latestLogType === "check_in") return `In at ${time}`;
  if (snapshot.latestLogType === "check_out") return `Out at ${time}`;
  return `Marked at ${time}`;
}

function dailyReportLabel(snapshot: DailyReportSnapshot) {
  if (snapshot.status === "queued") return "Report queued";
  if (snapshot.status === "sent") return "Report sent";
  if (snapshot.status === "draft") return "Report draft";
  return "No report";
}

function dailyReportDetail(snapshot: DailyReportSnapshot, timeZone: string) {
  const entryCount = snapshot.entries.meals + snapshot.entries.naps + snapshot.entries.diapers + snapshot.entries.activities;
  const time = formatTime(snapshot.sentAt ?? snapshot.latestReportAt, timeZone);
  const entryLabel = `${entryCount} care entr${entryCount === 1 ? "y" : "ies"}`;
  return time ? `${entryLabel} · ${time}` : entryLabel;
}

function dailyReportBadgeVariant(snapshot: DailyReportSnapshot): "default" | "secondary" | "outline" | "destructive" {
  if (snapshot.status === "sent") return "default";
  if (snapshot.status === "queued") return "secondary";
  if (snapshot.status === "draft") return "outline";
  return "outline";
}

function createMealDraft(): MealDraft {
  return { id: draftId("meal"), mealType: "Lunch", food: "", amount: "" };
}

function createNapDraft(): NapDraft {
  return { id: draftId("nap"), startsAt: "", endsAt: "" };
}

function createDiaperDraft(timeZone = "America/New_York"): DiaperDraft {
  return { id: draftId("diaper"), type: "", occurredAt: zonedDateTimeLocalValue(new Date(), timeZone), notes: "" };
}

function createActivityDraft(): ActivityDraft {
  return { id: draftId("activity"), title: "", notes: "" };
}

export function TeacherMobileWorkspace({
  roster,
  teacherName,
  teacherProfile = null,
  classroomOptions = [],
  kioskAccess = null,
  classroomRatios = [],
  teacherChecklistCompletedIds = [],
}: Props) {
  const timeZone = useSchoolTimeZone(teacherProfile?.centerId);
  const router = useRouter();
  const firstChild = roster[0]?.id ?? "";
  const [profileName, setProfileName] = useState(teacherProfile?.name ?? teacherName);
  const [profileContactEmail, setProfileContactEmail] = useState(teacherProfile?.contactEmail ?? "");
  const [profilePhone, setProfilePhone] = useState(teacherProfile?.phone ?? "");
  const [profileTitle, setProfileTitle] = useState(teacherProfile?.title ?? "Teacher");
  const [profileClassroomId, setProfileClassroomId] = useState(teacherProfile?.classroomId ?? "none");
  const [profileKioskPin, setProfileKioskPin] = useState("");
  const [hasStaffKioskCode, setHasStaffKioskCode] = useState(Boolean(teacherProfile?.hasStaffKioskCode));
  const [selectedChildId, setSelectedChildId] = useState(firstChild);
  const [selectedDailyReportChildIds, setSelectedDailyReportChildIds] = useState<string[]>(() => firstChild ? [firstChild] : []);
  const [attendanceOverrides, setAttendanceOverrides] = useState<Record<string, AttendanceSnapshot>>({});
  const [dailyReportOverrides, setDailyReportOverrides] = useState<Record<string, DailyReportSnapshot>>({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState("present");
  const [logType, setLogType] = useState("check_in");
  const [mood, setMood] = useState("Happy");
  const [teacherNote, setTeacherNote] = useState("");
  const [reportDate, setReportDate] = useState(() => zonedDateKey(new Date(), timeZone));
  const [sendToParent, setSendToParent] = useState(true);
  const [mealRows, setMealRows] = useState<MealDraft[]>(() => [createMealDraft()]);
  const [napRows, setNapRows] = useState<NapDraft[]>(() => [createNapDraft()]);
  const [noNap, setNoNap] = useState(false);
  const [diaperRows, setDiaperRows] = useState<DiaperDraft[]>(() => [createDiaperDraft(timeZone)]);
  const [activityRows, setActivityRows] = useState<ActivityDraft[]>(() => [createActivityDraft()]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [suppliesNeeded, setSuppliesNeeded] = useState("");
  const [incidentType, setIncidentType] = useState("Minor injury");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [offlineQueue, setOfflineQueue] = useState<ClassroomOfflineAction[]>([]);
  const [locationOverrides, setLocationOverrides] = useState<Record<string, string>>({});
  const [locationTarget, setLocationTarget] = useState("area:Playground");
  const [locationReason, setLocationReason] = useState("");
  const offlineCredentialsRef = useRef<{ key: string; scopeId: string } | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isPending, startTransition] = useTransition();

  const selectedChild = useMemo(() => roster.find((child) => child.id === selectedChildId) ?? roster[0], [roster, selectedChildId]);
  const selectedCustodyWarning = custodyWarningSummary(selectedChild?.family);
  const ratioByClassroomId = useMemo(() => {
    return new Map(classroomRatios.map((classroom) => [classroom.classroomId, classroom]));
  }, [classroomRatios]);
  const selectedDailyReportChildren = useMemo(() => {
    const selectedIds = new Set(selectedDailyReportChildIds);
    return roster.filter((child) => selectedIds.has(child.id));
  }, [roster, selectedDailyReportChildIds]);
  const activeDailyReportChildIds = selectedDailyReportChildren.map((child) => child.id);
  const byClassroom = useMemo(() => {
    const grouped = roster.reduce<Record<string, { id: string | null; name: string; children: ChildOption[] }>>((acc, child) => {
      const key = child.classroom?.id ?? "unassigned";
      acc[key] ||= { id: child.classroom?.id ?? null, name: child.classroom?.name ?? "Unassigned", children: [] };
      acc[key].children.push(child);
      return acc;
    }, {});

    return Object.values(grouped);
  }, [roster]);
  const selectedProfileClassroom = classroomOptions.find((classroom) => classroom.id === profileClassroomId);
  const profileReady = Boolean(
    profileName.trim() &&
    teacherProfile?.centerId &&
    profileTitle.trim() &&
    profileClassroomId !== "none" &&
    hasStaffKioskCode,
  );

  async function getOfflineCredentials() {
    if (offlineCredentialsRef.current) return offlineCredentialsRef.current;
    const response = await fetch("/api/teacher/offline-queue-key", { cache: "no-store" });
    const json = await response.json().catch(() => null) as { key?: string; scopeId?: string; error?: string } | null;
    if (!response.ok || !json?.key || !json.scopeId) throw new Error(json?.error || "Offline recovery could not be initialized.");
    offlineCredentialsRef.current = { key: json.key, scopeId: json.scopeId };
    return offlineCredentialsRef.current;
  }

  async function readOfflineQueue() {
    const credentials = await getOfflineCredentials();
    const envelope = parseEncryptedClassroomOfflineQueue(window.localStorage.getItem(classroomOfflineQueueStorageKey(credentials.scopeId)));
    if (!envelope) return [];
    return decryptClassroomOfflineQueue({ envelope, ...credentials });
  }

  async function persistOfflineQueue(next: ClassroomOfflineAction[]) {
    const credentials = await getOfflineCredentials();
    const trimmed = next.slice(0, 50);
    const storageKey = classroomOfflineQueueStorageKey(credentials.scopeId);
    if (!trimmed.length) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, JSON.stringify(await encryptClassroomOfflineQueue({ actions: trimmed, ...credentials })));
    setOfflineQueue(trimmed);
    return trimmed;
  }

  async function syncStoredQueue() {
    const queued = await readOfflineQueue();
    if (!queued.length) return;
    const remaining: ClassroomOfflineAction[] = [];
    let synced = 0;
    for (const action of queued) {
      try {
        const response = await fetch(action.endpoint, { method: action.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(action.body) });
        const outcome = classifyClassroomReplayStatus(response.status);
        if (outcome === "complete") synced += 1;
        else remaining.push(action);
      } catch { remaining.push(action); }
    }
    await persistOfflineQueue(remaining);
    if (!remaining.length) showStatus(`${synced} queued classroom action${synced === 1 ? "" : "s"} synced.`);
    else showError(`${synced} queued action${synced === 1 ? "" : "s"} synced. ${remaining.length} need connection or director review.`);
  }

  useEffect(() => {
    const loadStoredState = window.setTimeout(() => {
      setIsOnline(navigator.onLine);
      window.localStorage.removeItem(CLASSROOM_OFFLINE_QUEUE_KEY);
      void readOfflineQueue().then(setOfflineQueue).then(() => { if (navigator.onLine) return syncStoredQueue(); }).catch((cause) => showError(cause instanceof Error ? cause.message : "Offline recovery could not be initialized."));
    }, 0);

    function updateOnlineState() {
      const nextOnline = navigator.onLine;
      setIsOnline(nextOnline);
      if (nextOnline) void syncStoredQueue();
    }
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.clearTimeout(loadStoredState);
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  async function queueOfflineAction(action: ClassroomOfflineAction) {
    try {
      const currentStoredQueue = await readOfflineQueue();
      await persistOfflineQueue([...(currentStoredQueue.length ? currentStoredQueue : offlineQueue), action]);
      showStatus(`${action.label} queued securely for this account and classroom.`);
      return true;
    } catch {
      showError("This tablet could not securely store the action. Keep a paper note and contact the director before leaving this screen.");
      return false;
    }
  }

  async function postJsonOrQueue({
    endpoint,
    body,
    label,
    onSuccess,
    onQueued,
  }: {
    endpoint: string;
    body: unknown;
    label: string;
    onSuccess: (json: Record<string, unknown> | null) => void;
    onQueued?: () => void;
  }) {
    const action = createClassroomOfflineAction({ endpoint, body, label });
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (await queueOfflineAction(action)) onQueued?.();
      return;
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action.body),
      });
    } catch {
      if (await queueOfflineAction(action)) onQueued?.();
      return;
    }

    const json = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      showError(json?.error || `${label} could not be saved.`);
      return;
    }
    onSuccess(json as Record<string, unknown> | null);
  }

  function flushOfflineQueue() {
    if (!offlineQueue.length) return;
    startTransition(async () => {
      const remaining: ClassroomOfflineAction[] = [];
      let synced = 0;
      for (const action of offlineQueue) {
        try {
          const response = await fetch(action.endpoint, {
            method: action.method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(action.body),
          });
          if (classifyClassroomReplayStatus(response.status) === "complete") {
            synced += 1;
          } else {
            remaining.push(action);
          }
        } catch {
          remaining.push(action);
        }
      }
      await persistOfflineQueue(remaining);
      if (remaining.length) {
        showError(`${synced} queued action${synced === 1 ? "" : "s"} synced. ${remaining.length} still need connection or review.`);
      } else {
        showStatus(`${synced} queued action${synced === 1 ? "" : "s"} synced.`);
      }
    });
  }

  function attendanceFor(child: ChildOption) {
    return attendanceOverrides[child.id] ?? child.attendance ?? emptyAttendance;
  }

  function dailyReportFor(child: ChildOption) {
    return dailyReportOverrides[child.id] ?? child.dailyReport ?? emptyDailyReport;
  }

  function chooseChild(childId: string) {
    setSelectedChildId(childId);
    setSelectedDailyReportChildIds((current) => current.length > 1 ? current : [childId]);
  }

  function setDailyReportTargets(childIds: string[]) {
    const rosterIds = new Set(roster.map((child) => child.id));
    const nextIds = Array.from(new Set(childIds.filter((childId) => rosterIds.has(childId)))).slice(0, 40);
    setSelectedDailyReportChildIds(nextIds);
    if (nextIds[0]) setSelectedChildId(nextIds[0]);
  }

  function toggleDailyReportTarget(childId: string) {
    setSelectedDailyReportChildIds((current) => {
      if (current.includes(childId)) return current.filter((id) => id !== childId);
      return [...current, childId].slice(0, 40);
    });
    setSelectedChildId(childId);
  }

  function selectPresentDailyReports() {
    const presentChildIds = roster
      .filter((child) => {
        const attendance = attendanceFor(child);
        return attendance.latestLogType === "check_in" || attendance.status === "present";
      })
      .map((child) => child.id);
    if (!presentChildIds.length) {
      showError("No children are currently marked present.");
      return;
    }
    setDailyReportTargets(presentChildIds);
  }

  function selectClassroomDailyReports(children: ChildOption[]) {
    setDailyReportTargets(children.map((child) => child.id));
  }

  function showStatus(next: string) {
    setError("");
    setStatus(next);
  }

  function showError(next: string) {
    setStatus("");
    setError(next);
  }

  function saveTeacherProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      showError("Reconnect this tablet before saving teacher profile setup.");
      return;
    }
    startTransition(async () => {
      setStatus("");
      setError("");
      const response = await fetch("/api/teacher/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileName,
          contactEmail: profileContactEmail,
          phone: profilePhone,
          title: profileTitle,
          classroomId: profileClassroomId === "none" ? null : profileClassroomId,
          staffKioskPin: profileKioskPin || null,
        }),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        profile?: {
          name?: string;
          contactEmail?: string | null;
          phone?: string | null;
          title?: string;
          classroomId?: string | null;
          hasStaffKioskCode?: boolean;
        };
      } | null;
      if (!response.ok) {
        showError(json?.error || "Teacher profile setup could not be saved.");
        return;
      }

      if (json?.profile) {
        setProfileName(json.profile.name ?? profileName);
        setProfileContactEmail(json.profile.contactEmail ?? "");
        setProfilePhone(json.profile.phone ?? "");
        setProfileTitle(json.profile.title ?? profileTitle);
        setProfileClassroomId(json.profile.classroomId ?? "none");
        setHasStaffKioskCode(Boolean(json.profile.hasStaffKioskCode));
      }
      setProfileKioskPin("");
      showStatus("Teacher profile setup saved.");
      router.refresh();
    });
  }

  function updateMeal(id: string, patch: Partial<MealDraft>) {
    setMealRows((current) => current.map((row) => row.id === id ? { ...row, ...patch, touched: true } : row));
  }

  function updateNap(id: string, patch: Partial<NapDraft>) {
    if ((patch.startsAt && patch.startsAt.trim()) || (patch.endsAt && patch.endsAt.trim())) setNoNap(false);
    setNapRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function locationFor(child: ChildOption) {
    return locationOverrides[child.id] ?? child.liveLocation?.areaName ?? child.liveLocation?.currentClassroom?.name ?? child.classroom?.name ?? "Unassigned";
  }

  function submitLocation() {
    if (!selectedChild) return;
    const isArea = locationTarget.startsWith("area:");
    const targetValue = locationTarget.slice(locationTarget.indexOf(":") + 1);
    startTransition(async () => {
      await postJsonOrQueue({
        endpoint: "/api/children/location",
        body: { childId: selectedChild.id, classroomId: isArea ? null : targetValue, areaName: isArea ? targetValue : null, reason: locationReason },
        label: `${selectedChild.fullName} location`,
        onQueued: () => setLocationOverrides((current) => ({ ...current, [selectedChild.id]: isArea ? targetValue : classroomOptions.find((room) => room.id === targetValue)?.name ?? "Classroom" })),
        onSuccess: () => {
          setLocationOverrides((current) => ({ ...current, [selectedChild.id]: isArea ? targetValue : classroomOptions.find((room) => room.id === targetValue)?.name ?? "Classroom" }));
          setLocationReason("");
          showStatus(`${selectedChild.fullName} location updated.`);
        },
      });
    });
  }

  function updateDiaper(id: string, patch: Partial<DiaperDraft>) {
    setDiaperRows((current) => current.map((row) => row.id === id ? { ...row, ...patch, touched: true } : row));
  }

  function updateActivity(id: string, patch: Partial<ActivityDraft>) {
    setActivityRows((current) => current.map((row) => row.id === id ? { ...row, ...patch, touched: true } : row));
  }

  function removeMeal(id: string) {
    setMealRows((current) => current.length > 1 ? current.filter((row) => row.id !== id) : [createMealDraft()]);
  }

  function removeNap(id: string) {
    setNapRows((current) => current.length > 1 ? current.filter((row) => row.id !== id) : [createNapDraft()]);
  }

  function removeDiaper(id: string) {
    setDiaperRows((current) => current.length > 1 ? current.filter((row) => row.id !== id) : [createDiaperDraft(timeZone)]);
  }

  function removeActivity(id: string) {
    setActivityRows((current) => current.length > 1 ? current.filter((row) => row.id !== id) : [createActivityDraft()]);
  }

  function resetDailyReportDrafts() {
    setTeacherNote("");
    setSuppliesNeeded("");
    setMealRows([createMealDraft()]);
    setNapRows([createNapDraft()]);
    setNoNap(false);
    setDiaperRows([createDiaperDraft(timeZone)]);
    setActivityRows([createActivityDraft()]);
  }

  function buildDailyReportEntries() {
    const activeReportDate = reportDate || dateInputValue(new Date(), timeZone);
    const meals = mealRows
      .filter((row) => row.food.trim() || row.amount.trim() || row.quickLog || row.touched)
      .map((row) => ({
        mealType: row.mealType,
        food: row.food.trim(),
        amount: row.amount.trim() || null,
        quickLog: row.quickLog === true,
        touched: row.touched === true,
      }));
    const naps = napRows
      .filter(() => !noNap)
      .filter((row) => row.startsAt.trim() || row.endsAt.trim())
      .map((row) => ({
        startsAt: zonedDateTimeLocalToUtc(normalizeReportTime(activeReportDate, row.startsAt), timeZone)?.toISOString() ?? "",
        endsAt: zonedDateTimeLocalToUtc(normalizeReportTime(activeReportDate, row.endsAt), timeZone)?.toISOString() ?? "",
      }));
    const diapers = diaperRows
      .filter((row) => row.type.trim() || row.notes.trim() || row.touched)
      .map((row) => ({ type: row.type, occurredAt: zonedDateTimeLocalToUtc(row.occurredAt, timeZone)?.toISOString() ?? "", notes: row.notes.trim(), touched: row.touched === true }));
    const activities = activityRows
      .filter((row) => row.title.trim() || row.notes.trim() || row.touched)
      .map((row) => ({ title: row.title.trim(), notes: row.notes.trim(), touched: row.touched === true }));

    return { meals, naps, diapers, activities, noNap };
  }

  function markDailyReportsLocally(childIds: string[], status: DailyReportSnapshot["status"]) {
    const entries = buildDailyReportEntries();
    const entryCounts = {
      meals: entries.meals.length,
      naps: entries.naps.length,
      diapers: entries.diapers.length,
      activities: entries.activities.length,
    };
    const now = new Date();
    setDailyReportOverrides((current) => {
      const next = { ...current };
      for (const childId of childIds) {
        next[childId] = {
          status,
          latestReportAt: `${reportDate || dateInputValue(new Date(), timeZone)}T12:00:00`,
          sentAt: status === "sent" ? now : null,
          entries: entryCounts,
        };
      }
      return next;
    });
  }

  function addMealPreset(mealType: string) {
    const nextRow = { ...createMealDraft(), mealType, quickLog: true, touched: true };
    setMealRows((current) => current.length === 1 && !current[0].quickLog && !current[0].food.trim() && !current[0].amount.trim() ? [nextRow] : [...current, nextRow]);
  }

  function addDiaperPreset(type: string) {
    const nextRow = { ...createDiaperDraft(timeZone), type, touched: true };
    setDiaperRows((current) => current.length === 1 && !current[0].type.trim() && !current[0].notes.trim() ? [nextRow] : [...current, nextRow]);
  }

  function addActivityPreset(title: string) {
    const nextRow = { ...createActivityDraft(), title, touched: true };
    setActivityRows((current) => current.length === 1 && !current[0].title.trim() && !current[0].notes.trim() ? [nextRow] : [...current, nextRow]);
  }

  function startNapNow() {
    setNoNap(false);
    const nextRow = { ...createNapDraft(), startsAt: timeInputValue() };
    setNapRows((current) => current.length === 1 && !current[0].startsAt && !current[0].endsAt ? [nextRow] : [...current, nextRow]);
  }

  function endLatestNapNow() {
    setNoNap(false);
    let openNapIndex = -1;
    for (let index = napRows.length - 1; index >= 0; index -= 1) {
      if (napRows[index].startsAt && !napRows[index].endsAt) {
        openNapIndex = index;
        break;
      }
    }
    if (openNapIndex < 0) {
      setNapRows((current) => [...current, { ...createNapDraft(), endsAt: timeInputValue() }]);
      return;
    }
    setNapRows((current) => {
      const next = [...current];
      if (next[openNapIndex]) {
        next[openNapIndex] = { ...next[openNapIndex], endsAt: timeInputValue() };
      }
      return next;
    });
  }

  function markNoNapToday() {
    setNoNap(true);
    setNapRows([createNapDraft()]);
  }

  function submitAttendance(options: { childId?: string; status?: string; logType?: string; label?: string } = {}) {
    const targetChildId = options.childId ?? selectedChild?.id;
    const targetChildName = roster.find((child) => child.id === targetChildId)?.fullName ?? selectedChild?.fullName ?? "Child";
    const targetStatus = options.status ?? attendanceStatus;
    const targetLogType = options.logType ?? logType;
    const payload = { childId: targetChildId, status: targetStatus, logType: targetLogType, date: new Date().toISOString() };
    const applyLocalAttendance = () => {
      if (targetChildId) {
        const nextStatus = targetLogType === "check_in" ? "present" : targetLogType === "check_out" ? "checked_out" : targetStatus;
        setAttendanceOverrides((current) => ({
          ...current,
          [targetChildId]: {
            status: nextStatus,
            latestLogType: targetLogType || null,
            latestLogAt: targetLogType ? new Date() : null,
            lastMarkedAt: new Date(),
          },
        }));
      }
    };
    startTransition(async () => {
      await postJsonOrQueue({
        endpoint: "/api/teacher/attendance",
        body: payload,
        label: `${targetChildName} attendance`,
        onQueued: applyLocalAttendance,
        onSuccess: () => {
          applyLocalAttendance();
          showStatus(options.label ?? `${targetChildName} attendance saved.`);
        },
      });
    });
  }

  function submitDailyReport() {
    const targetChildIds = activeDailyReportChildIds;
    if (!targetChildIds.length) {
      showError("Choose at least one child for the daily report.");
      return;
    }
    startTransition(async () => {
      const entries = buildDailyReportEntries();
      const targetLabel = targetChildIds.length === 1
        ? `${roster.find((child) => child.id === targetChildIds[0])?.fullName ?? "Child"} daily report`
        : `${targetChildIds.length} daily reports`;
      await postJsonOrQueue({
        endpoint: "/api/teacher/daily-reports",
        body: {
          childId: targetChildIds[0],
          childIds: targetChildIds,
          date: `${reportDate || dateInputValue(new Date(), timeZone)}T12:00:00`,
          mood,
          teacherNote,
          meals: entries.meals,
          naps: entries.naps,
          noNap: entries.noNap,
          diapers: entries.diapers,
          activities: entries.activities,
          suppliesNeeded,
          sendToParent,
        },
        label: targetLabel,
        onQueued: () => {
          markDailyReportsLocally(targetChildIds, "queued");
          resetDailyReportDrafts();
        },
        onSuccess: () => {
          markDailyReportsLocally(targetChildIds, sendToParent ? "sent" : "draft");
          resetDailyReportDrafts();
          const reportLabel = targetChildIds.length === 1 ? "Daily report" : `${targetChildIds.length} daily reports`;
          showStatus(sendToParent ? `${reportLabel} saved for parent view.` : `${reportLabel} saved as internal draft${targetChildIds.length === 1 ? "" : "s"}.`);
        },
      });
    });
  }

  function submitIncident() {
    startTransition(async () => {
      await postJsonOrQueue({
        endpoint: "/api/teacher/incidents",
        body: {
          childId: selectedChild?.id,
          type: incidentType,
          description: incidentDescription,
          actionTaken,
          parentNotified: false,
        },
        label: `${selectedChild?.fullName ?? "Child"} incident report`,
        onQueued: () => {
          setIncidentDescription("");
          setActionTaken("");
        },
        onSuccess: () => {
          setIncidentDescription("");
          setActionTaken("");
          showStatus("Incident report created and queued for director review.");
        },
      });
    });
  }

  function submitPhoto() {
    if (!selectedChild?.id || !photo) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      showError("Photo uploads need an active connection. Attendance, daily reports, and incidents can still be queued offline.");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("childId", selectedChild.id);
      formData.set("caption", photoCaption);
      formData.set("photo", photo);
      formData.set("sharedWithParents", "true");
      const response = await fetch("/api/teacher/media", { method: "POST", body: formData });
      const json = await response.json().catch(() => null) as { error?: string; warning?: string } | null;
      if (!response.ok) return showError(json?.error || "Photo could not be shared.");
      setPhoto(null);
      setPhotoCaption("");
      showStatus(json?.warning || "Photo shared to the parent portal.");
    });
  }

  const activeDailyReportChildren = activeDailyReportChildIds
    .map((childId) => roster.find((child) => child.id === childId))
    .filter((child): child is ChildOption => Boolean(child));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <SetupChecklistPanel
        checklistKey="teacher_profile"
        title="Teacher profile setup checklist"
        description="Check off each item after you confirm your account, classroom, roster, kiosk code, and classroom tablet workflows are ready."
        tasks={teacherProfileChecklistTasks}
        initialCompletedIds={teacherChecklistCompletedIds}
        graphicHref="/brand/the-bee-suite/explainers/kid-city-teacher-profile-setup-roadmap.svg"
        compact
      />

      <section className="rounded-2xl border bg-card/80 p-5 shadow-2xl shadow-black/15">
        <Badge className="mb-3">
          <ClipboardCheck data-icon="inline-start" />
          Teacher mobile
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight">Hi {teacherName}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Fast classroom task entry for attendance, parent daily reports, and incident documentation.
        </p>
      </section>

      {status ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card id="teacher-profile-setup" className="glass-panel scroll-mt-28">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <UserAvatar name={profileName || teacherName} src={teacherProfile?.profilePhotoUrl} size="lg" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Profile setup</CardTitle>
                  <Badge variant={profileReady ? "default" : "outline"}>
                    {profileReady ? "Ready" : "Needs setup"}
                  </Badge>
                </div>
                <CardDescription className="mt-2">
                  Confirm the teacher profile used for classroom access, parent updates, staff clock-in, and coverage.
                </CardDescription>
              </div>
            </div>
            <Badge variant={hasStaffKioskCode ? "default" : "destructive"}>
              {hasStaffKioskCode ? "Staff code ready" : "Staff code missing"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={saveTeacherProfile}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="teacher-profile-name">Full name</Label>
                <Input
                  id="teacher-profile-name"
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  className="h-11"
                  autoComplete="name"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="teacher-profile-contact-email">Contact email</Label>
                <Input
                  id="teacher-profile-contact-email"
                  value={profileContactEmail}
                  onChange={(event) => setProfileContactEmail(event.target.value)}
                  className="h-11"
                  type="email"
                  autoComplete="email"
                  placeholder="Work or personal email"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="teacher-profile-phone">Phone</Label>
                <Input
                  id="teacher-profile-phone"
                  value={profilePhone}
                  onChange={(event) => setProfilePhone(event.target.value)}
                  className="h-11"
                  type="tel"
                  autoComplete="tel"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="teacher-profile-title">Title</Label>
                <Input
                  id="teacher-profile-title"
                  value={profileTitle}
                  onChange={(event) => setProfileTitle(event.target.value)}
                  className="h-11"
                  placeholder="Lead Teacher"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="teacher-profile-classroom">Classroom</Label>
                <Select value={profileClassroomId} onValueChange={(value) => setProfileClassroomId(value || "none")}>
                  <SelectTrigger id="teacher-profile-classroom" className="h-11 w-full">
                    <SelectValue placeholder="Choose a classroom" />
                  </SelectTrigger>
                  <SelectContent align="start" className="w-[min(28rem,calc(100vw-2rem))]">
                    <SelectItem value="none">Director will assign later</SelectItem>
                    {classroomOptions.map((classroom) => (
                      <SelectItem key={classroom.id} value={classroom.id}>
                        {classroom.name} - {classroom.ageGroup}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProfileClassroom ? (
                  <p className="text-xs text-muted-foreground">
                    Roster access will use {selectedProfileClassroom.name}.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="teacher-profile-kiosk-pin">Staff kiosk code</Label>
                <Input
                  id="teacher-profile-kiosk-pin"
                  value={profileKioskPin}
                  onChange={(event) => setProfileKioskPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="h-11"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={hasStaffKioskCode ? "Leave blank to keep current code" : "Choose a 4 digit code"}
                />
              </div>
            </div>

            <div className="grid gap-3 rounded-xl border bg-background/40 p-3 text-sm md:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Teacher login</div>
                <div className="truncate font-medium">{teacherProfile?.loginEmail ?? "Not available"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">School</div>
                <div className="truncate font-medium">{teacherProfile?.centerName ?? "Not assigned"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Role</div>
                <div className="font-medium">Teacher</div>
              </div>
            </div>

            <Button type="submit" className="h-11 w-full sm:w-fit" disabled={isPending || !teacherProfile?.centerId}>
              <Save data-icon="inline-start" />
              Save Profile Setup
            </Button>
          </form>
        </CardContent>
      </Card>

      {selectedCustodyWarning ? (
        <Alert variant="destructive">
          <ShieldAlert className="size-4" />
          <AlertTitle>{CUSTODY_WARNING_LABEL}: {selectedChild?.fullName}</AlertTitle>
          <AlertDescription>
            {selectedCustodyWarning}
            {custodyWarningPreview(selectedChild?.family) ? ` Note preview: ${custodyWarningPreview(selectedChild?.family)}` : ""}
          </AlertDescription>
        </Alert>
      ) : null}
      <Alert className={isOnline ? "border-primary/30 bg-primary/10" : "border-amber-300/50 bg-amber-50 text-slate-900"}>
        <Clock className="size-4" />
        <AlertTitle>{isOnline ? "Tablet online" : "Tablet offline"}</AlertTitle>
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {offlineQueue.length
              ? `${offlineQueue.length} classroom action${offlineQueue.length === 1 ? "" : "s"} waiting to sync from this tablet.`
              : "Attendance, daily report, and incident actions will queue locally if the connection drops."}
          </span>
          {offlineQueue.length ? (
            <Button type="button" size="sm" variant="outline" disabled={isPending || !isOnline} onClick={flushOfflineQueue}>
              Sync queued actions
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>

      <nav className="sticky top-[4.75rem] z-10 -mx-1 overflow-x-auto rounded-xl border bg-background/95 p-2 shadow-sm backdrop-blur lg:top-20">
        <div className="flex min-w-max gap-2">
          {[
            ["Profile", "#teacher-profile-setup"],
            ["Roster", "#teacher-roster"],
            ["Attendance", "#teacher-attendance"],
            ["Daily report", "#teacher-daily-report"],
            ["Photo", "#teacher-photo"],
            ["Incident", "#teacher-incident"],
          ].map(([label, href]) => (
            <Button key={href} size="sm" variant="outline" nativeButton={false} render={<a href={href} />}>
              {label}
            </Button>
          ))}
        </div>
      </nav>

      {kioskAccess ? (
        <Card className="glass-panel">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="text-primary" />
                  Lobby Kiosk
                </CardTitle>
                <CardDescription>{kioskAccess.centerName}</CardDescription>
              </div>
              <Badge variant={kioskAccess.hasStaffKioskCode ? "default" : "destructive"}>
                {kioskAccess.hasStaffKioskCode ? "Staff code ready" : "Staff code missing"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant={kioskAccess.clockStatus === "clocked_in" ? "default" : "outline"}>
                  {kioskAccess.clockStatus === "clocked_in" ? "Clocked in" : "Clocked out"}
                </Badge>
                {kioskAccess.lastActionAt ? (
                  <Badge variant="secondary">Last action {formatTime(kioskAccess.lastActionAt, timeZone)}</Badge>
                ) : null}
                <Badge variant="outline">
                  <KeyRound data-icon="inline-start" />
                  Staff PIN
                </Badge>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-lg border bg-background/40 px-3 py-2">
                  <div className="text-xs text-muted-foreground">My stored hours</div>
                  <div className="font-medium">{formatHours(kioskAccess.timeClockSummary.totalMinutes)}</div>
                </div>
                <div className="rounded-lg border bg-background/40 px-3 py-2">
                  <div className="text-xs text-muted-foreground">Closed shifts</div>
                  <div className="font-medium">{kioskAccess.timeClockSummary.closedShiftCount}</div>
                </div>
                <div className="rounded-lg border bg-background/40 px-3 py-2">
                  <div className="text-xs text-muted-foreground">Open shift</div>
                  <div className="font-medium">
                    {kioskAccess.timeClockSummary.openShiftMinutes
                      ? formatHours(kioskAccess.timeClockSummary.openShiftMinutes)
                      : "None"}
                  </div>
                </div>
              </div>
            </div>
            <Button type="button" onClick={() => window.location.assign(kioskAccess.kioskPath)}>
              <ExternalLink data-icon="inline-start" />
              Open Staff Clock
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card id="teacher-roster" className="glass-panel scroll-mt-28">
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>{roster.length} children visible to your role</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {byClassroom.map((classroom) => {
            const ratioSnapshot = classroom.id ? ratioByClassroomId.get(classroom.id) : null;
            const presentChildren = classroom.children.filter((child) => {
              const attendance = attendanceFor(child);
              return attendance.latestLogType === "check_in" || attendance.status === "present";
            }).length;
            const ratioWarning = ratioSnapshot
              ? evaluateClassroomRatio({
                  children: presentChildren,
                  staff: ratioSnapshot.assignedStaff,
                  capacity: ratioSnapshot.capacity,
                  ratioRule: ratioSnapshot.ratioRule,
                })
              : null;

            return (
            <div key={classroom.id ?? classroom.name} className="rounded-xl border bg-background/40 p-3">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{classroom.name}</div>
                  {ratioSnapshot ? (
                    <div className="text-xs text-muted-foreground">
                      {presentChildren} present / {ratioSnapshot.assignedStaff} teacher{ratioSnapshot.assignedStaff === 1 ? "" : "s"} · {ratioSnapshot.ratioRule ?? "ratio not set"}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  <Button type="button" size="xs" variant="outline" onClick={() => selectClassroomDailyReports(classroom.children)}>
                    <Users data-icon="inline-start" />
                    Room
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      const presentChildIds = classroom.children
                        .filter((child) => {
                          const attendance = attendanceFor(child);
                          return attendance.latestLogType === "check_in" || attendance.status === "present";
                        })
                        .map((child) => child.id);
                      if (!presentChildIds.length) {
                        showError(`No present children in ${classroom.name}.`);
                        return;
                      }
                      setDailyReportTargets(presentChildIds);
                    }}
                  >
                    <ClipboardCheck data-icon="inline-start" />
                    Present
                  </Button>
                  {ratioWarning ? (
                    ratioWarning.status !== "healthy" ? (
                      <Badge
                        variant={ratioWarning.tone}
                        render={(
                          <Link
                            href="/classroom-dashboard#classroom-editor"
                            aria-label={`Open classroom setup to resolve ${ratioWarning.label} for ${classroom.name}`}
                          />
                        )}
                      >
                        {ratioWarning.label}
                      </Badge>
                    ) : (
                      <Badge variant={ratioWarning.tone}>{ratioWarning.label}</Badge>
                    )
                  ) : null}
                </div>
              </div>
              {ratioWarning && ratioWarning.status !== "healthy" ? (
                <Alert variant={ratioWarning.tone === "destructive" ? "destructive" : "default"} className="mb-3">
                  <AlertCircle className="size-4" />
                  <AlertTitle>{ratioWarning.label}</AlertTitle>
                  <AlertDescription>{ratioWarning.detail}</AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-2">
                {classroom.children.slice(0, 12).map((child) => {
                  const attendance = attendanceFor(child);
                  const dailyReport = dailyReportFor(child);
                  const isCheckedIn = attendance.latestLogType === "check_in";
                  const isReportTarget = selectedDailyReportChildIds.includes(child.id);
                  return (
                    <div
                      key={child.id}
                      className={`rounded-lg border p-2 text-sm transition ${selectedChild?.id === child.id ? "border-primary bg-primary/10" : "bg-card/40"}`}
                    >
                      <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={() => chooseChild(child.id)}>
                        <span className="min-w-0">
                          <span className="font-medium">{child.fullName}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{child.ageGroup}</span>
                          {hasCustodyWarning(child.family) ? (
                            <span className="mt-1 block text-xs font-medium text-destructive">
                              {CUSTODY_WARNING_LABEL}: review before pickup or parent communication
                            </span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant="outline">{attendanceLabel(attendance)}</Badge>
                          <Badge variant={dailyReportBadgeVariant(dailyReport)}>{dailyReportLabel(dailyReport)}</Badge>
                        </span>
                      </button>
                      <div className="mt-2 grid gap-2">
                        <span className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="flex min-w-0 items-center gap-1">
                            <Clock className="size-3" />
                            {attendanceDetail(attendance, timeZone)}
                          </span>
                          <span className="flex min-w-0 items-center gap-1">
                            <BookOpen className="size-3" />
                            {dailyReportDetail(dailyReport, timeZone)}
                          </span>
                        </span>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-xs">
                            <input
                              type="checkbox"
                              checked={isReportTarget}
                              onChange={() => toggleDailyReportTarget(child.id)}
                              aria-label={`Include ${child.fullName} in daily report batch`}
                            />
                            Daily
                          </label>
                          <span className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={isPending || isCheckedIn}
                              onClick={() => {
                                chooseChild(child.id);
                                submitAttendance({ childId: child.id, status: "present", logType: "check_in", label: `${child.fullName} checked in.` });
                              }}
                            >
                              <LogIn data-icon="inline-start" />
                              In
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={isPending || !isCheckedIn}
                              onClick={() => {
                                chooseChild(child.id);
                                submitAttendance({ childId: child.id, status: "checked_out", logType: "check_out", label: `${child.fullName} checked out.` });
                              }}
                            >
                              <LogOut data-icon="inline-start" />
                              Out
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={isPending || isCheckedIn || attendance.status === "absent"}
                              onClick={() => {
                                chooseChild(child.id);
                                submitAttendance({ childId: child.id, status: "absent", logType: "", label: `${child.fullName} marked absent.` });
                              }}
                            >
                              <UserX data-icon="inline-start" />
                              Absent
                            </Button>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card id="teacher-attendance" className="glass-panel scroll-mt-28">
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
            <CardDescription>{selectedChild?.fullName ?? "Choose a child"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={attendanceStatus} onValueChange={(value) => value && setAttendanceStatus(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="sick">Sick</SelectItem>
                  <SelectItem value="vacation">Vacation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Log type</Label>
              <Select value={logType} onValueChange={(value) => setLogType(value ?? "")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="check_in">Check in</SelectItem>
                  <SelectItem value="check_out">Check out</SelectItem>
                  <SelectItem value="">Attendance only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button disabled={isPending || !selectedChild} className="w-full" onClick={() => submitAttendance()}>
              <ClipboardCheck data-icon="inline-start" />
              Save Attendance
            </Button>
          </CardContent>
        </Card>

        <Card id="teacher-location" className="glass-panel scroll-mt-28">
          <CardHeader>
            <CardTitle>Child location</CardTitle>
            <CardDescription>{selectedChild ? `${selectedChild.fullName} · currently ${locationFor(selectedChild)}` : "Choose a child"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Move to</Label>
              <Select value={locationTarget} onValueChange={(value) => value && setLocationTarget(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>School areas</SelectLabel>
                    {['Playground', 'Gym', 'Cafeteria', 'Front office'].map((area) => <SelectItem key={area} value={`area:${area}`}>{area}</SelectItem>)}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Classrooms</SelectLabel>
                    {classroomOptions.map((room) => <SelectItem key={room.id} value={`classroom:${room.id}`}>{room.name}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <Input value={locationReason} onChange={(event) => setLocationReason(event.target.value)} placeholder="Reason (optional)" maxLength={180} />
            <Button disabled={isPending || !selectedChild} className="w-full" onClick={submitLocation}>
              <MapPin data-icon="inline-start" />
              Update Location
            </Button>
          </CardContent>
        </Card>

        <Card id="teacher-photo" className="glass-panel scroll-mt-28">
          <CardHeader>
            <CardTitle>Photo</CardTitle>
            <CardDescription>{selectedChild?.fullName ?? "Choose a child"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="photo-child">Child</Label>
              <Select value={selectedChild?.id ?? ""} onValueChange={(value) => { if (value) chooseChild(value); }}>
                <SelectTrigger id="photo-child" className="w-full">
                  <SelectValue placeholder="Choose a child from this class" />
                </SelectTrigger>
                <SelectContent align="start" className="w-[min(28rem,calc(100vw-2rem))]">
                  {byClassroom.map((classroom) => (
                    <SelectGroup key={classroom.id ?? "unassigned-photo"}>
                      <SelectLabel>{classroom.name}</SelectLabel>
                      {classroom.children.map((child) => (
                        <SelectItem key={child.id} value={child.id}>
                          <span className="truncate">{child.fullName}</span>
                          <span className="text-xs text-muted-foreground">{child.ageGroup}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={selectedChild?.photoVideoPermission ? "default" : "secondary"}>
                {selectedChild?.photoVideoPermission ? "Parent sharing ready" : "Director review required"}
              </Badge>
              <Badge variant="outline">Private storage</Badge>
            </div>
            <div className="space-y-1">
              <Label htmlFor="teacher-child-photo">Take or upload photo</Label>
              <Input
                id="teacher-child-photo"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
              />
            </div>
            <Textarea value={photoCaption} onChange={(event) => setPhotoCaption(event.target.value)} placeholder="Caption for parents" />
            <Button disabled={isPending || !selectedChild || !photo} className="w-full" onClick={submitPhoto}>
              <Camera data-icon="inline-start" />
              Share Photo
            </Button>
          </CardContent>
        </Card>

        <Card id="teacher-daily-report" className="glass-panel scroll-mt-28 lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily Report</CardTitle>
            <CardDescription>
              {activeDailyReportChildren.length === 1
                ? activeDailyReportChildren[0].fullName
                : `${activeDailyReportChildren.length} children selected`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <section className="rounded-xl border bg-background/40 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <Users className="size-4" />
                  Report targets
                </div>
                <Badge variant={activeDailyReportChildren.length ? "default" : "destructive"}>
                  {activeDailyReportChildren.length || 0} selected
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {activeDailyReportChildren.slice(0, 8).map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    className="rounded-md border bg-card px-2 py-1 text-xs font-medium transition hover:bg-muted"
                    onClick={() => chooseChild(child.id)}
                  >
                    {child.fullName}
                  </button>
                ))}
                {activeDailyReportChildren.length > 8 ? (
                  <Badge variant="secondary">+{activeDailyReportChildren.length - 8}</Badge>
                ) : null}
              </div>
              <div className="mt-3 space-y-1">
                <Label htmlFor="daily-report-child">Child</Label>
                <Select value={selectedChild?.id ?? ""} onValueChange={(value) => { if (value) setDailyReportTargets([value]); }}>
                  <SelectTrigger id="daily-report-child" className="w-full">
                    <SelectValue placeholder="Choose a child from this class" />
                  </SelectTrigger>
                  <SelectContent align="start" className="w-[min(28rem,calc(100vw-2rem))]">
                    {byClassroom.map((classroom) => (
                      <SelectGroup key={classroom.id ?? "unassigned"}>
                        <SelectLabel>{classroom.name}</SelectLabel>
                        {classroom.children.map((child) => (
                          <SelectItem key={child.id} value={child.id}>
                            <span className="truncate">{child.fullName}</span>
                            <span className="text-xs text-muted-foreground">{child.ageGroup}</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="xs" variant="outline" onClick={selectPresentDailyReports}>
                  <ClipboardCheck data-icon="inline-start" />
                  Present children
                </Button>
                <Button type="button" size="xs" variant="outline" onClick={() => setDailyReportTargets(roster.map((child) => child.id))}>
                  <Users data-icon="inline-start" />
                  All visible
                </Button>
                <Button type="button" size="xs" variant="ghost" onClick={() => setSelectedDailyReportChildIds(selectedChild?.id ? [selectedChild.id] : [])}>
                  Selected child
                </Button>
              </div>
            </section>

            <section className="rounded-xl border bg-background/40 p-3">
              <div className="mb-3 text-sm font-medium">Quick logging</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="xs" variant="outline" onClick={() => addMealPreset("Breakfast")}>Breakfast</Button>
                  <Button type="button" size="xs" variant="outline" onClick={() => addMealPreset("Lunch")}>Lunch</Button>
                  <Button type="button" size="xs" variant="outline" onClick={() => addMealPreset("Afternoon snack")}>Snack</Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="xs" variant="outline" onClick={startNapNow}>Start nap</Button>
                  <Button type="button" size="xs" variant="outline" onClick={endLatestNapNow}>End nap</Button>
                  <Button type="button" size="xs" variant={noNap ? "default" : "outline"} onClick={() => noNap ? setNoNap(false) : markNoNapToday()}>No nap today</Button>
                  <Button type="button" size="xs" variant="outline" onClick={() => addDiaperPreset("Wet")}>Wet</Button>
                  <Button type="button" size="xs" variant="outline" onClick={() => addDiaperPreset("Potty")}>Potty</Button>
                </div>
                <div className="flex flex-wrap gap-1 sm:col-span-2">
                  <Button type="button" size="xs" variant="outline" onClick={() => addActivityPreset("Circle time")}>Circle time</Button>
                  <Button type="button" size="xs" variant="outline" onClick={() => addActivityPreset("Outdoor play")}>Outdoor play</Button>
                  <Button type="button" size="xs" variant="outline" onClick={() => addActivityPreset("Centers")}>Centers</Button>
                </div>
              </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="daily-report-date">Report date</Label>
                <Input id="daily-report-date" type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="daily-report-mood">Mood</Label>
                <Input id="daily-report-mood" value={mood} onChange={(event) => setMood(event.target.value)} placeholder="Happy, calm, tired" />
              </div>
            </div>

            <label className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm">
              <input type="checkbox" checked={sendToParent} onChange={(event) => setSendToParent(event.target.checked)} />
              <span>Send to parent portal</span>
            </label>

            <div className="grid gap-4 xl:grid-cols-2">
              <section className="rounded-xl border bg-background/40 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <Utensils className="size-4" />
                    Meals
                  </div>
                  <Button type="button" size="xs" variant="outline" onClick={() => setMealRows((current) => [...current, createMealDraft()])}>
                    <Plus data-icon="inline-start" />
                    Add
                  </Button>
                </div>
                <div className="space-y-3">
                  {mealRows.map((row, index) => (
                    <div key={row.id} className="grid gap-2 rounded-lg border bg-card/40 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-muted-foreground">Meal {index + 1}</div>
                        <Button type="button" size="xs" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeMeal(row.id)}>
                          <Trash2 data-icon="inline-start" />
                          Remove
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Select value={row.mealType} onValueChange={(value) => updateMeal(row.id, { mealType: value ?? row.mealType })}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Breakfast">Breakfast</SelectItem>
                            <SelectItem value="Morning snack">Morning snack</SelectItem>
                            <SelectItem value="Lunch">Lunch</SelectItem>
                            <SelectItem value="Afternoon snack">Afternoon snack</SelectItem>
                            <SelectItem value="Bottle">Bottle</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input value={row.amount} onChange={(event) => updateMeal(row.id, { amount: event.target.value })} placeholder="Amount" />
                      </div>
                      <Textarea
                        value={row.food}
                        onChange={(event) => updateMeal(row.id, { food: event.target.value })}
                        placeholder="Food, bottle, or meal notes"
                        className="min-h-24 resize-y text-base leading-6 sm:text-sm"
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border bg-background/40 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <Moon className="size-4" />
                    Naps
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="xs" variant={noNap ? "default" : "outline"} onClick={() => noNap ? setNoNap(false) : markNoNapToday()}>
                      No nap today
                    </Button>
                    <Button type="button" size="xs" variant="outline" onClick={() => { setNoNap(false); setNapRows((current) => [...current, createNapDraft()]); }}>
                      <Plus data-icon="inline-start" />
                      Add nap
                    </Button>
                  </div>
                </div>
                {noNap ? (
                  <div className="mb-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                    No nap will be saved on this daily report.
                  </div>
                ) : null}
                <div className={noNap ? "hidden" : "space-y-3"}>
                  {napRows.map((row, index) => (
                    <div key={row.id} className="grid gap-2 rounded-lg border bg-card/40 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-muted-foreground">Nap {index + 1}</div>
                        <Button type="button" size="xs" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeNap(row.id)}>
                          <Trash2 data-icon="inline-start" />
                          Remove
                        </Button>
                      </div>
                      <div className="grid gap-2">
                        <div className="space-y-1">
                          <Label htmlFor={`nap-${index + 1}-start`}>Start time</Label>
                          <Input
                            id={`nap-${index + 1}-start`}
                            type="time"
                            value={row.startsAt}
                            onChange={(event) => updateNap(row.id, { startsAt: event.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`nap-${index + 1}-end`}>End time</Label>
                          <Input
                            id={`nap-${index + 1}-end`}
                            type="time"
                            value={row.endsAt}
                            onChange={(event) => updateNap(row.id, { endsAt: event.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border bg-background/40 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <Baby className="size-4" />
                    Diaper / Potty
                  </div>
                  <Button type="button" size="xs" variant="outline" onClick={() => setDiaperRows((current) => [...current, createDiaperDraft(timeZone)])}>
                    <Plus data-icon="inline-start" />
                    Add
                  </Button>
                </div>
                <div className="space-y-3">
                  {diaperRows.map((row, index) => (
                    <div key={row.id} className="grid gap-2 rounded-lg border bg-card/40 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-muted-foreground">Log {index + 1}</div>
                        <Button type="button" size="xs" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeDiaper(row.id)}>
                          <Trash2 data-icon="inline-start" />
                          Remove
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                        <Select value={row.type} onValueChange={(value) => updateDiaper(row.id, { type: value ?? "" })}>
                          <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Wet">Wet</SelectItem>
                            <SelectItem value="BM">BM</SelectItem>
                            <SelectItem value="Wet and BM">Wet and BM</SelectItem>
                            <SelectItem value="Dry">Dry</SelectItem>
                            <SelectItem value="Potty">Potty</SelectItem>
                            <SelectItem value="Accident">Accident</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input type="datetime-local" value={row.occurredAt} onChange={(event) => updateDiaper(row.id, { occurredAt: event.target.value })} />
                      </div>
                      <Input value={row.notes} onChange={(event) => updateDiaper(row.id, { notes: event.target.value })} placeholder="Notes" />
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border bg-background/40 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <Palette className="size-4" />
                    Activities
                  </div>
                  <Button type="button" size="xs" variant="outline" onClick={() => setActivityRows((current) => [...current, createActivityDraft()])}>
                    <Plus data-icon="inline-start" />
                    Add
                  </Button>
                </div>
                <div className="space-y-3">
                  {activityRows.map((row, index) => (
                    <div key={row.id} className="grid gap-2 rounded-lg border bg-card/40 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-muted-foreground">Activity {index + 1}</div>
                        <Button type="button" size="xs" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeActivity(row.id)}>
                          <Trash2 data-icon="inline-start" />
                          Remove
                        </Button>
                      </div>
                      <Input value={row.title} onChange={(event) => updateActivity(row.id, { title: event.target.value })} placeholder="Activity" />
                      <Input value={row.notes} onChange={(event) => updateActivity(row.id, { notes: event.target.value })} placeholder="Notes" />
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={suppliesNeeded} onChange={(event) => setSuppliesNeeded(event.target.value)} placeholder="Supplies needed" />
              <Textarea value={teacherNote} onChange={(event) => setTeacherNote(event.target.value)} placeholder="Teacher note" />
            </div>
            <Button disabled={isPending || !activeDailyReportChildIds.length} className="w-full" onClick={submitDailyReport}>
              <BookOpen data-icon="inline-start" />
              {activeDailyReportChildIds.length > 1 ? `Save ${activeDailyReportChildIds.length} Reports` : "Save Report"}
            </Button>
          </CardContent>
        </Card>

        <Card id="teacher-incident" className="glass-panel scroll-mt-28">
          <CardHeader>
            <CardTitle>Incident</CardTitle>
            <CardDescription>Director review required</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={incidentType} onChange={(event) => setIncidentType(event.target.value)} placeholder="Incident type" />
            <Textarea value={incidentDescription} onChange={(event) => setIncidentDescription(event.target.value)} placeholder="Objective description" />
            <Textarea value={actionTaken} onChange={(event) => setActionTaken(event.target.value)} placeholder="Action taken" />
            <Button disabled={isPending || !selectedChild} className="w-full" onClick={submitIncident}>
              <ShieldAlert data-icon="inline-start" />
              Create Incident
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
