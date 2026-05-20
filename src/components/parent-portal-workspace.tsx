"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, CreditCard, FileText, MessageSquare, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Child = {
  id: string;
  fullName: string;
  ageGroup: string;
  enrollmentStatus: string;
};

type Invoice = {
  id: string;
  number: string;
  status: string;
  dueDate: string | Date;
  totalCents: number;
};

type DailyReport = {
  id: string;
  date: string | Date;
  mood: string | null;
  teacherNote: string | null;
  suppliesNeeded: string | null;
  child: { fullName: string };
};

type Incident = {
  id: string;
  occurredAt: string | Date;
  type: string;
  description: string;
  actionTaken: string;
  parentAcknowledgedAt: string | Date | null;
  child: { fullName: string };
};

type PortalFamily = {
  id: string;
  name: string;
  billingEmail: string | null;
  guardians: Array<{ fullName: string; email: string | null; phone: string | null }>;
  children: Child[];
};

type Props = {
  family: PortalFamily | null;
  invoices: Invoice[];
  dailyReports: DailyReport[];
  incidents: Incident[];
  messages: Array<{ id: string; subject: string | null; body: string; createdAt: string | Date }>;
  documents: Array<{ id: string; name: string; type: string; status: string; expiresAt: string | Date | null }>;
  media?: Array<{ id: string; url: string; caption: string | null; createdAt: string | Date; child: { fullName: string } }>;
  demoMode?: boolean;
};

