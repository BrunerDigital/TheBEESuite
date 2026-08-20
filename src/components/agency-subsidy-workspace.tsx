"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { BadgeDollarSign, Building2, CheckCircle2, Download, FileCheck2, Printer, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { agencyProgramSetupBlockers } from "@/lib/agency-subsidy-billing";

type Program = { id: string; centerId: string; name: string; programName: string | null; stateCode: string; status: string; providerNumber: string | null; vendorNumber: string | null; submissionMethod: string; portalUrl: string | null; remittanceEmail: string | null; paymentInstructions: string | null; setupBlockers: string[] };
type Authorization = { id: string; centerId: string; agencyProgramId: string; familyId: string; childId: string; authorizationNumber: string; coverageStart: string; coverageEnd: string; authorizedRateCents: number; familyCopayCents: number; unitType: string; agencyProgram: { name: string; programName: string | null }; family: { name: string }; child: { fullName: string } };
type ClaimDocument = { id: string; name: string; status: string; notes: string | null };
type Claim = { id: string; number: string; status: string; claimedCents: number; approvedCents: number | null; paidCents: number; servicePeriodStart: string; servicePeriodEnd: string; agencyProgram: { name: string }; authorization: { child: { fullName: string }; family: { name: string } } | null; documents: ClaimDocument[] };
type Family = { id: string; centerId: string | null; name: string; children: Array<{ id: string; fullName: string }> };
type Workspace = { programs: Program[]; authorizations: Authorization[]; claims: Claim[]; families: Family[]; summary: { claimedCents: number; approvedCents: number; paidCents: number; outstandingCents: number; needsSubmission: number; missingDocumentClaims: number; readyPrograms: number; setupRequiredPrograms: number; expiredAuthorizations: number; expiringAuthorizations: number } };

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function dateOnly(value: string) { return value ? new Date(value).toLocaleDateString("en-US", { timeZone: "UTC" }) : "—"; }
function today() { return new Date().toISOString().slice(0, 10); }

