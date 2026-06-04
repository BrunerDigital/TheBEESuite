"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Save, UserPen } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
};

export type EditableFamilyRecord = {
  id: string;
  centerId: string | null;
  name: string;
  billingEmail: string | null;
  address?: string | null;
  notes?: string | null;
  custodyNotes: string | null;
  guardians: GuardianRecord[];
  children: ChildRecord[];
};

type Props = {
  families: EditableFamilyRecord[];
  centers: CenterOption[];
};

const ageGroups = ["Infant", "Toddler", "Twos", "Preschool", "Pre-K", "School Age"];
const enrollmentStatuses = ["enrolled", "pending", "waitlisted", "tour_scheduled", "inactive"];
const communicationMethods = ["email", "phone", "sms"];

function toDateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function scheduleNotes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const notes = (value as { notes?: unknown }).notes;
  return typeof notes === "string" ? notes : "";
}

export function FamilyRecordEditor({ families, centers }: Props) {
  const router = useRouter();
  const [selectedFamilyId, setSelectedFamilyId] = useState(families[0]?.id ?? "");
  const selectedFamily = useMemo(
    () => families.find((family) => family.id === selectedFamilyId) ?? families[0] ?? null,
    [families, selectedFamilyId],
  );

  const [familyCenterId, setFamilyCenterId] = useState(selectedFamily?.centerId ?? centers[0]?.id ?? "");
  const [familyName, setFamilyName] = useState(selectedFamily?.name ?? "");
  const [billingEmail, setBillingEmail] = useState(selectedFamily?.billingEmail ?? "");
  const [address, setAddress] = useState(selectedFamily?.address ?? "");
  const [familyNotes, setFamilyNotes] = useState(selectedFamily?.notes ?? "");
  const [custodyNotes, setCustodyNotes] = useState(selectedFamily?.custodyNotes ?? "");

  const [selectedGuardianId, setSelectedGuardianId] = useState(selectedFamily?.guardians[0]?.id ?? "");
  const selectedGuardian = selectedFamily?.guardians.find((guardian) => guardian.id === selectedGuardianId) ?? selectedFamily?.guardians[0] ?? null;
  const [guardianName, setGuardianName] = useState(selectedGuardian?.fullName ?? "");
  const [guardianEmail, setGuardianEmail] = useState(selectedGuardian?.email ?? "");
  const [guardianPhone, setGuardianPhone] = useState(selectedGuardian?.phone ?? "");
  const [guardianEmployer, setGuardianEmployer] = useState(selectedGuardian?.employer ?? "");
  const [guardianRelation, setGuardianRelation] = useState(selectedGuardian?.relation ?? "Parent/Guardian");
  const [preferredCommunication, setPreferredCommunication] = useState(selectedGuardian?.preferredCommunication ?? "email");
  const [isBillingContact, setIsBillingContact] = useState(Boolean(selectedGuardian?.isBillingContact));

  const [selectedChildId, setSelectedChildId] = useState(selectedFamily?.children[0]?.id ?? "");
  const selectedChild = selectedFamily?.children.find((child) => child.id === selectedChildId) ?? selectedFamily?.children[0] ?? null;
  const [childName, setChildName] = useState(selectedChild?.fullName ?? "");
  const [preferredName, setPreferredName] = useState(selectedChild?.preferredName ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(toDateInput(selectedChild?.dateOfBirth));
  const [ageGroup, setAgeGroup] = useState(selectedChild?.ageGroup ?? "Preschool");
  const [enrollmentStatus, setEnrollmentStatus] = useState(selectedChild?.enrollmentStatus ?? "enrolled");
  const [startDate, setStartDate] = useState(toDateInput(selectedChild?.startDate));
  const [classroomId, setClassroomId] = useState(selectedChild?.classroomId ?? "none");
  const [childScheduleNotes, setChildScheduleNotes] = useState(scheduleNotes(selectedChild?.schedule));
  const [napNotes, setNapNotes] = useState(selectedChild?.napNotes ?? "");
  const [feedingNotes, setFeedingNotes] = useState(selectedChild?.feedingNotes ?? "");
  const [pottyNotes, setPottyNotes] = useState(selectedChild?.pottyNotes ?? "");
  const [developmentalNotes, setDevelopmentalNotes] = useState(selectedChild?.developmentalNotes ?? "");
  const [photoVideoPermission, setPhotoVideoPermission] = useState(Boolean(selectedChild?.photoVideoPermission));
  const [fieldTripPermission, setFieldTripPermission] = useState(Boolean(selectedChild?.fieldTripPermission));

  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedCenter = centers.find((center) => center.id === familyCenterId);
  const classroomOptions = selectedCenter?.classrooms ?? [];

  function loadGuardian(guardian: GuardianRecord | null) {
    setSelectedGuardianId(guardian?.id ?? "");
    setGuardianName(guardian?.fullName ?? "");
    setGuardianEmail(guardian?.email ?? "");
    setGuardianPhone(guardian?.phone ?? "");
    setGuardianEmployer(guardian?.employer ?? "");
    setGuardianRelation(guardian?.relation ?? "Parent/Guardian");
    setPreferredCommunication(guardian?.preferredCommunication ?? "email");
    setIsBillingContact(Boolean(guardian?.isBillingContact));
  }

  function loadChild(child: ChildRecord | null) {
    setSelectedChildId(child?.id ?? "");
    setChildName(child?.fullName ?? "");
    setPreferredName(child?.preferredName ?? "");
    setDateOfBirth(toDateInput(child?.dateOfBirth));
    setAgeGroup(child?.ageGroup ?? "Preschool");
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
    loadChild(family?.children[0] ?? null);
  }

  function loadGuardianById(guardianId: string) {
    loadGuardian(selectedFamily?.guardians.find((guardian) => guardian.id === guardianId) ?? null);
  }

  function loadChildById(childId: string) {
    loadChild(selectedFamily?.children.find((child) => child.id === childId) ?? null);
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
      const json = await response.json().catch(() => null) as { error?: string; mode?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || `${successLabel} could not be saved.`);
        return;
      }
      setStatusMessage(`${successLabel} ${json?.mode ?? "saved"}.`);
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
    <Card className="glass-panel">
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

        <section className="space-y-3">
          <div className="text-sm font-medium">Family account</div>
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
              <Label>Restricted custody note</Label>
              <Input value={custodyNotes} onChange={(event) => setCustodyNotes(event.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-3">
              <Label>Internal family notes</Label>
              <Textarea value={familyNotes} onChange={(event) => setFamilyNotes(event.target.value)} />
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

        <section className="space-y-3">
          <div className="text-sm font-medium">Guardian contact</div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Guardian</Label>
              <Select value={selectedGuardian?.id ?? ""} onValueChange={(value) => value && loadGuardianById(value)}>
                <SelectTrigger><SelectValue placeholder="Choose guardian" /></SelectTrigger>
                <SelectContent>
                  {selectedFamily?.guardians.map((guardian) => (
                    <SelectItem key={guardian.id} value={guardian.id}>{guardian.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          </div>
          <Button
            disabled={isPending || !selectedFamily || !selectedGuardian || !guardianName.trim()}
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
            }, "Guardian contact")}
          >
            <Save data-icon="inline-start" />
            Save guardian
          </Button>
        </section>

        <section className="space-y-3">
          <div className="text-sm font-medium">Child profile</div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Child</Label>
              <Select value={selectedChild?.id ?? ""} onValueChange={(value) => value && loadChildById(value)}>
                <SelectTrigger><SelectValue placeholder="Choose child" /></SelectTrigger>
                <SelectContent>
                  {selectedFamily?.children.map((child) => (
                    <SelectItem key={child.id} value={child.id}>{child.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  {ageGroups.map((group) => (
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
            disabled={isPending || !selectedFamily || !selectedChild || !childName.trim() || !dateOfBirth}
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
            Save child
          </Button>
        </section>
      </CardContent>
    </Card>
  );
}
