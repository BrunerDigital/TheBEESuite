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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel as SelectGroupLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  initialCenterId?: string;
};

type SubmitResult = {
  ok?: boolean;
  leadId?: string;
  submissionId?: string;
  error?: string;
  errors?: Record<string, string>;
};

type Option = {
  value: string;
  label: string;
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

const previousCareOptions: Option[] = [
  { value: "home_daycare", label: "In a home daycare setting" },
  { value: "another_center", label: "At another center" },
  { value: "home_with_parent", label: "Home with parent/guardian" },
  { value: "relative_friend_neighbor", label: "By a relative, friend, or neighbor" },
];

const childLivesWithOptions = ["Mom & Dad", "Mom", "Dad", "Other"];

const yesNoOptions = ["Yes", "No"];

const medicalConditionOptions: Option[] = [
  { value: "asthma", label: "Asthma" },
  { value: "convulsions_diabetes", label: "Convulsions / Diabetes" },
  { value: "epilepsy", label: "Epilepsy" },
  { value: "heart_defect", label: "Heart defect" },
  { value: "bleeding_clotting_disorder", label: "Bleeding / Clotting disorder" },
];

const developmentSkillOptions: Option[] = [
  "Climbs",
  "Walks",
  "Runs",
  "Hops on one foot",
  "Jumps",
  "Uses words to express self",
  "Speaks clearly",
  "Understands directions",
  "Uses scissors",
  "Uses crayons",
  "Uses pencils",
].map((label) => ({ value: label, label }));

const participationOptions: Option[] = [
  { value: "share_special_skill", label: "Share a special skill or interest" },
  { value: "assist_classroom", label: "Assist with classroom activities" },
  { value: "special_events", label: "Join special events" },
];

const mealChildStatusOptions: Option[] = [
  { value: "foster_child", label: "Foster child" },
  { value: "homeless", label: "Homeless" },
  { value: "migrant", label: "Migrant" },
  { value: "runaway", label: "Runaway" },
  { value: "none", label: "None of these" },
];

const financialAgreementItems = [
  ["financialAgreementPaymentFeesInitials", "Payment of all fees"],
  ["financialAgreementAbsenteePolicyInitials", "Absentee policy"],
  ["financialAgreementRegistrationFeeInitials", "Registration fee"],
  ["financialAgreementReturnedPaymentInitials", "Returned payment policy"],
  ["financialAgreementDischargeInitials", "Discharge policy"],
  ["financialAgreementWithdrawalInitials", "Withdrawal"],
  ["financialAgreementLatePickupInitials", "Late pick-up fee"],
  ["financialAgreementCollectionInitials", "Collection policy"],
  ["financialAgreementUniformInitials", "Uniform policy"],
  ["financialAgreementFinalTermsInitials", "Final financial agreement terms"],
] as const;

const registrationSelectTriggerClassName =
  "w-full bg-background px-3 text-foreground dark:bg-input/30 data-[size=default]:h-10";

function centerLabel(center: CenterOption) {
  const location = [center.city, center.state].filter(Boolean).join(", ");
  return [center.crmLocationId ?? center.name, location].filter(Boolean).join(" · ");
}

function normalizeOption(option: string | Option): Option {
  return typeof option === "string" ? { value: option, label: option } : option;
}

function collectForm(form: HTMLFormElement) {
  const data = new FormData(form);
  const value = (key: string) => String(data.get(key) ?? "").trim();
  const values = (key: string) => data.getAll(key).map((item) => String(item).trim()).filter(Boolean);
  const bool = (key: string) => data.get(key) === "on";
  const photoVideoReleaseChoice = value("photoVideoReleaseChoice");

  return {
    centerId: value("centerId"),
    primaryGuardianName: value("primaryGuardianName"),
    primaryGuardianEmail: value("primaryGuardianEmail"),
    primaryGuardianPhone: value("primaryGuardianPhone"),
    primaryGuardianAddress: value("primaryGuardianAddress"),
    primaryGuardianRelation: value("primaryGuardianRelation"),
    primaryGuardianEmployer: value("primaryGuardianEmployer"),
    primaryGuardianHomePhone: value("primaryGuardianHomePhone"),
    primaryGuardianWorkPhone: value("primaryGuardianWorkPhone"),
    primaryGuardianCellPhoneCarrier: value("primaryGuardianCellPhoneCarrier"),
    primaryGuardianDriverLicense: value("primaryGuardianDriverLicense"),
    primaryGuardianSocialSecurityNumber: value("primaryGuardianSocialSecurityNumber"),
    secondaryGuardianName: value("secondaryGuardianName"),
    secondaryGuardianEmail: value("secondaryGuardianEmail"),
    secondaryGuardianPhone: value("secondaryGuardianPhone"),
    secondaryGuardianRelation: value("secondaryGuardianRelation"),
    secondaryGuardianEmployer: value("secondaryGuardianEmployer"),
    secondaryGuardianAddress: value("secondaryGuardianAddress"),
    secondaryGuardianHomePhone: value("secondaryGuardianHomePhone"),
    secondaryGuardianWorkPhone: value("secondaryGuardianWorkPhone"),
    secondaryGuardianCellPhoneCarrier: value("secondaryGuardianCellPhoneCarrier"),
    secondaryGuardianDriverLicense: value("secondaryGuardianDriverLicense"),
    secondaryGuardianSocialSecurityNumber: value("secondaryGuardianSocialSecurityNumber"),
    billingContactName: value("billingContactName"),
    billingContactEmail: value("billingContactEmail"),
    billingContactPhone: value("billingContactPhone"),
    childFullName: value("childFullName"),
    childPreferredName: value("childPreferredName"),
    childDateOfBirth: value("childDateOfBirth"),
    childSex: value("childSex"),
    childAddress: value("childAddress"),
    childPrimaryLanguage: value("childPrimaryLanguage"),
    childLivesWith: value("childLivesWith"),
    previousCareProgram: value("previousCareProgram"),
    siblingNamesAges: value("siblingNamesAges"),
    dayStructure: value("dayStructure"),
    newSituationNotes: value("newSituationNotes"),
    appetiteNotes: value("appetiteNotes"),
    feedsSelf: value("feedsSelf"),
    foodLikes: value("foodLikes"),
    foodDislikes: value("foodDislikes"),
    napSchedule: value("napSchedule"),
    nightSleepSchedule: value("nightSleepSchedule"),
    sleepItems: value("sleepItems"),
    napHints: value("napHints"),
    favoriteActivities: value("favoriteActivities"),
    developmentSkills: values("developmentSkills"),
    toiletingStatus: value("toiletingStatus"),
    bathroomRequest: value("bathroomRequest"),
    bathroomHelpNeeded: value("bathroomHelpNeeded"),
    toiletingRoutine: value("toiletingRoutine"),
    goalsExpectations: value("goalsExpectations"),
    friendsAtCenter: value("friendsAtCenter"),
    childPersonality: value("childPersonality"),
    otherHelpfulInfo: value("otherHelpfulInfo"),
    participationInterests: values("participationInterests"),
    participationOther: value("participationOther"),
    program: value("program"),
    schedule: value("schedule"),
    scheduleDays: values("scheduleDays"),
    desiredStartDate: value("desiredStartDate"),
    specialNeedsNotes: value("specialNeedsNotes"),
    medicalConditions: values("medicalConditions"),
    medicalConditionOther: value("medicalConditionOther"),
    allergies: value("allergies"),
    allergyActionPlan: value("allergyActionPlan"),
    allergyReactionSymptoms: value("allergyReactionSymptoms"),
    allergyPreventativeMeasures: value("allergyPreventativeMeasures"),
    allergyExposureResponse: value("allergyExposureResponse"),
    emergencyMedicationInstructions: value("emergencyMedicationInstructions"),
    emergencyCarePlanContacts: value("emergencyCarePlanContacts"),
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
    dentistPhone: value("dentistPhone"),
    insuranceInfo: value("insuranceInfo"),
    insuranceCompany: value("insuranceCompany"),
    insurancePolicyNumber: value("insurancePolicyNumber"),
    hospitalPreference: value("hospitalPreference"),
    immunizationStatus: value("immunizationStatus"),
    immunizationExpirationDate: value("immunizationExpirationDate"),
    physicalExpirationDate: value("physicalExpirationDate"),
    elc4cExpirationDate: value("elc4cExpirationDate"),
    photoVideoReleaseChoice,
    photoVideoPermission: photoVideoReleaseChoice === "yes",
    fieldTripPermission: bool("fieldTripPermission"),
    transportationPermission: bool("transportationPermission"),
    sunscreenPermission: bool("sunscreenPermission"),
    waterActivityPermission: bool("waterActivityPermission"),
    emergencyMedicalPermission: bool("emergencyMedicalPermission"),
    firstAidEmergencyConsent: bool("firstAidEmergencyConsent"),
    floridaKnowYourChildcareAcknowledgment: bool("floridaKnowYourChildcareAcknowledgment"),
    floridaDistractedAdultAcknowledgment: bool("floridaDistractedAdultAcknowledgment"),
    dcfInspectionAccessAcknowledgment: bool("dcfInspectionAccessAcknowledgment"),
    physicalImmunizationThirtyDayAcknowledgment: bool("physicalImmunizationThirtyDayAcknowledgment"),
    foodProgramPermission: bool("foodProgramPermission"),
    foodActivityPermission: value("foodActivityPermission"),
    foodActivityAllergyChoice: value("foodActivityAllergyChoice"),
    foodActivityRestrictedItems: value("foodActivityRestrictedItems"),
    uniformBlackQuantity: value("uniformBlackQuantity"),
    uniformBlackSize: value("uniformBlackSize"),
    uniformYellowQuantity: value("uniformYellowQuantity"),
    uniformYellowSize: value("uniformYellowSize"),
    uniformPaymentChoice: value("uniformPaymentChoice"),
    uniformPaymentAmount: value("uniformPaymentAmount"),
    uniformComments: value("uniformComments"),
    handbookAcknowledgment: bool("handbookAcknowledgment"),
    emergencyProceduresAcknowledgment: bool("emergencyProceduresAcknowledgment"),
    tuitionPolicyAcknowledgment: bool("tuitionPolicyAcknowledgment"),
    disciplinePolicyAcknowledgment: bool("disciplinePolicyAcknowledgment"),
    expulsionPolicyAcknowledgment: bool("expulsionPolicyAcknowledgment"),
    mandatoryReportingAcknowledgment: bool("mandatoryReportingAcknowledgment"),
    healthPolicyAcknowledgment: bool("healthPolicyAcknowledgment"),
    nutritionPolicyAcknowledgment: bool("nutritionPolicyAcknowledgment"),
    collectionResponsibilityAcknowledgment: bool("collectionResponsibilityAcknowledgment"),
    financialAgreementPaymentFeesInitials: value("financialAgreementPaymentFeesInitials"),
    financialAgreementAbsenteePolicyInitials: value("financialAgreementAbsenteePolicyInitials"),
    financialAgreementRegistrationFeeInitials: value("financialAgreementRegistrationFeeInitials"),
    financialAgreementReturnedPaymentInitials: value("financialAgreementReturnedPaymentInitials"),
    financialAgreementDischargeInitials: value("financialAgreementDischargeInitials"),
    financialAgreementWithdrawalInitials: value("financialAgreementWithdrawalInitials"),
    financialAgreementLatePickupInitials: value("financialAgreementLatePickupInitials"),
    financialAgreementCollectionInitials: value("financialAgreementCollectionInitials"),
    financialAgreementUniformInitials: value("financialAgreementUniformInitials"),
    financialAgreementFinalTermsInitials: value("financialAgreementFinalTermsInitials"),
    mealBenefitApplicationNeeded: bool("mealBenefitApplicationNeeded"),
    mealApplicationCaseNumberSnap: value("mealApplicationCaseNumberSnap"),
    mealApplicationCaseNumberTanf: value("mealApplicationCaseNumberTanf"),
    mealApplicationChildStatuses: values("mealApplicationChildStatuses"),
    mealApplicationAttendedThisCenter: value("mealApplicationAttendedThisCenter"),
    mealApplicationHeadStartPreK: value("mealApplicationHeadStartPreK"),
    mealApplicationChildIncome: value("mealApplicationChildIncome"),
    mealApplicationHouseholdMembers: value("mealApplicationHouseholdMembers"),
    mealApplicationAdultIncome: value("mealApplicationAdultIncome"),
    mealApplicationLastFourSsn: value("mealApplicationLastFourSsn"),
    mealApplicationNoSsn: bool("mealApplicationNoSsn"),
    mealApplicationEthnicity: value("mealApplicationEthnicity"),
    mealApplicationRace: value("mealApplicationRace"),
    mealApplicationSignatureName: value("mealApplicationSignatureName"),
    mealApplicationSignatureDate: value("mealApplicationSignatureDate"),
    policyAcknowledgment: bool("policyAcknowledgment"),
    eSignatureConsent: bool("eSignatureConsent"),
    signatureName: value("signatureName"),
    signatureDate: value("signatureDate"),
    pageUrl: window.location.href,
  };
}

function TextField({
  id,
  label,
  type = "text",
  required,
  className,
  placeholder,
  autoComplete,
  maxLength,
}: {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={type} required={required} placeholder={placeholder} autoComplete={autoComplete} maxLength={maxLength} />
    </div>
  );
}

function TextAreaField({
  id,
  label,
  required,
  className,
  placeholder,
}: {
  id: string;
  label: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} name={id} required={required} placeholder={placeholder} />
    </div>
  );
}

