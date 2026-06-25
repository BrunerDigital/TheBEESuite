"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  Bell,
  Camera,
  CheckCheck,
  ChevronDown,
  ClipboardList,
  Command,
  CreditCard,
  FileText,
  Home,
  Menu,
  Moon,
  LogOut,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LiveRefreshStatus } from "@/components/live-refresh-status";
import { ProfilePhotoUploader } from "@/components/profile-photo-uploader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { navGroups } from "@/lib/demo-data";
import { canAccessModule } from "@/lib/rbac";
import type { WorkspaceBranding } from "@/lib/brand-assets";
import { cn } from "@/lib/utils";

type ShellUser = {
  name: string;
  email: string;
  role: string;
  accessScope?: string;
  centerIds?: string[];
  profilePhotoUrl?: string | null;
  branding?: WorkspaceBranding;
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

type GlobalSearchResult = {
  id: string;
  type: string;
  label: string;
  detail: string;
  href: string;
  badge?: string;
};

function notificationBodyUrl(body: string) {
  return body.match(/https?:\/\/[^\s)]+/i)?.[0] ?? null;
}

function storedNotificationHref(notification: NotificationSummary["notifications"][number]) {
  if (notification.type === "payment_method_form") return notificationBodyUrl(notification.body) ?? "/parent-portal#billing";
  return "/notifications";
}

function BrandMark({ branding }: { branding?: WorkspaceBranding }) {
  return <BrandLogo href="/" branding={branding} size="md" />;
}