export function AgencySubsidyWorkspace({ centers }: { centers: Array<{ id: string; name: string; state?: string | null }> }) {
  const [centerId, setCenterId] = useState(centers[0]?.id ?? "");
  const [data, setData] = useState<Workspace | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [setupProgramId, setSetupProgramId] = useState("new");
  const [programId, setProgramId] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [childId, setChildId] = useState("");
  const [authorizationId, setAuthorizationId] = useState("");

  const load = useCallback(async () => {
    if (!centerId) return;
    setPending(true); setError("");
    const response = await fetch(`/api/billing/agency-claims?centerId=${encodeURIComponent(centerId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error || "Agency billing workspace could not be loaded.");
    else setData(body);
    setPending(false);
  }, [centerId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/billing/agency-claims?centerId=${encodeURIComponent(centerId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok) setError(body.error || "Agency billing workspace could not be loaded.");
        else setData(body);
      })
      .catch(() => { if (active) setError("Agency billing workspace could not be loaded."); });
    return () => { active = false; };
  }, [centerId]);

  async function post(action: string, fields: Record<string, unknown>) {
    setPending(true); setError(""); setMessage("");
    const response = await fetch("/api/billing/agency-claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, centerId, ...fields }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError([body.error, ...(body.blockers ?? [])].filter(Boolean).join(" "));
    else { setMessage("Agency billing record saved."); await load(); }
    setPending(false);
    return response.ok;
  }

  const selectedFamily = data?.families.find((family) => family.id === familyId);
  const programs = data?.programs ?? [];
  const authorizations = data?.authorizations ?? [];
  const claims = data?.claims ?? [];
  const summary = data?.summary;
  const setupProgram = programs.find((program) => program.id === setupProgramId);
  const setupBlockers = setupProgram ? agencyProgramSetupBlockers(setupProgram) : [];
  const selectedChild = selectedFamily?.children.find((child) => child.id === childId) ?? null;
  const selectedChildAuthorizations = authorizations.filter((authorization) => (
    authorization.childId === childId
    && (!programId || authorization.agencyProgramId === programId)
  ));

  async function submitProgramSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const action = setupProgram ? "updateProgram" : "createProgram";
    const fields: Record<string, unknown> = {
      agencyProgramId: setupProgram?.id,
      name: form.get("name"),
      programName: form.get("programName"),
      stateCode: form.get("stateCode"),
      providerNumber: form.get("providerNumber"),
      vendorNumber: form.get("vendorNumber"),
      submissionMethod: form.get("submissionMethod"),
      portalUrl: form.get("portalUrl"),
      remittanceEmail: form.get("remittanceEmail"),
      paymentInstructions: form.get("paymentInstructions"),
    };
    if (!setupProgram) {
      fields.requirements = [
        { key: "attendance", label: "Attendance detail", type: "attendance", required: true },
        { key: "authorization", label: "Current authorization", type: "authorization", required: true },
      ];
    }
    const ok = await post(action, fields);
    if (ok && !setupProgram) {
      event.currentTarget.reset();
      setSetupProgramId("new");
    }
  }

  function toggleClaimDocument(claimId: string, document: ClaimDocument) {
    if (document.status === "verified") {
      void post("updateDocument", { claimId, documentId: document.id, status: "required" });
      return;
    }
    const notes = window.prompt(`Evidence note for ${document.name}`, document.notes ?? "");
    if (notes?.trim()) void post("updateDocument", { claimId, documentId: document.id, status: "verified", notes });
  }

  function markClaimSubmitted(claimId: string) {
    const externalReference = window.prompt("Enter the confirmation reference returned by the agency portal or submission channel");
    if (externalReference?.trim()) void post("submitClaim", { claimId, externalReference });
  }

  function recordClaimApproval(claim: Claim) {
    const approvedDollars = window.prompt("Agency-approved amount", String(claim.claimedCents / 100));
    if (approvedDollars === null) return;
    const approvedAmount = Number.parseFloat(approvedDollars.replace(/[$,]/g, ""));
    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
      setError("Approved amount must be greater than zero.");
      return;
    }
    const externalReference = window.prompt("Agency decision or claim reference");
    if (externalReference?.trim()) void post("recordDecision", { claimId: claim.id, decision: "approved", approvedDollars, externalReference });
  }

  function exportClaims() {
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Claim", "Agency", "Family", "Child", "Service start", "Service end", "Status", "Claimed", "Approved", "Paid", "Missing documents"],
      ...claims.map((claim) => [claim.number, claim.agencyProgram.name, claim.authorization?.family.name ?? "", claim.authorization?.child.fullName ?? "", claim.servicePeriodStart.slice(0, 10), claim.servicePeriodEnd.slice(0, 10), claim.status, (claim.claimedCents / 100).toFixed(2), claim.approvedCents === null ? "" : (claim.approvedCents / 100).toFixed(2), (claim.paidCents / 100).toFixed(2), claim.documents.filter((document) => !["received", "verified", "not_applicable"].includes(document.status)).map((document) => document.name).join("; ")]),
    ];
    const blob = new Blob([rows.map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href; anchor.download = `agency-claims-${centerId}-${today()}.csv`; anchor.click();
    URL.revokeObjectURL(href);
  }

  return (
    <section id="agency-subsidy-billing" className="space-y-4 scroll-mt-24">
      <Card className="glass-panel border-sky-500/30">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Badge className="mb-3"><Building2 data-icon="inline-start" /> Agency receivables</Badge>
              <CardTitle as="h2">Subsidy claims and agency invoices</CardTitle>
              <CardDescription className="mt-2 max-w-3xl">Keep government or third-party claims separate from family balances. Configure each payer, verify authorizations and supporting documents, submit through the approved agency channel, and reconcile ACH, check, or portal remittances.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => window.print()}><Printer data-icon="inline-start" /> Print</Button><Button variant="outline" onClick={exportClaims} disabled={!claims.length}><Download data-icon="inline-start" /> Export CSV</Button><Button variant="outline" onClick={() => void load()} disabled={pending}><RefreshCw data-icon="inline-start" /> Refresh</Button></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="max-w-md space-y-2"><Label>School</Label><Select value={centerId} onValueChange={(value) => { if (!value) return; setCenterId(value); setSetupProgramId("new"); setProgramId(""); setFamilyId(""); setChildId(""); setAuthorizationId(""); setData(null); setError(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{centers.map((center) => <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>)}</SelectContent></Select></div>
          {error ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          {message ? <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">{message}</p> : null}
          {summary ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[["Programs ready", `${summary.readyPrograms}/${summary.readyPrograms + summary.setupRequiredPrograms}`], ["Expired authorizations", summary.expiredAuthorizations], ["Expiring in 30 days", summary.expiringAuthorizations], ["Claimed", money(summary.claimedCents)], ["Approved", money(summary.approvedCents)], ["Paid", money(summary.paidCents)], ["Outstanding", money(summary.outstandingCents)], ["Needs submission", summary.needsSubmission], ["Missing documents", summary.missingDocumentClaims]].map(([label, value]) => <div key={label} className="rounded-lg border bg-background/50 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>)}
          </div> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card><CardHeader><CardTitle as="h3">1. Complete agency setup</CardTitle><CardDescription>Finish a preloaded program or add another school-specific payer. Never reuse another location&apos;s provider identity.</CardDescription></CardHeader><CardContent><div className="mb-3 space-y-2"><Label>Program to configure</Label><Select value={setupProgramId} onValueChange={(value) => value && setSetupProgramId(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">Add another program</SelectItem>{programs.map((program) => <SelectItem key={program.id} value={program.id}>{program.name}{program.programName ? ` · ${program.programName}` : ""}</SelectItem>)}</SelectContent></Select></div>{setupProgram ? <div className="mb-3 rounded-lg border bg-background/50 p-3 text-sm"><div className="flex items-center gap-2"><Badge variant={setupBlockers.length ? "outline" : "default"}>{setupBlockers.length ? "Setup required" : "Ready"}</Badge><span>{setupBlockers.length ? `${setupBlockers.length} item${setupBlockers.length === 1 ? "" : "s"} remaining` : "Provider and payment setup documented"}</span></div>{setupBlockers.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{setupBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}</div> : null}<form key={`${centerId}:${setupProgramId}`} className="space-y-3" onSubmit={submitProgramSetup}>
          <div><Label htmlFor="agency-name">Agency payer</Label><Input id="agency-name" name="name" required placeholder="Indiana FSSA / local subsidy office" defaultValue={setupProgram?.name ?? ""} /></div>
          <div><Label htmlFor="agency-program">Program</Label><Input id="agency-program" name="programName" placeholder="CCDF" defaultValue={setupProgram?.programName ?? ""} /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="agency-state">State</Label><Input id="agency-state" name="stateCode" maxLength={2} required defaultValue={setupProgram?.stateCode ?? centers.find((center) => center.id === centerId)?.state ?? ""} /></div><div><Label htmlFor="agency-provider">Provider #</Label><Input id="agency-provider" name="providerNumber" defaultValue={setupProgram?.providerNumber ?? ""} /></div></div>
          <div><Label htmlFor="agency-vendor">Vendor/payee #</Label><Input id="agency-vendor" name="vendorNumber" defaultValue={setupProgram?.vendorNumber ?? ""} /></div>
          <div><Label htmlFor="agency-method">Submission method</Label><select id="agency-method" name="submissionMethod" defaultValue={setupProgram?.submissionMethod ?? "agency_portal"} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="agency_portal">Agency portal</option><option value="secure_email">Secure email</option><option value="edi">EDI/API</option><option value="paper">Paper/mail</option></select></div>
          <div><Label htmlFor="agency-portal">Official portal or instructions URL</Label><Input id="agency-portal" name="portalUrl" type="url" defaultValue={setupProgram?.portalUrl ?? ""} /></div>
          <div><Label htmlFor="agency-remittance-email">Agency remittance contact</Label><Input id="agency-remittance-email" name="remittanceEmail" type="email" defaultValue={setupProgram?.remittanceEmail ?? ""} /></div>
          <div><Label htmlFor="agency-payment-setup">Verified payment setup</Label><Input id="agency-payment-setup" name="paymentInstructions" defaultValue={setupProgram?.paymentInstructions ?? ""} placeholder="Direct deposit active in agency payment vendor; verified 2026-08-__" /></div>
          <Button type="submit" disabled={pending}>{setupProgram ? "Update agency setup" : "Save agency program"}</Button>
        </form></CardContent></Card>

        <Card><CardHeader><CardTitle as="h3">2. Record authorization</CardTitle><CardDescription>Bind one child, family, payer, coverage period, rate, and copay. Switching children clears the new-authorization fields.</CardDescription></CardHeader><CardContent><form key={`${centerId}:${programId}:${familyId}:${childId}`} className="space-y-3" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const ok = await post("createAuthorization", { agencyProgramId: programId, familyId, childId, authorizationNumber: form.get("authorizationNumber"), coverageStart: form.get("coverageStart"), coverageEnd: form.get("coverageEnd"), authorizedRateDollars: form.get("authorizedRateDollars"), familyCopayDollars: form.get("familyCopayDollars"), unitType: form.get("unitType") }); if (ok) event.currentTarget.reset(); }}>
          <div><Label>Agency program</Label><Select value={programId} onValueChange={(value) => value && setProgramId(value)}><SelectTrigger><SelectValue placeholder="Choose a completed agency setup" /></SelectTrigger><SelectContent>{programs.map((program) => { const blocked = agencyProgramSetupBlockers(program).length > 0; return <SelectItem key={program.id} value={program.id} disabled={blocked}>{program.name}{program.programName ? ` · ${program.programName}` : ""}{blocked ? " · setup required" : ""}</SelectItem>; })}</SelectContent></Select></div>
          <div><Label>Family</Label><Select value={familyId} onValueChange={(value) => { setFamilyId(value ?? ""); setChildId(""); }}><SelectTrigger><SelectValue placeholder="Choose family" /></SelectTrigger><SelectContent>{data?.families.map((family) => <SelectItem key={family.id} value={family.id}>{family.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Child</Label><Select value={childId} onValueChange={(value) => value && setChildId(value)}><SelectTrigger><SelectValue placeholder="Choose child" /></SelectTrigger><SelectContent>{selectedFamily?.children.map((child) => <SelectItem key={child.id} value={child.id}>{child.fullName}</SelectItem>)}</SelectContent></Select></div>
          {selectedChild ? <div className="rounded-lg border bg-background/50 p-3" aria-live="polite">
            <div className="text-sm font-medium">Saved authorization{selectedChildAuthorizations.length === 1 ? "" : "s"} for {selectedChild.fullName}</div>
            {selectedChildAuthorizations.length ? <div className="mt-2 space-y-2">
              {selectedChildAuthorizations.map((authorization) => <div key={authorization.id} className="rounded-md border bg-muted/20 p-2 text-xs">
                <div className="font-medium">{money(authorization.authorizedRateCents)} / {authorization.unitType}</div>
                <div className="mt-1 text-muted-foreground">{authorization.agencyProgram.name} · {authorization.authorizationNumber} · {dateOnly(authorization.coverageStart)} – {dateOnly(authorization.coverageEnd)}</div>
                <div className="text-muted-foreground">Family copay: {money(authorization.familyCopayCents)}</div>
              </div>)}
            </div> : <p className="mt-1 text-xs text-muted-foreground">No saved authorization for this child and agency program. The blank fields below create a new one.</p>}
          </div> : null}
          <div><Label htmlFor="auth-number">Authorization #</Label><Input id="auth-number" name="authorizationNumber" required /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Start</Label><Input name="coverageStart" type="date" required /></div><div><Label>End</Label><Input name="coverageEnd" type="date" required /></div></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Agency rate</Label><Input name="authorizedRateDollars" inputMode="decimal" required placeholder="250.00" /></div><div><Label>Family copay</Label><Input name="familyCopayDollars" inputMode="decimal" placeholder="0.00" /></div></div>
          <div><Label>Rate unit</Label><select name="unitType" className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="weekly">Weekly</option><option value="daily">Daily</option><option value="hourly">Hourly</option><option value="monthly">Monthly</option></select></div>
          <Button type="submit" disabled={pending || !programId || !familyId || !childId}>Save authorization</Button>
        </form></CardContent></Card>

        <Card><CardHeader><CardTitle as="h3">3. Build agency claim</CardTitle><CardDescription>Create a separate agency invoice with its required-document checklist.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const ok = await post("createClaim", { authorizationId, servicePeriodStart: form.get("servicePeriodStart"), servicePeriodEnd: form.get("servicePeriodEnd"), dueDate: form.get("dueDate"), serviceUnits: form.get("serviceUnits"), rateDollars: form.get("rateDollars"), attendanceDays: form.get("attendanceDays") }); if (ok) event.currentTarget.reset(); }}>
          <div><Label>Authorization</Label><Select value={authorizationId} onValueChange={(value) => value && setAuthorizationId(value)}><SelectTrigger><SelectValue placeholder="Choose authorization" /></SelectTrigger><SelectContent>{authorizations.map((authorization) => <SelectItem key={authorization.id} value={authorization.id}>{authorization.child.fullName} · {money(authorization.authorizedRateCents)}/{authorization.unitType} · {authorization.authorizationNumber}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Service start</Label><Input name="servicePeriodStart" type="date" required /></div><div><Label>Service end</Label><Input name="servicePeriodEnd" type="date" required /></div></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Units</Label><Input name="serviceUnits" inputMode="decimal" required defaultValue="1" /></div><div><Label>Override rate</Label><Input name="rateDollars" inputMode="decimal" placeholder="Uses authorization" /></div></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Attendance days</Label><Input name="attendanceDays" type="number" min="0" /></div><div><Label>Claim due</Label><Input name="dueDate" type="date" /></div></div>
          <Button type="submit" disabled={pending || !authorizationId}>Create draft claim</Button>
        </form></CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle as="h3">Agency claim queue</CardTitle><CardDescription>Document readiness, manual portal submission, decisions, and remittances are tracked independently from parent billing.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Claim</TableHead><TableHead>Agency / child</TableHead><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead>Amount</TableHead><TableHead>Documents</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>
        {claims.map((claim) => { const incomplete = claim.documents.filter((document) => !["received", "verified", "not_applicable"].includes(document.status)); return <TableRow key={claim.id}><TableCell className="font-medium">{claim.number}</TableCell><TableCell>{claim.agencyProgram.name}<div className="text-xs text-muted-foreground">{claim.authorization?.child.fullName ?? "No child"}</div></TableCell><TableCell>{dateOnly(claim.servicePeriodStart)} – {dateOnly(claim.servicePeriodEnd)}</TableCell><TableCell><Badge variant="outline">{claim.status.replaceAll("_", " ")}</Badge></TableCell><TableCell>{money(claim.claimedCents)}<div className="text-xs text-muted-foreground">Paid {money(claim.paidCents)}</div></TableCell><TableCell>{incomplete.length ? <div className="space-y-1">{claim.documents.map((document) => <button key={document.id} type="button" className="block text-left text-xs underline-offset-2 hover:underline" onClick={() => toggleClaimDocument(claim.id, document)}>{document.status === "verified" ? "✓" : "○"} {document.name}</button>)}</div> : <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><FileCheck2 className="size-4" /> Complete</span>}</TableCell><TableCell><div className="flex flex-wrap gap-2">
          {claim.status === "draft" ? <Button size="sm" variant="outline" onClick={() => markClaimSubmitted(claim.id)}>Mark submitted</Button> : null}
          {claim.status === "submitted" ? <Button size="sm" variant="outline" onClick={() => recordClaimApproval(claim)}><CheckCircle2 data-icon="inline-start" /> Record approval</Button> : null}
          {["approved", "partially_paid"].includes(claim.status) ? <Button size="sm" onClick={() => { const amount = window.prompt("Remittance amount", String(((claim.approvedCents ?? claim.claimedCents) - claim.paidCents) / 100)); const reference = amount ? window.prompt("ACH/check/portal reference") : null; if (amount && reference) void post("recordRemittance", { claimId: claim.id, amountDollars: amount, externalReference: reference, paidAt: today(), paymentMethod: "ach" }); }}><BadgeDollarSign data-icon="inline-start" /> Record payment</Button> : null}
        </div></TableCell></TableRow>; })}
        {!claims.length ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No agency claims for this school yet.</TableCell></TableRow> : null}
      </TableBody></Table></div></CardContent></Card>
    </section>
  );
}
