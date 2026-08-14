"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  CreditCard,
  FileText,
  Home,
  KeyRound,
  MessageSquare,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SetupGuardian = {
  id: string;
  familyId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  relation: string;
  preferredCommunication: string | null;
  hasPin: boolean;
  familyName: string;
  centerName: string | null;
  children: Array<{ id: string; fullName: string }>;
};

type Props = {
  guardians: SetupGuardian[];
};

type SetupResponse = {
  ok?: boolean;
  error?: string;
};

function pinDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

const setupSteps = [
  {
    title: "Review Your Family",
    body: "Confirm that the school, family, and children shown on this page are correct before saving.",
  },
  {
    title: "Confirm Your Information",
    body: "Check the family, school, name, phone number, relationship, and login email shown here.",
  },
  {
    title: "Choose Your Check-In PIN",
    body: "Choose 4 digits that only authorized adults know. Do not share the PIN outside your family’s approved pickup list.",
  },
];

const homeScreenSteps = [
  "iPhone: open this portal in Safari, tap Share, then choose Add to Home Screen.",
  "Android: open this portal in Chrome, tap the menu, then choose Add to Home screen or Install app.",
];

const portalPreviews = [
  {
    title: "Updates",
    meta: "Meals, naps & care",
    body: "See meals, naps, activities, notes, photos, and classroom updates for each child.",
    Icon: Camera,
  },
  {
    title: "Messages",
    meta: "School conversation",
    body: "Read and reply to school messages without searching through separate sections.",
    Icon: MessageSquare,
  },
  {
    title: "Check-in PIN",
    meta: "At your school",
    body: "Use your 4-digit PIN when an authorized adult checks a child in or out at the school kiosk.",
    Icon: KeyRound,
  },
  {
    title: "Documents & Billing",
    meta: "When available",
    body: "Review forms, signature requests, invoices, balances, and available payment options.",
    Icon: FileText,
  },
];