function NotificationDropdown({ currentUser }: { currentUser?: ShellUser }) {
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const canViewEnrollment = canAccessModule(currentUser, "crm-leads");
  const canViewTasks = canViewEnrollment;
  const canViewFteReports = canAccessModule(currentUser, "fte-reports");

  function loadSummary() {
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
  }

  useEffect(() => {
    const cleanup = loadSummary();
    return () => {
      cleanup();
    };
  }, []);

  async function markMineRead() {
    await fetch("/api/notifications/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    }).catch(() => undefined);
    loadSummary();
  }

  const unread = summary?.stats.unread ?? 0;
  const notificationScopeText = canViewEnrollment && canViewFteReports
    ? "New inquiries, tasks, FTE, tours, and review alerts"
    : canViewEnrollment
      ? "New inquiries, tours, CRM tasks, and review alerts"
      : canViewFteReports
        ? "FTE reminders, assigned tasks, and review alerts"
        : currentUser?.role === "TEACHER"
          ? "Classroom messages, incidents, and assigned notifications"
          : currentUser?.role === "BILLING_ADMIN"
            ? "Billing messages, payment follow-ups, and assigned notifications"
            : currentUser?.role === "PARENT_GUARDIAN" || currentUser?.role === "AUTHORIZED_PICKUP"
              ? "Family portal updates, messages, documents, and account alerts"
              : "Assigned notifications and review items";
  const items = [
    ...(summary?.derived ?? []),
    ...(summary?.notifications.map((notification) => ({
      title: notification.title,
      body: notification.body,
      type: notification.type,
      priority: notification.priority,
      href: storedNotificationHref(notification),
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
              <div className="text-xs text-muted-foreground">{notificationScopeText}</div>
            </div>
            <Badge variant={unread ? "default" : "outline"}>{unread} unread</Badge>
          </div>
          {unread ? (
            <Button className="mt-3 w-full" variant="outline" size="sm" onClick={markMineRead}>
              <CheckCheck data-icon="inline-start" />
              Mark my notifications read
            </Button>
          ) : null}
          {summary ? (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              {canViewEnrollment ? (
                <div className="rounded-lg border bg-background/60 p-2">
                  <div className="font-semibold">{summary.stats.newInquiries}</div>
                  <div className="text-muted-foreground">Inquiries</div>
                </div>
              ) : null}
              {canViewTasks ? (
                <div className="rounded-lg border bg-background/60 p-2">
                  <div className="font-semibold">{summary.stats.openTasks}</div>
                  <div className="text-muted-foreground">Tasks</div>
                </div>
              ) : null}
              {canViewFteReports ? (
                <div className="rounded-lg border bg-background/60 p-2">
                  <div className="font-semibold">{summary.stats.missingFteReports}</div>
                  <div className="text-muted-foreground">FTE due</div>
                </div>
              ) : null}
              {!canViewEnrollment && !canViewTasks && !canViewFteReports ? (
                <div className="col-span-3 rounded-lg border bg-background/60 p-2">
                  <div className="font-semibold">{summary.stats.pendingIncidents}</div>
                  <div className="text-muted-foreground">Review items</div>
                </div>
              ) : null}
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 p-5">
        <BrandMark branding={currentUser?.branding} />
      </div>
      <ScrollArea className="min-h-0 flex-1 px-3">
        <nav className="flex flex-col gap-5 pb-4">
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
        <div className="border-t py-4">
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
      </ScrollArea>
    </div>
  );
}

function isTeacherUser(currentUser?: ShellUser) {
  return currentUser?.role === "TEACHER";
}

function isParentFacingUser(currentUser?: ShellUser) {
  return currentUser?.role === "PARENT_GUARDIAN" || currentUser?.role === "AUTHORIZED_PICKUP";
}

function AccountMenu({ currentUser, onLogout }: { currentUser: ShellUser; onLogout: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Open account menu" className="overflow-hidden rounded-full p-0" />}>
        <UserAvatar name={currentUser.name} src={currentUser.profilePhotoUrl} size="md" className="border-0 shadow-none" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="p-2">
          <ProfilePhotoUploader name={currentUser.name} email={currentUser.email} profilePhotoUrl={currentUser.profilePhotoUrl} />
        </div>
        <div className="px-3 pb-2">
          <span className="mt-1 block text-[0.65rem] font-normal text-muted-foreground">{currentUser.role.replaceAll("_", " ")}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} variant="destructive" className="py-2">
          <LogOut data-icon="inline-start" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RoleBottomNav({ currentUser }: { currentUser?: ShellUser }) {
  const pathname = usePathname();
  const teacherItems = [
    { label: "Home", href: "/dashboard", Icon: Home },
    { label: "Classroom", href: "/teacher-portal", Icon: ClipboardList },
    { label: "Messages", href: "/messages", Icon: MessageSquare },
    { label: "Docs", href: "/documents", Icon: FileText },
  ];
  const parentItems = currentUser?.role === "AUTHORIZED_PICKUP"
    ? [
        { label: "Family", href: "/parent-portal", Icon: Home },
        { label: "Alerts", href: "/notifications", Icon: Bell },
        { label: "Help", href: "/help", Icon: ShieldCheck },
      ]
    : [
        { label: "Family", href: "/parent-portal", Icon: Home },
        { label: "Billing", href: "/parent-portal#billing", Icon: CreditCard },
        { label: "Photos", href: "/parent-portal#photos", Icon: Camera },
        { label: "Docs", href: "/parent-portal#documents", Icon: FileText },
        { label: "Messages", href: "/parent-portal#messages", Icon: MessageSquare },
      ];
  const items = isTeacherUser(currentUser) ? teacherItems : isParentFacingUser(currentUser) ? parentItems : [];
  if (!items.length) return null;

  return (
    <nav
      aria-label="Role quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl xl:hidden"
    >
      <div className={cn("mx-auto grid max-w-md gap-1", items.length === 3 ? "grid-cols-3" : items.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {items.map(({ label, href, Icon }) => {
          const hrefPath = href.split("#")[0];
          const active = pathname === hrefPath;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[0.68rem] font-medium text-muted-foreground transition",
                active && "bg-primary/12 text-primary",
              )}
            >
              <Icon className="size-4" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({ children, currentUser }: { children: React.ReactNode; currentUser?: ShellUser }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResponse, setSearchResponse] = useState<{ query: string; results: GlobalSearchResult[]; error: string }>({
    query: "",
    results: [],
    error: "",
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const searchUserEmail = currentUser?.email ?? "";
  const trimmedSearchQuery = searchQuery.trim();
  const activeSearchResults = searchResponse.query === trimmedSearchQuery ? searchResponse.results : [];
  const activeSearchError = searchResponse.query === trimmedSearchQuery ? searchResponse.error : "";
  const searchPending = trimmedSearchQuery.length >= 2 && searchResponse.query !== trimmedSearchQuery;
  const hasRoleBottomNav = isTeacherUser(currentUser) || isParentFacingUser(currentUser);
  const visibleCommandItems = navGroups
    .flatMap((group) => group.items.map(([label, slug, Icon]) => ({ label, slug, Icon, group: group.title })))
    .filter((item) => canAccessModule(currentUser, item.slug))
    .slice(0, 12);
  const searchDestination = canAccessModule(currentUser, "crm-leads")
    ? "crm-leads"
    : canAccessModule(currentUser, "parent-portal")
      ? "parent-portal"
      : canAccessModule(currentUser, "billing-invoices")
        ? "billing-invoices"
        : canAccessModule(currentUser, "messages")
          ? "messages"
          : "dashboard";
  const searchPlaceholder = searchDestination === "crm-leads"
    ? "Search families, children, invoices, tours, tasks..."
    : searchDestination === "parent-portal"
      ? "Search your family portal..."
      : searchDestination === "billing-invoices"
        ? "Search billing accounts and invoices..."
        : searchDestination === "messages"
          ? "Search messages..."
          : "Search your dashboard...";

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("bee-suite-theme");
    if (storedTheme === "dark") document.documentElement.classList.add("dark");
    if (storedTheme === "light") document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!searchUserEmail || query.length < 2) {
      return;
    }

    const handle = window.setTimeout(() => {
      fetch(`/api/global-search?q=${encodeURIComponent(query)}`)
        .then((response) => response.json())
        .then((json: { ok?: boolean; results?: GlobalSearchResult[]; error?: string }) => {
          if (!json?.ok) {
            setSearchResponse({ query, results: [], error: json?.error || "Search is unavailable." });
            return;
          }
          setSearchResponse({ query, results: json.results ?? [], error: "" });
        })
        .catch(() => {
          setSearchResponse({ query, results: [], error: "Search is unavailable." });
        });
    }, 180);

    return () => {
      window.clearTimeout(handle);
    };
  }, [searchQuery, searchUserEmail]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  function submitGlobalSearch() {
    const query = searchQuery.trim();
    if (!query) return;
    const firstResult = query.length >= 2 ? activeSearchResults[0] : undefined;
    setSearchOpen(false);
    router.push(firstResult?.href ?? `/${searchDestination}?q=${encodeURIComponent(query)}`);
  }

  function toggleTheme() {
    const root = document.documentElement;
    const nextDark = !root.classList.contains("dark");
    root.classList.toggle("dark", nextDark);
    window.localStorage.setItem("bee-suite-theme", nextDark ? "dark" : "light");
  }

  return (
    <div className="min-h-screen">
      <aside className={cn("fixed inset-y-0 left-0 z-20 hidden h-dvh w-72 overflow-hidden border-r bg-sidebar/90 backdrop-blur-xl", hasRoleBottomNav ? "xl:block" : "lg:block")}>
        <SidebarNav currentUser={currentUser} />
      </aside>
      <div className={cn(hasRoleBottomNav ? "xl:pl-72" : "lg:pl-72")}>
        <header className="sticky top-0 z-10 border-b bg-background/75 backdrop-blur-xl">
          <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6">
            <Sheet>
              <SheetTrigger
                render={
                  <Button variant="outline" size="icon" className={cn(hasRoleBottomNav ? "xl:hidden" : "lg:hidden")} aria-label="Open navigation" />
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
                  aria-autocomplete="list"
                  aria-controls="global-search-results"
                  aria-expanded={searchOpen && searchQuery.trim().length >= 2}
                  className="h-11 rounded-xl border-border/70 bg-card/70 pl-10"
                  placeholder={searchPlaceholder}
                  role="combobox"
                  value={searchQuery}
                  onBlur={() => {
                    window.setTimeout(() => setSearchOpen(false), 120);
                  }}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitGlobalSearch();
                  }}
                />
                {searchOpen && searchQuery.trim().length >= 2 ? (
                  <div
                    id="global-search-results"
                    className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl shadow-black/15"
                    role="listbox"
                  >
                    <div className="border-b px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Search records
                    </div>
                    {searchPending ? (
                      <div className="px-3 py-4 text-sm text-muted-foreground">Searching families, billing, leads, and child records...</div>
                    ) : activeSearchError ? (
                      <div className="px-3 py-4 text-sm text-destructive">{activeSearchError}</div>
                    ) : activeSearchResults.length ? (
                      <div className="max-h-[28rem] overflow-auto p-2">
                        {activeSearchResults.map((result) => (
                          <Link
                            key={result.id}
                            href={result.href}
                            className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            role="option"
                            onClick={() => setSearchOpen(false)}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{result.label}</span>
                              <span className="block truncate text-xs text-muted-foreground">{result.detail}</span>
                            </span>
                            {result.badge ? <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">{result.badge}</Badge> : null}
                            <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 py-4 text-sm text-muted-foreground">
                        No matching records. Press Enter to search {searchDestination.replaceAll("-", " ")}.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="secondary" className="hidden gap-1 rounded-lg px-3 py-1 sm:inline-flex">
                <Sparkles data-icon="inline-start" />
                AI suggestions require review
              </Badge>
              {currentUser ? <LiveRefreshStatus role={currentUser.role} /> : null}
              <Dialog>
                <Tooltip>
                  <DialogTrigger render={<TooltipTrigger render={<Button variant="outline" size="icon" aria-label="Open command menu" />} />}>
                    <Command />
                  </DialogTrigger>
                  <TooltipContent>Open command menu</TooltipContent>
                </Tooltip>
                <DialogContent className="sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Command menu</DialogTitle>
                    <DialogDescription>Open the next workspace area for your role.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-2">
                    {visibleCommandItems.map(({ label, slug, Icon, group }) => {
                      const href = slug === "dashboard" ? "/dashboard" : `/${slug}`;
                      return (
                        <Link key={slug} href={href} className="flex items-center gap-3 rounded-lg border bg-background/60 p-3 transition hover:border-primary/50 hover:bg-primary/10">
                          <Icon className="text-primary" />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{label}</span>
                            <span className="block text-xs text-muted-foreground">{group}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </DialogContent>
              </Dialog>
              <NotificationDropdown currentUser={currentUser} />
              <Button variant="outline" size="icon" aria-label="Toggle theme" onClick={toggleTheme}>
                <Moon className="dark:hidden" />
                <Sun className="hidden dark:block" />
              </Button>
              {currentUser ? (
                <>
                  <div className="sm:hidden">
                    <AccountMenu currentUser={currentUser} onLogout={logout} />
                  </div>
                  <div className="hidden items-center gap-2 sm:flex">
                    <AccountMenu currentUser={currentUser} onLogout={logout} />
                    <div className="rounded-lg border bg-card/70 px-3 py-1.5 text-right">
                      <div className="text-xs font-medium leading-none">{currentUser.name}</div>
                      <div className="mt-1 text-[0.65rem] text-muted-foreground">{currentUser.role.replaceAll("_", " ")}</div>
                    </div>
                    <Button variant="outline" size="icon" aria-label="Sign out" onClick={logout}>
                      <LogOut />
                    </Button>
                  </div>
                </>
              ) : (
                <Button variant="secondary" className="hidden gap-2 sm:inline-flex" nativeButton={false} render={<Link href="/login" />}>
                  Live workspace
                  <ChevronDown data-icon="inline-end" />
                </Button>
              )}
            </div>
          </div>
        </header>
        <main className={cn("min-h-[calc(100vh-4rem)] p-4 sm:p-6 xl:p-8", hasRoleBottomNav && "pb-24 xl:pb-8")}>{children}</main>
      </div>
      <RoleBottomNav currentUser={currentUser} />
    </div>
  );
}
