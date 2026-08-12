import Link from "next/link";
import { AlertTriangle, BadgeCheck, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, KeyRound, PenLine, ShieldAlert } from "lucide-react";
import { SchoolDateTime } from "@/components/school-time-zone-context";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type EndOfDayReconciliationData = {
  serviceDate: Date | string;
  checkIns: number;
  checkOuts: number;
  stillCheckedIn: number;
  latePickups: number;
  authorizationWarnings: number;
  signaturesCaptured: number;
  pinVerified: number;
  qrVerified: number;
  staffVerified: number;
  logs: Array<{
    id: string;
    type: string;
    occurredAt: Date | string;
    pickupName: string | null;
    verificationStatus: string | null;
    pinVerified: boolean;
    signatureCaptured: boolean;
    latePickup: boolean;
    pickupAuthorizationWarning: boolean;
    child: { fullName: string; ageGroup: string } | null;
    guardian: { fullName: string; email: string | null } | null;
    classroom: { name: string } | null;
    center: { name: string; crmLocationId: string | null } | null;
  }>;
};

type StepProps = {
  number: number;
  title: string;
  detail: string;
  issueCount: number;
  icon: React.ReactNode;
  href?: string;
};

function ClosingStep({ number, title, detail, issueCount, icon, href }: StepProps) {
  const clear = issueCount === 0;
  const body = (
    <>
      <span className={cn(
        "grid size-11 shrink-0 place-items-center rounded-2xl border shadow-sm",
        clear ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "border-amber-500/35 bg-amber-500/12 text-amber-800 dark:text-amber-200",
      )} aria-hidden="true">
        {clear ? <CheckCircle2 className="size-5" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Step {number}</span>
        <span className="mt-0.5 block font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Badge variant={clear ? "default" : "secondary"} className="tabular-nums">{clear ? "Clear" : issueCount}</Badge>
        {href ? <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
      </span>
    </>
  );

  return href ? (
    <Link href={href} className="flex min-h-24 items-start gap-3 rounded-2xl border bg-background/65 p-4 shadow-sm transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-background hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none">
      {body}
    </Link>
  ) : (
    <div className="flex min-h-24 items-start gap-3 rounded-2xl border bg-background/65 p-4 shadow-sm">{body}</div>
  );
}

export function EndOfDayClosingBoard({ data }: { data: EndOfDayReconciliationData }) {
  const missingSignatures = data.logs.filter((log) => log.type === "check_out" && !log.signatureCaptured).length;
  const missingCredentials = data.logs.filter((log) => !log.pinVerified && log.verificationStatus !== "qr_verified" && log.verificationStatus !== "staff_verified").length;
  const exceptionLogs = data.logs.filter((log) => (
    log.latePickup ||
    log.pickupAuthorizationWarning ||
    (log.type === "check_out" && !log.signatureCaptured) ||
    (!log.pinVerified && log.verificationStatus !== "qr_verified" && log.verificationStatus !== "staff_verified")
  ));
  const blockingIssues = data.stillCheckedIn + data.authorizationWarnings + missingSignatures + missingCredentials;
  const ready = blockingIssues === 0;

  return (
    <Card id="end-of-day-reconciliation" className="glass-panel scroll-mt-36 overflow-hidden border-primary/20">
      <CardHeader className="border-b bg-gradient-to-br from-primary/12 via-card/80 to-amber-500/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-3"><ClipboardCheck data-icon="inline-start" />Daily Closeout</Badge>
            <h2 className="font-heading text-balance text-2xl font-medium leading-snug">End-of-Day Closing Board</h2>
            <CardDescription className="mt-1 max-w-3xl text-pretty">
              Resolve the school day in order. Every action opens the existing attendance or review workflow; this board does not silently change records.
            </CardDescription>
          </div>
          <div className={cn("rounded-2xl border px-4 py-3", ready ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/35 bg-amber-500/10")}>
            <div className="flex items-center gap-2 font-semibold">
              {ready ? <BadgeCheck className="size-5 text-emerald-600" aria-hidden="true" /> : <ShieldAlert className="size-5 text-amber-600" aria-hidden="true" />}
              {ready ? "Ready to Close" : "Closeout Needs Review"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">{ready ? `${data.checkOuts} check-outs reconciled` : `${blockingIssues} blocking signal${blockingIssues === 1 ? "" : "s"}`}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4 sm:p-5 lg:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ClosingStep number={1} title="Account for Every Child" detail={data.stillCheckedIn ? `${data.stillCheckedIn} child${data.stillCheckedIn === 1 ? " is" : "ren are"} still checked in.` : "Every checked-in child has a check-out."} issueCount={data.stillCheckedIn} icon={<Clock3 className="size-5" />} href="/check-in" />
          <ClosingStep number={2} title="Review Pickup Safety" detail={data.authorizationWarnings ? "Front desk authorization warnings need human review." : "No pickup authorization warnings remain."} issueCount={data.authorizationWarnings} icon={<ShieldAlert className="size-5" />} href="#attendance-reconciliation-ledger" />
          <ClosingStep number={3} title="Confirm Signatures" detail={missingSignatures ? "Check-out records are missing guardian signatures." : "Required check-out signatures are captured."} issueCount={missingSignatures} icon={<PenLine className="size-5" />} href="#attendance-reconciliation-ledger" />
          <ClosingStep number={4} title="Verify Credentials" detail={missingCredentials ? "Some activity lacks PIN, QR, or staff verification." : "Attendance activity has a verification method."} issueCount={missingCredentials} icon={<KeyRound className="size-5" />} href="#attendance-reconciliation-ledger" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
          <section aria-labelledby="closeout-exceptions-title" className="rounded-2xl border bg-background/55 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="closeout-exceptions-title" className="font-semibold">Exception Tray</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">People and records most likely to need attention before staff leave.</p>
              </div>
              <Badge variant={exceptionLogs.length ? "secondary" : "outline"} className="tabular-nums">{exceptionLogs.length}</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {exceptionLogs.slice(0, 6).map((log) => (
                <div key={log.id} className="flex flex-col gap-2 rounded-xl border bg-card/70 p-3 sm:flex-row sm:items-center">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/12 text-amber-700 dark:text-amber-300" aria-hidden="true"><AlertTriangle className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{log.child?.fullName || "Unlinked child"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{log.pickupName || log.guardian?.fullName || "Pickup not captured"} · <SchoolDateTime value={log.occurredAt} options={{ hour: "numeric", minute: "2-digit" }} /></span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {log.pickupAuthorizationWarning ? <Badge variant="destructive">Authorization</Badge> : null}
                    {log.latePickup ? <Badge variant="secondary">Late Pickup</Badge> : null}
                    {log.type === "check_out" && !log.signatureCaptured ? <Badge variant="outline">No Signature</Badge> : null}
                    {!log.pinVerified && log.verificationStatus !== "qr_verified" && log.verificationStatus !== "staff_verified" ? <Badge variant="outline">No Credential</Badge> : null}
                  </span>
                </div>
              ))}
              {!exceptionLogs.length ? (
                <div className="rounded-xl border border-dashed bg-emerald-500/6 p-5 text-center text-sm text-muted-foreground">No closeout exceptions are visible for this service day.</div>
              ) : null}
              {exceptionLogs.length > 6 ? <p className="text-xs text-muted-foreground">+{exceptionLogs.length - 6} more in the reconciliation activity below.</p> : null}
            </div>
          </section>

          <section aria-labelledby="closeout-summary-title" className="rounded-2xl border bg-gradient-to-br from-card to-primary/8 p-4">
            <h3 id="closeout-summary-title" className="font-semibold">Today’s Verification</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["Check-Ins", data.checkIns],
                ["Check-Outs", data.checkOuts],
                ["Signatures", data.signaturesCaptured],
                ["Late Pickups", data.latePickups],
                ["PIN", data.pinVerified],
                ["QR", data.qrVerified],
                ["Staff", data.staffVerified],
                ["Warnings", data.authorizationWarnings],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border bg-background/65 p-3">
                  <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
                  <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
                </div>
              ))}
            </div>
            <Link href="/check-in" className={cn(buttonVariants({ variant: ready ? "outline" : "default" }), "mt-3 w-full")}>
              {ready ? "Open Kiosk Activity" : "Resolve Check-In Status"}
            </Link>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