function SelectField({
  id,
  label,
  options,
  required,
  className,
  emptyLabel = "Choose",
}: {
  id: string;
  label: string;
  options: string[] | Option[];
  required?: boolean;
  className?: string;
  emptyLabel?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Select name={id} required={required}>
        <SelectTrigger id={id} className={registrationSelectTriggerClassName}>
          <SelectValue placeholder={emptyLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">{emptyLabel}</SelectItem>
          {options.map((option) => {
            const { value, label } = normalizeOption(option);
            return <SelectItem key={value} value={value}>{label}</SelectItem>;
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

function CheckboxCard({ name, children, required }: { name: string; children: string; required?: boolean }) {
  return (
    <label className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm leading-6">
      <input className="mt-1 size-4" name={name} type="checkbox" required={required} />
      <span>{children}</span>
    </label>
  );
}

function CheckboxGroup({ label, name, options, columns = "sm:grid-cols-2" }: { label: string; name: string; options: Option[]; columns?: string }) {
  return (
    <div className="space-y-2 md:col-span-2">
      <Label>{label}</Label>
      <div className={`grid gap-2 ${columns}`}>
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm">
            <input className="size-4" name={name} type="checkbox" value={option.value} />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function OnlineRegistrationForm({ centers, initialCenterId = "" }: RegistrationFormProps) {
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
            <Select name="centerId" defaultValue={initialCenterId} required>
              <SelectTrigger id="centerId" className={registrationSelectTriggerClassName}>
                <SelectValue placeholder="Choose a school" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Choose a school</SelectItem>
                {groupedCenters.map(([state, stateCenters]) => (
                  <SelectGroup key={state}>
                    <SelectGroupLabel>{state}</SelectGroupLabel>
                    {stateCenters.map((center) => (
                      <SelectItem key={center.id} value={center.id}>
                        {centerLabel(center)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SelectField id="program" label="Program" options={programs} required emptyLabel="Choose a program" />
          <SelectField id="schedule" label="Schedule" options={schedules} required emptyLabel="Choose a schedule" />
          <TextField id="desiredStartDate" label="Desired start date" type="date" required />
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
          <CardDescription>Contact, employment, billing, and identification details from the registration packet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <TextField id="primaryGuardianName" label="Primary guardian name" autoComplete="name" required />
          <TextField id="primaryGuardianEmail" label="Primary email" type="email" autoComplete="email" required />
          <TextField id="primaryGuardianPhone" label="Primary cell phone" type="tel" autoComplete="tel" required />
          <TextField id="primaryGuardianCellPhoneCarrier" label="Primary cell carrier" />
          <TextField id="primaryGuardianHomePhone" label="Primary home phone" type="tel" />
          <TextField id="primaryGuardianWorkPhone" label="Primary work phone" type="tel" />
          <TextField id="primaryGuardianAddress" label="Primary address" autoComplete="street-address" className="md:col-span-2" />
          <TextField id="primaryGuardianRelation" label="Primary relationship to child" />
          <TextField id="primaryGuardianEmployer" label="Primary place of employment" />
          <TextField id="primaryGuardianDriverLicense" label="Primary driver's license" />
          <TextField id="primaryGuardianSocialSecurityNumber" label="Primary social security number if required" />

          <div className="md:col-span-2 border-t border-border pt-4" />
          <TextField id="secondaryGuardianName" label="Secondary guardian name" />
          <TextField id="secondaryGuardianEmail" label="Secondary email" type="email" />
          <TextField id="secondaryGuardianPhone" label="Secondary cell phone" type="tel" />
          <TextField id="secondaryGuardianCellPhoneCarrier" label="Secondary cell carrier" />
          <TextField id="secondaryGuardianHomePhone" label="Secondary home phone" type="tel" />
          <TextField id="secondaryGuardianWorkPhone" label="Secondary work phone" type="tel" />
          <TextField id="secondaryGuardianAddress" label="Secondary address" className="md:col-span-2" />
          <TextField id="secondaryGuardianRelation" label="Secondary relationship" />
          <TextField id="secondaryGuardianEmployer" label="Secondary place of employment" />
          <TextField id="secondaryGuardianDriverLicense" label="Secondary driver's license" />
          <TextField id="secondaryGuardianSocialSecurityNumber" label="Secondary social security number if required" />

          <div className="md:col-span-2 border-t border-border pt-4" />
          <TextField id="billingContactName" label="Billing contact name" />
          <TextField id="billingContactEmail" label="Billing email" type="email" />
          <TextField id="billingContactPhone" label="Billing phone" type="tel" />
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Child Information</CardTitle>
          <CardDescription>Identity, household, previous care, and daily routine details.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <TextField id="childFullName" label="Child full name" required />
          <TextField id="childPreferredName" label="Preferred name" />
          <TextField id="childDateOfBirth" label="Date of birth" type="date" required />
          <SelectField id="childSex" label="Gender" options={["Female", "Male", "Prefer not to answer"]} />
          <TextField id="childAddress" label="Child address" className="md:col-span-2" />
          <TextField id="childPrimaryLanguage" label="Primary language at home" />
          <SelectField id="childLivesWith" label="Child lives with" options={childLivesWithOptions} />
          <SelectField id="previousCareProgram" label="Previously cared for" options={previousCareOptions} />
          <TextAreaField id="siblingNamesAges" label="Siblings, names, and ages" />
          <SelectField id="dayStructure" label="Child's day is usually" options={["Relatively structured", "Relatively unstructured"]} />
          <TextAreaField id="newSituationNotes" label="In new situations, my child tends to" className="md:col-span-2" />
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>What Makes My Child Special</CardTitle>
          <CardDescription>Eating, sleeping, development, toileting, goals, and family participation notes.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <TextAreaField id="appetiteNotes" label="Appetite notes" placeholder="Good appetite, meal preferences, or feeding support." />
          <SelectField id="feedsSelf" label="Does your child feed themself?" options={yesNoOptions} />
          <TextAreaField id="foodLikes" label="Foods your child likes" />
          <TextAreaField id="foodDislikes" label="Foods your child dislikes" />
          <TextField id="napSchedule" label="Nap schedule" placeholder="Times per day, from/to" />
          <TextField id="nightSleepSchedule" label="Night sleep schedule" placeholder="p.m. to a.m." />
          <TextField id="sleepItems" label="Special sleep items" />
          <TextAreaField id="napHints" label="Special hints for nap time" />
          <TextAreaField id="favoriteActivities" label="Activities your child likes" className="md:col-span-2" />
          <CheckboxGroup label="Development abilities that are ready or emerging" name="developmentSkills" options={developmentSkillOptions} columns="sm:grid-cols-3" />
          <SelectField id="toiletingStatus" label="Is your child fully potty trained?" options={["Yes", "No", "In process"]} />
          <SelectField id="bathroomRequest" label="Does your child ask to use the bathroom?" options={yesNoOptions} />
          <SelectField id="bathroomHelpNeeded" label="Does your child need bathroom help?" options={yesNoOptions} />
          <TextAreaField id="toiletingRoutine" label="Toileting routines or methods" />
          <TextAreaField id="goalsExpectations" label="Goals and expectations for Kid City USA" />
          <TextAreaField id="friendsAtCenter" label="Friends or acquaintances at this center" />
          <TextAreaField id="childPersonality" label="Describe your child" placeholder="Shy, outgoing, a leader, strong willed, etc." />
          <TextAreaField id="otherHelpfulInfo" label="Other information to help meet your child's needs" />
          <CheckboxGroup label="How would you like to participate?" name="participationInterests" options={participationOptions} />
          <TextAreaField id="participationOther" label="Other participation notes" className="md:col-span-2" />
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Medical, Allergy, and Care Plan</CardTitle>
          <CardDescription>Medical, allergy, medication, insurance, and emergency treatment details are protected for director review.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <TextAreaField id="specialNeedsNotes" label="Special needs notes" className="md:col-span-2" />
          <CheckboxGroup label="Medical conditions" name="medicalConditions" options={medicalConditionOptions} />
          <TextAreaField id="medicalConditionOther" label="Other medical conditions" className="md:col-span-2" />
          <TextAreaField id="allergies" label="Allergies" placeholder="List allergies, severity, and action notes." />
          <TextAreaField id="allergyActionPlan" label="Allergy action plan" placeholder="Medication, emergency response, or care plan notes." />
          <TextAreaField id="allergyReactionSymptoms" label="Allergic reaction signs and symptoms" />
          <TextAreaField id="allergyPreventativeMeasures" label="Preventative measures" />
          <TextAreaField id="allergyExposureResponse" label="Emergency care in event of exposure" />
          <TextAreaField id="emergencyMedicationInstructions" label="Emergency medication administration instructions" />
          <TextAreaField id="emergencyCarePlanContacts" label="Emergency care plan contacts" placeholder="Name and phone. One per line." className="md:col-span-2" />
          <TextAreaField id="medications" label="Medications" />
          <CheckboxCard name="medicationAuthorizationNeeded">Medication authorization form may be needed.</CheckboxCard>
          <TextAreaField id="dietaryRestrictions" label="Dietary restrictions" />
          <TextAreaField id="medicalNotes" label="Additional medical or care notes" />
          <TextAreaField id="physicianInfo" label="Child's physician" />
          <TextField id="physicianPhone" label="Physician phone" type="tel" />
          <TextAreaField id="dentistInfo" label="Dentist" />
          <TextField id="dentistPhone" label="Dentist phone" type="tel" />
          <TextField id="hospitalPreference" label="Preferred hospital" />
          <TextField id="insuranceCompany" label="Insurance company" />
          <TextField id="insurancePolicyNumber" label="Policy or group number" />
          <TextAreaField id="insuranceInfo" label="Insurance notes" />
          <TextField id="immunizationStatus" label="Immunization status" />
          <TextField id="immunizationExpirationDate" label="Immunization expiration date" type="date" />
          <TextField id="physicalExpirationDate" label="Physical expiration date" type="date" />
          <TextField id="elc4cExpirationDate" label="4C / ELC expiration date" type="date" />
          <TextAreaField id="restrictedPickups" label="Restricted pickup people" placeholder="Names and restrictions the director must review." />
          <TextAreaField id="custodyNotes" label="Custody or restricted pickup notes" placeholder="Visible only to authorized staff after review." />
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Emergency Contacts and Permissions</CardTitle>
          <CardDescription>The director will review these before they are added to the family account.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <TextAreaField id="emergencyContacts" label="Emergency contacts" placeholder="Name, relationship, cell, work/home phone, and address. One per line." required />
          <TextAreaField id="authorizedPickups" label="Authorized pickups" placeholder="Name, relationship, phone, and identification notes. One per line." required />
          <SelectField id="photoVideoReleaseChoice" label="Audio / video / photo release" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} required />
          <CheckboxCard name="fieldTripPermission">I authorize field trip participation according to the school policy.</CheckboxCard>
          <CheckboxCard name="transportationPermission">I authorize school transportation for field trips, after school programs, or emergencies when applicable.</CheckboxCard>
          <CheckboxCard name="sunscreenPermission">I authorize sunscreen or topical application according to school policy.</CheckboxCard>
          <CheckboxCard name="waterActivityPermission">I authorize water activity participation when applicable.</CheckboxCard>
          <CheckboxCard name="emergencyMedicalPermission" required>I authorize emergency medical care if needed.</CheckboxCard>
          <CheckboxCard name="firstAidEmergencyConsent" required>I give consent for Kid City USA staff to provide first aid and, if necessary, transport my child for emergency care.</CheckboxCard>
          <CheckboxCard name="floridaKnowYourChildcareAcknowledgment" required>I have received, read, and understand the Know Your Childcare Facility information.</CheckboxCard>
          <CheckboxCard name="floridaDistractedAdultAcknowledgment" required>I have received, read, and understand the Distracted Adult Flyer.</CheckboxCard>
          <CheckboxCard name="dcfInspectionAccessAcknowledgment" required>I understand DCF licensing authority may access, photograph, record, and copy child care records for inspections.</CheckboxCard>
          <CheckboxCard name="physicalImmunizationThirtyDayAcknowledgment" required>I understand current physical and immunization records are required within 30 days of enrollment.</CheckboxCard>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Nutrition, Food Activities, and Uniforms</CardTitle>
          <CardDescription>Policies, food activity choices, and uniform order details from the Kid City packet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <CheckboxCard name="nutritionPolicyAcknowledgment" required>I acknowledge the Child Care Nutrition and Physical Activity Policies.</CheckboxCard>
          <CheckboxCard name="foodProgramPermission">I authorize food program participation and meal service records.</CheckboxCard>
          <SelectField id="foodActivityPermission" label="Permission for food-related activities" options={["Give permission", "Decline permission"]} required />
          <SelectField
            id="foodActivityAllergyChoice"
            label="Food allergy or dietary restriction statement"
            options={[
              "No food allergy/restriction and may participate",
              "No food allergy/restriction and may not participate",
              "Has food allergy/restriction and may participate with restrictions",
              "Has food allergy/restriction and may not participate",
            ]}
            required
          />
          <TextAreaField id="foodActivityRestrictedItems" label="Foods child may not eat or handle" className="md:col-span-2" />
          <TextField id="uniformBlackQuantity" label="Black uniform quantity" />
          <TextField id="uniformBlackSize" label="Black uniform size" />
          <TextField id="uniformYellowQuantity" label="Yellow uniform quantity" />
          <TextField id="uniformYellowSize" label="Yellow uniform size" />
          <SelectField id="uniformPaymentChoice" label="Uniform payment choice" options={["One-time payment", "Payment plan"]} />
          <TextField id="uniformPaymentAmount" label="Uniform payment amount" />
          <TextAreaField id="uniformComments" label="Uniform comments" className="md:col-span-2" />
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Food Program Free/Reduced Meal Application</CardTitle>
          <CardDescription>Optional household and income information for the child care food program application.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <CheckboxCard name="mealBenefitApplicationNeeded">Complete a food program free/reduced meal application for this child.</CheckboxCard>
          <TextField id="mealApplicationCaseNumberSnap" label="FAP/SNAP case number" />
          <TextField id="mealApplicationCaseNumberTanf" label="TANF case number" />
          <CheckboxGroup label="Child statuses" name="mealApplicationChildStatuses" options={mealChildStatusOptions} />
          <SelectField id="mealApplicationAttendedThisCenter" label="Attended this center this year?" options={yesNoOptions} />
          <SelectField id="mealApplicationHeadStartPreK" label="Head Start / Pre-K / After School?" options={yesNoOptions} />
          <TextAreaField id="mealApplicationChildIncome" label="Child income" placeholder="Source, amount, and frequency." />
          <TextAreaField id="mealApplicationHouseholdMembers" label="Household members" placeholder="Adult and child household members. Include foster children if applicable." />
          <TextAreaField id="mealApplicationAdultIncome" label="Adult household income" placeholder="Earnings, public assistance, pensions/retirement, and other income with frequency." className="md:col-span-2" />
          <TextField id="mealApplicationLastFourSsn" label="Last four digits of adult household member SSN" maxLength={4} />
          <CheckboxCard name="mealApplicationNoSsn">Adult household member has no SSN.</CheckboxCard>
          <TextField id="mealApplicationEthnicity" label="Optional ethnicity" placeholder="Hispanic/Latino or not Hispanic/Latino" />
          <TextField id="mealApplicationRace" label="Optional race" placeholder="American Indian/Alaskan Native, Asian, Black or African American, Native Hawaiian or Pacific Islander, White" />
          <TextField id="mealApplicationSignatureName" label="Meal application signature name" />
          <TextField id="mealApplicationSignatureDate" label="Meal application signature date" type="date" />
        </CardContent>
      </Card>

      <Card className="glass-panel border-primary/25">
        <CardHeader>
          <CardTitle>Financial Agreement and Handbook Receipt</CardTitle>
          <CardDescription>
            Initial each financial term and acknowledge the handbook, emergency procedures, and policy receipts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {financialAgreementItems.map(([name, label]) => (
              <div key={name} className="grid grid-cols-[5rem_1fr] items-center gap-3 rounded-xl border bg-background/40 p-3">
                <Input name={name} maxLength={4} required className="h-9 text-center uppercase" aria-label={`${label} initials`} />
                <span className="text-sm leading-5">{label}</span>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <CheckboxCard name="tuitionPolicyAcknowledgment" required>I acknowledge tuition, fee, returned payment, absentee, withdrawal, and late pick-up policies.</CheckboxCard>
            <CheckboxCard name="collectionResponsibilityAcknowledgment" required>I understand I am responsible for charges during enrollment and at dismissal, including collection costs if applicable.</CheckboxCard>
            <CheckboxCard name="handbookAcknowledgment" required>I have read and understand the Parent Handbook.</CheckboxCard>
            <CheckboxCard name="emergencyProceduresAcknowledgment" required>I have read and understand the Emergency Procedures Notification.</CheckboxCard>
            <CheckboxCard name="disciplinePolicyAcknowledgment" required>I have read and understand the disciplinary policy.</CheckboxCard>
            <CheckboxCard name="expulsionPolicyAcknowledgment" required>I have read and understand the expulsion policy.</CheckboxCard>
            <CheckboxCard name="mandatoryReportingAcknowledgment" required>I have read and understand the mandatory reporting policy.</CheckboxCard>
            <CheckboxCard name="healthPolicyAcknowledgment" required>I acknowledge health, illness, and medication policies will be reviewed.</CheckboxCard>
          </div>

          <div className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm leading-6 text-muted-foreground">
            <CreditCard className="mt-0.5 size-5 shrink-0 text-primary" />
            Parent tuition payments are handled inside the parent portal after the school activates billing and its payout account.
          </div>
          <CheckboxCard name="policyAcknowledgment" required>I certify that the information provided is true, correct, and complete.</CheckboxCard>
          <CheckboxCard name="eSignatureConsent" required>I consent to completing registration documents and acknowledgments electronically.</CheckboxCard>
          <TextField id="signatureName" label="Typed signature" required />
          <TextField id="signatureDate" label="Signature date" type="date" />
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