export function ParentPortalSetupForm({ guardians }: Props) {
  const router = useRouter();
  const [selectedGuardianId, setSelectedGuardianId] = useState(guardians[0]?.id ?? "");
  const selectedGuardian = useMemo(
    () => guardians.find((guardian) => guardian.id === selectedGuardianId) ?? guardians[0] ?? null,
    [guardians, selectedGuardianId],
  );
  const [fullName, setFullName] = useState(selectedGuardian?.fullName ?? "");
  const [phone, setPhone] = useState(selectedGuardian?.phone ?? "");
  const [relation, setRelation] = useState(selectedGuardian?.relation ?? "Parent/Guardian");
  const [preferredCommunication, setPreferredCommunication] = useState(selectedGuardian?.preferredCommunication ?? "email");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function selectGuardian(guardian: SetupGuardian) {
    setSelectedGuardianId(guardian.id);
    setFullName(guardian.fullName);
    setPhone(guardian.phone ?? "");
    setRelation(guardian.relation);
    setPreferredCommunication(guardian.preferredCommunication ?? "email");
    setPin("");
    setStatus("");
    setError("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGuardian) return;
    setStatus("");
    setError("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/parent/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guardianId: selectedGuardian.id,
            familyId: selectedGuardian.familyId,
            fullName,
            phone,
            relation,
            preferredCommunication,
            pin,
          }),
        });
        const data = (await response.json().catch(() => null)) as SetupResponse | null;

        if (!response.ok) {
          setError(data?.error ?? "Parent portal setup could not be saved. Review the form and try again.");
          return;
        }

        setStatus("Your parent portal setup is complete.");
        setTimeout(() => {
          router.push("/parent-portal");
          router.refresh();
        }, 900);
      } catch {
        setError("We could not reach the setup service. Check your connection and try again. Your entries are still here.");
      }
    });
  }

  if (!selectedGuardian) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle as="h2">Parent Portal Setup</CardTitle>
            <CardDescription>No parent or guardian profile is connected to this account. Contact your school office and ask them to review your Parent Portal access.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="secondary" className="mb-3">
            School invitation
          </Badge>
          <h1 className="text-3xl font-semibold tracking-normal">Finish Parent Portal Setup</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Review the family and school connected to this account, confirm your contact information, and choose the 4-digit PIN
            you will use at your school’s check-in kiosk.
          </p>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Parent setup steps">
        {setupSteps.map((step, index) => (
          <div key={step.title} className="rounded-lg border bg-card p-4">
            <div className="mb-3 grid size-8 place-items-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
              {index + 1}
            </div>
            <h2 className="text-sm font-semibold">{step.title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </section>

      {guardians.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose the parent or guardian profile to review">
          {guardians.map((guardian) => (
            <Button
              key={guardian.id}
              type="button"
              className="min-h-11"
              variant={guardian.id === selectedGuardian.id ? "default" : "outline"}
              aria-pressed={guardian.id === selectedGuardian.id}
              onClick={() => selectGuardian(guardian)}
            >
              {guardian.fullName}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-5">
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4 text-primary" />
              Your Family & School
            </h2>
            <div>
              <div className="text-sm text-muted-foreground">Family</div>
              <div className="font-medium">{selectedGuardian.familyName}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">School</div>
              <div className="font-medium">{selectedGuardian.centerName ?? "School not shown — contact your school office"}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Children</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {selectedGuardian.children.length ? (
                  selectedGuardian.children.map((child) => (
                    <Badge key={child.id} variant="outline">
                      {child.fullName}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No children are connected to this account. Contact your school office before continuing.</span>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="size-4 text-primary" />
              Add to Your Home Screen
            </h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Add the Parent Portal to your Home Screen for one-tap access. It uses the same sign-in and family information as
              the browser.
            </p>
            <ol className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              {homeScreenSteps.map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="font-semibold text-primary">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Home className="size-4 text-primary" />
              What’s in the Parent Portal
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {portalPreviews.map(({ title, meta, body, Icon }) => (
                <div key={title} className="rounded-lg border bg-background/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Icon className="size-4 text-primary" />
                      {title}
                    </div>
                    <Badge variant="outline">{meta}</Badge>
                  </div>
                  <div className="mt-3 rounded-md bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">{body}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg border bg-background/60 p-3 text-xs leading-5 text-muted-foreground">
              <CreditCard className="size-4 shrink-0 text-primary" />
              Billing tools only appear when your school has enabled parent payments for your family.
            </div>
          </section>
        </div>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <UserRound className="text-primary" />
              Confirm Your Information
            </CardTitle>
            <CardDescription>Review the contact information your school has connected to this account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit} aria-busy={isPending}>
              {status ? (
                <Alert role="status">
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

              <div className="rounded-lg border bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="size-4 text-primary" />
                  Parent login email
                </div>
                <div className="mt-2 break-words text-sm font-medium">{selectedGuardian.email ?? "No login email shown — contact your school office"}</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Use this email any time you sign in. If it is not correct, ask your school office to update the guardian email
                  before continuing.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="parent-setup-name">Full name</Label>
                  <Input id="parent-setup-name" name="fullName" className="h-11" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent-setup-phone">Mobile phone</Label>
                  <Input id="parent-setup-phone" name="phone" className="h-11" value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" inputMode="tel" autoComplete="tel" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent-setup-relation">Relationship</Label>
                  <Input id="parent-setup-relation" name="relation" className="h-11" value={relation} onChange={(event) => setRelation(event.target.value)} autoComplete="off" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent-setup-communication">Preferred contact method</Label>
                  <Input
                    id="parent-setup-communication"
                    name="preferredCommunication"
                    className="h-11"
                    value={preferredCommunication}
                    onChange={(event) => setPreferredCommunication(event.target.value)}
                    placeholder="Email, text message, or portal"
                    autoComplete="off"
                    aria-describedby="parent-setup-communication-help"
                  />
                  <p id="parent-setup-communication-help" className="text-xs leading-5 text-muted-foreground">
                    Your school can use this preference for routine communication. Choose detailed alert settings in Notifications after setup.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border bg-background/50 p-4">
                <Label htmlFor="parent-setup-pin" className="flex items-center gap-2">
                  <KeyRound className="size-4 text-primary" />
                  4-Digit Check-In PIN
                </Label>
                <Input
                  id="parent-setup-pin"
                  name="checkInPin"
                  className="mt-2 h-11 max-w-xs"
                  value={pin}
                  onChange={(event) => setPin(pinDigits(event.target.value))}
                  inputMode="numeric"
                  type="password"
                  autoComplete="one-time-code"
                  maxLength={4}
                  minLength={pin || !selectedGuardian.hasPin ? 4 : undefined}
                  pattern="[0-9]{4}"
                  required={!selectedGuardian.hasPin}
                  aria-describedby="parent-setup-pin-help"
                />
                <p id="parent-setup-pin-help" className="mt-2 text-xs leading-5 text-muted-foreground">
                  {selectedGuardian.hasPin
                    ? "A check-in PIN is already on file. Leave this blank to keep it, or enter a new 4-digit PIN that only authorized adults know."
                    : "Enter a 4-digit PIN that only authorized adults know. You will use it when checking a child in or out at your school’s kiosk."}
                </p>
              </div>

              <Button className="h-11" type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Finish Setup & Open Parent Portal"}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
