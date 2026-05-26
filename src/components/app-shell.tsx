"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  Command,
  Hexagon,
  Menu,
  Moon,
  LogOut,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { navGroups } from "@/lib/demo-data";
import { canAccessModule } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type ShellUser = {
  name: string;
  email: string;
  role: string;
  accessScope?: string;
  centerIds?: string[];
};

type NotificationSummary = {
  stats: {
    unread: number;
    newInquiries: number;
    highIntentLeads: number;
    openTasks: number;
    upcomingTours: number;
    pendingIncidents: number;
    missingFteReports: number;
  };
  derived: Array<{
    title: string;
    body: string;
    type: string;
    priority: string;
    href?: string;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    body: string;
    type: string;
    priority: string;
    readAt: string | null;
    createdAt: string;
  }>;
};

function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
        <Hexagon data-icon="inline-start" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold tracking-wide">The Bee Suite</span>
        <span className="block text-xs text-muted-foreground">Childcare OS</span>
      </span>
    </Link>
  );
}

function NotificationDropdown() {
  const [summary, setSummary] = useState<NotificationSummary | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/notifications/summary")
      .then((response) => response.json())
      .then((json) => {
        if (mounted && json?.ok) setSummary(json as NotificationSummary);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const unread = summary?.stats.unread ?? 0;
  const items = [
    ...(summary?.derived ?? []),
    ...(summary?.notifications.map((notification) => ({
      title: notification.title,
      body: notification.body,
      type: notification.type,
      priority: notification.priority,
      href: "/notifications",
    })) ?? []),
  ].slice(0, 6);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Notifications" className="relative" />}>
        <Bell />
        {unread ? (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.65rem] font-semibold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="border-b p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Notifications</div>
              <div className="text-xs text-muted-foreground">New inquiries, tasks, FTE, tours, and review alerts</div>
            </div>
            <Badge variant={unread ? "default" : "outline"}>{unread} unread</Badge>
          </div>
          {summary ? (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border bg-background/60 p-2">
                <div className="font-semibold">{summary.stats.newInquiries}</div>
                <div className="text-muted-foreground">Inquiries</div>
              </div>
              <div className="rounded-lg border bg-background/60 p-2">
                <div className="font-semibold">{summary.stats.openTasks}</div>
                <div className="text-muted-foreground">Tasks</div>
              </div>
              <div className="rounded-lg border bg-background/60 p-2">
                <div className="font-semibold">{summary.stats.missingFteReports}</div>
                <div className="text-muted-foreground">FTE due</div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="max-h-80 overflow-auto p-2">
          {items.map((item, index) => (
            <Link
              key={`${item.type}-${index}`}
              href={item.href ?? "/notifications"}
              className="block rounded-lg p-3 text-sm transition hover:bg-muted"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="font-medium">{item.title}</div>
                <Badge variant={item.priority === "high" ? "destructive" : "outline"}>{item.priority}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.body}</p>
            </Link>
          ))}
          {!items.length ? (
            <div className="p-4 text-sm text-muted-foreground">No urgent notifications are queued for your scope.</div>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <Link href="/notifications" className="block p-3 text-sm font-medium text-primary hover:bg-muted">
          Open notification center
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarNav({ close, currentUser }: { close?: () => void; currentUser?: ShellUser }) {
  const pathname = usePathname();
  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(([, slug]) => canAccessModule(currentUser, slug)),
    }))
    .filter((group) => group.items.length);

  return (
    <div className="flex h-full flex-col">
      <div className="p-5">
        <BrandMark />
      </div>
      <ScrollArea className="flex-1 px-3">
        <nav className="flex flex-col gap-5 pb-6">
          {visibleNavGroups.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <div className="px-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {group.title}
              </div>
              <div className="flex flex-col gap-1">
                {group.items.map(([label, slug, Icon]) => {
                  const href = slug === "dashboard" ? "/dashboard" : `/${slug}`;
                  const active = pathname === href || (pathname === "/dashboard" && slug === "dashboard");
                  return (
                    <Link
                      key={slug}
                      href={href}
                      onClick={close}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        active && "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm",
                      )}
                    >
                      <Icon data-icon="inline-start" />
                      <span className="truncate">{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>
      <div className="border-t p-4">
        <div className="rounded-xl border bg-background/60 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck data-icon="inline-start" />
            Live pilot safeguards
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Sensitive child, custody, medical, billing, and compliance workflows stay role-gated and human-reviewed.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children, currentUser }: { children: React.ReactNode; currentUser?: ShellUser }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r bg-sidebar/90 backdrop-blur-xl lg:block">
        <SidebarNav currentUser={currentUser} />
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b bg-background/75 backdrop-blur-xl">
          <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6">
            <Sheet>
              <SheetTrigger
                render={
                  <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation" />
                }
              >
                <Menu />
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarNav currentUser={currentUser} />
              </SheetContent>
            </Sheet>
            <div className="hidden flex-1 items-center md:flex">
              <div className="relative w-full max-w-2xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-11 rounded-xl border-border/70 bg-card/70 pl-10"
                  placeholder="Search families, children, invoices, tours, tasks..."
                />
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="secondary" className="hidden gap-1 rounded-lg px-3 py-1 sm:inline-flex">
                <Sparkles data-icon="inline-start" />
                AI suggestions require review
              </Badge>
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" size="icon" aria-label="Command menu" />}>
                  <Command />
                </TooltipTrigger>
                <TooltipContent>Command menu placeholder</TooltipContent>
              </Tooltip>
              <NotificationDropdown />
              <Button variant="outline" size="icon" aria-label="Theme preview">
                <Moon className="dark:hidden" />
                <Sun className="hidden dark:block" />
              </Button>
              {currentUser ? (
                <div className="hidden items-center gap-2 sm:flex">
                  <div className="rounded-lg border bg-card/70 px-3 py-1.5 text-right">
                    <div className="text-xs font-medium leading-none">{currentUser.name}</div>
                    <div className="mt-1 text-[0.65rem] text-muted-foreground">{currentUser.role.replaceAll("_", " ")}</div>
                  </div>
                  <Button variant="outline" size="icon" aria-label="Sign out" onClick={logout}>
                    <LogOut />
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" className="hidden gap-2 sm:inline-flex">
                  Live workspace
                  <ChevronDown data-icon="inline-end" />
                </Button>
              )}
            </div>
          </div>
        </header>
        <main className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 xl:p-8">{children}</main>
      </div>
    </div>
  );
}
