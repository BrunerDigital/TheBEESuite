"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedDateTime } from "@/lib/zoned-date-time";
import { AlertCircle, ArrowUpRight, Building2, CheckCircle2, CreditCard, GitMerge, Mail, Save, Trash2, UserPen } from "lucide-react";
import { ContextBadge, EntityHeader, SummaryMetric, initialsFromName } from "@/components/entity-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CUSTODY_WARNING_DETAIL, CUSTODY_WARNING_LABEL, custodyWarningPreview, hasCustodyWarning } from "@/lib/custody-visibility";
import {
  findChildDuplicateCandidates,
  findFamilyDuplicateCandidates,
  findGuardianDuplicateCandidates,
} from "@/lib/family-dedupe";
import { defaultAgeGroupOptions, mergeAgeGroupOptions } from "@/lib/dashboard-options";
import { resolveDailyReportEmailRecipients } from "@/lib/daily-report-email-settings";

type ClassroomOption = { id: string; name: string; ageGroup: string };
type CenterOption = { id: string; name: string; classrooms: ClassroomOption[] };

type GuardianRecord = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  employer?: string | null;
  relation: string;
  preferredCommunication?: string | null;
  isBillingContact?: boolean;
  userId?: string | null;
  checkInPinSetAt?: Date | string | null;
  qrToken?: string | null;
  kioskPath?: string | null;
  centerName?: string | null;
  customFields?: unknown;
};

type ChildRecord = {
  id: string;
  fullName: string;
  preferredName?: string | null;
  dateOfBirth?: Date | string | null;
  ageGroup: string;
  enrollmentStatus: string;
  startDate?: Date | string | null;
  classroomId?: string | null;
  schedule?: unknown;
  photoVideoPermission?: boolean;
  fieldTripPermission?: boolean;
  napNotes?: string | null;
  feedingNotes?: string | null;
  pottyNotes?: string | null;
  developmentalNotes?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  allergies: AllergyRecord[];
  medicalNotes: MedicalNoteRecord[];
  documents: DocumentRecord[];
  tuitionAssignment?: {
    enabled: boolean;
    tuitionPlanId: string | null;
    tuitionPlanName: string | null;
    cadence: string | null;
    amountCents: number | null;
    billingDay: number | null;
    startsPeriod: string | null;
    description: string | null;
  } | null;
};

type AuthorizedPickupRecord = {
  id: string;
  fullName: string;
  phone: string | null;
  relation: string | null;
  verificationNotes: string | null;
};

type EmergencyContactRecord = {
  id: string;
  fullName: string;
  phone: string;
  relation: string;
};

type AllergyRecord = {
  id: string;
  allergen: string;
  severity: string;
  actionPlan: string | null;
};

type MedicalNoteRecord = {
  id: string;
  category: string;
  note: string;
  restricted: boolean;
};

type DocumentRecord = {
  id: string;
  familyId: string | null;
  childId: string | null;
  name: string;
  type: string;
  status: string;
  expiresAt: Date | string | null;
  restricted: boolean;
  createdAt?: Date | string | null;
};

type FamilyNoteRecord = {
  id: string;
  body: string;
  restricted: boolean;
  createdAt: Date | string;
  user?: { name: string | null; email: string | null } | null;
};

type PaymentMethodManagementRecord = {
  autopayEnabled: boolean;
  autopayStatus: "enabled" | "disabled" | "pending";
  hasStripeCustomer: boolean;
  hasSavedPaymentMethod: boolean;
  stripeCustomerId: string | null;
  stripeDefaultPaymentMethodId: string | null;
  paymentMethodType: string | null;
  paymentMethodLabel: string | null;
  lastUpdatedAt: string | null;
};

export type EditableFamilyRecord = {
  id: string;
  centerId: string | null;
  centerName?: string | null;
  name: string;
  billingEmail: string | null;
  address?: string | null;
  notes?: string | null;
  custodyNotes: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  customFields?: unknown;
  guardians: GuardianRecord[];
  children: ChildRecord[];
  pickups: AuthorizedPickupRecord[];
  emergencyContacts: EmergencyContactRecord[];
  documents: DocumentRecord[];
  notesList?: FamilyNoteRecord[];
  billingAccount?: {
    id: string;
    balanceCents: number;
    autopayPlaceholder: boolean;
    paymentMethodManagement: PaymentMethodManagementRecord;
  } | null;
};

type Props = {
  families: EditableFamilyRecord[];
  centers: CenterOption[];
  ageGroups?: string[];
  initialFamilyId?: string;
  initialChildId?: string;
  searchQuery?: string;
};

const enrollmentStatuses = ["enrolled", "pending", "waitlisted", "tour_scheduled", "summer_break", "withdrawn", "graduated", "inactive"];
const communicationMethods = ["email", "phone", "sms"];
const documentStatuses = ["REQUESTED", "SUBMITTED", "APPROVED", "REJECTED", "EXPIRED"];
const profileSectionLinks = [
  ["Overview", "family-overview"],
  ["Guardians", "family-guardians"],
  ["Pickups", "family-contacts"],
  ["Children", "family-children"],
  ["Billing", "family-billing"],
  ["Documents", "family-documents"],
  ["Notes", "family-notes"],
  ["Activity", "family-activity"],
] as const;

function toDateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (date.getUTCFullYear() === 1900) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function scheduleNotes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const notes = (value as { notes?: unknown }).notes;
  return typeof notes === "string" ? notes : "";
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parentPortalLoginEnabledForGuardian(guardian: GuardianRecord | null | undefined) {
  if (!guardian) return true;
  const parentPortal = recordValue(recordValue(guardian.customFields).parentPortal);
  if (parentPortal.accessDisabled === true || parentPortal.loginEnabled === false) return false;
  if (guardian.userId) return true;
  return parentPortal.accessDisabled !== true && parentPortal.loginEnabled !== false;
}

