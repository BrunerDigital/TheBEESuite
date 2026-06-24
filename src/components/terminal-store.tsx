"use client";

import { useMemo, useState, useTransition } from "react";
import { Minus, Package, Plus, ShoppingCart, TabletSmartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TerminalStoreItem } from "@/lib/terminal-store";

type TerminalStoreCenter = {
  id: string;
  name: string;
};

type Props = {
  items: TerminalStoreItem[];
  centers: TerminalStoreCenter[];
  defaultCenterId?: string | null;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function itemIcon(category: TerminalStoreItem["category"]) {
  return category === "reader" ? <TabletSmartphone className="size-5" /> : <Package className="size-5" />;
}

export function TerminalStore({ items, centers, defaultCenterId }: Props) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [centerId, setCenterId] = useState(defaultCenterId ?? centers[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const rows = useMemo(
    () => items
      .map((item) => ({ item, quantity: quantities[item.id] ?? 0 }))
      .filter((row) => row.quantity > 0),
    [items, quantities],
  );
  const totalCents = rows.reduce((sum, row) => sum + row.item.priceCents * row.quantity, 0);
  const baseTotalCents = rows.reduce((sum, row) => sum + row.item.stripeBasePriceCents * row.quantity, 0);
  const itemCount = rows.reduce((sum, row) => sum + row.quantity, 0);

  function setQuantity(itemId: string, quantity: number) {
    setQuantities((current) => ({
      ...current,
      [itemId]: Math.max(0, Math.min(20, Math.floor(quantity || 0))),
    }));
  }

  function checkout() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/terminal-store/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId,
          items: rows.map((row) => ({ itemId: row.item.id, quantity: row.quantity })),
        }),
      }).catch(() => null);
      const json = await response?.json().catch(() => null) as { ok?: boolean; url?: string; error?: string } | null;
      if (!response?.ok || !json?.ok || !json.url) {
        setMessage(json?.error || "Checkout could not be opened.");
        return;
      }
      window.location.href = json.url;
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const quantity = quantities[item.id] ?? 0;
          return (
            <Card key={item.id} className="glass-panel">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg border bg-background/60 text-primary">
                      {itemIcon(item.category)}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base">{item.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">{item.description}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline">{item.category}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Stripe list</div>
                    <div className="text-sm text-muted-foreground line-through">{money(item.stripeBasePriceCents)}</div>
                    <div className="mt-2 text-xs text-muted-foreground">Bee Suite price</div>
                    <div className="text-2xl font-semibold tracking-tight">{money(item.priceCents)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="icon" aria-label={`Decrease ${item.name}`} onClick={() => setQuantity(item.id, quantity - 1)} disabled={!quantity || isPending}>
                      <Minus />
                    </Button>
                    <input
                      aria-label={`${item.name} quantity`}
                      className="h-9 w-14 rounded-md border bg-background text-center text-sm font-medium tabular-nums"
                      min={0}
                      max={20}
                      type="number"
                      value={quantity}
                      onChange={(event) => setQuantity(item.id, Number(event.target.value))}
                    />
                    <Button type="button" variant="outline" size="icon" aria-label={`Increase ${item.name}`} onClick={() => setQuantity(item.id, quantity + 1)} disabled={isPending}>
                      <Plus />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <aside className="xl:sticky xl:top-6 xl:self-start">
        <Card className="glass-panel">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Order Summary</CardTitle>
                <CardDescription>{itemCount} item{itemCount === 1 ? "" : "s"} selected</CardDescription>
              </div>
              <ShoppingCart className="size-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {centers.length ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">School</span>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={centerId}
                  onChange={(event) => setCenterId(event.target.value)}
                  disabled={isPending}
                >
                  {centers.map((center) => (
                    <option key={center.id} value={center.id}>{center.name}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.item.id} className="flex items-start justify-between gap-3 rounded-lg border bg-background/40 p-3 text-sm">
                  <div>
                    <div className="font-medium">{row.item.name}</div>
                    <div className="text-xs text-muted-foreground">Qty {row.quantity} · {money(row.item.priceCents)} each</div>
                  </div>
                  <div className="font-medium tabular-nums">{money(row.item.priceCents * row.quantity)}</div>
                </div>
              ))}
              {!rows.length ? (
                <div className="rounded-lg border bg-background/40 p-4 text-sm text-muted-foreground">No items selected.</div>
              ) : null}
            </div>

            <div className="rounded-lg border bg-background/40 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Stripe list subtotal</span>
                <span className="tabular-nums">{money(baseTotalCents)}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3">
                <span className="text-muted-foreground">Bee Suite markup</span>
                <span className="tabular-nums">{money(totalCents - baseTotalCents)}</span>
              </div>
              <div className="mt-3 flex justify-between gap-3 border-t pt-3 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(totalCents)}</span>
              </div>
            </div>

            {message ? (
              <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {message}
              </div>
            ) : null}

            <Button className="w-full" type="button" onClick={checkout} disabled={isPending || !rows.length}>
              <ShoppingCart data-icon="inline-start" />
              {isPending ? "Opening checkout..." : "Checkout"}
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
