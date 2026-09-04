"use client";

import { type FormEvent, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FileClock, Landmark, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { CollapsibleCard } from "@/components/workspace-preferences";

type Program = { id: string; name: string; programName: string | null };
type Claim = { id: string; number: string; status: string; claimedCents: number; approvedCents: number | null; paidCents: number; agencyProgram: { id: string; name: string }; authorization: { child: { fullName: string }; family: { name: string } } | null };
type Account = { id: string; agencyProgram: { name: string; programName: string | null }; balanceCents: number };
type Allocation = { id: string; claimId: string; amountCents: number; status: string; requestedById: string; reviewedAt: string | null; claim: Claim };
type Batch = { id: string; agencyProgramId: string; externalReference: string; paidAt: string; paymentMethod: string; totalCents: number; allocatedCents: number; unappliedCents: number; status: string; notes: string | null; evidenceName: string | null; evidenceReference: string | null; enteredById: string; followUpOwnerId: string | null; followUpDueAt: string | null; reviewedAt: string | null; reversedAt: string | null; agencyProgram: Program; allocations: Allocation[] };
type Adjustment = { id: string; ledgerAccountId: string; type: string; amountCents: number; effectiveAt: string; status: string; reason: string; evidenceName: string | null; evidenceReference: string | null; requestedById: string; followUpOwnerId: string | null; followUpDueAt: string | null; reviewedAt: string | null; claim: { number: string } | null; agencyProgram: Program };
type Period = { id: string; name: string; startDate: string; endDate: string; status: string; closeReason: string | null; reopenedAt: string | null };
type ReconciliationRow = { agencyLedgerAccountId: string; agency: { name: string; programName: string | null }; approvedCents: number; remittedCents: number; unappliedCents: number; adjustmentCents: number; expectedBalanceCents: number; ledgerBalanceCents: number; varianceCents: number };
type Aging = { current: number; days_1_30: number; days_31_60: number; days_61_90: number; days_91_plus: number };

type Props = {
  programs: Program[];
  claims: Claim[];
  accounts: Account[];
  batches: Batch[];
  adjustments: Adjustment[];
  periods: Period[];
  reconciliation: ReconciliationRow[];
  aging: Aging;
  capabilities: { currentUserId: string; canReviewAgencyPosting: boolean; canCloseAccountingPeriod: boolean };
  readOnly: boolean;
  pending: boolean;
  post: (action: string, fields: Record<string, unknown>) => Promise<boolean>;
};

type AllocationDraft = { key: string; claimId: string; amountDollars: string };

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function dateOnly(value: string) { return value ? new Date(value).toLocaleDateString("en-US", { timeZone: "UTC" }) : "—"; }
function today() { return new Date().toISOString().slice(0, 10); }
function followUpDate() { const value = new Date(); value.setUTCDate(value.getUTCDate() + 7); return value.toISOString().slice(0, 10); }
function idempotencyKey() { return globalThis.crypto?.randomUUID?.() ?? `agency-batch-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

function statusVariant(status: string): "default" | "outline" | "secondary" | "destructive" {
  if (status === "reconciled" || status === "posted" || status === "closed") return "default";
  if (status === "exception" || status === "reversed" || status === "rejected") return "destructive";
  if (status === "pending_review") return "secondary";
  return "outline";
}

export function AgencyReconciliationControls({ programs, claims, accounts, batches, adjustments, periods, reconciliation, aging, capabilities: suppliedCapabilities, readOnly, pending, post }: Props) {
  const capabilities = readOnly ? { ...suppliedCapabilities, canReviewAgencyPosting: false, canCloseAccountingPeriod: false } : suppliedCapabilities;
  const canReviewRequest = (requestedById: string) => capabilities.canReviewAgencyPosting && capabilities.currentUserId !== requestedById;
  const [batchProgramId, setBatchProgramId] = useState(programs[0]?.id ?? "");
  const [batchKey, setBatchKey] = useState(idempotencyKey);
  const [allocationDrafts, setAllocationDrafts] = useState<AllocationDraft[]>([{ key: idempotencyKey(), claimId: "", amountDollars: "" }]);
  const [allocationClaimByBatch, setAllocationClaimByBatch] = useState<Record<string, string>>({});
  const [adjustmentAccountId, setAdjustmentAccountId] = useState(accounts[0]?.id ?? "");
  const [adjustmentType, setAdjustmentType] = useState("write_off");
  const availableClaims = useMemo(() => claims.filter((claim) => ["approved", "partially_paid"].includes(claim.status)), [claims]);
  const selectedBatchProgram = programs.find((program) => program.id === batchProgramId);
  const batchClaims = availableClaims.filter((claim) => claim.agencyProgram.id === selectedBatchProgram?.id);
  const selectedAdjustmentAccount = accounts.find((account) => account.id === adjustmentAccountId);

  async function prepareBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const allocations = allocationDrafts.filter((row) => row.claimId && Number(row.amountDollars) > 0).map((row) => ({ claimId: row.claimId, amountDollars: row.amountDollars }));
    const ok = await post("prepareRemittanceBatch", {
      agencyProgramId: batchProgramId,
      idempotencyKey: batchKey,
      externalReference: form.get("externalReference"),
      totalDollars: form.get("totalDollars"),
      paidAt: form.get("paidAt"),
      paymentMethod: form.get("paymentMethod"),
      evidenceName: form.get("evidenceName"),
      evidenceReference: form.get("evidenceReference"),
      followUpDueAt: form.get("followUpDueAt"),
      notes: form.get("notes"),
      allocations,
    });
    if (ok) {
      formElement.reset();
      setBatchKey(idempotencyKey());
      setAllocationDrafts([{ key: idempotencyKey(), claimId: "", amountDollars: "" }]);
    }
  }

  async function requestAdditionalAllocation(event: FormEvent<HTMLFormElement>, batch: Batch) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await post("requestBatchAllocation", { batchId: batch.id, claimId: allocationClaimByBatch[batch.id], amountDollars: form.get("amountDollars"), notes: form.get("notes") });
    if (ok) setAllocationClaimByBatch((current) => ({ ...current, [batch.id]: "" }));
  }

  async function requestAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const ok = await post("requestLedgerAdjustment", { ledgerAccountId: adjustmentAccountId, adjustmentType, amountDollars: form.get("amountDollars"), effectiveAt: form.get("effectiveAt"), reason: form.get("reason"), evidenceName: form.get("evidenceName"), evidenceReference: form.get("evidenceReference"), followUpDueAt: form.get("followUpDueAt") });
    if (ok) formElement.reset();
  }

  return <div className="space-y-4">
    <CollapsibleCard id="agency-reconciliation" title="Agency reconciliation" description="Three-way control across approved claims, deposit batches, and the immutable agency ledger." collapsedSummary={`${reconciliation.filter((row) => row.varianceCents !== 0).length} variance${reconciliation.filter((row) => row.varianceCents !== 0).length === 1 ? "" : "s"} · ${money(Object.values(aging).reduce((total, amount) => total + amount, 0))} outstanding`}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[["Current", aging.current], ["1–30 days", aging.days_1_30], ["31–60 days", aging.days_31_60], ["61–90 days", aging.days_61_90], ["91+ days", aging.days_91_plus]].map(([label, cents]) => <div key={String(label)} className="rounded-lg border bg-background/50 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-semibold">{money(Number(cents))}</div></div>)}
      </div>
      <div className="mt-4 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Agency</TableHead><TableHead>Approved</TableHead><TableHead>Remitted</TableHead><TableHead>Unapplied</TableHead><TableHead>Adjustments</TableHead><TableHead>Expected</TableHead><TableHead>Ledger</TableHead><TableHead>Variance</TableHead></TableRow></TableHeader><TableBody>
        {reconciliation.map((row) => <TableRow key={row.agencyLedgerAccountId}><TableCell className="font-medium">{row.agency.name}<div className="text-xs text-muted-foreground">{row.agency.programName}</div></TableCell><TableCell>{money(row.approvedCents)}</TableCell><TableCell>{money(row.remittedCents)}</TableCell><TableCell>{money(row.unappliedCents)}</TableCell><TableCell>{money(row.adjustmentCents)}</TableCell><TableCell>{money(row.expectedBalanceCents)}</TableCell><TableCell>{money(row.ledgerBalanceCents)}</TableCell><TableCell className={row.varianceCents ? "font-semibold text-destructive" : "font-medium text-emerald-700 dark:text-emerald-300"}>{money(row.varianceCents)}</TableCell></TableRow>)}
        {!reconciliation.length ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No agency accounts are available for reconciliation.</TableCell></TableRow> : null}
      </TableBody></Table></div>
    </CollapsibleCard>

    {!readOnly ? <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle as="h3"><Landmark data-icon="inline-start" /> Prepare deposit batch</CardTitle><CardDescription>Record the bank/check advice once, allocate it across claims, and send it to a different accounting reviewer. Leave allocations blank to hold the full deposit as unapplied cash.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={prepareBatch}>
        <div><Label htmlFor="batch-program">Agency account</Label><Select value={batchProgramId} onValueChange={(value) => { setBatchProgramId(value ?? ""); setAllocationDrafts([{ key: idempotencyKey(), claimId: "", amountDollars: "" }]); }}><SelectTrigger id="batch-program"><SelectValue /></SelectTrigger><SelectContent>{programs.map((program) => <SelectItem key={program.id} value={program.id}>{program.name}{program.programName ? ` · ${program.programName}` : ""}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="batch-reference">Payment reference</Label><Input id="batch-reference" name="externalReference" required /></div><div><Label htmlFor="batch-total">Deposit total</Label><Input id="batch-total" name="totalDollars" type="number" inputMode="decimal" min="0.01" step="0.01" required /></div></div>
        <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="batch-paid-at">Paid date</Label><Input id="batch-paid-at" name="paidAt" type="date" defaultValue={today()} required /></div><div><Label htmlFor="batch-method">Method</Label><select id="batch-method" name="paymentMethod" defaultValue="ach" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="ach">ACH</option><option value="check">Check</option><option value="agency_portal">Agency portal</option><option value="other">Other</option></select></div></div>
        <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="batch-evidence-name">Evidence name</Label><Input id="batch-evidence-name" name="evidenceName" placeholder="September remittance advice" required /></div><div><Label htmlFor="batch-evidence-reference">Secure document/advice reference</Label><Input id="batch-evidence-reference" name="evidenceReference" placeholder="Internal document ID or portal advice ID" required /></div></div>
        <div><Label htmlFor="batch-follow-up">Follow-up due</Label><Input id="batch-follow-up" name="followUpDueAt" type="date" defaultValue={followUpDate()} required /><p className="mt-1 text-xs text-muted-foreground">Assigned to the preparer until a different reviewer reconciles the batch.</p></div>
        <div className="space-y-2"><div className="flex items-center justify-between"><Label>Claim allocations</Label><Button type="button" size="sm" variant="outline" onClick={() => setAllocationDrafts((rows) => [...rows, { key: idempotencyKey(), claimId: "", amountDollars: "" }])}><Plus data-icon="inline-start" /> Add claim</Button></div>
          {allocationDrafts.map((row, index) => <div key={row.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_9rem_auto]"><Select value={row.claimId} onValueChange={(value) => setAllocationDrafts((rows) => rows.map((candidate) => candidate.key === row.key ? { ...candidate, claimId: value ?? "" } : candidate))}><SelectTrigger aria-label={`Allocation ${index + 1} claim`}><SelectValue placeholder="Choose approved claim" /></SelectTrigger><SelectContent>{batchClaims.map((claim) => <SelectItem key={claim.id} value={claim.id}>{claim.number} · {claim.authorization?.child.fullName ?? "Unlinked"} · {money((claim.approvedCents ?? claim.claimedCents) - claim.paidCents)} open</SelectItem>)}</SelectContent></Select><Input aria-label={`Allocation ${index + 1} amount`} type="number" min="0.01" step="0.01" placeholder="Amount" value={row.amountDollars} onChange={(event) => setAllocationDrafts((rows) => rows.map((candidate) => candidate.key === row.key ? { ...candidate, amountDollars: event.target.value } : candidate))} /><Button type="button" size="sm" variant="ghost" disabled={allocationDrafts.length === 1} onClick={() => setAllocationDrafts((rows) => rows.filter((candidate) => candidate.key !== row.key))}>Remove</Button></div>)}
        </div>
        <div><Label htmlFor="batch-notes">Notes</Label><Textarea id="batch-notes" name="notes" /></div>
        <Button type="submit" disabled={pending || !batchProgramId}><ShieldCheck data-icon="inline-start" /> Prepare for review</Button>
      </form></CardContent></Card>

      <Card><CardHeader><CardTitle as="h3"><FileClock data-icon="inline-start" /> Adjustment request</CardTitle><CardDescription>Write-offs, recoupments, overpayments, and corrections remain pending until a different accounting reviewer posts them.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={requestAdjustment}>
        <div><Label htmlFor="adjustment-account">Agency account</Label><Select value={adjustmentAccountId} onValueChange={(value) => setAdjustmentAccountId(value ?? "")}><SelectTrigger id="adjustment-account"><SelectValue /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.agencyProgram.name} · {money(account.balanceCents)}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="adjustment-type">Type</Label><Select value={adjustmentType} onValueChange={(value) => setAdjustmentType(value ?? "write_off")}><SelectTrigger id="adjustment-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="write_off">Write-off</SelectItem><SelectItem value="recoupment">Recoupment</SelectItem><SelectItem value="overpayment">Overpayment credit</SelectItem><SelectItem value="correction_increase">Correction increase</SelectItem><SelectItem value="correction_decrease">Correction decrease</SelectItem></SelectContent></Select></div><div><Label htmlFor="adjustment-amount">Amount</Label><Input id="adjustment-amount" name="amountDollars" type="number" min="0.01" step="0.01" required /></div></div>
        <div><Label htmlFor="adjustment-date">Effective date</Label><Input id="adjustment-date" name="effectiveAt" type="date" defaultValue={today()} required /></div>
        <div><Label htmlFor="adjustment-reason">Specific reason</Label><Textarea id="adjustment-reason" name="reason" required /></div>
        <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="adjustment-evidence-name">Evidence name</Label><Input id="adjustment-evidence-name" name="evidenceName" required /></div><div><Label htmlFor="adjustment-evidence-reference">Secure evidence reference</Label><Input id="adjustment-evidence-reference" name="evidenceReference" required /></div></div>
        <div><Label htmlFor="adjustment-follow-up">Follow-up due</Label><Input id="adjustment-follow-up" name="followUpDueAt" type="date" defaultValue={followUpDate()} required /><p className="mt-1 text-xs text-muted-foreground">Assigned to the requester until the exception is reviewed.</p></div>
        <p className="text-xs text-muted-foreground">{selectedAdjustmentAccount ? `${selectedAdjustmentAccount.agencyProgram.name} current balance: ${money(selectedAdjustmentAccount.balanceCents)}` : "Choose an agency account."}</p>
        <Button type="submit" disabled={pending || !adjustmentAccountId}>Request review</Button>
      </form></CardContent></Card>
    </div> : <Card><CardHeader><CardTitle as="h3"><Landmark data-icon="inline-start" /> Consolidated accounting view</CardTitle><CardDescription>Review aging, variances, deposit batches, adjustments, and periods across authorized schools. Choose one school before creating or changing a financial record.</CardDescription></CardHeader></Card>}

    <CollapsibleCard id="agency-remittance-batches" title="Deposit batches and review queue" description="Each bank/check reference appears once per school and agency. Posted cash remains either claim-allocated or explicitly unapplied." collapsedSummary={`${batches.filter((batch) => batch.status === "pending_review").length} awaiting review · ${money(batches.reduce((total, batch) => total + (batch.reversedAt ? 0 : batch.unappliedCents), 0))} unapplied`} defaultCollapsed>
      <div className="space-y-3">{batches.map((batch) => {
        const eligibleClaims = availableClaims.filter((claim) => claim.agencyProgram.id === batch.agencyProgramId);
        const pendingAllocations = batch.allocations.filter((allocation) => allocation.status === "pending_review");
        return <div key={batch.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{batch.agencyProgram.name}</span><Badge variant={statusVariant(batch.status)}>{batch.status.replaceAll("_", " ")}</Badge></div><div className="mt-1 text-sm text-muted-foreground">{batch.externalReference} · {dateOnly(batch.paidAt)} · {batch.paymentMethod.replaceAll("_", " ")}</div><div className="mt-1 text-xs text-muted-foreground">Evidence: {batch.evidenceName ?? "—"} · {batch.evidenceReference ?? "—"}</div>{batch.followUpDueAt ? <div className="mt-1 text-xs text-muted-foreground">Follow-up: assigned · due {dateOnly(batch.followUpDueAt)}</div> : null}</div><div className="grid grid-cols-3 gap-3 text-right text-sm"><div><div className="text-xs text-muted-foreground">Total</div>{money(batch.totalCents)}</div><div><div className="text-xs text-muted-foreground">Allocated</div>{money(batch.allocatedCents)}</div><div><div className="text-xs text-muted-foreground">Unapplied</div>{money(batch.unappliedCents)}</div></div></div>
          <div className="mt-3 space-y-2">{batch.allocations.map((allocation) => <div key={allocation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"><span>{allocation.claim.number} · {allocation.claim.authorization?.family.name ?? "Unlinked family"} · {allocation.claim.authorization?.child.fullName ?? "Unlinked child"}</span><span className="flex items-center gap-2"><Badge variant={statusVariant(allocation.status)}>{allocation.status.replaceAll("_", " ")}</Badge>{money(allocation.amountCents)}{allocation.status === "pending_review" && batch.reviewedAt && canReviewRequest(allocation.requestedById) ? <Button type="button" size="sm" onClick={() => void post("approveBatchAllocation", { allocationId: allocation.id })} disabled={pending}>Approve allocation</Button> : null}</span></div>)}</div>
          {batch.status === "pending_review" && !batch.reviewedAt && canReviewRequest(batch.enteredById) ? <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void post("approveRemittanceBatch", { batchId: batch.id, reviewNotes: form.get("reviewNotes") }); }}><div className="min-w-64 flex-1"><Label htmlFor={`batch-review-${batch.id}`}>Reviewer notes</Label><Input id={`batch-review-${batch.id}`} name="reviewNotes" /></div><Button type="submit" disabled={pending}><CheckCircle2 data-icon="inline-start" /> Approve and post</Button></form> : null}
          {batch.status === "pending_review" && !batch.reviewedAt && canReviewRequest(batch.enteredById) ? <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void post("rejectRemittanceBatch", { batchId: batch.id, reason: form.get("reason") }); }}><div className="min-w-64 flex-1"><Label htmlFor={`batch-reject-${batch.id}`}>Rejection reason</Label><Input id={`batch-reject-${batch.id}`} name="reason" required /></div><Button type="submit" variant="outline" disabled={pending}>Reject batch</Button></form> : null}
          {batch.reviewedAt && batch.unappliedCents > 0 && !batch.reversedAt ? <form className="mt-3 grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_9rem_1fr_auto]" onSubmit={(event) => void requestAdditionalAllocation(event, batch)}><div><Label htmlFor={`batch-claim-${batch.id}`}>Allocate remaining cash</Label><Select value={allocationClaimByBatch[batch.id] ?? ""} onValueChange={(value) => setAllocationClaimByBatch((current) => ({ ...current, [batch.id]: value ?? "" }))}><SelectTrigger id={`batch-claim-${batch.id}`}><SelectValue placeholder="Choose approved claim" /></SelectTrigger><SelectContent>{eligibleClaims.map((claim) => <SelectItem key={claim.id} value={claim.id}>{claim.number} · {money((claim.approvedCents ?? claim.claimedCents) - claim.paidCents)} open</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor={`batch-amount-${batch.id}`}>Amount</Label><Input id={`batch-amount-${batch.id}`} name="amountDollars" type="number" min="0.01" max={(batch.unappliedCents / 100).toFixed(2)} step="0.01" required /></div><div><Label htmlFor={`batch-notes-${batch.id}`}>Notes</Label><Input id={`batch-notes-${batch.id}`} name="notes" /></div><Button className="self-end" type="submit" disabled={pending || !allocationClaimByBatch[batch.id]}>Request allocation</Button></form> : null}
          {batch.reviewedAt && !batch.reversedAt && canReviewRequest(batch.enteredById) ? <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void post("reverseRemittanceBatch", { batchId: batch.id, reason: form.get("reason") }); }}><div className="min-w-64 flex-1"><Label htmlFor={`batch-reversal-${batch.id}`}>Batch reversal reason</Label><Input id={`batch-reversal-${batch.id}`} name="reason" required /></div><Button type="submit" variant="destructive" disabled={pending}><RotateCcw data-icon="inline-start" /> Reverse batch</Button></form> : null}
          {pendingAllocations.some((allocation) => !canReviewRequest(allocation.requestedById)) ? <p className="mt-3 text-xs text-muted-foreground"><Clock3 data-icon="inline-start" /> A different billing administrator or accounting reviewer must post the pending allocation.</p> : null}
        </div>;
      })}{!batches.length ? <p className="py-8 text-center text-muted-foreground">No deposit batches recorded yet.</p> : null}</div>
    </CollapsibleCard>

    <div className="grid gap-4 xl:grid-cols-2">
      <CollapsibleCard id="agency-adjustment-review" title="Adjustment review" description="Every material correction preserves the request, independent review, posting, and any later reversal." collapsedSummary={`${adjustments.filter((adjustment) => adjustment.status === "pending_review").length} awaiting review`} defaultCollapsed>
        <div className="space-y-3">{adjustments.map((adjustment) => <div key={adjustment.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium">{adjustment.agencyProgram.name} · {adjustment.type.replaceAll("_", " ")}</div><div className="text-xs text-muted-foreground">{dateOnly(adjustment.effectiveAt)} · {adjustment.claim?.number ?? "Account level"} · {adjustment.evidenceName} / {adjustment.evidenceReference}</div>{adjustment.followUpDueAt ? <div className="text-xs text-muted-foreground">Follow-up: assigned · due {dateOnly(adjustment.followUpDueAt)}</div> : null}</div><div className="flex items-center gap-2"><Badge variant={statusVariant(adjustment.status)}>{adjustment.status.replaceAll("_", " ")}</Badge><span className={adjustment.amountCents < 0 ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"}>{money(adjustment.amountCents)}</span></div></div><p className="mt-2 text-sm">{adjustment.reason}</p>{adjustment.status === "pending_review" && canReviewRequest(adjustment.requestedById) ? <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => void post("approveLedgerAdjustment", { adjustmentId: adjustment.id })} disabled={pending}>Approve and post</Button><Button size="sm" variant="outline" onClick={() => void post("rejectLedgerAdjustment", { adjustmentId: adjustment.id, reviewNotes: "Rejected from agency adjustment review." })} disabled={pending}>Reject</Button></div> : null}{adjustment.status === "posted" && canReviewRequest(adjustment.requestedById) ? <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void post("reverseLedgerAdjustment", { adjustmentId: adjustment.id, reason: form.get("reason") }); }}><Input name="reason" required placeholder="Specific reversal reason" /><Button type="submit" size="sm" variant="destructive" disabled={pending}>Reverse</Button></form> : null}</div>)}{!adjustments.length ? <p className="py-8 text-center text-muted-foreground">No agency adjustments have been requested.</p> : null}</div>
      </CollapsibleCard>

      <CollapsibleCard id="agency-period-close" title="Accounting periods" description="Closed periods reject backdated remittances and adjustments. Reopening requires a retained reason." collapsedSummary={`${periods.filter((period) => period.status === "closed").length} closed period${periods.filter((period) => period.status === "closed").length === 1 ? "" : "s"}`} defaultCollapsed>
        {capabilities.canCloseAccountingPeriod ? <form className="space-y-3 rounded-lg border p-3" onSubmit={(event) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); void post("closeAccountingPeriod", { name: form.get("name"), startDate: form.get("startDate"), endDate: form.get("endDate"), reason: form.get("reason") }).then((ok) => { if (ok) formElement.reset(); }); }}><div><Label htmlFor="period-name">Period name</Label><Input id="period-name" name="name" placeholder="September 2026" required /></div><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="period-start">Start</Label><Input id="period-start" name="startDate" type="date" required /></div><div><Label htmlFor="period-end">End</Label><Input id="period-end" name="endDate" type="date" required /></div></div><div><Label htmlFor="period-reason">Close reason</Label><Input id="period-reason" name="reason" placeholder="Monthly reconciliation complete" required /></div><Button type="submit" disabled={pending}><ShieldCheck data-icon="inline-start" /> Close period</Button></form> : <p className="rounded-lg border p-3 text-sm text-muted-foreground"><AlertTriangle data-icon="inline-start" /> Billing-admin or higher accounting access is required to close or reopen a period.</p>}
        <div className="mt-3 space-y-2">{periods.map((period) => <div key={period.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium">{period.name}</div><div className="text-xs text-muted-foreground">{dateOnly(period.startDate)} – {dateOnly(period.endDate)}</div></div><Badge variant={statusVariant(period.status)}>{period.status}</Badge></div>{period.closeReason ? <p className="mt-2 text-xs text-muted-foreground">Close reason: {period.closeReason}</p> : null}{period.status === "closed" && capabilities.canCloseAccountingPeriod ? <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void post("reopenAccountingPeriod", { periodId: period.id, reason: form.get("reason") }); }}><Input name="reason" required placeholder="Specific reopen reason" /><Button type="submit" size="sm" variant="outline" disabled={pending}><RotateCcw data-icon="inline-start" /> Reopen</Button></form> : null}</div>)}</div>
      </CollapsibleCard>
    </div>
  </div>;
}
