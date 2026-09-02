"use client";

import {
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const preferencePrefix = "bee-suite";

function storageKey(kind: string, id: string) {
  return `${preferencePrefix}:${kind}:${id}`;
}

function parseStoredStringArray(value: string | null) {
  try {
    const parsed = JSON.parse(value ?? "null");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readStoredOrder(key: string) {
  if (typeof window === "undefined") return null;
  return parseStoredStringArray(window.localStorage.getItem(key));
}

function mergeOrder(preferredOrder: string[], currentIds: string[]) {
  const currentIdSet = new Set(currentIds);
  const ordered = preferredOrder.filter((id) => currentIdSet.has(id));
  for (const id of currentIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

function moveItem(order: string[], activeId: string, overId: string) {
  const from = order.indexOf(activeId);
  const to = order.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return order;
  const next = order.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function moveByOffset(order: string[], activeId: string, offset: -1 | 1) {
  const from = order.indexOf(activeId);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = order.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

type CollapsibleCardProps = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  headerActions?: ReactNode;
  headerAfter?: ReactNode;
  collapsedSummary?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
  titleClassName?: string;
  defaultCollapsed?: boolean;
  forceExpanded?: boolean;
};

function usePersistedCollapsed(id: string, defaultCollapsed: boolean, forceExpanded = false) {
  const key = storageKey("collapsed", id);
  const [collapsed, setCollapsed] = useState(forceExpanded ? false : defaultCollapsed);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    if (forceExpanded) {
      window.localStorage.removeItem(key);
      window.queueMicrotask(() => {
        if (!cancelled) setCollapsed(false);
      });
      return () => {
        cancelled = true;
      };
    }
    window.queueMicrotask(() => {
      if (cancelled) return;
      const stored = window.localStorage.getItem(key);
      if (stored === "1") setCollapsed(true);
      if (stored === "0") setCollapsed(false);
    });
    return () => {
      cancelled = true;
    };
  }, [forceExpanded, key]);

  const setPersistedCollapsed = useCallback((next: boolean) => {
    if (forceExpanded) {
      setCollapsed(false);
      return;
    }
    setCollapsed(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, next ? "1" : "0");
    }
  }, [forceExpanded, key]);

  const toggleCollapsed = useCallback(() => {
    if (forceExpanded) return;
    setCollapsed((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, next ? "1" : "0");
      }
      return next;
    });
  }, [forceExpanded, key]);

  const expand = useCallback(() => setPersistedCollapsed(false), [setPersistedCollapsed]);

  return { collapsed: forceExpanded ? false : collapsed, expand, toggleCollapsed };
}

function useExpandForHash(id: string, expand: () => void) {
  useEffect(() => {
    function expandAndFocusTarget(targetHash: string) {
      let target = "";
      try {
        target = decodeURIComponent(targetHash.slice(1));
      } catch {
        return;
      }
      const container = document.getElementById(id);
      const destination = document.getElementById(target);
      if (target !== id && (!container || !destination || !container.contains(destination))) return;
      expand();
      window.requestAnimationFrame(() => {
        const element = document.getElementById(target) ?? document.getElementById(id);
        element?.scrollIntoView({ block: "start" });
        element?.focus({ preventScroll: true });
      });
    }

    function expandFromAnchorClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      const href = anchor?.getAttribute("href");
      if (!href) return;
      const destination = new URL(href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname !== window.location.pathname || !destination.hash) return;
      expandAndFocusTarget(destination.hash);
    }

    function expandFromLocationHash() {
      expandAndFocusTarget(window.location.hash);
    }

    expandFromLocationHash();
    window.addEventListener("hashchange", expandFromLocationHash);
    document.addEventListener("click", expandFromAnchorClick);
    return () => {
      window.removeEventListener("hashchange", expandFromLocationHash);
      document.removeEventListener("click", expandFromAnchorClick);
    };
  }, [expand, id]);
}

