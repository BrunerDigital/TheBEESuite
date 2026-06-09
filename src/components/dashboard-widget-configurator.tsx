"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, RotateCcw, Save, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DashboardWidgetView } from "@/lib/dashboard-widgets";

type Props = {
  initialWidgets: DashboardWidgetView[];
  roleLabel: string;
};

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

export function DashboardWidgetConfigurator({ initialWidgets, roleLabel }: Props) {
  const router = useRouter();
  const [widgets, setWidgets] = useState(initialWidgets);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const visibleCount = useMemo(() => widgets.filter((widget) => widget.visible).length, [widgets]);

  function setWidgetVisibility(widgetId: string, visible: boolean) {
    setWidgets((current) => {
      const next = current.map((widget) => widget.id === widgetId ? { ...widget, visible } : widget);
      if (!next.some((widget) => widget.visible)) {
        setStatusMessage("At least one dashboard widget must stay visible.");
        return current;
      }
      setStatusMessage("");
      return next;
    });
  }

  function moveWidget(index: number, direction: -1 | 1) {
    setWidgets((current) => moveItem(current, index, direction));
    setStatusMessage("");
  }

  async function saveWidgets(reset = false) {
    setIsSaving(true);
    setStatusMessage(reset ? "Resetting dashboard..." : "Saving dashboard...");
    try {
      const response = await fetch("/api/dashboard/widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reset ? { reset: true } : {
          widgets: widgets.map((widget) => ({ id: widget.id, visible: widget.visible })),
        }),
      });
      const result = await response.json().catch(() => ({})) as {
        ok?: boolean;
        error?: string;
        dashboardWidgets?: { widgets?: DashboardWidgetView[] };
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Dashboard widgets could not be saved.");
      }
      if (result.dashboardWidgets?.widgets?.length) {
        setWidgets(result.dashboardWidgets.widgets);
      }
      setStatusMessage(reset ? "Dashboard widgets reset." : "Dashboard widgets saved.");
      router.refresh();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Dashboard widgets could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="glass-panel">
      <CardContent className="grid gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
              <Settings2 className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="font-medium">Dashboard widgets</div>
              <div className="text-xs text-muted-foreground">{roleLabel} · {visibleCount} visible</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => saveWidgets(true)} disabled={isSaving}>
              <RotateCcw data-icon="inline-start" />
              Reset
            </Button>
            <Button onClick={() => saveWidgets(false)} disabled={isSaving}>
              <Save data-icon="inline-start" />
              Save dashboard
            </Button>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {widgets.map((widget, index) => (
            <div key={widget.id} className="grid min-h-28 gap-3 rounded-lg border bg-background/55 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{widget.title}</span>
                    <Badge variant="outline">{widget.category}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{widget.description}</p>
                </div>
                <Switch
                  checked={widget.visible}
                  onCheckedChange={(checked) => setWidgetVisibility(widget.id, Boolean(checked))}
                  aria-label={`${widget.visible ? "Hide" : "Show"} ${widget.title}`}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Badge variant={widget.visible ? "secondary" : "outline"}>{widget.visible ? "Visible" : "Hidden"}</Badge>
                <div className="flex gap-1">
                  <Tooltip>
                    <TooltipTrigger
                      render={(
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => moveWidget(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${widget.title} up`}
                        />
                      )}
                    >
                      <ArrowUp />
                    </TooltipTrigger>
                    <TooltipContent>Move up</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={(
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => moveWidget(index, 1)}
                          disabled={index === widgets.length - 1}
                          aria-label={`Move ${widget.title} down`}
                        />
                      )}
                    >
                      <ArrowDown />
                    </TooltipTrigger>
                    <TooltipContent>Move down</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          ))}
        </div>
        {statusMessage ? <p className="text-xs text-muted-foreground">{statusMessage}</p> : null}
      </CardContent>
    </Card>
  );
}
