"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SetupGuardian = {
  id: string;
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
      const response = await fetch("/api/parent/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardianId: selectedGuardian.id,
          fullName,
          phone,
          relation,
          preferredCommunication,
          pin,
        }),
      });
      const data = (await response.json().catch(() => null)) as SetupResponse | null;

      if (!response.ok) {
        setError(data?.error ?? "Parent portal setup could not be saved.");
        return;
      }

      setStatus("Your parent portal setup is complete.");
      setTimeout(() => {
        router.push("/parent-portal");
        router.refresh();
      }, 900);
    });
  }

  if (!selectedGuardian) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Parent Portal Setup</CardTitle>
            <CardDescription>No guardian profile is linked to this login yet. Please contact the school office.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="secondary" className="mb-3">
            Parent portal invite
          </Badge>
          <h1 className="text-3xl font-semibold tracking-normal">Confirm Parent Portal Setup</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Confirm the guardian details connected to this login and create the 4 digit PIN used for lobby sign-in and sign-out.
          </p>
        </div>
        <Button variant="outline" nativeButton={false} render={<Link href="/parent-portal" />}>
          Skip to portal
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>

      {guardians.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {guardians.map((guardian) => (
            <Button
              key={guardian.id}
              type="button"
              variant={guardian.id === selectedGuardian.id ? "default" : "outline"}
              onClick={() => selectGuardian(guardian)}
            >
              {guardian.fullName}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" />
            Family access
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Family</div>
            <div className="font-medium">{selectedGuardian.familyName}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">School</div>
            <div className="font-medium">{selectedGuardian.centerName ?? "School record pending"}</div>
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
                <span className="text-sm text-muted-foreground">Child records are still being prepared.</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Login email</div>
            <div className="font-medium">{selectedGuardian.email ?? "Email pending"}</div>
          </div>
        </section>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="text-primary" />
              Guardian Details
            </CardTitle>
            <CardDescription>These details are used by school staff and the check-in kiosk.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="parent-setup-name">Full name</Label>
                  <Input id="parent-setup-name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent-setup-phone">Mobile phone</Label>
                  <Input id="parent-setup-phone" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent-setup-relation">Relationship</Label>
                  <Input id="parent-setup-relation" value={relation} onChange={(event) => setRelation(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent-setup-communication">Preferred communication</Label>
                  <Input
                    id="parent-setup-communication"
                    value={preferredCommunication}
                    onChange={(event) => setPreferredCommunication(event.target.value)}
                    placeholder="email, sms, or portal"
                  />
                </div>
              </div>

              <div className="rounded-lg border bg-background/50 p-4">
                <Label htmlFor="parent-setup-pin" className="flex items-center gap-2">
                  <KeyRound className="size-4 text-primary" />
                  4 digit check-in PIN
                </Label>
                <Input
                  id="parent-setup-pin"
                  className="mt-2 max-w-xs"
                  value={pin}
                  onChange={(event) => setPin(pinDigits(event.target.value))}
                  inputMode="numeric"
                  type="password"
                  autoComplete="one-time-code"
                  placeholder={selectedGuardian.hasPin ? "Optional reset PIN" : "Required"}
                  required={!selectedGuardian.hasPin}
                />
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {selectedGuardian.hasPin
                    ? "A kiosk PIN is already on file. Enter a new one only if you want to reset it."
                    : "This PIN is required before you can sign a child in or out from the lobby kiosk."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Finish setup"}
                  <ArrowRight data-icon="inline-end" />
                </Button>
                <Button variant="outline" nativeButton={false} render={<Link href="/parent-portal" />}>
                  Open parent portal
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
