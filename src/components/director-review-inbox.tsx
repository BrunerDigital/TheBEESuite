import Link from "next/link";
import { ArrowUpRight, ClipboardList, Inbox, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type DirectorReviewInboxItem = {
  id: string;
  label: string;
  count: number;
  detail: string;
  href: string;
  tone: "urgent" | "attention" | "standard";
};

const toneClasses: Record<DirectorReviewInboxItem["tone"], string> = {
  urgent: "border-rose-500/35 bg-rose-500/8 hover:bg-rose-500/12",
  attention: "border-amber-500/35 bg-amber-500/8 hover:bg-amber-500/12",
  standard: "border-sky-500/30 bg-sky-500/7 hover:bg-sky-500/11",
};

export function DirectorReviewInbox({ items }: { items: DirectorReviewInboxItem[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const activeItems = items.filter((item) => item.count > 0);

  return (
    <Card id="director-review-inbox" className="glass-panel scroll-mt-36 overflow-hidden border-primary/20">
      <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-card/80 to-amber-500/8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge variant="secondary" className="mb-3"><Inbox data-icon="inline-start" />Daily Review</Badge>
            <h2 className="font-heading text-balance text-xl font-medium leading-snug">Director Review Inbox</h2>
            <CardDescription className="mt-1 max-w-2xl text-pretty">
              One place to see what needs human judgment. Each item opens its original role-scoped workflow so approvals remain separate and auditable.
            </CardDescription>
          </div>
          <Badge variant={total ? "secondary" : "default"} className="w-fit tabular-nums">{total ? `${total} waiting` : "Inbox clear"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        {activeItems.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "group flex min-h-28 items-start gap-3 rounded-2xl border p-4 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none",
                  toneClasses[item.tone],
                )}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl border bg-background/75 text-primary shadow-sm" aria-hidden="true"><ClipboardList className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{item.label}</span>
                    <span className="text-2xl font-bold tabular-nums">{item.count}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.detail}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">Open Review <ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none" aria-hidden="true" /></span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed bg-emerald-500/6 p-6 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" aria-hidden="true"><ShieldCheck className="size-6" /></span>
              <div className="mt-3 font-semibold">No Review Items Are Waiting</div>
              <p className="mt-1 text-sm text-muted-foreground">Incident, media, registration, document, guardian-change, and message queues are clear for this visible scope.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
