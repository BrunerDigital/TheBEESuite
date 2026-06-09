"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, CreditCard, FileCheck2, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CenterOption = {
  id: string;
  name: string;
  crmLocationId: string | null;
  city: string | null;
  state: string | null;
};

type RegistrationFormProps = {
  centers: CenterOption[];
};

type SubmitResult = {
  ok?: boolean;
  leadId?: string;
  submissionId?: string;
  error?: string;
  errors?: Record<string, string>;
};

const programs = [
  "Infants",
  "Toddlers",
  "Preschool",
  "Pre-K",
  "VPK",
  "Before & After School",
  "Summer Camp",
];

const schedules = [
  "Full time",
  "Part time",
  "Before school",
  "After school",
  "Drop-in / flexible",
];

const scheduleDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function centerLabel(center: CenterOption) {
  const location = [center.city, center.state].filter(Boolean).join(", ");
  return [center.crmLocationId ?? center.name, location].filter(Boolean).join(" · ");
}

function collectForm(form: HTMLFormElement) {
  const data = new FormData(form);
  const value = (key: string) => String(data.get(key) ?? "").trim();
  const bool = (key: string) => data.get(key) === "on";

  return {
    centerId: value("centerId"),
    primaryGuardianName: value("primaryGuardianName"),
    primaryGuardianEmail: value("primaryGuardianEmail"),
    primaryGuardianPhone: value("primaryGuardianPhone"),
    primaryGuardianAddress: value("primaryGuardianAddress"),
    primaryGuardianRelation: value("primaryGuardianRelation"),
    primaryGuardianEmployer: value("primaryGuardianEmployer"),
    primaryGuardianWorkPhone: value("primaryGuardianWorkPhone"),
    secondaryGuardianName: value("secondaryGuardianName"),
    secondaryGuardianEmail: value("secondaryGuardianEmail"),
    secondaryGuardianPhone: value("secondaryGuardianPhone"),
    secondaryGuardianRelation: value("secondaryGuardianRelation"),
    secondaryGuardianEmployer: value("secondaryGuardianEmployer"),
    secondaryGuardianAddress: value("secondaryGuardianAddress"),
    billingContactName: value("billingContactName"),
    billingContactEmail: value("billingContactEmail"),
    billingContactPhone: value("billingContactPhone"),
    childFullName: value("childFullName"),
    childPreferredName: value("childPreferredName"),
    childDateOfBirth: value("childDateOfBirth"),
    childSex: value("childSex"),
    childPrimaryLanguage: value("childPrimaryLanguage"),
    childLivesWith: value("childLivesWith"),
    previousCareProgram: value("previousCareProgram"),
    program: value("program"),
    schedule: value("schedule"),
    scheduleDays: data.getAll("scheduleDays").map((item) => String(item).trim()).filter(Boolean),
    desiredStartDate: value("desiredStartDate"),
    allergies: value("allergies"),
    allergyActionPlan: value("allergyActionPlan"),
    medications: value("medications"),
    medicationAuthorizationNeeded: bool("medicationAuthorizationNeeded"),
    dietaryRestrictions: value("dietaryRestrictions"),
    medicalNotes: value("medicalNotes"),
    emergencyContacts: value("emergencyContacts"),
    authorizedPickups: value("authorizedPickups"),
    restrictedPickups: value("restrictedPickups"),
    custodyNotes: value("custodyNotes"),
    physicianInfo: value("physicianInfo"),
    physicianPhone: value("physicianPhone"),
    dentistInfo: value("dentistInfo"),
    insuranceInfo: value("insuranceInfo"),
    hospitalPreference: value("hospitalPreference"),
    immunizationStatus: value("immunizationStatus"),
    photoVideoPermission: bool("photoVideoPermission"),
    fieldTripPermission: bool("fieldTripPermission"),
    transportationPermission: bool("transportationPermission"),
    sunscreenPermission: bool("sunscreenPermission"),
    waterActivityPermission: bool("waterActivityPermission"),
    emergencyMedicalPermission: bool("emergencyMedicalPermission"),
    foodProgramPermission: bool("foodProgramPermission"),
    handbookAcknowledgment: bool("handbookAcknowledgment"),
    tuitionPolicyAcknowledgment: bool("tuitionPolicyAcknowledgment"),
    disciplinePolicyAcknowledgment: bool("disciplinePolicyAcknowledgment"),
    healthPolicyAcknowledgment: bool("healthPolicyAcknowledgment"),
    policyAcknowledgment: bool("policyAcknowledgment"),
    eSignatureConsent: bool("eSignatureConsent"),
    signatureName: value("signatureName"),
    signatureDate: value("signatureDate"),
    pageUrl: window.location.href,
  };
}

