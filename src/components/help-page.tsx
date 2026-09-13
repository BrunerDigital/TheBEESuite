import Link from "next/link";
import { ArrowRight, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SchoolDateTime } from "@/components/school-time-zone-context";
import { PaymentFormDestination } from "@/components/payment-form-destination";
import { formatRecordLabel } from "@/lib/record-label";
import type { HelpNavigationCard } from "@/lib/help-navigation";

const timestampOptions: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" };

export type HelpPageData = {
  canManageOperations: boolean;
  links: HelpNavigationCard[];
  notifications: Array<{
    id: string;
    title: string;
    body: string;
    type: string;
    priority: string;
    createdAt: Date | string;
  }>;
  supportEvents: Array<{
    id: string;
    action: string;
    resource: string;
    resourceId: string | null;
    createdAt: Date | string;
    metadata: unknown;
    user: { name: string; email: string } | null;
    center: { name: string; crmLocationId: string | null } | null;
  }>;
};

export function HelpPage({ data }: { data: HelpPageData }) {
  return (
    <div className="school-help-page flex min-w-0 flex-col gap-4">
      <section className="rounded-xl border bg-card/80 p-3 sm:p-4">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Help and guides</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Find instructions, contact support or open a school workflow.
        </p>
      </section>

      <nav aria-label="Help shortcuts" className="school-help-links grid gap-2">
        {data.links.map((item) => (
          <Link key={item.key} href={item.href} className="flex min-h-11 min-w-0 items-start gap-2 rounded-lg border bg-card/80 p-3 transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{item.label}</div>
              <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
            </div>
            <ArrowRight aria-hidden="true" className="mt-1 size-4 shrink-0" />
          </Link>
        ))}
      </nav>

      {data.canManageOperations ? (
        <Link href="/announcements" className="inline-flex min-h-11 w-fit max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <Megaphone aria-hidden="true" className="size-4 shrink-0" />
          Manage school announcements
        </Link>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle as="h2">Recent alerts</CardTitle>
            <CardDescription>Up to 12 active notifications assigned to your account, highest priority first</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {data.notifications.map(notification => (
                <li key={notification.id} className="min-w-0 rounded-lg border p-3">
                  <div className="font-medium">{notification.title}</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{notification.body}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatRecordLabel(notification.type)}</span>
                    <Badge variant={notification.priority === "high" ? "destructive" : "outline"}>{formatRecordLabel(notification.priority)}</Badge>
                    <span>{<SchoolDateTime value={notification.createdAt} options={timestampOptions} />}</span>
                  </div>
                  {notification.type === "payment_method_form" ? <PaymentFormDestination body={notification.body} /> : null}
                </li>
              ))}
              {!data.notifications.length ? <li className="text-sm text-muted-foreground">No active alerts are assigned to your account.</li> : null}
            </ul>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle as="h2">Support Access History</CardTitle>
            <CardDescription>Up to 25 most recent support events within your authorized scope</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {data.supportEvents.map(event => (
                <li key={event.id} className="min-w-0 rounded-lg border p-3">
                  <div className="font-medium">{formatRecordLabel(event.action)}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{event.resource} {event.resourceId ?? ""}</p>
                  <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Actor</dt><dd>{event.user?.email ?? "System"}</dd>
                    <dt className="text-muted-foreground">Scope</dt><dd>{event.center?.crmLocationId ?? event.center?.name ?? "All locations"}</dd>
                    <dt className="text-muted-foreground">When</dt><dd>{<SchoolDateTime value={event.createdAt} options={timestampOptions} />}</dd>
                  </dl>
                </li>
              ))}
              {!data.supportEvents.length ? <li className="text-sm text-muted-foreground">No support-access activity has been recorded for this account.</li> : null}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