export function CollapsibleCard({
  id,
  title,
  description,
  eyebrow,
  headerActions,
  headerAfter,
  collapsedSummary,
  children,
  className,
  contentClassName,
  headerClassName,
  titleClassName,
  defaultCollapsed = false,
  forceExpanded = false,
}: CollapsibleCardProps) {
  const contentId = useId();
  const { collapsed, expand, toggleCollapsed } = usePersistedCollapsed(id, defaultCollapsed, forceExpanded);
  useExpandForHash(id, expand);

  return (
    <Card
      id={id}
      tabIndex={-1}
      className={cn("scroll-mt-28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      data-collapsible-card="true"
      data-collapsed={collapsed ? "true" : "false"}
      size={collapsed ? "sm" : "default"}
    >
      <CardHeader className={cn(collapsed && "py-0", headerClassName)}>
        <div className={cn("flex gap-3", collapsed ? "items-center justify-between" : "flex-col lg:flex-row lg:items-start lg:justify-between")}>
          <div className="min-w-0">
            {!collapsed && eyebrow ? <div className="mb-2 flex flex-wrap items-center gap-2">{eyebrow}</div> : null}
            <CardTitle as="h2" className={cn(collapsed && "text-sm", titleClassName)}>{title}</CardTitle>
            {!collapsed && description ? <CardDescription className="mt-2 max-w-3xl">{description}</CardDescription> : null}
            {collapsed && (collapsedSummary || description) ? (
              <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{collapsedSummary || description}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {headerActions}
            {!forceExpanded ? <Tooltip>
              <TooltipTrigger
                render={(
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-expanded={!collapsed}
                    aria-controls={contentId}
                    aria-label={`${collapsed ? "Expand" : "Collapse"} ${typeof title === "string" ? title : "section"}`}
                    onClick={toggleCollapsed}
                  />
                )}
              >
                {collapsed ? <ChevronRight /> : <ChevronDown />}
              </TooltipTrigger>
              <TooltipContent>{collapsed ? "Expand" : "Collapse"}</TooltipContent>
            </Tooltip> : null}
          </div>
        </div>
        {!collapsed ? headerAfter : null}
      </CardHeader>
      <div id={contentId} hidden={collapsed}>
        <CardContent className={contentClassName}>{children}</CardContent>
      </div>
    </Card>
  );
}

type CollapsiblePanelProps = {
  id: string;
  title: ReactNode;
  accessibleLabel?: string;
  summary?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultCollapsed?: boolean;
};

export function CollapsiblePanel({
  id,
  title,
  accessibleLabel,
  summary,
  headerActions,
  children,
  className,
  contentClassName,
  defaultCollapsed = true,
}: CollapsiblePanelProps) {
  const contentId = useId();
  const { collapsed, expand, toggleCollapsed } = usePersistedCollapsed(id, defaultCollapsed);
  useExpandForHash(id, expand);

  return (
    <section
      id={id}
      tabIndex={-1}
      className={cn("min-w-0 scroll-mt-28 overflow-hidden rounded-xl border bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      data-collapsible-panel="true"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className={cn("flex min-h-14 items-center gap-3 px-3", !collapsed && "border-b py-3")}>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-pretty">{title}</h3>
          {summary ? <div className="mt-1 text-xs text-muted-foreground">{summary}</div> : null}
        </div>
        {headerActions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div> : null}
        <Tooltip>
          <TooltipTrigger
            render={(
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-expanded={!collapsed}
                aria-controls={contentId}
                aria-label={`${collapsed ? "Expand" : "Collapse"} ${accessibleLabel ?? (typeof title === "string" ? title : "section")}`}
                onClick={toggleCollapsed}
              />
            )}
          >
            {collapsed ? <ChevronRight /> : <ChevronDown />}
          </TooltipTrigger>
          <TooltipContent>{collapsed ? "Expand" : "Collapse"}</TooltipContent>
        </Tooltip>
      </div>
      <div id={contentId} hidden={collapsed}>
        <div className={cn("p-3", contentClassName)}>{children}</div>
      </div>
    </section>
  );
}

export type WorkspaceBoardItem = {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
};

type WorkspaceBoardProps = {
  storageId: string;
  items: WorkspaceBoardItem[];
  className?: string;
  itemClassName?: string;
  controlsClassName?: string;
};

export function WorkspaceBoard({ storageId, items, className, itemClassName, controlsClassName }: WorkspaceBoardProps) {
  const currentIdsKey = JSON.stringify(items.map((item) => item.id));
  const currentIds = useMemo(() => parseStoredStringArray(currentIdsKey), [currentIdsKey]);
  const key = storageKey("order", storageId);
  const [order, setOrder] = useState(currentIds);
  const [loaded, setLoaded] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      const stored = readStoredOrder(key);
      setOrder(mergeOrder(stored ?? currentIds, currentIds));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [currentIds, currentIdsKey, key]);

  useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(mergeOrder(order, currentIds)));
  }, [currentIds, key, loaded, order]);

  const orderedItems = useMemo(() => {
    const itemById = new Map(items.map((item) => [item.id, item]));
    return mergeOrder(order, currentIds)
      .map((id) => itemById.get(id))
      .filter((item): item is WorkspaceBoardItem => Boolean(item));
  }, [currentIds, items, order]);

  function reorder(activeId: string, overId: string) {
    setOrder((current) => moveItem(mergeOrder(current, currentIds), activeId, overId));
  }

  function move(activeId: string, offset: -1 | 1) {
    setOrder((current) => moveByOffset(mergeOrder(current, currentIds), activeId, offset));
  }

  function startDrag(event: DragEvent<HTMLElement>, id: string) {
    setDraggingId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }

  function overDrag(event: DragEvent<HTMLElement>, overId: string) {
    if (!draggingId || draggingId === overId) return;
    event.preventDefault();
    reorder(draggingId, overId);
  }

  function dropDrag(event: DragEvent<HTMLElement>, overId: string) {
    const activeId = event.dataTransfer.getData("text/plain") || draggingId;
    if (activeId && activeId !== overId) reorder(activeId, overId);
    setDraggingId(null);
  }

  return (
    <div className={cn("min-w-0", className)}>
      {orderedItems.map((item, index) => (
        <div
          key={item.id}
          className={cn("min-w-0", itemClassName, item.className, draggingId === item.id && "opacity-70")}
          onDragOver={(event) => overDrag(event, item.id)}
          onDrop={(event) => dropDrag(event, item.id)}
        >
          {orderedItems.length > 1 ? (
            <div className={cn("mb-2 flex justify-end gap-1 print:hidden", controlsClassName)}>
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Move ${item.title} up`}
                      disabled={index === 0}
                      onClick={() => move(item.id, -1)}
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
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Move ${item.title} down`}
                      disabled={index === orderedItems.length - 1}
                      onClick={() => move(item.id, 1)}
                    />
                  )}
                >
                  <ArrowDown />
                </TooltipTrigger>
                <TooltipContent>Move down</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <button
                      type="button"
                      draggable
                      className="inline-flex size-6 cursor-grab items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                      aria-label={`Drag ${item.title} to reorder`}
                      onDragStart={(event) => startDrag(event, item.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          move(item.id, -1);
                        }
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          move(item.id, 1);
                        }
                      }}
                    />
                  )}
                >
                  <GripVertical className="size-4" />
                </TooltipTrigger>
                <TooltipContent>Drag</TooltipContent>
              </Tooltip>
            </div>
          ) : null}
          {item.children}
        </div>
      ))}
    </div>
  );
}
