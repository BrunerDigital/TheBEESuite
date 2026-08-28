"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, CircleAlert, Search } from "lucide-react";
import type {
  AccountsReceivableSnapshot,
  AccountsReceivableSummary,
  SchoolAccountBalanceStatus,
} from "@/lib/accounts-receivable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReportPrintAction } from "@/components/printable-report";
import { cn } from "@/lib/utils";

type AccountFilter = "all" | SchoolAccountBalanceStatus;

const accountFilters: Array<{ id: AccountFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "owes", label: "Owes" },
  { id: "credit", label: "Credits" },
  { id: "current", label: "Current" },
];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function shortDate(value: string, options: { dateOnly?: boolean; timeZone?: string } = {}) {
  const date = options.dateOnly && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: options.timeZone,
  }).format(date);
}

function statusLabel(status: SchoolAccountBalanceStatus) {
  if (status === "owes") return "Owes";
  if (status === "credit") return "Credit";
  return "Current";
}

export function AccountsReceivablePanel({
  snapshot,
  className,
}: {
  snapshot: AccountsReceivableSnapshot;
  className?: string;
}) {
  const [filter, setFilter] = useState<AccountFilter>("all");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const showCenterNames = new Set(snapshot.accounts.map((account) => account.centerId).filter(Boolean)).size > 1;
  const visibleAccounts = useMemo(
    () => snapshot.accounts.filter((account) => {
      if (filter !== "all" && account.status !== filter) return false;
      if (!normalizedQuery) return true;
      return `${account.familyName} ${account.centerName}`.toLocaleLowerCase().includes(normalizedQuery);
    }),
    [filter, normalizedQuery, snapshot.accounts],
  );
  const reportAccounts = snapshot.accounts;
  const reportSchoolIds = new Set(reportAccounts.map((account) => account.centerId ?? `missing:${account.centerName}`));
  const reportSchoolLabel = reportSchoolIds.size === 1 ? reportAccounts[0]?.centerName ?? "School" : `${reportSchoolIds.size} schools`;
  const printCenterNames = reportSchoolIds.size > 1;

  return (
    <div className={cn("grid min-h-0 gap-4", className)}>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-background/60 p-3">
          <div className="text-xs text-muted-foreground">Current-family owed</div>
          <div className="mt-1 text-lg font-semibold text-rose-700 dark:text-rose-300">
            {money(snapshot.totalOwedCents)}
          </div>
        </div>
        <div className="rounded-xl border bg-background/60 p-3">
          <div className="text-xs text-muted-foreground">Current families owing</div>
          <div className="mt-1 text-lg font-semibold">{snapshot.owingAccountCount.toLocaleString("en-US")}</div>
        </div>
        <div className="rounded-xl border bg-background/60 p-3">
          <div className="text-xs text-muted-foreground">Family credits</div>
          <div className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-300">
            {money(Math.abs(snapshot.totalCreditCents))}
          </div>
        </div>
        <div className="rounded-xl border bg-background/60 p-3">
          <div className="text-xs text-muted-foreground">Current-family accounts</div>
          <div className="mt-1 text-lg font-semibold">{snapshot.totalAccountCount.toLocaleString("en-US")}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1" role="group" aria-label="Filter family balances">
          {accountFilters.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={filter === item.id ? "default" : "ghost"}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <label className="relative block w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Search family accounts</span>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search family accounts"
              className="pl-9"
            />
          </label>
          <ReportPrintAction
            buttonLabel="Print balances"
            reportTitle="School Account Balances Report"
            label="Printable accounts receivable report"
            disabled={!reportAccounts.length}
            meta={[
              reportSchoolLabel,
              `As of ${shortDate(snapshot.asOf, { timeZone: "UTC" })}`,
              "Current family accounts, with balances owed listed first",
            ]}
          >
            <section aria-label="Accounts receivable totals">
              <h2>Summary</h2>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Families owing</th>
                    <th scope="col">Total amount due</th>
                    <th scope="col">Family credits</th>
                    <th scope="col">Current accounts</th>
                    <th scope="col">Families overdue</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{snapshot.owingAccountCount.toLocaleString("en-US")}</td>
                    <td>{money(snapshot.totalOwedCents)}</td>
                    <td>{money(Math.abs(snapshot.totalCreditCents))}</td>
                    <td>{snapshot.currentAccountCount.toLocaleString("en-US")}</td>
                    <td>{snapshot.overdueAccountCount.toLocaleString("en-US")}</td>
                  </tr>
                </tbody>
              </table>
            </section>
            <section aria-label="Current family account balances">
              <h2>Family balances</h2>
              <table>
                <thead>
                  <tr>
                    {printCenterNames ? <th scope="col">School</th> : null}
                    <th scope="col">Family</th>
                    <th scope="col">Status</th>
                    <th scope="col">Balance</th>
                    <th scope="col">Open invoices</th>
                    <th scope="col">Overdue</th>
                    <th scope="col">Oldest open due date</th>
                  </tr>
                </thead>
                <tbody>
                  {reportAccounts.map((account) => (
                    <tr key={`print-${account.id}`}>
                      {printCenterNames ? <td>{account.centerName}</td> : null}
                      <td>{account.familyName}</td>
                      <td>{statusLabel(account.status)}</td>
                      <td>{money(account.balanceCents)}</td>
                      <td>{account.openInvoiceCount.toLocaleString("en-US")}</td>
                      <td>{account.overdueInvoiceCount.toLocaleString("en-US")}</td>
                      <td>{account.oldestOpenDueDate ? shortDate(account.oldestOpenDueDate, { dateOnly: true }) : "No due date"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={printCenterNames ? 3 : 2}>Net balance</th>
                    <th>{money(snapshot.netBalanceCents)}</th>
                    <td colSpan={3}>{snapshot.totalAccountCount.toLocaleString("en-US")} current-family accounts</td>
                  </tr>
                  <tr>
                    <th scope="row" colSpan={printCenterNames ? 3 : 2}>Total owed</th>
                    <th>{money(snapshot.totalOwedCents)}</th>
                    <td colSpan={3}>{snapshot.owingAccountCount.toLocaleString("en-US")} families owing</td>
                  </tr>
                </tfoot>
              </table>
            </section>
            <p>This report includes currently enrolled families only. Positive balances are owed, negative balances are family credits, and zero balances are current.</p>
          </ReportPrintAction>
        </div>
      </div>

      <div className="max-h-[32rem] overflow-y-auto rounded-xl border bg-background/40">
        <div className="divide-y">
          {visibleAccounts.map((account) => (
            <div
              key={account.id}
              className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/billing-invoices?familyId=${encodeURIComponent(account.familyId)}${account.centerId ? `&centerId=${encodeURIComponent(account.centerId)}` : ""}#family-ledger`}
                    className="truncate font-medium hover:text-primary hover:underline"
                  >
                    {account.familyName}
                  </Link>
                  <Badge
                    variant={account.status === "owes" ? "destructive" : account.status === "credit" ? "secondary" : "outline"}
                  >
                    {statusLabel(account.status)}
                  </Badge>
                  {account.overdueInvoiceCount > 0 ? (
                    <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-800 dark:text-amber-200">
                      <CircleAlert className="size-3" aria-hidden="true" />
                      {account.overdueInvoiceCount} overdue
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {showCenterNames ? `${account.centerName} · ` : ""}
                  {account.openInvoiceCount
                    ? `${account.openInvoiceCount} open invoice${account.openInvoiceCount === 1 ? "" : "s"}${account.oldestOpenDueDate ? ` · oldest due ${shortDate(account.oldestOpenDueDate)}` : ""}`
                    : account.hasBillingAccount
                      ? "No open invoices"
                      : "No billing activity yet"}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <div className={cn(
                  "text-base font-semibold tabular-nums",
                  account.status === "owes" && "text-rose-700 dark:text-rose-300",
                  account.status === "credit" && "text-emerald-700 dark:text-emerald-300",
                )}>
                  {money(account.balanceCents)}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="min-h-11 min-w-11"
                  aria-label={`Open ${account.familyName} ledger`}
                  nativeButton={false}
                  render={(
                    <Link
                      href={`/billing-invoices?familyId=${encodeURIComponent(account.familyId)}${account.centerId ? `&centerId=${encodeURIComponent(account.centerId)}` : ""}#family-ledger`}
                    />
                  )}
                >
                  <ArrowRight />
                </Button>
              </div>
            </div>
          ))}
          {!visibleAccounts.length ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No family accounts match this filter.
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        This view includes currently enrolled families only. Positive balances are owed, negative balances are family credits, and zero balances are current.
      </p>
    </div>
  );
}

export function ExecutiveAccountsReceivablePanel({
  summary,
  className,
}: {
  summary: AccountsReceivableSummary;
  className?: string;
}) {
  const [showOnlyOwing, setShowOnlyOwing] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleSchools = useMemo(
    () => summary.schools.filter((school) => {
      if (showOnlyOwing && school.owingAccountCount === 0) return false;
      return !normalizedQuery || school.centerName.toLocaleLowerCase().includes(normalizedQuery);
    }),
    [normalizedQuery, showOnlyOwing, summary.schools],
  );
  const schoolsOwing = summary.schools.filter((school) => school.owingAccountCount > 0).length;

  return (
    <div className={cn("grid min-h-0 gap-4", className)}>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-background/60 p-3">
          <div className="text-xs text-muted-foreground">Current-family owed</div>
          <div className="mt-1 text-lg font-semibold text-rose-700 dark:text-rose-300">
            {money(summary.totalOwedCents)}
          </div>
        </div>
        <div className="rounded-xl border bg-background/60 p-3">
          <div className="text-xs text-muted-foreground">Current families owing</div>
          <div className="mt-1 text-lg font-semibold">{summary.owingAccountCount.toLocaleString("en-US")}</div>
        </div>
        <div className="rounded-xl border bg-background/60 p-3">
          <div className="text-xs text-muted-foreground">Schools with balances</div>
          <div className="mt-1 text-lg font-semibold">{schoolsOwing.toLocaleString("en-US")}</div>
        </div>
        <div className="rounded-xl border bg-background/60 p-3">
          <div className="text-xs text-muted-foreground">Overdue current families</div>
          <div className="mt-1 text-lg font-semibold">{summary.overdueAccountCount.toLocaleString("en-US")}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1" role="group" aria-label="Filter school balances">
          <Button
            type="button"
            size="sm"
            variant={showOnlyOwing ? "ghost" : "default"}
            aria-pressed={!showOnlyOwing}
            onClick={() => setShowOnlyOwing(false)}
          >
            All schools
          </Button>
          <Button
            type="button"
            size="sm"
            variant={showOnlyOwing ? "default" : "ghost"}
            aria-pressed={showOnlyOwing}
            onClick={() => setShowOnlyOwing(true)}
          >
            Schools owing
          </Button>
        </div>
        <label className="relative block w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search schools</span>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search schools"
            className="pl-9"
          />
        </label>
      </div>

      <div className="max-h-[32rem] overflow-y-auto rounded-xl border bg-background/40">
        <div className="divide-y">
          {visibleSchools.map((school) => (
            <div
              key={school.centerId}
              className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <Link
                    href={`/billing-invoices?centerId=${encodeURIComponent(school.centerId)}`}
                    className="truncate font-medium hover:text-primary hover:underline"
                  >
                    {school.centerName}
                  </Link>
                  {school.overdueAccountCount > 0 ? (
                    <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-800 dark:text-amber-200">
                      <CircleAlert className="size-3" aria-hidden="true" />
                      {school.overdueAccountCount} overdue
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {school.owingAccountCount} of {school.totalAccountCount} families owe
                  {school.creditAccountCount ? ` · ${school.creditAccountCount} with credit` : ""}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <div className="text-right">
                  <div className="font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                    {money(school.totalOwedCents)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {school.totalCreditCents ? `${money(Math.abs(school.totalCreditCents))} credits` : "No credits"}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="min-h-11 min-w-11"
                  aria-label={`Open ${school.centerName} billing`}
                  nativeButton={false}
                  render={<Link href={`/billing-invoices?centerId=${encodeURIComponent(school.centerId)}`} />}
                >
                  <ArrowRight />
                </Button>
              </div>
            </div>
          ))}
          {!visibleSchools.length ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No schools match this filter.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
