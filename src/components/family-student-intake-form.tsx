"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, UserPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type CenterOption = {
  id: string;
  name: string;
  classrooms: Array<{ id: string; name: string; ageGroup: string }>;
};

type Props = {
  centers: CenterOption[];
  compact?: boolean;
};

const ageGroups = ["Infant", "Toddler", "Twos", "Preschool", "Pre-K", "School Age"];
const enrollmentStatuses = ["enrolled", "pending", "waitlisted", "tour_scheduled", "inactive"];
const communicationMethods = ["email", "phone", "sms"];

type IntakeResponse = {
  error?: string;
  errors?: Record<string, string>;
  family?: { id: string; name: string };
  guardian?: { id: string; fullName: string };
  child?: { id: string; fullName: string };
  mode?: string;
};

export function FamilyStudentIntakeForm({ centers, compact = false }: Props) {
  const router = useRouter();
  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
  const [familyName, setFamilyName] = useState("");
  const [address, setAddress] = useState("");
  const [familyNotes, setFamilyNotes] = useState("");
  const [custodyNotes, setCustodyNotes] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianRelation, setGuardianRelation] = useState("Parent/Guardian");
  const [guardianEmployer, setGuardianEmployer] = useState("");
  const [preferredCommunication, setPreferredCommunication] = useState("email");
  const [checkInPin, setCheckInPin] = useState("");
  const [childName, setChildName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [ageGroup, setAgeGroup] = useState("Preschool");
  const [enrollmentStatus, setEnrollmentStatus] = useState("enrolled");
  const [startDate, setStartDate] = useState("");
  const [classroomId, setClassroomId] = useState("none");
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [napNotes, setNapNotes] = useState("");
  const [feedingNotes, setFeedingNotes] = useState("");
  const [pottyNotes, setPottyNotes] = useState("");
  const [developmentalNotes, setDevelopmentalNotes] = useState("");
  const [startingBalanceDollars, setStartingBalanceDollars] = useState("");
  const [photoVideoPermission, setPhotoVideoPermission] = useState(false);
  const [fieldTripPermission, setFieldTripPermission] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const selectedCenter = useMemo(() => centers.find((center) => center.id === centerId), [centers, centerId]);
  const classroomOptions = selectedCenter?.classrooms ?? [];

  function resetStudentFields() {
    setChildName("");
    setPreferredName("");
    setDateOfBirth("");
    setAgeGroup("Preschool");
    setEnrollmentStatus("enrolled");
    setStartDate("");
    setClassroomId("none");
    setScheduleNotes("");
    setNapNotes("");
    setFeedingNotes("");
    setPottyNotes("");
    setDevelopmentalNotes("");
    setPhotoVideoPermission(false);
    setFieldTripPermission(false);
  }

  function submit() {
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      setFieldErrors({});
      const response = await fetch("/api/families/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId,
          familyName,
          address,
          familyNotes,
          custodyNotes,
          guardianName,
          guardianEmail,
          guardianPhone,
          guardianRelation,
          guardianEmployer,
          preferredCommunication,
          checkInPin,
          childName,
          preferredName,
          dateOfBirth,
          ageGroup,
          enrollmentStatus,
          startDate,
          classroomId: classroomId === "none" ? "" : classroomId,
          scheduleNotes,
          napNotes,
          feedingNotes,
          pottyNotes,
          developmentalNotes,
          startingBalanceDollars,
          photoVideoPermission,
          fieldTripPermission,
        }),
      });
      const json = await response.json().catch(() => null) as IntakeResponse | null;
      if (!response.ok) {
        setFieldErrors(json?.errors ?? {});
        setErrorMessage(json?.error || "Family and student could not be saved.");
        return;
      }
      setStatusMessage(`${json?.family?.name ?? "Family"} saved with ${json?.guardian?.fullName ?? "guardian"} and ${json?.child?.fullName ?? "student"}.`);
      setStartingBalanceDollars("");
      setCheckInPin("");
      resetStudentFields();
      router.refresh();
    });
  }

  function errorFor(name: string) {
    return fieldErrors[name] ? <p className="text-xs text-destructive">{fieldErrors[name]}</p> : null;
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Add Family + Student</CardTitle>
            <CardDescription>
              Creates the family profile, primary parent/guardian, child profile, billing account, and optional kiosk PIN in one save.
            </CardDescription>
          </div>
          <Badge variant="outline">Director workflow</Badge>
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

        <section className="space-y-3">
          <div className="text-sm font-medium">Family account</div>
          <div className={`grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
            <div className="space-y-1">
              <Label>School / center</Label>
              <Select value={centerId} onValueChange={(value) => value && setCenterId(value)}>
                <SelectTrigger><SelectValue placeholder="Choose center" /></SelectTrigger>
                <SelectContent>
                  {centers.map((center) => (
                    <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errorFor("centerId")}
            </div>
            <div className="space-y-1">
              <Label>Family name</Label>
              <Input value={familyName} onChange={(event) => setFamilyName(event.target.value)} placeholder="Johnson Family" />
              {errorFor("familyName")}
            </div>
            <div className="space-y-1">
              <Label>Opening balance</Label>
              <Input value={startingBalanceDollars} onChange={(event) => setStartingBalanceDollars(event.target.value)} placeholder="Optional, e.g. 250" inputMode="decimal" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Address</Label>
              <Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street, city, state, ZIP" />
            </div>
            <div className="space-y-1">
              <Label>Restricted custody note</Label>
              <Input value={custodyNotes} onChange={(event) => setCustodyNotes(event.target.value)} placeholder="Optional restricted note" />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="text-sm font-medium">Primary parent / guardian</div>
          <div className={`grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
            <div className="space-y-1">
              <Label>Guardian name</Label>
              <Input value={guardianName} onChange={(event) => setGuardianName(event.target.value)} placeholder="Avery Johnson" />
              {errorFor("guardianName")}
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={guardianEmail} onChange={(event) => setGuardianEmail(event.target.value)} type="email" placeholder="parent@example.com" />
              {errorFor("guardianEmail")}
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={guardianPhone} onChange={(event) => setGuardianPhone(event.target.value)} type="tel" placeholder="(555) 555-1212" />
            </div>
            <div className="space-y-1">
              <Label>Relation</Label>
              <Input value={guardianRelation} onChange={(event) => setGuardianRelation(event.target.value)} placeholder="Mother, father, guardian..." />
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
            <div className="space-y-1">
              <Label>4 digit kiosk PIN</Label>
              <Input value={checkInPin} onChange={(event) => setCheckInPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Optional" inputMode="numeric" />
              {errorFor("checkInPin")}
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Employer</Label>
              <Input value={guardianEmployer} onChange={(event) => setGuardianEmployer(event.target.value)} placeholder="Optional" />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="text-sm font-medium">Student / child profile</div>
          <div className={`grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
            <div className="space-y-1">
              <Label>Child full name</Label>
              <Input value={childName} onChange={(event) => setChildName(event.target.value)} placeholder="Liam Johnson" />
              {errorFor("childName")}
            </div>
            <div className="space-y-1">
              <Label>Preferred name</Label>
              <Input value={preferredName} onChange={(event) => setPreferredName(event.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label>Date of birth</Label>
              <Input value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} type="date" />
              {errorFor("dateOfBirth")}
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
              <Label>Enrollment status</Label>
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
              Photo/video permission verified
            </label>
            <label className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm">
              <input type="checkbox" checked={fieldTripPermission} onChange={(event) => setFieldTripPermission(event.target.checked)} />
              Field trip permission verified
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Schedule notes</Label>
              <Textarea value={scheduleNotes} onChange={(event) => setScheduleNotes(event.target.value)} placeholder="Days/times or special schedule notes" />
            </div>
            <div className="space-y-1">
              <Label>Family notes</Label>
              <Textarea value={familyNotes} onChange={(event) => setFamilyNotes(event.target.value)} placeholder="Internal family notes" />
            </div>
            <div className="space-y-1">
              <Label>Nap notes</Label>
              <Textarea value={napNotes} onChange={(event) => setNapNotes(event.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label>Feeding / dietary notes</Label>
              <Textarea value={feedingNotes} onChange={(event) => setFeedingNotes(event.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label>Potty notes</Label>
              <Textarea value={pottyNotes} onChange={(event) => setPottyNotes(event.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label>Developmental notes</Label>
              <Textarea value={developmentalNotes} onChange={(event) => setDevelopmentalNotes(event.target.value)} placeholder="Optional" />
            </div>
          </div>
        </section>

        <Button disabled={isPending || !centers.length} onClick={submit}>
          <UserPlus data-icon="inline-start" />
          Save Family + Student
        </Button>
      </CardContent>
    </Card>
  );
}
