"use client";

import { useId, useMemo, useState, useTransition } from "react";
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
import { enrollmentClassroomValidationError } from "@/lib/enrollment-status";

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

function suggestedFamilyName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const surname = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return `${surname} Family`;
}

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
  const controlIdPrefix = useId();
  const controlId = (name: string) => `${controlIdPrefix}-${name}`;
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
  const familyNameHint = familyName.trim() ? "" : suggestedFamilyName(guardianName);
  const enrollmentClassroomError = enrollmentClassroomValidationError({
    enrollmentStatus,
    classroomId: classroomId === "none" ? null : classroomId,
  });

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
      setStatusMessage(`${json?.family?.name ?? "Family"} saved with one parent/guardian record for ${json?.guardian?.fullName ?? "the parent"} and ${json?.child?.fullName ?? "the child"}.`);
      setStartingBalanceDollars("");
      setCheckInPin("");
      resetStudentFields();
      router.refresh();
    });
  }

  function errorFor(name: string) {
    return fieldErrors[name] ? <p id={controlId(`${name}-error`)} className="text-xs text-destructive">{fieldErrors[name]}</p> : null;
  }

  function accessibilityFor(name: string, descriptions: string[] = []) {
    const describedBy = [
      ...descriptions,
      fieldErrors[name] ? controlId(`${name}-error`) : "",
    ].filter(Boolean).join(" ");
    return {
      "aria-describedby": describedBy || undefined,
      "aria-invalid": Boolean(fieldErrors[name]) || undefined,
    };
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
        <CardTitle as="h2">Add Family, Parent + Child</CardTitle>
            <CardDescription>
              Enter the primary parent once here. This creates the family profile, parent/guardian record, child profile, billing account, and kiosk PIN in one save.
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
              <Label htmlFor={controlId("school-center")}>School / center</Label>
              <Select value={centerId} onValueChange={(value) => value && setCenterId(value)}>
                <SelectTrigger id={controlId("school-center")} {...accessibilityFor("centerId")}><SelectValue placeholder="Choose center" /></SelectTrigger>
                <SelectContent>
                  {centers.map((center) => (
                    <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errorFor("centerId")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("family-name")}>Household / family label</Label>
              <Input id={controlId("family-name")} value={familyName} onChange={(event) => setFamilyName(event.target.value)} placeholder={familyNameHint || "Optional"} {...accessibilityFor("familyName", [controlId("family-name-help")])} />
              <p id={controlId("family-name-help")} className="text-xs text-muted-foreground">
                Optional. Leave blank and the system will use {familyNameHint || "the parent/guardian last name"}.
              </p>
              {errorFor("familyName")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("starting-balance")}>Prior balance owed at cutover</Label>
              <Input id={controlId("starting-balance")} value={startingBalanceDollars} onChange={(event) => setStartingBalanceDollars(event.target.value)} placeholder="Leave blank or 0" inputMode="decimal" min="0" type="number" step="0.01" {...accessibilityFor("startingBalanceDollars", [controlId("starting-balance-help")])} />
              <p id={controlId("starting-balance-help")} className="text-xs text-muted-foreground">
                Use once for a new family only when they already owe a verified balance from before BEE Suite. Leave zero for weekly tuition, new charges, imported invoices, or an existing family.
              </p>
              {errorFor("startingBalanceDollars")}
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={controlId("family-address")}>Address</Label>
              <Input id={controlId("family-address")} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street, city, state, ZIP" {...accessibilityFor("address")} />
              {errorFor("address")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("custody-notes")}>Restricted custody note</Label>
              <Input id={controlId("custody-notes")} value={custodyNotes} onChange={(event) => setCustodyNotes(event.target.value)} placeholder="Optional restricted note" {...accessibilityFor("custodyNotes")} />
              {errorFor("custodyNotes")}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="text-sm font-medium">Primary parent / guardian</div>
          <div className={`grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
            <div className="space-y-1">
              <Label htmlFor={controlId("guardian-name")}>Parent/guardian name</Label>
              <Input id={controlId("guardian-name")} value={guardianName} onChange={(event) => setGuardianName(event.target.value)} placeholder="Avery Johnson" {...accessibilityFor("guardianName")} />
              {errorFor("guardianName")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("guardian-email")}>Email</Label>
              <Input id={controlId("guardian-email")} value={guardianEmail} onChange={(event) => setGuardianEmail(event.target.value)} type="email" placeholder="parent@example.com" {...accessibilityFor("guardianEmail")} />
              {errorFor("guardianEmail")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("guardian-phone")}>Phone</Label>
              <Input id={controlId("guardian-phone")} value={guardianPhone} onChange={(event) => setGuardianPhone(event.target.value)} type="tel" placeholder="(555) 555-1212" {...accessibilityFor("guardianPhone")} />
              {errorFor("guardianPhone")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("guardian-relation")}>Relation</Label>
              <Input id={controlId("guardian-relation")} value={guardianRelation} onChange={(event) => setGuardianRelation(event.target.value)} placeholder="Mother, father, guardian..." {...accessibilityFor("guardianRelation")} />
              {errorFor("guardianRelation")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("preferred-contact")}>Preferred contact</Label>
              <Select value={preferredCommunication} onValueChange={(value) => value && setPreferredCommunication(value)}>
                <SelectTrigger id={controlId("preferred-contact")} {...accessibilityFor("preferredCommunication")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {communicationMethods.map((method) => (
                    <SelectItem key={method} value={method}>{method}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errorFor("preferredCommunication")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("check-in-pin")}>4 digit kiosk PIN</Label>
              <Input id={controlId("check-in-pin")} value={checkInPin} onChange={(event) => setCheckInPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Defaults to last 4 of phone" inputMode="numeric" {...accessibilityFor("checkInPin")} />
              {errorFor("checkInPin")}
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={controlId("guardian-employer")}>Employer</Label>
              <Input id={controlId("guardian-employer")} value={guardianEmployer} onChange={(event) => setGuardianEmployer(event.target.value)} placeholder="Optional" {...accessibilityFor("guardianEmployer")} />
              {errorFor("guardianEmployer")}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="text-sm font-medium">Student / child profile</div>
          <div className={`grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
            <div className="space-y-1">
              <Label htmlFor={controlId("child-name")}>Child full name</Label>
              <Input id={controlId("child-name")} value={childName} onChange={(event) => setChildName(event.target.value)} placeholder="Liam Johnson" {...accessibilityFor("childName")} />
              {errorFor("childName")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("child-preferred-name")}>Preferred name</Label>
              <Input id={controlId("child-preferred-name")} value={preferredName} onChange={(event) => setPreferredName(event.target.value)} placeholder="Optional" {...accessibilityFor("preferredName")} />
              {errorFor("preferredName")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("child-date-of-birth")}>Date of birth</Label>
              <Input id={controlId("child-date-of-birth")} value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} type="date" {...accessibilityFor("dateOfBirth")} />
              {errorFor("dateOfBirth")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("child-age-group")}>Age group</Label>
              <Select value={ageGroup} onValueChange={(value) => value && setAgeGroup(value)}>
                <SelectTrigger id={controlId("child-age-group")} {...accessibilityFor("ageGroup")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ageGroups.map((group) => (
                    <SelectItem key={group} value={group}>{group}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errorFor("ageGroup")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("enrollment-status")}>Enrollment status</Label>
              <Select value={enrollmentStatus} onValueChange={(value) => value && setEnrollmentStatus(value)}>
                <SelectTrigger id={controlId("enrollment-status")} {...accessibilityFor("enrollmentStatus")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {enrollmentStatuses.map((status) => (
                    <SelectItem key={status} value={status}>{status.replaceAll("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errorFor("enrollmentStatus")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("enrollment-start-date")}>Start date</Label>
              <Input id={controlId("enrollment-start-date")} value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" {...accessibilityFor("startDate")} />
              {errorFor("startDate")}
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={controlId("classroom")}>Classroom</Label>
              <Select value={classroomId} onValueChange={(value) => value && setClassroomId(value)}>
                <SelectTrigger
                  id={controlId("classroom")}
                  aria-describedby={[
                    enrollmentClassroomError ? controlId("classroom-enrollment-error") : "",
                    fieldErrors.classroomId ? controlId("classroomId-error") : "",
                  ].filter(Boolean).join(" ") || undefined}
                  aria-invalid={Boolean(enrollmentClassroomError || fieldErrors.classroomId) || undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {classroomOptions.map((classroom) => (
                    <SelectItem key={classroom.id} value={classroom.id}>{classroom.name} · {classroom.ageGroup}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {enrollmentClassroomError ? <p id={controlId("classroom-enrollment-error")} className="text-xs text-destructive">{enrollmentClassroomError}</p> : null}
              {errorFor("classroomId")}
            </div>
            <label htmlFor={controlId("photo-video-permission")} className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm">
              <input id={controlId("photo-video-permission")} type="checkbox" checked={photoVideoPermission} onChange={(event) => setPhotoVideoPermission(event.target.checked)} />
              Photo/video permission verified
            </label>
            <label htmlFor={controlId("field-trip-permission")} className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm">
              <input id={controlId("field-trip-permission")} type="checkbox" checked={fieldTripPermission} onChange={(event) => setFieldTripPermission(event.target.checked)} />
              Field trip permission verified
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={controlId("schedule-notes")}>Schedule notes</Label>
              <Textarea id={controlId("schedule-notes")} value={scheduleNotes} onChange={(event) => setScheduleNotes(event.target.value)} placeholder="Days/times or special schedule notes" {...accessibilityFor("scheduleNotes")} />
              {errorFor("scheduleNotes")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("family-notes")}>Family notes</Label>
              <Textarea id={controlId("family-notes")} value={familyNotes} onChange={(event) => setFamilyNotes(event.target.value)} placeholder="Internal family notes" {...accessibilityFor("familyNotes")} />
              {errorFor("familyNotes")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("nap-notes")}>Nap notes</Label>
              <Textarea id={controlId("nap-notes")} value={napNotes} onChange={(event) => setNapNotes(event.target.value)} placeholder="Optional" {...accessibilityFor("napNotes")} />
              {errorFor("napNotes")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("feeding-notes")}>Feeding / dietary notes</Label>
              <Textarea id={controlId("feeding-notes")} value={feedingNotes} onChange={(event) => setFeedingNotes(event.target.value)} placeholder="Optional" {...accessibilityFor("feedingNotes")} />
              {errorFor("feedingNotes")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("potty-notes")}>Potty notes</Label>
              <Textarea id={controlId("potty-notes")} value={pottyNotes} onChange={(event) => setPottyNotes(event.target.value)} placeholder="Optional" {...accessibilityFor("pottyNotes")} />
              {errorFor("pottyNotes")}
            </div>
            <div className="space-y-1">
              <Label htmlFor={controlId("developmental-notes")}>Developmental notes</Label>
              <Textarea id={controlId("developmental-notes")} value={developmentalNotes} onChange={(event) => setDevelopmentalNotes(event.target.value)} placeholder="Optional" {...accessibilityFor("developmentalNotes")} />
              {errorFor("developmentalNotes")}
            </div>
          </div>
        </section>

        <Button disabled={isPending || !centers.length || Boolean(enrollmentClassroomError)} onClick={submit}>
          <UserPlus data-icon="inline-start" />
          Save Family, Parent + Child
        </Button>
      </CardContent>
    </Card>
  );
}
