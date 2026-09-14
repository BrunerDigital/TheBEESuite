import Link from "next/link";
import { AuditLogViewer } from "./audit-log-viewer";
import { buttonVariants } from "./ui/button";
import type { AuditHistoryData } from "@/lib/audit-history";
import { cn } from "@/lib/utils";

export type AuditLogsData = AuditHistoryData;
export function AuditLogsPage({ data }: { data: AuditLogsData }) {
  return <div className="flex min-w-0 flex-col gap-3" data-audit-history-page>
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight">Audit history</h1>
        <p className="mt-1 text-sm text-muted-foreground">Find activity across your authorized schools and records.</p></div>
      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {[["Matching events", data.stats.total], ["Enrollment", data.stats.leadActions], ["Protected activity", data.stats.sensitive]].map(([label, value]) =>
          <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{Number(value).toLocaleString()}</dd></div>)}
      </dl>
    </header>
    <AuditLogViewer data={data} />
  </div>;
}
export function AuditHistoryUnavailable({ message }: { message: string }) {
  return <section className="space-y-3 rounded-xl border bg-card p-4"><h1 className="text-2xl font-semibold">Audit history</h1>
    <p role="alert">{message}</p><Link href="/audit-logs" prefetch={false} className={cn(buttonVariants({ variant: "outline" }), "h-auto min-h-11 max-w-full whitespace-normal")}>Reset audit filters</Link></section>;
}