function parentPortalStatusText(json: {
  parentPortalLoginEnabled?: boolean;
  parentPortalLogin?: { status?: string; reason?: string };
} | null) {
  if (!json) return "";
  if (json.parentPortalLogin?.status === "failed") return " Parent portal login needs staff follow-up.";
  if (json.parentPortalLoginEnabled === false) return " Parent portal login disabled for this guardian.";
  if (json.parentPortalLogin?.status === "linked") return " Parent portal login is ready.";
  if (json.parentPortalLogin?.status === "disabled") return " Parent portal login disabled for this guardian.";
  if (json.parentPortalLogin?.reason === "guardian_email_invalid") return " Add a valid personal email before parent portal login can be created.";
  if (json.parentPortalLogin?.reason === "parent_portal_disabled") return " Parent portal login disabled for this guardian.";
  return "";
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatActivityDate(value: string | Date | null | undefined, timeZone: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  if (date.getUTCFullYear() === 1900) return "Missing DOB";
  return formatZonedDateTime(date, timeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

type FamilyActivityItem = {
  id: string;
  title: string;
  detail: string;
  date: string | Date | null | undefined;
};

function buildFamilyActivity(family: EditableFamilyRecord | null, paymentMethod: PaymentMethodManagementRecord | null) {
  if (!family) return [];
  const items: FamilyActivityItem[] = [
    {
      id: `family-updated-${family.id}`,
      title: "Family profile updated",
      detail: `${family.name} family-level data`,
      date: family.updatedAt ?? family.createdAt,
    },
    {
      id: `family-created-${family.id}`,
      title: "Family profile created",
      detail: family.centerName ?? "School not set",
      date: family.createdAt,
    },
  ];

  for (const child of family.children) {
    items.push({
      id: `child-updated-${child.id}`,
      title: "Child profile updated",
      detail: `${child.fullName} · ${child.enrollmentStatus.replaceAll("_", " ")}`,
      date: child.updatedAt ?? child.createdAt,
    });
  }

  for (const document of family.documents) {
    items.push({
      id: `family-document-${document.id}`,
      title: "Family document record",
      detail: `${document.name} · ${document.status.toLowerCase()}`,
      date: document.createdAt,
    });
  }

  for (const child of family.children) {
    for (const document of child.documents) {
      items.push({
        id: `child-document-${document.id}`,
        title: "Child document record",
        detail: `${child.fullName} · ${document.name} · ${document.status.toLowerCase()}`,
        date: document.createdAt,
      });
    }
  }

  for (const note of family.notesList ?? []) {
    items.push({
      id: `note-${note.id}`,
      title: note.restricted ? "Restricted family note" : "Family note",
      detail: `${note.user?.name ?? note.user?.email ?? "Staff"} · ${note.body.slice(0, 96)}`,
      date: note.createdAt,
    });
  }

  if (paymentMethod?.lastUpdatedAt) {
    items.push({
      id: `payment-method-${family.id}`,
      title: "Payment method updated",
      detail: paymentMethod.paymentMethodLabel ?? "Saved payment method",
      date: paymentMethod.lastUpdatedAt,
    });
  }

  return items
    .filter((item) => item.date)
    .sort((left, right) => new Date(right.date ?? 0).getTime() - new Date(left.date ?? 0).getTime())
    .slice(0, 10);
}

function familySearchText(family: EditableFamilyRecord) {
  return [
    family.name,
    family.billingEmail,
    family.address,
    family.centerName,
    family.guardians.map((guardian) => [guardian.fullName, guardian.email, guardian.phone, guardian.relation].filter(Boolean).join(" ")).join(" "),
    family.children.map((child) => [child.fullName, child.preferredName, child.ageGroup, child.enrollmentStatus].filter(Boolean).join(" ")).join(" "),
  ].filter(Boolean).join(" ").toLowerCase();
}

function pickInitialFamily(families: EditableFamilyRecord[], initialFamilyId?: string, searchQuery?: string) {
  const byId = initialFamilyId ? families.find((family) => family.id === initialFamilyId) : null;
  if (byId) return byId;
  const query = searchQuery?.trim().toLowerCase();
  if (query) {
    const bySearch = families.find((family) => familySearchText(family).includes(query));
    if (bySearch) return bySearch;
  }
  return families[0] ?? null;
}

function pickInitialChild(family: EditableFamilyRecord | null, initialChildId?: string, searchQuery?: string) {
  if (!family) return null;
  const byId = initialChildId ? family.children.find((child) => child.id === initialChildId) : null;
  if (byId) return byId;
  const query = searchQuery?.trim().toLowerCase();
  if (query) {
    const bySearch = family.children.find((child) =>
      [child.fullName, child.preferredName, child.ageGroup, child.enrollmentStatus].filter(Boolean).join(" ").toLowerCase().includes(query),
    );
    if (bySearch) return bySearch;
  }
  return family.children[0] ?? null;
}

function familyProfileHref(family: EditableFamilyRecord | null | undefined) {
  if (!family) return "/family-detail";
  return `/family-detail?familyId=${encodeURIComponent(family.id)}#family-editor`;
}

function familyBillingHref(
  family: EditableFamilyRecord | null | undefined,
  child: ChildRecord | null | undefined,
) {
  if (!family) return "/billing-invoices#billing-workbench";
  const params = new URLSearchParams({ familyId: family.id });
  if (family.centerId) params.set("centerId", family.centerId);
  if (child?.id) params.set("childId", child.id);
  return `/billing-invoices?${params.toString()}#billing-workbench`;
}

export function FamilyRecordEditor({ families, centers, ageGroups: configuredAgeGroups, initialFamilyId, initialChildId, searchQuery }: Props) {
  const timeZone = useSchoolTimeZone();
  const router = useRouter();
  const availableAgeGroups = useMemo(
    () => mergeAgeGroupOptions(
      configuredAgeGroups,
      families.flatMap((family) => family.children.map((child) => child.ageGroup)),
      centers.flatMap((center) => center.classrooms.map((classroom) => classroom.ageGroup)),
    ),
    [centers, configuredAgeGroups, families],
  );
  const initialFamily = useMemo(
    () => pickInitialFamily(families, initialFamilyId, searchQuery),
    [families, initialFamilyId, searchQuery],
  );
  const [selectedFamilyId, setSelectedFamilyId] = useState(initialFamily?.id ?? "");
  const selectedFamily = useMemo(
    () => families.find((family) => family.id === selectedFamilyId) ?? families[0] ?? null,
    [families, selectedFamilyId],
  );
  const initialChild = useMemo(
    () => pickInitialChild(selectedFamily, initialChildId, searchQuery),
    [initialChildId, searchQuery, selectedFamily],
  );

  const [familyCenterId, setFamilyCenterId] = useState(selectedFamily?.centerId ?? centers[0]?.id ?? "");
  const [familyName, setFamilyName] = useState(selectedFamily?.name ?? "");
  const [billingEmail, setBillingEmail] = useState(selectedFamily?.billingEmail ?? "");
  const [address, setAddress] = useState(selectedFamily?.address ?? "");
  const [familyNotes, setFamilyNotes] = useState(selectedFamily?.notes ?? "");
  const [custodyNotes, setCustodyNotes] = useState(selectedFamily?.custodyNotes ?? "");
  const [selectedGuardianId, setSelectedGuardianId] = useState(selectedFamily?.guardians[0]?.id ?? "");
  const selectedGuardian = selectedGuardianId
    ? selectedFamily?.guardians.find((guardian) => guardian.id === selectedGuardianId) ?? null
    : null;
  const [guardianName, setGuardianName] = useState(selectedGuardian?.fullName ?? "");
  const [guardianEmail, setGuardianEmail] = useState(selectedGuardian?.email ?? "");
  const [guardianPhone, setGuardianPhone] = useState(selectedGuardian?.phone ?? "");
  const [guardianEmployer, setGuardianEmployer] = useState(selectedGuardian?.employer ?? "");
  const [guardianRelation, setGuardianRelation] = useState(selectedGuardian?.relation ?? "Parent/Guardian");
  const [preferredCommunication, setPreferredCommunication] = useState(selectedGuardian?.preferredCommunication ?? "email");
  const [isBillingContact, setIsBillingContact] = useState(Boolean(selectedGuardian?.isBillingContact));
  const [parentPortalLoginEnabled, setParentPortalLoginEnabled] = useState(parentPortalLoginEnabledForGuardian(selectedGuardian));

  const [selectedPickupId, setSelectedPickupId] = useState(selectedFamily?.pickups[0]?.id ?? "");
  const selectedPickup = selectedPickupId
    ? selectedFamily?.pickups.find((pickup) => pickup.id === selectedPickupId) ?? null
    : null;
  const [pickupName, setPickupName] = useState(selectedPickup?.fullName ?? "");
  const [pickupPhone, setPickupPhone] = useState(selectedPickup?.phone ?? "");
  const [pickupRelation, setPickupRelation] = useState(selectedPickup?.relation ?? "");
  const [pickupVerificationNotes, setPickupVerificationNotes] = useState(selectedPickup?.verificationNotes ?? "");

  const [selectedEmergencyContactId, setSelectedEmergencyContactId] = useState(selectedFamily?.emergencyContacts[0]?.id ?? "");
  const selectedEmergencyContact = selectedEmergencyContactId
    ? selectedFamily?.emergencyContacts.find((contact) => contact.id === selectedEmergencyContactId) ?? null
    : null;
  const [emergencyContactName, setEmergencyContactName] = useState(selectedEmergencyContact?.fullName ?? "");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(selectedEmergencyContact?.phone ?? "");
  const [emergencyContactRelation, setEmergencyContactRelation] = useState(selectedEmergencyContact?.relation ?? "");

  const [selectedChildId, setSelectedChildId] = useState(initialChild?.id ?? "");
  const selectedChild = selectedChildId
    ? selectedFamily?.children.find((child) => child.id === selectedChildId) ?? null
    : null;
  const [childName, setChildName] = useState(initialChild?.fullName ?? "");
  const [preferredName, setPreferredName] = useState(initialChild?.preferredName ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(toDateInput(initialChild?.dateOfBirth));
  const [ageGroup, setAgeGroup] = useState(initialChild?.ageGroup ?? defaultAgeGroupOptions[0]);
  const [enrollmentStatus, setEnrollmentStatus] = useState(initialChild?.enrollmentStatus ?? "enrolled");
  const [startDate, setStartDate] = useState(toDateInput(initialChild?.startDate));
  const [classroomId, setClassroomId] = useState(initialChild?.classroomId ?? "none");
  const [childScheduleNotes, setChildScheduleNotes] = useState(scheduleNotes(initialChild?.schedule));
  const [napNotes, setNapNotes] = useState(initialChild?.napNotes ?? "");
  const [feedingNotes, setFeedingNotes] = useState(initialChild?.feedingNotes ?? "");
  const [pottyNotes, setPottyNotes] = useState(initialChild?.pottyNotes ?? "");
  const [developmentalNotes, setDevelopmentalNotes] = useState(initialChild?.developmentalNotes ?? "");
  const [photoVideoPermission, setPhotoVideoPermission] = useState(Boolean(initialChild?.photoVideoPermission));
  const [fieldTripPermission, setFieldTripPermission] = useState(Boolean(initialChild?.fieldTripPermission));

  const [selectedAllergyId, setSelectedAllergyId] = useState(selectedChild?.allergies[0]?.id ?? "");
  const selectedAllergy = selectedAllergyId
    ? selectedChild?.allergies.find((allergy) => allergy.id === selectedAllergyId) ?? null
    : null;
  const [allergen, setAllergen] = useState(selectedAllergy?.allergen ?? "");
  const [allergySeverity, setAllergySeverity] = useState(selectedAllergy?.severity ?? "");
  const [allergyActionPlan, setAllergyActionPlan] = useState(selectedAllergy?.actionPlan ?? "");

  const [selectedMedicalNoteId, setSelectedMedicalNoteId] = useState(selectedChild?.medicalNotes[0]?.id ?? "");
  const selectedMedicalNote = selectedMedicalNoteId
    ? selectedChild?.medicalNotes.find((note) => note.id === selectedMedicalNoteId) ?? null
    : null;
  const [medicalCategory, setMedicalCategory] = useState(selectedMedicalNote?.category ?? "");
  const [medicalNote, setMedicalNote] = useState(selectedMedicalNote?.note ?? "");
  const [medicalRestricted, setMedicalRestricted] = useState(selectedMedicalNote?.restricted ?? true);

  const firstDocument = selectedChild?.documents[0] ?? selectedFamily?.documents[0] ?? null;
  const [selectedDocumentId, setSelectedDocumentId] = useState(firstDocument?.id ?? "");
  const selectedDocument = selectedDocumentId
    ? selectedChild?.documents.find((document) => document.id === selectedDocumentId) ??
      selectedFamily?.documents.find((document) => document.id === selectedDocumentId) ??
      null
    : null;
  const [documentName, setDocumentName] = useState(selectedDocument?.name ?? "");
  const [documentType, setDocumentType] = useState(selectedDocument?.type ?? "");
  const [documentStatus, setDocumentStatus] = useState(selectedDocument?.status ?? "REQUESTED");
  const [documentExpiresAt, setDocumentExpiresAt] = useState(toDateInput(selectedDocument?.expiresAt));
  const [documentRestricted, setDocumentRestricted] = useState(Boolean(selectedDocument?.restricted));
  const [documentChildId, setDocumentChildId] = useState(selectedDocument?.childId ?? "family");

  const [duplicateFamilyId, setDuplicateFamilyId] = useState("");
  const [duplicateGuardianId, setDuplicateGuardianId] = useState("");
  const [duplicateChildId, setDuplicateChildId] = useState("");

  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedCenter = centers.find((center) => center.id === familyCenterId);
  const classroomOptions = selectedCenter?.classrooms ?? [];
  const dailyReportEmailRecipients = selectedFamily
    ? resolveDailyReportEmailRecipients({
        customFields: selectedFamily.customFields,
        guardians: selectedFamily.guardians,
      })
    : [];
  const childDuplicateRecords = useMemo(
    () => families.flatMap((family) =>
      family.children.map((child) => ({
        ...child,
        familyId: family.id,
        familyName: family.name,
        centerId: family.centerId,
      })),
    ),
    [families],
  );
  const guardianDuplicateRecords = useMemo(
    () => families.flatMap((family) =>
      family.guardians.map((guardian) => ({
        ...guardian,
        familyId: family.id,
        familyName: family.name,
        centerId: family.centerId,
      })),
    ),
    [families],
  );
  const duplicateCandidates = useMemo(
    () => selectedFamily ? findFamilyDuplicateCandidates(families, selectedFamily.id) : [],
    [families, selectedFamily],
  );
  const selectedDuplicateId = duplicateFamilyId && duplicateCandidates.some((candidate) => candidate.candidateId === duplicateFamilyId)
    ? duplicateFamilyId
    : duplicateCandidates[0]?.candidateId || "";
  const guardianDuplicateCandidates = useMemo(
    () => selectedGuardian ? findGuardianDuplicateCandidates(guardianDuplicateRecords, selectedGuardian.id) : [],
    [guardianDuplicateRecords, selectedGuardian],
  );
  const selectedDuplicateGuardianId = duplicateGuardianId && guardianDuplicateCandidates.some((candidate) => candidate.candidateId === duplicateGuardianId)
    ? duplicateGuardianId
    : guardianDuplicateCandidates[0]?.candidateId || "";
  const childDuplicateCandidates = useMemo(
    () => selectedChild ? findChildDuplicateCandidates(childDuplicateRecords, selectedChild.id) : [],
    [childDuplicateRecords, selectedChild],
  );
  const selectedDuplicateChildId = duplicateChildId && childDuplicateCandidates.some((candidate) => candidate.candidateId === duplicateChildId)
    ? duplicateChildId
    : childDuplicateCandidates[0]?.candidateId || "";
  const selectedBillingAccount = selectedFamily?.billingAccount ?? null;
  const selectedPaymentMethod = selectedBillingAccount?.paymentMethodManagement ?? null;
  const activityItems = useMemo(
    () => buildFamilyActivity(selectedFamily, selectedPaymentMethod),
    [selectedFamily, selectedPaymentMethod],
  );
  const selectedAutopayStatus = selectedPaymentMethod?.autopayStatus ?? (selectedBillingAccount?.autopayPlaceholder ? "enabled" : "disabled");
  const documentRecordCount =
    (selectedFamily?.documents.length ?? 0) +
    (selectedFamily?.children.reduce((count, child) => count + child.documents.length, 0) ?? 0);
  const selectedCenterLabel = selectedCenter?.name ?? selectedFamily?.centerName ?? "School not set";
  const selectedChildLabel = selectedChild?.fullName ?? (childName.trim() ? `${childName.trim()} (new child)` : "No child selected");
  const selectedWeeklyTuition = selectedChild?.tuitionAssignment?.enabled && selectedChild.tuitionAssignment.amountCents
    ? selectedChild.tuitionAssignment
    : null;
  const activeWeeklyTuitionAssignments = selectedFamily?.children.filter(
    (child) => child.tuitionAssignment?.enabled && (child.tuitionAssignment.amountCents ?? 0) > 0,
  ) ?? [];
  const familyWeeklyTuitionCents = activeWeeklyTuitionAssignments.reduce(
    (total, child) => total + (child.tuitionAssignment?.amountCents ?? 0),
    0,
  );
  const selectedGuardianLabel = selectedGuardian?.fullName ?? (guardianName.trim() ? `${guardianName.trim()} (new parent)` : "No parent selected");
  const editingTargetLabel = selectedFamily
    ? `${selectedFamily.name} / ${selectedChild?.fullName ?? "family account"}`
    : "No family selected";
  const selectedFamilyUpdatedAt = formatDate(selectedFamily?.updatedAt ?? selectedFamily?.createdAt);

  function loadGuardian(guardian: GuardianRecord | null) {
    setSelectedGuardianId(guardian?.id ?? "");
    setGuardianName(guardian?.fullName ?? "");
    setGuardianEmail(guardian?.email ?? "");
    setGuardianPhone(guardian?.phone ?? "");
    setGuardianEmployer(guardian?.employer ?? "");
    setGuardianRelation(guardian?.relation ?? "Parent/Guardian");
    setPreferredCommunication(guardian?.preferredCommunication ?? "email");
    setIsBillingContact(Boolean(guardian?.isBillingContact));
    setParentPortalLoginEnabled(parentPortalLoginEnabledForGuardian(guardian));
    setDuplicateGuardianId("");
  }

  function loadPickup(pickup: AuthorizedPickupRecord | null) {
    setSelectedPickupId(pickup?.id ?? "");
    setPickupName(pickup?.fullName ?? "");
    setPickupPhone(pickup?.phone ?? "");
    setPickupRelation(pickup?.relation ?? "");
    setPickupVerificationNotes(pickup?.verificationNotes ?? "");
  }

  function loadEmergencyContact(contact: EmergencyContactRecord | null) {
    setSelectedEmergencyContactId(contact?.id ?? "");
    setEmergencyContactName(contact?.fullName ?? "");
    setEmergencyContactPhone(contact?.phone ?? "");
    setEmergencyContactRelation(contact?.relation ?? "");
  }

  function loadAllergy(allergy: AllergyRecord | null) {
    setSelectedAllergyId(allergy?.id ?? "");
    setAllergen(allergy?.allergen ?? "");
    setAllergySeverity(allergy?.severity ?? "");
    setAllergyActionPlan(allergy?.actionPlan ?? "");
  }

  function loadMedicalNote(note: MedicalNoteRecord | null) {
    setSelectedMedicalNoteId(note?.id ?? "");
    setMedicalCategory(note?.category ?? "");
    setMedicalNote(note?.note ?? "");
    setMedicalRestricted(note?.restricted ?? true);
  }

  function loadDocument(document: DocumentRecord | null, child: ChildRecord | null = selectedChild) {
    setSelectedDocumentId(document?.id ?? "");
    setDocumentName(document?.name ?? "");
    setDocumentType(document?.type ?? "");
    setDocumentStatus(document?.status ?? "REQUESTED");
    setDocumentExpiresAt(toDateInput(document?.expiresAt));
    setDocumentRestricted(Boolean(document?.restricted));
    setDocumentChildId(document?.childId ?? child?.id ?? "family");
  }

  function loadChild(child: ChildRecord | null) {
    setSelectedChildId(child?.id ?? "");
    setChildName(child?.fullName ?? "");
    setPreferredName(child?.preferredName ?? "");
    setDateOfBirth(toDateInput(child?.dateOfBirth));
    setAgeGroup(child?.ageGroup ?? availableAgeGroups[0] ?? defaultAgeGroupOptions[0]);
    setEnrollmentStatus(child?.enrollmentStatus ?? "enrolled");
    setStartDate(toDateInput(child?.startDate));
    setClassroomId(child?.classroomId ?? "none");
    setChildScheduleNotes(scheduleNotes(child?.schedule));
    setNapNotes(child?.napNotes ?? "");
    setFeedingNotes(child?.feedingNotes ?? "");
    setPottyNotes(child?.pottyNotes ?? "");
    setDevelopmentalNotes(child?.developmentalNotes ?? "");
    setPhotoVideoPermission(Boolean(child?.photoVideoPermission));
    setFieldTripPermission(Boolean(child?.fieldTripPermission));
    loadAllergy(child?.allergies[0] ?? null);
    loadMedicalNote(child?.medicalNotes[0] ?? null);
    loadDocument(child?.documents[0] ?? null, child);
    setDuplicateChildId("");
  }

  function loadFamily(familyId: string) {
    const family = families.find((item) => item.id === familyId) ?? families[0] ?? null;
    setSelectedFamilyId(family?.id ?? "");
    setFamilyCenterId(family?.centerId ?? centers[0]?.id ?? "");
    setFamilyName(family?.name ?? "");
    setBillingEmail(family?.billingEmail ?? "");
    setAddress(family?.address ?? "");
    setFamilyNotes(family?.notes ?? "");
    setCustodyNotes(family?.custodyNotes ?? "");
    loadGuardian(family?.guardians[0] ?? null);
    loadPickup(family?.pickups[0] ?? null);
    loadEmergencyContact(family?.emergencyContacts[0] ?? null);
    loadChild(family?.children[0] ?? null);
    loadDocument(family?.children[0]?.documents[0] ?? family?.documents[0] ?? null, family?.children[0] ?? null);
    setDuplicateFamilyId("");
  }

  function loadGuardianById(guardianId: string) {
    loadGuardian(selectedFamily?.guardians.find((guardian) => guardian.id === guardianId) ?? null);
  }

  function loadChildById(childId: string) {
    loadChild(selectedFamily?.children.find((child) => child.id === childId) ?? null);
  }

  function loadPickupById(pickupId: string) {
    loadPickup(selectedFamily?.pickups.find((pickup) => pickup.id === pickupId) ?? null);
  }

  function loadEmergencyContactById(contactId: string) {
    loadEmergencyContact(selectedFamily?.emergencyContacts.find((contact) => contact.id === contactId) ?? null);
  }

  function loadAllergyById(allergyId: string) {
    loadAllergy(selectedChild?.allergies.find((allergy) => allergy.id === allergyId) ?? null);
  }

  function loadMedicalNoteById(noteId: string) {
    loadMedicalNote(selectedChild?.medicalNotes.find((note) => note.id === noteId) ?? null);
  }

  function loadDocumentById(documentId: string) {
    const childDocument = selectedFamily?.children.flatMap((child) => child.documents).find((document) => document.id === documentId);
    loadDocument(selectedFamily?.documents.find((document) => document.id === documentId) ?? childDocument ?? null);
  }

  function postRecord(payload: Record<string, unknown>, successLabel: string) {
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        mode?: string;
        parentPortalLoginEnabled?: boolean;
        parentPortalLogin?: { status?: string; reason?: string };
      } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || `${successLabel} could not be saved.`);
        return;
      }
      setStatusMessage(`${successLabel} ${json?.mode ?? "saved"}.${parentPortalStatusText(json)}`);
      router.refresh();
    });
  }

  function removeGuardian() {
    if (!selectedGuardian) return;
    const confirmed = window.confirm(
      `Remove ${selectedGuardian.fullName} from ${selectedFamily?.name ?? "this family"}? Their kiosk PIN, portal link to this family, and parent contact row will be removed. Historical check-in/out records will stay on file.`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "guardian", id: selectedGuardian.id }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Parent/guardian could not be removed.");
        return;
      }
      loadGuardian(null);
      setStatusMessage("Parent/guardian removed from the family.");
      router.refresh();
    });
  }

  function removePickup() {
    if (!selectedPickup) return;
    const confirmed = window.confirm(
      `Remove ${selectedPickup.fullName} from ${selectedFamily?.name ?? "this family"} as an authorized pickup?`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "authorizedPickup", id: selectedPickup.id }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Authorized pickup could not be removed.");
        return;
      }
      loadPickup(null);
      setStatusMessage("Authorized pickup removed from the family.");
      router.refresh();
    });
  }

  function removeEmergencyContact() {
    if (!selectedEmergencyContact) return;
    const confirmed = window.confirm(
      `Remove ${selectedEmergencyContact.fullName} from ${selectedFamily?.name ?? "this family"} as an emergency contact?`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "emergencyContact", id: selectedEmergencyContact.id }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Emergency contact could not be removed.");
        return;
      }
      loadEmergencyContact(null);
      setStatusMessage("Emergency contact removed from the family.");
      router.refresh();
    });
  }

  function removeAllergy() {
    if (!selectedAllergy) return;
    const confirmed = window.confirm(`Remove the ${selectedAllergy.allergen} allergy record from ${selectedChild?.fullName ?? "this child"}?`);
    if (!confirmed) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "allergy", id: selectedAllergy.id }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Allergy record could not be removed.");
        return;
      }
      loadAllergy(null);
      setStatusMessage("Allergy record removed from the child profile.");
      router.refresh();
    });
  }

  function removeMedicalNote() {
    if (!selectedMedicalNote) return;
    const confirmed = window.confirm(`Remove this ${selectedMedicalNote.category || "medical"} note from ${selectedChild?.fullName ?? "this child"}?`);
    if (!confirmed) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "medicalNote", id: selectedMedicalNote.id }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Medical note could not be removed.");
        return;
      }
      loadMedicalNote(null);
      setStatusMessage("Medical note removed from the child profile.");
      router.refresh();
    });
  }

  function removeDocument() {
    if (!selectedDocument) return;
    const confirmed = window.confirm(`Remove the ${selectedDocument.name} document request? Uploaded files and request history for this row will be removed.`);
    if (!confirmed) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "document", id: selectedDocument.id }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Document request could not be removed.");
        return;
      }
      loadDocument(null);
      setStatusMessage("Document request removed.");
      router.refresh();
    });
  }

  function emailDocumentRequest() {
    if (!selectedDocument) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch(`/api/documents/${encodeURIComponent(selectedDocument.id)}/request-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await response.json().catch(() => null) as { error?: string; emailsSent?: number; parentAccountsLinked?: number } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Parent document request email could not be sent.");
        return;
      }
      const emailsSent = json?.emailsSent ?? 0;
      const linkedText = json?.parentAccountsLinked ? ` ${json.parentAccountsLinked} parent portal account linked.` : "";
      setStatusMessage(`${emailsSent} parent document request email${emailsSent === 1 ? "" : "s"} sent.${linkedText}`);
      router.refresh();
    });
  }

  function manageFamilyPaymentMethod(action: "setup" | "portal" | "disable_autopay", paymentMethodCategory: "ach" | "card" | "link_bank" | "default" = "default") {
    if (!selectedBillingAccount) {
      setStatusMessage("");
      setErrorMessage("Create a billing account before saving a family payment method.");
      return;
    }
    if (action !== "portal") {
      const confirmed = window.confirm(
        `You are editing the billing payment method for ${selectedFamily?.name ?? "this family"} at ${selectedCenterLabel}. Continue?`,
      );
      if (!confirmed) return;
    }
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/billing/payment-method-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingAccountId: selectedBillingAccount.id,
          action,
          paymentMethodCategory,
          returnPath: "/family-detail",
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; url?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Payment method management is not configured yet.");
        return;
      }
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      setStatusMessage(action === "disable_autopay" ? "Autopay disabled." : "Payment method settings updated.");
      router.refresh();
    });
  }

  function mergeDuplicateGuardian() {
    if (!selectedGuardian || !selectedDuplicateGuardianId) return;
    const duplicate = guardianDuplicateRecords.find((guardian) => guardian.id === selectedDuplicateGuardianId);
    const confirmed = window.confirm(`Merge ${duplicate?.fullName ?? "this duplicate guardian"} into ${selectedGuardian.fullName}? Check-in history and the linked parent account will move to the kept guardian when safe.`);
    if (!confirmed) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "guardianMerge",
          primaryGuardianId: selectedGuardian.id,
          duplicateGuardianId: selectedDuplicateGuardianId,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Guardian merge could not be completed.");
        return;
      }
      setStatusMessage("Duplicate guardian merged into the selected guardian.");
      setDuplicateGuardianId("");
      router.refresh();
    });
  }

  function mergeDuplicateChild() {
    if (!selectedChild || !selectedDuplicateChildId) return;
    const duplicate = childDuplicateRecords.find((child) => child.id === selectedDuplicateChildId);
    const confirmed = window.confirm(`Merge ${duplicate?.fullName ?? "this duplicate child"} into ${selectedChild.fullName}? Attendance, documents, daily reports, incidents, medication logs, media, and enrollment history will move to the kept child profile.`);
    if (!confirmed) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "childMerge",
          primaryChildId: selectedChild.id,
          duplicateChildId: selectedDuplicateChildId,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Child merge could not be completed.");
        return;
      }
      setStatusMessage("Duplicate child profile merged into the selected child.");
      setDuplicateChildId("");
      router.refresh();
    });
  }

  function mergeDuplicateFamily() {
    if (!selectedFamily || !selectedDuplicateId) return;
    const duplicate = families.find((family) => family.id === selectedDuplicateId);
    const confirmed = window.confirm(`Merge ${duplicate?.name ?? "this duplicate family"} into ${selectedFamily.name}? The kept family will receive children, guardians, documents, messages, and billing history.`);
    if (!confirmed) return;
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "familyMerge",
          primaryFamilyId: selectedFamily.id,
          duplicateFamilyId: selectedDuplicateId,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Family merge could not be completed.");
        return;
      }
      setStatusMessage("Duplicate family merged into the selected family.");
      setDuplicateFamilyId("");
      router.refresh();
    });
  }

  if (!families.length) {
    return (
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Family Record Editor</CardTitle>
          <CardDescription>No family records are visible for this school scope yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card id="family-editor" className="glass-panel scroll-mt-28">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>
              <UserPen data-icon="inline-start" />
              Family Record Editor
            </CardTitle>
            <CardDescription>Edit director-level family, guardian, and child profile details for the selected account.</CardDescription>
          </div>
          <Badge variant="outline">Office workflow</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {statusMessage ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Saved</AlertTitle>
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

        <EntityHeader
          sticky
          eyebrow="Currently editing family data"
          title={selectedFamily?.name ?? "Choose a family"}
          subtitle={`You are editing: ${editingTargetLabel}`}
          initials={initialsFromName(selectedFamily?.name)}
          status={<ContextBadge label="School" value={selectedCenterLabel} />}
          actions={
            selectedFamily ? (
              <>
                <Link href={familyBillingHref(selectedFamily, selectedChild)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <CreditCard data-icon="inline-start" />
                  Open billing
                </Link>
                <Link href={familyProfileHref(selectedFamily)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <ArrowUpRight data-icon="inline-start" />
                  View full profile
                </Link>
              </>
            ) : null
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryMetric label="Record type" value="Family account" detail={`Updated ${selectedFamilyUpdatedAt}`} />
            <SummaryMetric
              label="Selected child"
              value={selectedChildLabel}
              detail={selectedWeeklyTuition ? `${money(selectedWeeklyTuition.amountCents ?? 0)} weekly tuition` : selectedChild?.enrollmentStatus?.replaceAll("_", " ") ?? "Family-level edit"}
            />
            <SummaryMetric label="Selected parent" value={selectedGuardianLabel} detail={selectedGuardian?.isBillingContact ? "Billing contact" : selectedGuardian?.relation ?? "Guardian"} />
            <SummaryMetric label="Billing account" value={selectedBillingAccount ? money(selectedBillingAccount.balanceCents) : "Not linked"} detail={`Autopay ${selectedAutopayStatus}`} />
            <SummaryMetric label="Records" value={`${selectedFamily?.children.length ?? 0} children`} detail={`${documentRecordCount} docs, ${selectedFamily?.guardians.length ?? 0} contacts`} />
          </div>
        </EntityHeader>

        <div className="space-y-1">
          <Label>Family</Label>
          <Select value={selectedFamily?.id ?? ""} onValueChange={(value) => value && loadFamily(value)}>
            <SelectTrigger><SelectValue placeholder="Choose family" /></SelectTrigger>
            <SelectContent>
              {families.map((family) => (
                <SelectItem key={family.id} value={family.id}>{family.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <nav
          aria-label="Family profile sections"
          className="sticky top-20 z-20 -mx-1 flex gap-2 overflow-x-auto rounded-xl border bg-background/85 p-2 shadow-lg shadow-black/5 backdrop-blur-xl"
        >
          {profileSectionLinks.map(([label, target]) => (
            <a
              key={target}
              href={`#${target}`}
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {label}
            </a>
          ))}
        </nav>

        <section id="family-overview" className="scroll-mt-36 space-y-3">
          <div className="text-sm font-medium">Family account</div>
          {hasCustodyWarning({ custodyNotes }) ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>{CUSTODY_WARNING_LABEL}</AlertTitle>
              <AlertDescription>
                {CUSTODY_WARNING_DETAIL} Note preview: {custodyWarningPreview({ custodyNotes }, 140)}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>School / center</Label>
              <Select value={familyCenterId} onValueChange={(value) => value && setFamilyCenterId(value)}>
                <SelectTrigger><SelectValue placeholder="Choose center" /></SelectTrigger>
                <SelectContent>
                  {centers.map((center) => (
                    <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Family name</Label>
              <Input value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Billing email</Label>
              <Input value={billingEmail} onChange={(event) => setBillingEmail(event.target.value)} type="email" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Address</Label>
              <Input value={address} onChange={(event) => setAddress(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Restricted custody note (staff only)</Label>
              <Input value={custodyNotes} onChange={(event) => setCustodyNotes(event.target.value)} />
            </div>
            <div id="family-notes" className="scroll-mt-36 space-y-1 md:col-span-3">
              <Label>Internal family notes</Label>
              <Textarea value={familyNotes} onChange={(event) => setFamilyNotes(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>
                <Mail data-icon="inline-start" />
                Daily report email recipients
              </Label>
              <Badge variant="outline">
                {dailyReportEmailRecipients.length} email{dailyReportEmailRecipients.length === 1 ? "" : "s"} on file
              </Badge>
            </div>
            {dailyReportEmailRecipients.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {dailyReportEmailRecipients.map((recipient) => (
                  <div key={recipient.guardianId} className="flex min-h-12 items-center gap-3 rounded-lg border bg-background/40 px-3 py-2 text-sm">
                    <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{recipient.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{recipient.email}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border bg-card/50 p-3 text-sm text-muted-foreground">
                Add parent or guardian emails before daily report delivery.
              </p>
            )}
          </div>
          <div id="family-billing" className="scroll-mt-36 rounded-xl border bg-background/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Family payment method</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedBillingAccount
                    ? selectedPaymentMethod?.hasSavedPaymentMethod
                      ? `${selectedPaymentMethod.paymentMethodLabel ?? "Payment method saved securely"}${selectedPaymentMethod.lastUpdatedAt ? ` on ${formatDate(selectedPaymentMethod.lastUpdatedAt)}` : ""}.`
                      : selectedPaymentMethod?.autopayStatus === "pending"
                        ? "Bank verification is pending. Use Instant Bank Login to verify through the parent's bank now."
                        : "No bank account or card is saved for autopay."
                    : "No billing account is linked to this family yet."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={selectedAutopayStatus === "enabled" ? "default" : selectedAutopayStatus === "pending" ? "secondary" : "outline"}>
                  Autopay {selectedAutopayStatus}
                </Badge>
                {selectedBillingAccount ? <Badge variant="outline">Balance {money(selectedBillingAccount.balanceCents)}</Badge> : null}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SummaryMetric
                label="Family weekly tuition"
                value={activeWeeklyTuitionAssignments.length ? money(familyWeeklyTuitionCents) : "Not assigned"}
                detail={activeWeeklyTuitionAssignments.length
                  ? `${activeWeeklyTuitionAssignments.length} active child rate${activeWeeklyTuitionAssignments.length === 1 ? "" : "s"}`
                  : "Assign weekly tuition from Billing"}
              />
              <div className="rounded-lg border bg-card/50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Weekly tuition by child</div>
                <div className="mt-2 space-y-1 text-sm">
                  {activeWeeklyTuitionAssignments.map((child) => (
                    <div key={child.id} className="flex items-center justify-between gap-3">
                      <span className="truncate">{child.fullName}</span>
                      <span className="shrink-0 font-medium">{money(child.tuitionAssignment?.amountCents ?? 0)}/week</span>
                    </div>
                  ))}
                  {!activeWeeklyTuitionAssignments.length ? <span className="text-muted-foreground">No weekly tuition assigned.</span> : null}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={isPending || !selectedBillingAccount} onClick={() => manageFamilyPaymentMethod("setup", "link_bank")}>
                <Building2 data-icon="inline-start" />
                {selectedPaymentMethod?.hasSavedPaymentMethod ? "Verify Bank Instantly" : "Instant Bank Login"}
              </Button>
              <Button disabled={isPending || !selectedBillingAccount} onClick={() => manageFamilyPaymentMethod("setup", "card")} variant="outline">
                <CreditCard data-icon="inline-start" />
                {selectedPaymentMethod?.hasSavedPaymentMethod ? "Replace With Card" : "Add Card"}
              </Button>
              <Button
                disabled={isPending || !selectedPaymentMethod?.hasStripeCustomer}
                onClick={() => manageFamilyPaymentMethod("portal")}
                variant="outline"
              >
                Manage Saved Method
              </Button>
              <Button
                disabled={isPending || selectedAutopayStatus === "disabled" || !selectedBillingAccount}
                onClick={() => manageFamilyPaymentMethod("disable_autopay")}
                variant="outline"
              >
                Disable Autopay
              </Button>
            </div>
          </div>
          <Button
            disabled={isPending || !selectedFamily || !familyName.trim() || !familyCenterId}
            onClick={() => postRecord({
              entity: "family",
              id: selectedFamily?.id,
              centerId: familyCenterId,
              name: familyName,
              billingEmail,
              address,
              notes: familyNotes,
              custodyNotes,
            }, "Family account")}
          >
            <Save data-icon="inline-start" />
            Save family
          </Button>
        </section>

        <section className="rounded-xl border bg-background/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Family deduplication</div>
              <p className="text-xs text-muted-foreground">
                Review same-school matches before merging duplicate guardians, children, documents, messages, and billing history.
              </p>
            </div>
            <Badge variant={duplicateCandidates.length ? "secondary" : "outline"}>
              {duplicateCandidates.length} candidate{duplicateCandidates.length === 1 ? "" : "s"}
            </Badge>
          </div>
          {duplicateCandidates.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="space-y-1">
                <Label>Duplicate to merge into selected family</Label>
                <Select value={selectedDuplicateId} onValueChange={(value) => value && setDuplicateFamilyId(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {duplicateCandidates.map((candidate) => {
                      const family = families.find((item) => item.id === candidate.candidateId);
                      return (
                        <SelectItem key={candidate.candidateId} value={candidate.candidateId}>
                          {family?.name ?? "Duplicate family"} · {candidate.confidence} · {candidate.reasons.join(", ")}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" className="self-end" disabled={isPending || !selectedFamily || !selectedDuplicateId} onClick={mergeDuplicateFamily}>
                <GitMerge data-icon="inline-start" />
                Merge duplicate
              </Button>
            </div>
          ) : (
            <p className="mt-3 rounded-lg border bg-card/50 p-3 text-sm text-muted-foreground">
              No likely duplicates found for the selected family.
            </p>
          )}
        </section>

        <section id="family-guardians" className="scroll-mt-36 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">Parent / guardian contacts</div>
            <Badge variant="outline">
              {selectedFamily?.guardians.length ?? 0} contact{selectedFamily?.guardians.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Parent / guardian</Label>
              <div className="flex gap-2">
                <Select value={selectedGuardian?.id ?? ""} onValueChange={(value) => value && loadGuardianById(value)}>
                  <SelectTrigger><SelectValue placeholder="Choose parent" /></SelectTrigger>
                  <SelectContent>
                    {selectedFamily?.guardians.map((guardian) => (
                      <SelectItem key={guardian.id} value={guardian.id}>{guardian.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => loadGuardian(null)}>Add</Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={guardianName} onChange={(event) => setGuardianName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={guardianEmail} onChange={(event) => setGuardianEmail(event.target.value)} type="email" />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={guardianPhone} onChange={(event) => setGuardianPhone(event.target.value)} type="tel" />
            </div>
            <div className="space-y-1">
              <Label>Relation</Label>
              <Input value={guardianRelation} onChange={(event) => setGuardianRelation(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Preferred contact</Label>
              <Select value={preferredCommunication} onValueChange={(value) => value && setPreferredCommunication(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {communicationMethods.map((method) => (
                    <SelectItem key={method} value={method}>{method}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Employer</Label>
              <Input value={guardianEmployer} onChange={(event) => setGuardianEmployer(event.target.value)} />
            </div>
            <label className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm">
              <input type="checkbox" checked={isBillingContact} onChange={(event) => setIsBillingContact(event.target.checked)} />
              Billing contact
            </label>
            <label className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm">
              <input type="checkbox" checked={parentPortalLoginEnabled} onChange={(event) => setParentPortalLoginEnabled(event.target.checked)} />
              Parent portal login
            </label>
            {selectedGuardian?.userId && parentPortalLoginEnabled ? (
              <Badge variant="secondary" className="w-fit self-center">Portal linked</Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isPending || !selectedFamily || !guardianName.trim()}
              onClick={() => postRecord({
                entity: "guardian",
                id: selectedGuardian?.id,
                familyId: selectedFamily?.id,
                name: guardianName,
                email: guardianEmail,
                phone: guardianPhone,
                employer: guardianEmployer,
                relation: guardianRelation,
                preferredCommunication,
                isBillingContact,
                parentPortalLoginEnabled,
              }, "Parent/guardian contact")}
            >
              <Save data-icon="inline-start" />
              {selectedGuardian ? "Save parent" : "Add parent"}
            </Button>
            <Button type="button" variant="outline" disabled={isPending || !selectedGuardian} onClick={removeGuardian}>
              <Trash2 data-icon="inline-start" />
              Remove parent
            </Button>
          </div>
          <div className="rounded-xl border bg-background/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Guardian duplicate matching</div>
                <p className="text-xs text-muted-foreground">
                  Review same-school guardian matches before merging contact details, check-in history, and safe parent portal links.
                </p>
              </div>
              <Badge variant={guardianDuplicateCandidates.length ? "secondary" : "outline"}>
                {guardianDuplicateCandidates.length} candidate{guardianDuplicateCandidates.length === 1 ? "" : "s"}
              </Badge>
            </div>
            {selectedGuardian && guardianDuplicateCandidates.length ? (
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-1">
                  <Label>Duplicate guardian to merge into selected guardian</Label>
                  <Select value={selectedDuplicateGuardianId} onValueChange={(value) => value && setDuplicateGuardianId(value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {guardianDuplicateCandidates.map((candidate) => {
                        const guardian = guardianDuplicateRecords.find((item) => item.id === candidate.candidateId);
                        return (
                          <SelectItem key={candidate.candidateId} value={candidate.candidateId}>
                            {guardian?.fullName ?? "Duplicate guardian"} · {guardian?.familyName ?? "Family"} · {candidate.confidence} · {candidate.reasons.join(", ")}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" className="self-end" disabled={isPending || !selectedDuplicateGuardianId} onClick={mergeDuplicateGuardian}>
                  <GitMerge data-icon="inline-start" />
                  Merge guardian
                </Button>
              </div>
            ) : (
              <p className="mt-3 rounded-lg border bg-card/50 p-3 text-sm text-muted-foreground">
                No likely guardian duplicates found for the selected guardian.
              </p>
            )}
          </div>
        </section>

        <section id="family-contacts" className="scroll-mt-36 space-y-3">
          <div className="text-sm font-medium">Authorized pickups and emergency contacts</div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Authorized pickups</div>
                  <p className="text-xs text-muted-foreground">
                    Add every person allowed to pick up children in this family.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {selectedFamily?.pickups.length ?? 0} pickup{selectedFamily?.pickups.length === 1 ? "" : "s"}
                  </Badge>
                  <Button type="button" size="sm" variant="outline" onClick={() => loadPickup(null)}>Add</Button>
                </div>
              </div>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>Pickup record</Label>
                  <Select value={selectedPickup?.id ?? ""} onValueChange={(value) => value && loadPickupById(value)}>
                    <SelectTrigger><SelectValue placeholder="Choose pickup" /></SelectTrigger>
                    <SelectContent>
                      {selectedFamily?.pickups.map((pickup) => (
                        <SelectItem key={pickup.id} value={pickup.id}>{pickup.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={pickupName} onChange={(event) => setPickupName(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Phone</Label>
                    <Input value={pickupPhone} onChange={(event) => setPickupPhone(event.target.value)} type="tel" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Relation</Label>
                    <Input value={pickupRelation} onChange={(event) => setPickupRelation(event.target.value)} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Verification notes</Label>
                    <Textarea value={pickupVerificationNotes} onChange={(event) => setPickupVerificationNotes(event.target.value)} />
                  </div>
                </div>
                <Button
                  disabled={isPending || !selectedFamily || !pickupName.trim()}
                  onClick={() => postRecord({
                    entity: "authorizedPickup",
                    id: selectedPickup?.id,
                    familyId: selectedFamily?.id,
                    name: pickupName,
                    phone: pickupPhone,
                    relation: pickupRelation,
                    verificationNotes: pickupVerificationNotes,
                  }, "Authorized pickup")}
                >
                  <Save data-icon="inline-start" />
                  {selectedPickup ? "Save pickup" : "Add pickup"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending || !selectedPickup}
                  onClick={removePickup}
                >
                  <Trash2 data-icon="inline-start" />
                  Remove pickup
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-background/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Emergency contacts</div>
                  <p className="text-xs text-muted-foreground">
                    Add every backup contact the school may call in an emergency.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {selectedFamily?.emergencyContacts.length ?? 0} contact{selectedFamily?.emergencyContacts.length === 1 ? "" : "s"}
                  </Badge>
                  <Button type="button" size="sm" variant="outline" onClick={() => loadEmergencyContact(null)}>Add</Button>
                </div>
              </div>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>Contact record</Label>
                  <Select value={selectedEmergencyContact?.id ?? ""} onValueChange={(value) => value && loadEmergencyContactById(value)}>
                    <SelectTrigger><SelectValue placeholder="Choose contact" /></SelectTrigger>
                    <SelectContent>
                      {selectedFamily?.emergencyContacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>{contact.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={emergencyContactName} onChange={(event) => setEmergencyContactName(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Phone</Label>
                    <Input value={emergencyContactPhone} onChange={(event) => setEmergencyContactPhone(event.target.value)} type="tel" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Relation</Label>
                    <Input value={emergencyContactRelation} onChange={(event) => setEmergencyContactRelation(event.target.value)} />
                  </div>
                </div>
                <Button
                  disabled={isPending || !selectedFamily || !emergencyContactName.trim() || !emergencyContactPhone.trim()}
                  onClick={() => postRecord({
                    entity: "emergencyContact",
                    id: selectedEmergencyContact?.id,
                    familyId: selectedFamily?.id,
                    name: emergencyContactName,
                    phone: emergencyContactPhone,
                    relation: emergencyContactRelation,
                  }, "Emergency contact")}
                >
                  <Save data-icon="inline-start" />
                  {selectedEmergencyContact ? "Save contact" : "Add contact"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending || !selectedEmergencyContact}
                  onClick={removeEmergencyContact}
                >
                  <Trash2 data-icon="inline-start" />
                  Remove contact
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section id="family-children" className="scroll-mt-36 space-y-3">
          <div className="text-sm font-medium">Child profile</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryMetric
              label="Weekly tuition rate"
              value={selectedWeeklyTuition ? money(selectedWeeklyTuition.amountCents ?? 0) : "Not assigned"}
              detail={selectedWeeklyTuition?.tuitionPlanName ?? "Manage this child’s recurring rate in Billing"}
            />
            <SummaryMetric
              label="Weekly billing"
              value={selectedWeeklyTuition ? "Active" : "Not active"}
              detail={selectedWeeklyTuition?.startsPeriod ? `Starts ${selectedWeeklyTuition.startsPeriod}` : "No recurring start week"}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Child</Label>
              <div className="flex gap-2">
                <Select value={selectedChild?.id ?? ""} onValueChange={(value) => value && loadChildById(value)}>
                  <SelectTrigger><SelectValue placeholder="Choose child" /></SelectTrigger>
                  <SelectContent>
                    {selectedFamily?.children.map((child) => (
                      <SelectItem key={child.id} value={child.id}>{child.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => loadChild(null)}>Add</Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Full name</Label>
              <Input value={childName} onChange={(event) => setChildName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Preferred name</Label>
              <Input value={preferredName} onChange={(event) => setPreferredName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Date of birth</Label>
              <Input value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} type="date" />
            </div>
            <div className="space-y-1">
              <Label>Age group</Label>
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
              <Label>Status</Label>
              <Select value={enrollmentStatus} onValueChange={(value) => value && setEnrollmentStatus(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {enrollmentStatuses.map((status) => (
                    <SelectItem key={status} value={status}>{status.replaceAll("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Start date</Label>
              <Input value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Classroom</Label>
              <Select value={classroomId} onValueChange={(value) => value && setClassroomId(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {classroomOptions.map((classroom) => (
                    <SelectItem key={classroom.id} value={classroom.id}>{classroom.name} · {classroom.ageGroup}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm">
              <input type="checkbox" checked={photoVideoPermission} onChange={(event) => setPhotoVideoPermission(event.target.checked)} />
              Photo/video permission
            </label>
            <label className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm">
              <input type="checkbox" checked={fieldTripPermission} onChange={(event) => setFieldTripPermission(event.target.checked)} />
              Field trip permission
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Schedule notes</Label>
              <Textarea value={childScheduleNotes} onChange={(event) => setChildScheduleNotes(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Developmental notes</Label>
              <Textarea value={developmentalNotes} onChange={(event) => setDevelopmentalNotes(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Nap notes</Label>
              <Textarea value={napNotes} onChange={(event) => setNapNotes(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Feeding / dietary notes</Label>
              <Textarea value={feedingNotes} onChange={(event) => setFeedingNotes(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Potty notes</Label>
              <Textarea value={pottyNotes} onChange={(event) => setPottyNotes(event.target.value)} />
            </div>
          </div>
          <Button
            disabled={isPending || !selectedFamily || !childName.trim() || !dateOfBirth}
            onClick={() => postRecord({
              entity: "child",
              id: selectedChild?.id,
              familyId: selectedFamily?.id,
              name: childName,
              preferredName,
              dateOfBirth,
              ageGroup,
              enrollmentStatus,
              startDate,
              classroomId: classroomId === "none" ? undefined : classroomId,
              schedule: childScheduleNotes,
              photoVideoPermission,
              fieldTripPermission,
              napNotes,
              feedingNotes,
              pottyNotes,
              body: developmentalNotes,
            }, "Child profile")}
          >
            <Save data-icon="inline-start" />
            {selectedChild ? "Save child" : "Add child"}
          </Button>
          <div id="family-documents" className="scroll-mt-36 rounded-xl border bg-background/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Child duplicate matching</div>
                <p className="text-xs text-muted-foreground">
                  Review same-school child matches before merging enrollment, attendance, health, document, media, and incident history.
                </p>
              </div>
              <Badge variant={childDuplicateCandidates.length ? "secondary" : "outline"}>
                {childDuplicateCandidates.length} candidate{childDuplicateCandidates.length === 1 ? "" : "s"}
              </Badge>
            </div>
            {selectedChild && childDuplicateCandidates.length ? (
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-1">
                  <Label>Duplicate child to merge into selected child</Label>
                  <Select value={selectedDuplicateChildId} onValueChange={(value) => value && setDuplicateChildId(value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {childDuplicateCandidates.map((candidate) => {
                        const child = childDuplicateRecords.find((item) => item.id === candidate.candidateId);
                        return (
                          <SelectItem key={candidate.candidateId} value={candidate.candidateId}>
                            {child?.fullName ?? "Duplicate child"} · {child?.familyName ?? "Family"} · {candidate.confidence} · {candidate.reasons.join(", ")}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" className="self-end" disabled={isPending || !selectedDuplicateChildId} onClick={mergeDuplicateChild}>
                  <GitMerge data-icon="inline-start" />
                  Merge child
                </Button>
              </div>
            ) : (
              <p className="mt-3 rounded-lg border bg-card/50 p-3 text-sm text-muted-foreground">
                No likely child duplicates found for the selected child.
              </p>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Allergy action plans</div>
                  <p className="text-xs text-muted-foreground">Select an allergy to edit it, or add another plan for this child.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {selectedChild?.allergies.length ?? 0} allerg{selectedChild?.allergies.length === 1 ? "y" : "ies"}
                  </Badge>
                  <Button type="button" size="sm" variant="outline" disabled={!selectedChild} onClick={() => loadAllergy(null)}>Add</Button>
                </div>
              </div>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>Allergy record</Label>
                  <Select value={selectedAllergy?.id ?? ""} onValueChange={(value) => value && loadAllergyById(value)}>
                    <SelectTrigger><SelectValue placeholder="Choose allergy" /></SelectTrigger>
                    <SelectContent>
                      {selectedChild?.allergies.map((allergy) => (
                        <SelectItem key={allergy.id} value={allergy.id}>{allergy.allergen}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Allergen</Label>
                    <Input value={allergen} onChange={(event) => setAllergen(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Severity</Label>
                    <Input value={allergySeverity} onChange={(event) => setAllergySeverity(event.target.value)} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Action plan</Label>
                    <Textarea value={allergyActionPlan} onChange={(event) => setAllergyActionPlan(event.target.value)} />
                  </div>
                </div>
                <Button
                  disabled={isPending || !selectedChild || !allergen.trim()}
                  onClick={() => postRecord({
                    entity: "allergy",
                    id: selectedAllergy?.id,
                    childId: selectedChild?.id,
                    name: allergen,
                    severity: allergySeverity,
                    actionPlan: allergyActionPlan,
                  }, "Allergy record")}
                >
                  <Save data-icon="inline-start" />
                  {selectedAllergy ? "Save allergy" : "Add allergy"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending || !selectedAllergy}
                  onClick={removeAllergy}
                >
                  <Trash2 data-icon="inline-start" />
                  Remove allergy
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-background/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Medical notes</div>
                  <p className="text-xs text-muted-foreground">Select a note to edit it, or add another note for this child.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {selectedChild?.medicalNotes.length ?? 0} note{selectedChild?.medicalNotes.length === 1 ? "" : "s"}
                  </Badge>
                  <Button type="button" size="sm" variant="outline" disabled={!selectedChild} onClick={() => loadMedicalNote(null)}>Add</Button>
                </div>
              </div>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>Medical note record</Label>
                  <Select value={selectedMedicalNote?.id ?? ""} onValueChange={(value) => value && loadMedicalNoteById(value)}>
                    <SelectTrigger><SelectValue placeholder="Choose note" /></SelectTrigger>
                    <SelectContent>
                      {selectedChild?.medicalNotes.map((note) => (
                        <SelectItem key={note.id} value={note.id}>{note.category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Input value={medicalCategory} onChange={(event) => setMedicalCategory(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Note</Label>
                  <Textarea value={medicalNote} onChange={(event) => setMedicalNote(event.target.value)} />
                </div>
                <label className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm">
                  <input type="checkbox" checked={medicalRestricted} onChange={(event) => setMedicalRestricted(event.target.checked)} />
                  Restricted to staff with child safety access
                </label>
                <Button
                  disabled={isPending || !selectedChild || !medicalNote.trim()}
                  onClick={() => postRecord({
                    entity: "medicalNote",
                    id: selectedMedicalNote?.id,
                    childId: selectedChild?.id,
                    category: medicalCategory,
                    note: medicalNote,
                    restricted: medicalRestricted,
                  }, "Medical note")}
                >
                  <Save data-icon="inline-start" />
                  {selectedMedicalNote ? "Save medical note" : "Add medical note"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending || !selectedMedicalNote}
                  onClick={removeMedicalNote}
                >
                  <Trash2 data-icon="inline-start" />
                  Remove medical note
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-background/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Family and child document request</div>
                <p className="text-xs text-muted-foreground">
                  Create or edit family/child document rows. Parents upload requested files from the portal; directors review them from Documents.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {documentRecordCount} document{documentRecordCount === 1 ? "" : "s"}
                </Badge>
                <Button type="button" size="sm" variant="outline" disabled={!selectedFamily} onClick={() => loadDocument(null)}>Add</Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Document record</Label>
                <Select value={selectedDocument?.id ?? ""} onValueChange={(value) => value && loadDocumentById(value)}>
                  <SelectTrigger><SelectValue placeholder="Choose document" /></SelectTrigger>
                  <SelectContent>
                    {selectedFamily?.documents.map((document) => (
                      <SelectItem key={document.id} value={document.id}>{document.name} · family</SelectItem>
                    ))}
                    {selectedFamily?.children.flatMap((child) =>
                      child.documents.map((document) => (
                        <SelectItem key={document.id} value={document.id}>{document.name} · {child.fullName}</SelectItem>
                      )),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Owner</Label>
                <Select value={documentChildId} onValueChange={(value) => value && setDocumentChildId(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="family">Family account</SelectItem>
                    {selectedFamily?.children.map((child) => (
                      <SelectItem key={child.id} value={child.id}>{child.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Document name</Label>
                <Input value={documentName} onChange={(event) => setDocumentName(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Input value={documentType} onChange={(event) => setDocumentType(event.target.value)} placeholder="immunization, policy, custody" />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={documentStatus} onValueChange={(value) => value && setDocumentStatus(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {documentStatuses.map((status) => (
                      <SelectItem key={status} value={status}>{status.toLowerCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Expiration</Label>
                <Input type="date" value={documentExpiresAt} onChange={(event) => setDocumentExpiresAt(event.target.value)} />
              </div>
              <label className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm md:col-span-3">
                <input type="checkbox" checked={documentRestricted} onChange={(event) => setDocumentRestricted(event.target.checked)} />
                Restricted document visibility
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={isPending || !selectedFamily || !documentName.trim()}
                onClick={() => postRecord({
                  entity: "document",
                  id: selectedDocument?.id,
                  familyId: selectedFamily?.id,
                  childId: documentChildId === "family" ? undefined : documentChildId,
                  name: documentName,
                  type: documentType,
                  status: documentStatus,
                  expiresAt: documentExpiresAt,
                  restricted: documentRestricted,
                }, "Document request")}
              >
                <Save data-icon="inline-start" />
                {selectedDocument ? "Save document" : "Add document"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isPending || !selectedDocument}
                onClick={emailDocumentRequest}
              >
                <Mail data-icon="inline-start" />
                Email parent request
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isPending || !selectedDocument}
                onClick={removeDocument}
              >
                <Trash2 data-icon="inline-start" />
                Remove document
              </Button>
            </div>
          </div>
        </section>

        <section id="family-activity" className="scroll-mt-36 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Notes and activity</div>
              <p className="text-xs text-muted-foreground">
                Persistent family notes and recent record timestamps for the selected profile.
              </p>
            </div>
            <Badge variant="outline">
              {(selectedFamily?.notesList?.length ?? 0) + activityItems.length} item{(selectedFamily?.notesList?.length ?? 0) + activityItems.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="mb-3 text-sm font-medium">Recent persistent notes</div>
              {selectedFamily?.notesList?.length ? (
                <div className="space-y-3">
                  {selectedFamily.notesList.slice(0, 5).map((note) => (
                    <div key={note.id} className="rounded-lg border bg-card/45 p-3 text-sm">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{note.user?.name ?? note.user?.email ?? "Staff note"}</span>
                        <Badge variant={note.restricted ? "secondary" : "outline"}>{note.restricted ? "Restricted" : "General"}</Badge>
                      </div>
                      <p className="leading-6 text-muted-foreground">{note.body}</p>
                      <div className="mt-2 text-xs text-muted-foreground">{formatActivityDate(note.createdAt, timeZone)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border bg-card/50 p-3 text-sm text-muted-foreground">
                  No persistent family notes have been created yet. Saved internal notes still appear in the family overview.
                </p>
              )}
            </div>
            <div className="rounded-xl border bg-background/40 p-4">
              <div className="mb-3 text-sm font-medium">Recent activity</div>
              {activityItems.length ? (
                <div className="space-y-3">
                  {activityItems.map((item) => (
                    <div key={item.id} className="grid gap-1 rounded-lg border bg-card/45 p-3 text-sm">
                      <div className="font-medium">{item.title}</div>
                      <div className="text-muted-foreground">{item.detail}</div>
                      <div className="text-xs text-muted-foreground">{formatActivityDate(item.date, timeZone)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border bg-card/50 p-3 text-sm text-muted-foreground">
                  Activity appears after profile, document, billing, or note records have timestamps.
                </p>
              )}
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
