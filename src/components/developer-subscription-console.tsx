"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SchoolDateTime } from "@/components/school-time-zone-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type DeveloperSubscriptionSchool = {
  id: string;
  name: string;
  activeUsers: number;
  monthlyAmountCents: number;
  customerReady: boolean;
  paymentMethodReady: boolean;
  subscriptionId: string | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  lastInvoiceStatus: string | null;
  lastInvoiceAmountCents: number | null;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function DeveloperSubscriptionConsole({
  schools,
}: {
  schools: DeveloperSubscriptionSchool[];
}) {
  const [rows, setRows] = useState(schools);
  const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [pending, startTransition] = useTransition();
  function run(
    centerId: string,
    action: "start" | "sync" | "cancel" | "resume",
  ) {
    setWorkingId(centerId);
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/developer/software-subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ centerId, action }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        subscription?: {
          id: string;
          status: string;
          quantity: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: string | null;
        };
      };
      if (!response.ok || !json.ok || !json.subscription)
        setMessage(json.error || "Subscription update failed.");
      else {
        setRows((current) =>
          current.map((row) =>
            row.id === centerId
              ? {
                  ...row,
                  subscriptionId: json.subscription!.id,
                  status: json.subscription!.status,
                  activeUsers: json.subscription!.quantity,
                  cancelAtPeriodEnd: json.subscription!.cancelAtPeriodEnd,
                  currentPeriodEnd: json.subscription!.currentPeriodEnd,
                }
              : row,
          ),
        );
        setMessage("School subscription updated successfully.");
      }
      setWorkingId("");
    });
  }
  return (
    <Card className="glass-panel border-primary/35">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-5 text-primary" />
          School software subscriptions
        </CardTitle>
        <CardDescription>
          Recurring monthly billing is quantity-based on active director,
          assistant director, and billing administrator accounts. Sync after
          access changes; Stripe invoices and retries run automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {message ? (
          <div className="rounded-lg border bg-background/60 px-3 py-2 text-sm">
            {message}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>Billing readiness</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Monthly</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next renewal</TableHead>
                <TableHead className="text-right">Controls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const ready = row.customerReady && row.paymentMethodReady;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      {ready ? (
                        <Badge variant="outline" className="text-emerald-500">
                          <CheckCircle2 />
                          Ready
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-500">
                          <AlertTriangle />
                          {row.customerReady
                            ? "Payment method needed"
                            : "Setup needed"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{row.activeUsers}</TableCell>
                    <TableCell>{money(row.monthlyAmountCents)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === "active" ? "default" : "outline"
                        }
                      >
                        {row.cancelAtPeriodEnd
                          ? "Cancels at renewal"
                          : row.status || "Not started"}
                      </Badge>
                      {row.lastInvoiceStatus === "payment_failed" ? (
                        <XCircle className="ml-2 inline size-4 text-destructive" />
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {row.currentPeriodEnd
                        ? <SchoolDateTime value={row.currentPeriodEnd} options={{ month: "short", day: "numeric", year: "numeric" }} />
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!row.subscriptionId ? (
                          <Button
                            size="sm"
                            disabled={!ready || pending}
                            onClick={() => run(row.id, "start")}
                          >
                            Start billing
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() => run(row.id, "sync")}
                            >
                              <RefreshCw
                                className={
                                  workingId === row.id ? "animate-spin" : ""
                                }
                              />
                              Sync
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() =>
                                run(
                                  row.id,
                                  row.cancelAtPeriodEnd ? "resume" : "cancel",
                                )
                              }
                            >
                              {row.cancelAtPeriodEnd ? "Resume" : "Cancel"}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
