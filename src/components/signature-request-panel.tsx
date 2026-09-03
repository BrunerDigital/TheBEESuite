"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/workspace-preferences";
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
  const controlPrefix = useId();
  const controlIds = {
    family: `${controlPrefix}-family`,
    child: `${controlPrefix}-child`,
    document: `${controlPrefix}-document`,
    type: `${controlPrefix}-type`,
    email: `${controlPrefix}-email`,
  };
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
    <CollapsibleCard
      id="document-signature-request"
      title={<span className="flex items-center gap-2"><PenLine className="text-primary" />Request parent signature</span>}
      description="Create a parent portal signature request and notify the family."
      collapsedSummary={`${families.length} ${families.length === 1 ? "family" : "families"} available`}
      contentClassName="space-y-4"
      defaultCollapsed
    >
      <div aria-busy={isPending} className="contents">
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
            <Label htmlFor={controlIds.family}>Family</Label>
            <Select value={familyId} onValueChange={selectFamily}>
              <SelectTrigger id={controlIds.family}><SelectValue placeholder="Choose family" /></SelectTrigger>
              <SelectContent>
                {families.map((family) => (
                  <SelectItem key={family.id} value={family.id}>{family.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={controlIds.child}>Child</Label>
            <Select value={childId || "family"} onValueChange={(value) => setChildId(!value || value === "family" ? "" : value)}>
              <SelectTrigger id={controlIds.child}><SelectValue placeholder="Family-level document" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="family">Family-level document</SelectItem>
                {selectedFamily?.children.map((child) => (
                  <SelectItem key={child.id} value={child.id}>{child.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={controlIds.document}>Document</Label>
            <Input id={controlIds.document} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={controlIds.type}>Type</Label>
            <Input id={controlIds.type} value={type} onChange={(event) => setType(event.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor={controlIds.email}>Recipient email</Label>
            <Input id={controlIds.email} value={email} onChange={(event) => setEmail(event.target.value)} type="email" inputMode="email" />
          </div>
        </div>
        <Button disabled={isPending || !familyId || !name.trim()} onClick={submit} aria-busy={isPending}>
          <Send data-icon="inline-start" />
          {isPending ? "Sending request..." : "Send Signature Request"}
        </Button>
      </div>
    </CollapsibleCard>
  );
}