function formatDate(value: string | Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function ParentPortalWorkspace({ family, invoices, dailyReports, incidents, messages, documents, media = [], demoMode }: Props) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("Question for the center");
  const [message, setMessage] = useState("");
  const [requestDetails, setRequestDetails] = useState("");
  const [isPending, startTransition] = useTransition();

  const openInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === "OPEN"), [invoices]);
  const unacknowledged = useMemo(() => incidents.filter((incident) => !incident.parentAcknowledgedAt), [incidents]);

  function showStatus(next: string) {
    setError("");
    setStatus(next);
  }

  function showError(next: string) {
    setStatus("");
    setError(next);
  }

  function sendMessage() {
    if (!family) return;
    startTransition(async () => {
      const response = await fetch("/api/communications/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: family.id,
          subject,
          message,
          priority: "normal",
          sendEmailCopy: true,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return showError(json?.error || "Message could not be sent.");
      setMessage("");
      showStatus("Message sent to the center and recorded in the family timeline.");
    });
  }

  function requestContactUpdate() {
    if (!family) return;
    startTransition(async () => {
      const response = await fetch("/api/parent/contact-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: family.id,
          requestType: "Emergency contact / authorized pickup update",
          details: requestDetails,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return showError(json?.error || "Request could not be submitted.");
      setRequestDetails("");
      showStatus("Update request sent for director review.");
    });
  }

  function acknowledgeIncident(incidentId: string) {
    startTransition(async () => {
      const response = await fetch(`/api/parent/incidents/${incidentId}/acknowledge`, { method: "POST" });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) return showError(json?.error || "Incident could not be acknowledged.");
      showStatus("Incident acknowledgment recorded.");
    });
  }

  function payInvoice(invoiceId: string) {
    startTransition(async () => {
      const response = await fetch("/api/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const json = await response.json().catch(() => null) as { error?: string; url?: string; configured?: boolean } | null;
      if (!response.ok || !json?.url) {
        return showError(json?.error || "Payment checkout is not configured yet.");
      }
      window.location.href = json.url;
    });
  }

  if (!family) {
    return (
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Parent Portal</CardTitle>
          <CardDescription>No family profile is connected to this account yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <ShieldCheck data-icon="inline-start" />
          Family portal
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">{family.name}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Daily reports, invoices, messages, documents, and director-reviewed update requests for your family.
        </p>
      </section>

      {demoMode ? (
        <Alert className="border-primary/30 bg-primary/10">
          <ShieldCheck className="size-4" />
          <AlertTitle>Executive demo data</AlertTitle>
          <AlertDescription>
            This parent portal sample is visible only to executive roles and is not saved as live family data.
          </AlertDescription>
        </Alert>
      ) : null}

      {status ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Done</AlertTitle>
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

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-panel"><CardHeader><CardDescription>Children</CardDescription><CardTitle>{family.children.length}</CardTitle></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardDescription>Open invoices</CardDescription><CardTitle>{openInvoices.length}</CardTitle></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardDescription>Reports</CardDescription><CardTitle>{dailyReports.length}</CardTitle></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardDescription>Need acknowledgment</CardDescription><CardTitle>{unacknowledged.length}</CardTitle></CardHeader></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>Stripe Checkout is used when platform keys and the school payout account are ready.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/40 p-4">
                <div>
                  <div className="font-medium">{invoice.number}</div>
                  <div className="text-xs text-muted-foreground">Due {formatDate(invoice.dueDate)}</div>
                </div>
                <Badge variant={invoice.status === "OPEN" ? "outline" : "default"}>{invoice.status}</Badge>
                <div className="text-lg font-semibold">{money(invoice.totalCents)}</div>
                <Button disabled={isPending || invoice.status !== "OPEN"} onClick={() => payInvoice(invoice.id)}>
                  <CreditCard data-icon="inline-start" />
                  Pay
                </Button>
              </div>
            ))}
            {!invoices.length ? <p className="text-sm text-muted-foreground">No invoices are visible yet.</p> : null}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Message the Center</CardTitle>
            <CardDescription>Messages are logged and routed to center leadership.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="portal-subject">Subject</Label>
              <Input id="portal-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="portal-message">Message</Label>
              <Textarea id="portal-message" value={message} onChange={(event) => setMessage(event.target.value)} />
            </div>
            <Button disabled={isPending || !message.trim()} onClick={sendMessage}>
              <MessageSquare data-icon="inline-start" />
              Send Message
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Photos and Moments</CardTitle>
            <CardDescription>Teacher-shared classroom photos for this family.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {media.slice(0, 8).map((item) => (
              <div key={item.id} className="overflow-hidden rounded-xl border bg-background/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.caption || `${item.child.fullName} classroom moment`} className="aspect-video w-full object-cover" />
                <div className="p-3">
                  <div className="text-sm font-medium">{item.child.fullName}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.caption || formatDate(item.createdAt)}</p>
                </div>
              </div>
            ))}
            {!media.length ? <p className="text-sm text-muted-foreground">No shared photos have been added yet.</p> : null}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Daily Reports</CardTitle>
            <CardDescription>Recent teacher notes and care details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dailyReports.map((report) => (
              <div key={report.id} className="rounded-xl border bg-background/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{report.child.fullName}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(report.date)}</div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{report.teacherNote ?? report.mood ?? "No teacher note added."}</p>
                {report.suppliesNeeded ? <Badge className="mt-3" variant="outline">Needs {report.suppliesNeeded}</Badge> : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Documents and Requests</CardTitle>
            <CardDescription>Director-reviewed changes protect child safety data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {documents.slice(0, 5).map((document) => (
              <div key={document.id} className="flex items-center justify-between gap-3 rounded-xl border bg-background/40 p-3">
                <div>
                  <div className="font-medium">{document.name}</div>
                  <div className="text-xs text-muted-foreground">{document.type} · expires {formatDate(document.expiresAt)}</div>
                </div>
                <Badge>{document.status}</Badge>
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="contact-request">Request an emergency contact or pickup change</Label>
              <Textarea id="contact-request" value={requestDetails} onChange={(event) => setRequestDetails(event.target.value)} />
              <Button disabled={isPending || !requestDetails.trim()} onClick={requestContactUpdate}>
                <FileText data-icon="inline-start" />
                Submit Request
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Recent Messages</CardTitle>
          <CardDescription>Family communication timeline</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.slice(0, 5).map((item) => (
            <div key={item.id} className="rounded-xl border bg-background/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{item.subject ?? "Portal message"}</div>
                <div className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
          {!messages.length ? <p className="text-sm text-muted-foreground">No messages have been recorded yet.</p> : null}
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Incident Acknowledgments</CardTitle>
          <CardDescription>Review and acknowledge center-shared incident documentation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {incidents.map((incident) => (
            <div key={incident.id} className="rounded-xl border bg-background/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{incident.type} · {incident.child.fullName}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(incident.occurredAt)}</div>
                </div>
                {incident.parentAcknowledgedAt ? <Badge> Acknowledged</Badge> : <Button disabled={isPending} onClick={() => acknowledgeIncident(incident.id)}>Acknowledge</Button>}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{incident.description} Action: {incident.actionTaken}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
