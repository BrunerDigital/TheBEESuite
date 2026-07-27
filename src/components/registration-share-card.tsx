"use client";

import { useState, useTransition } from "react";
import { ArrowUpRight, CheckCircle2, Clipboard, Mail, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type RegistrationShareCardProps = {
  centerId: string;
  schoolLabel: string;
  registrationUrl: string;
};

type SendResult = {
  ok?: boolean;
  emailsQueued?: number;
  registrationUrl?: string;
  error?: string;
  invalidEmails?: string[];
};

export function RegistrationShareCard({
  centerId,
  schoolLabel,
  registrationUrl,
}: RegistrationShareCardProps) {
  const [recipientInput, setRecipientInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [isPending, startTransition] = useTransition();

  async function copyRegistrationLink() {
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setCopied(true);
      setResult(null);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setResult({ error: "The link could not be copied automatically. Select the link below and copy it manually." });
    }
  }

  function sendRegistrationEmail() {
    setResult(null);
    startTransition(async () => {
      const response = await fetch("/api/registration/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId, emails: recipientInput }),
      });
      const json = await response.json().catch(() => null) as SendResult | null;
      if (!response.ok || !json?.ok) {
        setResult(json ?? { error: "The registration email could not be sent." });
        return;
      }
      setRecipientInput("");
      setResult(json);
    });
  }

  return (
    <Card className="glass-panel border-emerald-500/25">
      <CardHeader>
        <Badge variant="secondary" className="w-fit">
          School-specific registration
        </Badge>
        <CardTitle className="flex items-center gap-2">
          <Mail className="text-emerald-400" />
          Share registration for {schoolLabel}
        </CardTitle>
        <CardDescription>
          Email this school&apos;s registration and enrollment packet to one or more families, or copy the same locked school link to share elsewhere.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result?.ok ? (
          <Alert className="border-emerald-500/30 bg-emerald-500/10" aria-live="polite">
            <CheckCircle2 className="size-4" />
            <AlertTitle>Email queued</AlertTitle>
            <AlertDescription>
              The school-specific registration link was accepted for {result.emailsQueued ?? 0} {result.emailsQueued === 1 ? "email address" : "email addresses"}.
            </AlertDescription>
          </Alert>
        ) : null}
        {result?.error ? (
          <Alert variant="destructive" aria-live="polite">
            <Mail className="size-4" />
            <AlertTitle>Registration email not sent</AlertTitle>
            <AlertDescription>
              {result.error}
              {result.invalidEmails?.length ? ` Check: ${result.invalidEmails.join(", ")}.` : ""}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor={`registration-emails-${centerId}`}>Family email address(es)</Label>
          <Textarea
            id={`registration-emails-${centerId}`}
            value={recipientInput}
            onChange={(event) => setRecipientInput(event.target.value)}
            placeholder="parent@example.com, guardian@example.com"
            className="min-h-24"
            disabled={isPending}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Separate multiple addresses with commas, spaces, semicolons, or new lines. Each recipient receives the same {schoolLabel} link.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={sendRegistrationEmail} disabled={isPending || !recipientInput.trim()}>
            <Send data-icon="inline-start" />
            {isPending ? "Sending…" : "Send registration form"}
          </Button>
          <Button type="button" variant="outline" onClick={copyRegistrationLink}>
            {copied ? <CheckCircle2 data-icon="inline-start" /> : <Clipboard data-icon="inline-start" />}
            {copied ? "Link copied" : "Copy registration link"}
          </Button>
          <Button
            variant="ghost"
            nativeButton={false}
            render={<a href={registrationUrl} target="_blank" rel="noreferrer" />}
          >
            Preview form
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/45 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Linked registration form</p>
          <p className="break-all font-mono text-xs leading-5">{registrationUrl}</p>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          This is separate from the public inquiry form. Inquiry collects interest and lets a family choose a location; this registration link is locked to {schoolLabel} and routes submitted packets back to its director workflow.
        </p>
      </CardContent>
    </Card>
  );
}