export function OnlineRegistrationForm({ centers }: RegistrationFormProps) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SubmitResult | null>(null);

  const groupedCenters = useMemo(() => {
    const groups = new Map<string, CenterOption[]>();
    for (const center of centers) {
      const key = center.state || "Other";
      groups.set(key, [...(groups.get(key) ?? []), center]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [centers]);

  function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = collectForm(event.currentTarget);
    setResult(null);
    startTransition(async () => {
      const response = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => null) as SubmitResult | null;
      if (!response.ok || !json?.ok) {
        setResult(json ?? { error: "Registration could not be submitted." });
        return;
      }
      event.currentTarget.reset();
      setResult(json);
    });
  }

  return (
    <form className="space-y-5" onSubmit={submitRegistration}>
      {result?.ok ? (
        <Alert className="border-emerald-500/30 bg-emerald-500/10">
          <CheckCircle2 className="size-4" />
          <AlertTitle>Registration submitted</AlertTitle>
          <AlertDescription>
            The selected school received the registration packet and a CRM follow-up task was created.
          </AlertDescription>
        </Alert>
      ) : null}
      {result?.error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Review the form</AlertTitle>
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : null}
      {!centers.length ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Schools are not available</AlertTitle>
          <AlertDescription>
            Registration can render, but it needs a database connection and active school records before families can submit packets.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="glass-panel">
        <CardHeader>
          <Badge className="w-fit">
            <ShieldCheck data-icon="inline-start" />
            Step 1
          </Badge>
          <CardTitle>School and Program</CardTitle>
          <CardDescription>Select the school receiving this registration packet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="centerId">School</Label>
            <select
              id="centerId"
              name="centerId"
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              required
            >
              <option value="">Choose a school</option>
              {groupedCenters.map(([state, stateCenters]) => (
                <optgroup key={state} label={state}>
                  {stateCenters.map((center) => (
                    <option key={center.id} value={center.id}>
                      {centerLabel(center)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="program">Program</Label>
            <select
              id="program"
              name="program"
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              required
            >
              <option value="">Choose a program</option>
              {programs.map((program) => <option key={program} value={program}>{program}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="schedule">Schedule</Label>
            <select
              id="schedule"
              name="schedule"
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              required
            >
              <option value="">Choose a schedule</option>
              {schedules.map((schedule) => <option key={schedule} value={schedule}>{schedule}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desiredStartDate">Desired start date</Label>
            <Input id="desiredStartDate" name="desiredStartDate" type="date" required />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Requested days</Label>
            <div className="grid gap-2 sm:grid-cols-5">
              {scheduleDays.map((day) => (
                <label key={day} className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm">
                  <input className="size-4" name="scheduleDays" type="checkbox" value={day} />
                  {day}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <Badge className="w-fit">
            <FileCheck2 data-icon="inline-start" />
            Step 2
          </Badge>
          <CardTitle>Parent or Guardian</CardTitle>
          <CardDescription>This becomes the primary contact for the registration packet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="primaryGuardianName">Primary guardian name</Label>
            <Input id="primaryGuardianName" name="primaryGuardianName" autoComplete="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="primaryGuardianEmail">Email</Label>
            <Input id="primaryGuardianEmail" name="primaryGuardianEmail" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="primaryGuardianPhone">Phone</Label>
            <Input id="primaryGuardianPhone" name="primaryGuardianPhone" type="tel" autoComplete="tel" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="primaryGuardianAddress">Address</Label>
            <Input id="primaryGuardianAddress" name="primaryGuardianAddress" autoComplete="street-address" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="primaryGuardianRelation">Relationship to child</Label>
            <Input id="primaryGuardianRelation" name="primaryGuardianRelation" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="primaryGuardianEmployer">Employer</Label>
            <Input id="primaryGuardianEmployer" name="primaryGuardianEmployer" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="primaryGuardianWorkPhone">Work phone</Label>
            <Input id="primaryGuardianWorkPhone" name="primaryGuardianWorkPhone" type="tel" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="secondaryGuardianName">Secondary guardian name</Label>
            <Input id="secondaryGuardianName" name="secondaryGuardianName" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="secondaryGuardianEmail">Secondary email</Label>
              <Input id="secondaryGuardianEmail" name="secondaryGuardianEmail" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="secondaryGuardianPhone">Secondary phone</Label>
              <Input id="secondaryGuardianPhone" name="secondaryGuardianPhone" type="tel" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="secondaryGuardianRelation">Secondary relationship</Label>
            <Input id="secondaryGuardianRelation" name="secondaryGuardianRelation" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="secondaryGuardianEmployer">Secondary employer</Label>
            <Input id="secondaryGuardianEmployer" name="secondaryGuardianEmployer" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="secondaryGuardianAddress">Secondary address</Label>
            <Input id="secondaryGuardianAddress" name="secondaryGuardianAddress" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="billingContactName">Billing contact name</Label>
            <Input id="billingContactName" name="billingContactName" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="billingContactEmail">Billing email</Label>
            <Input id="billingContactEmail" name="billingContactEmail" type="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="billingContactPhone">Billing phone</Label>
            <Input id="billingContactPhone" name="billingContactPhone" type="tel" />
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Child Information</CardTitle>
          <CardDescription>Medical, allergy, custody, and safety details are protected and director-reviewed.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="childFullName">Child full name</Label>
            <Input id="childFullName" name="childFullName" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="childPreferredName">Preferred name</Label>
            <Input id="childPreferredName" name="childPreferredName" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="childDateOfBirth">Date of birth</Label>
            <Input id="childDateOfBirth" name="childDateOfBirth" type="date" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="childSex">Sex</Label>
            <select
              id="childSex"
              name="childSex"
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">Choose</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="not_specified">Prefer not to specify</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="childPrimaryLanguage">Primary language</Label>
            <Input id="childPrimaryLanguage" name="childPrimaryLanguage" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="childLivesWith">Child lives with</Label>
            <Input id="childLivesWith" name="childLivesWith" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="previousCareProgram">Previous care or school</Label>
            <Input id="previousCareProgram" name="previousCareProgram" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="allergies">Allergies</Label>
            <Textarea id="allergies" name="allergies" placeholder="List allergies, severity, and action notes." />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="allergyActionPlan">Allergy action plan</Label>
            <Textarea id="allergyActionPlan" name="allergyActionPlan" placeholder="Medication, emergency response, or care plan notes." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="medications">Medications</Label>
            <Textarea id="medications" name="medications" />
          </div>
          <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm">
            <input className="mt-1 size-4" name="medicationAuthorizationNeeded" type="checkbox" />
            Medication authorization form may be needed.
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="dietaryRestrictions">Dietary restrictions</Label>
            <Textarea id="dietaryRestrictions" name="dietaryRestrictions" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="physicianInfo">Physician / pediatrician</Label>
            <Textarea id="physicianInfo" name="physicianInfo" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="physicianPhone">Physician phone</Label>
            <Input id="physicianPhone" name="physicianPhone" type="tel" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dentistInfo">Dentist</Label>
            <Textarea id="dentistInfo" name="dentistInfo" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insuranceInfo">Insurance / policy notes</Label>
            <Textarea id="insuranceInfo" name="insuranceInfo" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hospitalPreference">Hospital preference</Label>
            <Input id="hospitalPreference" name="hospitalPreference" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="immunizationStatus">Immunization status</Label>
            <Input id="immunizationStatus" name="immunizationStatus" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="medicalNotes">Additional medical or care notes</Label>
            <Textarea id="medicalNotes" name="medicalNotes" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="restrictedPickups">Restricted pickup people</Label>
            <Textarea id="restrictedPickups" name="restrictedPickups" placeholder="Names and restrictions the director must review." />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="custodyNotes">Custody or restricted pickup notes</Label>
            <Textarea id="custodyNotes" name="custodyNotes" placeholder="Visible only to authorized staff after review." />
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Emergency Contacts and Permissions</CardTitle>
          <CardDescription>The director will review these before they are added to the family account.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="emergencyContacts">Emergency contacts</Label>
            <Textarea id="emergencyContacts" name="emergencyContacts" placeholder="Name, phone, relation. One per line." required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="authorizedPickups">Authorized pickups</Label>
            <Textarea id="authorizedPickups" name="authorizedPickups" placeholder="Name, phone, relation. One per line." required />
          </div>
          <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm">
            <input className="mt-1 size-4" name="photoVideoPermission" type="checkbox" />
            I authorize photo/video sharing according to the school policy.
          </label>
          <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm">
            <input className="mt-1 size-4" name="fieldTripPermission" type="checkbox" />
            I authorize field trip participation according to the school policy.
          </label>
          <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm">
            <input className="mt-1 size-4" name="transportationPermission" type="checkbox" />
            I authorize school transportation when applicable.
          </label>
          <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm">
            <input className="mt-1 size-4" name="sunscreenPermission" type="checkbox" />
            I authorize sunscreen or topical application according to school policy.
          </label>
          <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm">
            <input className="mt-1 size-4" name="waterActivityPermission" type="checkbox" />
            I authorize water activity participation when applicable.
          </label>
          <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm">
            <input className="mt-1 size-4" name="emergencyMedicalPermission" type="checkbox" />
            I authorize emergency medical care if needed.
          </label>
          <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm">
            <input className="mt-1 size-4" name="foodProgramPermission" type="checkbox" />
            I authorize food program participation and meal service records.
          </label>
        </CardContent>
      </Card>

      <Card className="glass-panel border-primary/25">
        <CardHeader>
          <CardTitle>Review and Signature</CardTitle>
          <CardDescription>
            This is a registration intake packet, not a final enrollment approval. The school will review documents, availability, and required fees.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm leading-6 text-muted-foreground">
            <CreditCard className="mt-0.5 size-5 shrink-0 text-primary" />
            Parent tuition payments are handled inside the parent portal after the school activates billing and its payout account.
          </div>
          <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm">
            <input className="mt-1 size-4" name="policyAcknowledgment" type="checkbox" required />
            I certify that the information provided is accurate and understand the school may request additional documents or signatures.
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm">
              <input className="mt-1 size-4" name="handbookAcknowledgment" type="checkbox" />
              I acknowledge the parent handbook will be reviewed and signed.
            </label>
            <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm">
              <input className="mt-1 size-4" name="tuitionPolicyAcknowledgment" type="checkbox" />
              I acknowledge tuition, fee, and deposit policies will be reviewed and signed.
            </label>
            <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm">
              <input className="mt-1 size-4" name="disciplinePolicyAcknowledgment" type="checkbox" />
              I acknowledge behavior and discipline policies will be reviewed.
            </label>
            <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm">
              <input className="mt-1 size-4" name="healthPolicyAcknowledgment" type="checkbox" />
              I acknowledge health, illness, and medication policies will be reviewed.
            </label>
          </div>
          <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm">
            <input className="mt-1 size-4" name="eSignatureConsent" type="checkbox" />
            I consent to completing registration documents and acknowledgments electronically.
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="signatureName">Typed signature</Label>
            <Input id="signatureName" name="signatureName" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signatureDate">Signature date</Label>
            <Input id="signatureDate" name="signatureDate" type="date" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button type="submit" disabled={isPending || !centers.length} className="h-11 px-5">
              Submit registration packet
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button type="button" variant="outline" nativeButton={false} render={<Link href="/" />}>
              Back to product site
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
