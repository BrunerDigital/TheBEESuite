"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type SignatureRequestFamilyOption = {
  id: string;
  name: string;
  billingEmail: string | null;
  guardians: Array<{ fullName: string; email: string | null }>;
  children: Array<{ id: string; fullName: string }>;
};

function firstFamilyEmail(family: SignatureRequestFamilyOption | undefined) {
  return family?.billingEmail || family?.guardians.find((guardian) => guardian.email)?.email || "";
}

export function SignatureRequestPanel({ families }: { families: SignatureRequestFamilyOption[] }) {
  const router = useRouter();
  const [familyId, setFamilyId] = useState(families[0]?.id ?? "");
  const selectedFamily = useMemo(() => families.find((family) => family.id === familyId), [families, familyId]);
  const [childId, setChildId] = useState("");
  const [name, setName] = useState("Policy Acknowledgment");
  const [type, setType] = useState("policy_acknowledgment");
  const [email, setEmail] = useState(firstFamilyEmail(selectedFamily));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function selectFamily(nextFamilyId: string | null) {
    if (!nextFamilyId) return;
    const family = families.find((item) => item.id === nextFamilyId);
    setFamilyId(nextFamilyId);
    setChildId("");
    setEmail(firstFamilyEmail(family));
  }

  function submit() {
    startTransition(async () => {
      setMessage("");
      setError("");
      const response = await fetch("/api/integrations/signature-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          childId: childId || undefined,
          name,
          type,
          email,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; document?: { id: string } } | null;
      if (!response.ok) {
        setError(json?.error || "Signature request could not be created.");
        return;
      }
      setMessage("Signature request sent to the parent portal.");
      router.refresh();
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine className="text-primary" />
          Request Parent Signature
        </CardTitle>
        <CardDescription>Create a parent portal signature request and notify the family.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? (
          <Alert>
            <AlertTitle>Sent</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Family</Label>
            <Select value={familyId} onValueChange={selectFamily}>
              <SelectTrigger><SelectValue placeholder="Choose family" /></SelectTrigger>
              <SelectContent>
                {families.map((family) => (
                  <SelectItem key={family.id} value={family.id}>{family.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Child</Label>
            <Select value={childId || "family"} onValueChange={(value) => setChildId(!value || value === "family" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Family-level document" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="family">Family-level document</SelectItem>
                {selectedFamily?.children.map((child) => (
                  <SelectItem key={child.id} value={child.id}>{child.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Document</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Input value={type} onChange={(event) => setType(event.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Recipient email</Label>
            <Input value={email} onChange={(event) => setEmail(event.target.value)} inputMode="email" />
          </div>
        </div>
        <Button disabled={isPending || !familyId || !name.trim()} onClick={submit}>
          <Send data-icon="inline-start" />
          Send Signature Request
        </Button>
      </CardContent>
    </Card>
  );
}
