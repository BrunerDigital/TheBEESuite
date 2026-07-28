"use client";

import { useState } from "react";
import { BadgeDollarSign, RefreshCw } from "lucide-react";
import { AccountsReceivablePanel } from "@/components/accounts-receivable-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { AccountsReceivableSnapshot } from "@/lib/accounts-receivable";

type AccountsReceivableResponse = {
  ok?: boolean;
  error?: string;
  accountsReceivable?: AccountsReceivableSnapshot;
};

export function AccountsReceivableSheet({ executive = false }: { executive?: boolean }) {
  const [snapshot, setSnapshot] = useState<AccountsReceivableSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadBalances(force = false) {
    if ((snapshot && !force) || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard/accounts-receivable", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({})) as AccountsReceivableResponse;
      if (!response.ok || !body.accountsReceivable) {
        throw new Error(body.error || "Unable to load school account balances.");
      }
      setSnapshot(body.accountsReceivable);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load school account balances.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet>
      <SheetTrigger
        render={(
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            aria-label={executive ? "Open executive account balances" : "Open school account balances"}
            onClick={() => void loadBalances()}
          />
        )}
      >
        <BadgeDollarSign />
        <span className="hidden lg:inline">Balances</span>
        {snapshot?.owingAccountCount ? (
          <Badge variant="destructive" className="min-w-5 justify-center px-1.5">
            {snapshot.owingAccountCount}
          </Badge>
        ) : null}
      </SheetTrigger>
      <SheetContent className="w-[min(96vw,44rem)] data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b pr-14">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle>{executive ? "Executive account balances" : "School account balances"}</SheetTitle>
              <SheetDescription>
                {executive
                  ? "Every family account across your visible schools, with families who owe listed first."
                  : "Every family account in your school, with families who owe listed first."}
              </SheetDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => void loadBalances(true)}
            >
              <RefreshCw className={loading ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {loading && !snapshot ? (
            <div className="grid gap-3" aria-label="Loading account balances">
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
              <div className="h-80 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <div className="font-medium">Balances could not be loaded</div>
              <p className="mt-1 text-muted-foreground">{error}</p>
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void loadBalances(true)}>
                Try again
              </Button>
            </div>
          ) : null}
          {snapshot ? <AccountsReceivablePanel snapshot={snapshot} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
