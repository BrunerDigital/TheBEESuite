"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  BadgeDollarSign,
  Bell,
  Building2,
  Camera,
  CheckCheck,
  ChevronDown,
  ClipboardList,
  Command,
  Home,
  Menu,
  Moon,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";
import { BrandIcon, BrandLogo } from "@/components/brand-logo";
import { AccountsReceivableSheet } from "@/components/accounts-receivable-sheet";
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
import { clearClassroomOfflineQueues } from "@/lib/classroom-offline-queue";
import { canViewAccountBalances, isExecutiveAccountBalanceView } from "@/lib/accounts-receivable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { modules, navGroups } from "@/lib/demo-data";
import { notificationCenterHrefForRole, storedNotificationHrefForRole } from "@/lib/notification-links";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notification-client-events";
import { canAccessModule } from "@/lib/rbac";
import { canUseKidCityCorporateBilling, type WorkspaceBranding } from "@/lib/brand-assets";
import { cn } from "@/lib/utils";
import { removeDemoMarkersFromUserView } from "@/lib/user-view-text";
import { workspaceVisualDomain } from "@/lib/workspace-visual-domain";
import { SchoolTimeZoneProvider } from "@/components/school-time-zone-context";
import { WebPushControl } from "@/components/web-push-control";
import { DataReadinessContextBadge, type CountSummary } from "@/components/data-readiness-context-badge";
import { DataReadinessContextPanel } from "@/components/data-readiness-context-panel";
import { dataReadinessContextForPath } from "@/lib/data-readiness-context";
import { dataReadinessCenterEnabled, honeyglassUiEnabled } from "@/lib/honeyglass";
import type { WorkspaceScopeContext } from "@/lib/workspace-scope";

type ShellUser = {
  name: string;
  email: string;
  role: string;
  accessScope?: string;
  centerIds?: string[];
  profilePhotoUrl?: string | null;
  branding?: WorkspaceBranding;
  timeZone?: string;
  timeZonesByCenterId?: Record<string, string>;
  scopeContext?: WorkspaceScopeContext;
};

function canAccessShellModule(currentUser: ShellUser | undefined, slug: string) {
  if (slug === "data-readiness" && !dataReadinessCenterEnabled()) return false;
  if (
    slug === "corporate-billing"
    && !canUseKidCityCorporateBilling(currentUser?.role, currentUser?.branding?.kind)
  ) return false;
  return canAccessModule(currentUser, slug);
}

function ScopeIcon({ kind, className }: { kind: WorkspaceScopeContext["kind"]; className?: string }) {
  if (kind === "family") return <Users className={className} aria-hidden="true" />;
  if (kind === "classroom") return <ClipboardList className={className} aria-hidden="true" />;
  if (kind === "portfolio" || kind === "school") return <Building2 className={className} aria-hidden="true" />;
  return <ShieldCheck className={className} aria-hidden="true" />;
}

function ScopeContextLink({ currentUser, compact = false, mobile = false }: { currentUser?: ShellUser; compact?: boolean; mobile?: boolean }) {
  const context = currentUser?.scopeContext;
  if (!context) return null;
  const label = shellUserViewText(context.label, currentUser);
  const detail = shellUserViewText(context.detail, currentUser);

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={(
            <Link
              href={context.href}
              aria-label={`${label}. ${detail}`}
              className="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary transition-colors hover:border-primary/50 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          )}
        >
          <ScopeIcon kind={context.kind} className="size-5" />
        </TooltipTrigger>
        <TooltipContent side="right" className="flex max-w-72 flex-col items-start">
          <span className="font-semibold">{label}</span>
          <span className="opacity-80">{detail}</span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      href={context.href}
      aria-label={`${label}. ${detail}`}
      className={cn(
        "group flex min-w-0 items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.07] p-3 transition-colors hover:border-primary/40 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        mobile && "mx-auto w-full max-w-xl border-border/70 bg-card/75 px-3 py-2 shadow-sm",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
        <ScopeIcon kind={context.kind} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      <ChevronDown className="size-4 -rotate-90 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

function SidebarRail({ currentUser, onLogout }: { currentUser?: ShellUser; onLogout?: () => void }) {
  const pathname = usePathname();
  const visibleItems = navGroups
    .flatMap((group) => group.items.map(([label, slug, Icon]) => ({ label, slug, Icon, group: group.title })))
    .filter((item) => canAccessShellModule(currentUser, item.slug));

  return (
    <div className="flex h-full min-h-0 flex-col items-center gap-3 overflow-hidden py-4">
      <Link href="/" aria-label={`${currentUser?.branding?.name ?? "The BEE Suite"} home`}>
        <BrandIcon branding={currentUser?.branding} className="size-10" />
      </Link>
      <ScopeContextLink currentUser={currentUser} compact />
      <ScrollArea className="min-h-0 w-full flex-1 px-2">
        <nav className="flex flex-col items-center gap-2 py-2" aria-label="Tablet navigation rail">
          {visibleItems.map(({ label, slug, Icon, group }) => {
            const href = slug === "dashboard" ? "/dashboard" : `/${slug}`;
            const active = pathname === href || (slug === "dashboard" && pathname === "/center-dashboard");
            return (
              <Tooltip key={slug}>
                <TooltipTrigger
                  render={(
                    <Link
                      href={href}
                      aria-label={label}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "grid size-11 place-items-center rounded-xl border border-transparent text-muted-foreground transition hover:border-primary/20 hover:bg-primary/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active && "border-primary/30 bg-primary/15 text-primary shadow-sm",
                      )}
                    />
                  )}
                >
                  <Icon className="size-5" />
                </TooltipTrigger>
                <TooltipContent side="right"><span className="font-semibold">{label}</span><span className="ml-1 opacity-75">· {group}</span></TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </ScrollArea>
      {currentUser && onLogout ? <AccountMenu currentUser={currentUser} onLogout={onLogout} /> : null}
    </div>
  );
}

function shellUserViewText(value: string, currentUser?: ShellUser) {
  void currentUser;
  return removeDemoMarkersFromUserView(value);
}

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

function BrandMark({ branding }: { branding?: WorkspaceBranding }) {
  return <BrandLogo href="/" branding={branding} size="md" />;
}

function NotificationDropdown({ currentUser }: { currentUser?: ShellUser }) {
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [unread, setUnread] = useState(0);
  const mountedRef = useRef(true);
  const canViewEnrollment = canAccessShellModule(currentUser, "crm-leads");
  const canViewTasks = canViewEnrollment;
  const canViewFteReports = canAccessShellModule(currentUser, "fte-reports");
  const notificationCenterHref = notificationCenterHrefForRole(currentUser?.role);

  const syncAppBadge = useCallback((count: number) => {
    if (count > 0 && "setAppBadge" in navigator) {
      void navigator.setAppBadge(count).catch(() => undefined);
    } else if (count === 0 && "clearAppBadge" in navigator) {
      void navigator.clearAppBadge().catch(() => undefined);
    }
  }, []);

  const loadUnreadCount = useCallback(() => {
    fetch("/api/notifications/summary?mode=count", { cache: "no-store" })
      .then((response) => response.json())
      .then((json) => {
        if (mountedRef.current && json?.ok && typeof json.unread === "number") {
          setUnread(json.unread);
          syncAppBadge(json.unread);
        }
      })
      .catch(() => undefined);
  }, [syncAppBadge]);

  const loadSummary = useCallback(() => {
    fetch("/api/notifications/summary", { cache: "no-store" })
      .then((response) => response.json())
      .then((json) => {
        if (mountedRef.current && json?.ok) {
          const nextSummary = json as NotificationSummary;
          setSummary(nextSummary);
          setUnread(nextSummary.stats.unread);
          syncAppBadge(nextSummary.stats.unread);
        }
      })
      .catch(() => undefined);
  }, [syncAppBadge]);

  useEffect(() => {
    mountedRef.current = true;
    void loadUnreadCount();
    return () => {
      mountedRef.current = false;
    };
  }, [loadUnreadCount]);

  useEffect(() => {
    const refresh = () => void loadUnreadCount();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const refreshFromServiceWorker = (event: MessageEvent) => {
      if (event.data?.type === "bee-suite-notification") refresh();
    };
    const timer = window.setInterval(refresh, 60_000);

    window.addEventListener("focus", refresh);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    navigator.serviceWorker?.addEventListener("message", refreshFromServiceWorker);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      navigator.serviceWorker?.removeEventListener("message", refreshFromServiceWorker);
    };
  }, [loadUnreadCount]);

  async function markMineRead() {
    await fetch("/api/notifications/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    }).catch(() => undefined);
    void loadSummary();
  }

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
      href: storedNotificationHrefForRole(notification, currentUser?.role),
    })) ?? []),
  ].slice(0, 6);

  return (
    <DropdownMenu onOpenChange={(open) => {
      if (open) void loadSummary();
    }}>
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
          <WebPushControl />
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
                <div className="font-medium">{shellUserViewText(item.title, currentUser)}</div>
                <Badge variant={item.priority === "high" ? "destructive" : "outline"}>{item.priority}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {shellUserViewText(item.body, currentUser)}
              </p>
            </Link>
          ))}
          {!summary ? (
            <div className="p-4 text-sm text-muted-foreground">Loading notification details…</div>
          ) : !items.length ? (
            <div className="p-4 text-sm text-muted-foreground">No urgent notifications are queued for your scope.</div>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="p-0"
          render={(
            <Link href={notificationCenterHref} className="block w-full p-3 text-sm font-medium text-primary hover:bg-muted" />
          )}
        >
          {notificationCenterHref === "/parent-portal" ? "Open parent portal" : "Open notification center"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarNav({ close, currentUser, onLogout }: { close?: () => void; currentUser?: ShellUser; onLogout?: () => void }) {
  const pathname = usePathname();
  const descriptionBySlug = new Map(modules.map((module) => [module.slug, module.description]));
  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(([, slug]) => canAccessShellModule(currentUser, slug)),
    }))
    .filter((group) => group.items.length);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 p-5">
        <BrandMark branding={currentUser?.branding} />
        <div className="mt-4">
          <ScopeContextLink currentUser={currentUser} />
        </div>
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
                  const active = pathname === href || (slug === "dashboard" && pathname === "/center-dashboard");
                  const description = descriptionBySlug.get(slug) ?? `${label} workspace, tools, and related activity.`;
                  return (
                    <Tooltip key={slug}>
                      <TooltipTrigger
                        render={
                          <Link
                            href={href}
                            onClick={close}
                            aria-description={description}
                            className={cn(
                              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                              active &&
                                "bg-sidebar-accent pl-4 text-sidebar-accent-foreground shadow-sm before:absolute before:left-1.5 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-primary",
                            )}
                          />
                        }
                      >
                        <Icon data-icon="inline-start" />
                        <span className="truncate">{label}</span>
                      </TooltipTrigger>
                      <TooltipContent side="right" align="start" className="max-w-80 flex-col items-start gap-0.5 px-3 py-2 text-xs leading-5">
                        <span className="font-semibold">{label}</span>
                        <span className="text-background/80">{description}</span>
                      </TooltipContent>
                    </Tooltip>
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
      {currentUser && onLogout ? (
        <div className="shrink-0 border-t p-3">
          <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-background/55 p-2.5">
            <AccountMenu currentUser={currentUser} onLogout={onLogout} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{shellUserViewText(currentUser.name, currentUser)}</div>
              <div className="truncate text-xs text-muted-foreground">{currentUser.role.replaceAll("_", " ").toLocaleLowerCase()}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isTeacherUser(currentUser?: ShellUser) {
  return currentUser?.role === "TEACHER";
}

function isParentFacingUser(currentUser?: ShellUser) {
  return currentUser?.role === "PARENT_GUARDIAN" || currentUser?.role === "AUTHORIZED_PICKUP";
}

function AccountMenu({ currentUser, onLogout, previewMode = false }: { currentUser: ShellUser; onLogout: () => void; previewMode?: boolean }) {
  const displayName = removeDemoMarkersFromUserView(currentUser.name);
  const displayEmail = removeDemoMarkersFromUserView(currentUser.email);
  if (previewMode) {
    return <UserAvatar name={displayName} src={currentUser.profilePhotoUrl} size="md" className="border shadow-none" />;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Open account menu" className="overflow-hidden rounded-full p-0" />}>
        <UserAvatar name={displayName} src={currentUser.profilePhotoUrl} size="md" className="border-0 shadow-none" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="p-2">
          <ProfilePhotoUploader name={displayName} email={displayEmail} profilePhotoUrl={currentUser.profilePhotoUrl} />
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

function RoleBottomNav({ currentUser, previewMode = false, previewHrefBase }: { currentUser?: ShellUser; previewMode?: boolean; previewHrefBase?: string }) {
  const pathname = usePathname();
  const [selectedTarget, setSelectedTarget] = useState(pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const teacherItems = [
    { label: "Today", href: "/teacher-portal", slug: "teacher-portal", Icon: Home },
    { label: "Roster", href: "/teacher-portal#teacher-roster", slug: "teacher-portal", Icon: Users },
    { label: "Log", href: "/teacher-portal#teacher-quick-log", slug: "teacher-portal", Icon: ClipboardList, featured: true },
    { label: "Messages", href: "/messages", slug: "messages", Icon: MessageSquare },
  ];
  const parentItems = [
    { label: "Home", href: "/parent-portal", slug: "parent-portal", Icon: Home },
    { label: "Day", href: "/parent-portal#today", slug: "parent-portal", Icon: Activity },
    { label: "Messages", href: "/parent-portal#messages", slug: "parent-portal", Icon: MessageSquare },
    { label: "Payments", href: "/parent-portal#billing", slug: "parent-portal", Icon: BadgeDollarSign },
  ];
  const pickupItems = [
    { label: "Home", href: "/parent-portal", slug: "parent-portal", Icon: Home },
    { label: "Day", href: "/parent-portal#today", slug: "parent-portal", Icon: Activity },
    { label: "Photos", href: "/parent-portal#photos", slug: "parent-portal", Icon: Camera },
    { label: "Updates", href: "/parent-portal#daily-updates", slug: "parent-portal", Icon: ClipboardList },
  ];
  const directorItems = [
    { label: "Overview", href: "/dashboard", slug: "dashboard", Icon: Home },
    { label: "School", href: "/classroom-dashboard", slug: "classroom-dashboard", Icon: Building2 },
    { label: "Actions", href: "/notifications", slug: "notifications", Icon: ClipboardList, featured: true },
    { label: "Inbox", href: "/messages", slug: "messages", Icon: MessageSquare },
  ];
  const executiveItems = [
    { label: "Overview", href: "/dashboard", slug: "dashboard", Icon: Home },
    { label: "Schools", href: "/multi-location-dashboard", slug: "multi-location-dashboard", Icon: Building2 },
    { label: "Actions", href: "/notifications", slug: "notifications", Icon: ClipboardList, featured: true },
    { label: "Inbox", href: "/messages", slug: "messages", Icon: MessageSquare },
  ];
  const billingItems = [
    { label: "Overview", href: "/dashboard", slug: "dashboard", Icon: Home },
    { label: "Billing", href: "/billing-invoices", slug: "billing-invoices", Icon: BadgeDollarSign },
    { label: "Payments", href: "/billing-invoices?view=payments", slug: "payments", Icon: Activity, featured: true },
    { label: "Inbox", href: "/messages", slug: "messages", Icon: MessageSquare },
  ];
  const auditorItems = [
    { label: "Overview", href: "/dashboard", slug: "dashboard", Icon: Home },
    { label: "Schools", href: "/multi-location-dashboard", slug: "multi-location-dashboard", Icon: Building2 },
    { label: "Reports", href: "/analytics", slug: "analytics", Icon: Activity, featured: true },
    { label: "Audit", href: "/audit-logs", slug: "audit-logs", Icon: ShieldCheck },
  ];
  const executiveRole = ["PLATFORM_OWNER", "BRAND_ADMIN", "REGIONAL_MANAGER"].includes(currentUser?.role ?? "");
  const sourceItems = isTeacherUser(currentUser)
    ? teacherItems
    : currentUser?.role === "PARENT_GUARDIAN"
      ? parentItems
      : currentUser?.role === "AUTHORIZED_PICKUP"
        ? pickupItems
      : currentUser?.role === "READ_ONLY_AUDITOR"
        ? auditorItems
      : currentUser?.role === "BILLING_ADMIN"
        ? billingItems
        : executiveRole
          ? executiveItems
          : currentUser
            ? directorItems
            : [];
  const items = sourceItems.filter((item) => canAccessShellModule(currentUser, item.slug));
  const moreItems = navGroups
    .flatMap((group) => group.items.map(([label, slug, Icon]) => ({ label, slug, Icon, group: group.title })))
    .filter((item) => canAccessShellModule(currentUser, item.slug))
    .filter((item) => !items.some((quickItem) => quickItem.slug === item.slug))
    .slice(0, 12);
  const bottomNavItemCount = items.length + (moreItems.length ? 1 : 0);

  useEffect(() => {
    if (currentUser?.role !== "PARENT_GUARDIAN" && currentUser?.role !== "AUTHORIZED_PICKUP") return;

    function syncParentPortalTarget() {
      const hash = window.location.hash;
      const previewBase = currentUser?.role === "PARENT_GUARDIAN" || currentUser?.role === "AUTHORIZED_PICKUP"
        ? "/parent-portal"
        : "/teacher-portal";
      setSelectedTarget(previewMode ? `${previewBase}${hash}` : `${pathname}${hash}`);
    }

    syncParentPortalTarget();
    window.addEventListener("hashchange", syncParentPortalTarget);
    return () => window.removeEventListener("hashchange", syncParentPortalTarget);
  }, [currentUser?.role, pathname, previewMode]);

  if (!items.length) return null;

  return (
    <nav
      aria-label="Role quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:hidden"
    >
      <div className={cn(
        "mx-auto grid max-w-md items-end gap-1",
        bottomNavItemCount <= 1 ? "grid-cols-1" : bottomNavItemCount === 2 ? "grid-cols-2" : bottomNavItemCount === 3 ? "grid-cols-3" : bottomNavItemCount === 4 ? "grid-cols-4" : "grid-cols-5",
      )}>
        {items.map((item) => {
          const { label, href, Icon } = item;
          const featured = Boolean("featured" in item && item.featured);
          const hrefPath = href.split("#")[0];
          const previewHref = previewMode && href.includes("#")
            ? `${previewHrefBase ?? pathname}${href.slice(href.indexOf("#"))}`
            : previewMode
              ? previewHrefBase ?? pathname
              : href;
          const selectedPath = selectedTarget.split(/[?#]/)[0];
          const active = previewMode
            ? selectedTarget === href
            : selectedPath === pathname
              ? selectedTarget === href
              : pathname === hrefPath && !href.includes("#") && !href.includes("?");
          return (
            <Link
              key={href}
              href={previewHref}
              aria-current={active ? "page" : undefined}
              onClick={() => setSelectedTarget(href)}
              className={cn(
                "relative flex min-h-12 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl px-1.5 text-[0.68rem] font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "bg-primary/12 text-primary shadow-sm",
                featured && "-mt-5 min-h-16 rounded-2xl border border-primary/35 bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90",
              )}
            >
              <Icon className={cn("size-4", featured && "size-5")} aria-hidden="true" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
        {moreItems.length ? <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            render={(
              <button
                type="button"
                className="flex min-h-12 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl px-1.5 text-[0.68rem] font-medium text-muted-foreground transition-colors hover:bg-primary/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Open more navigation"
              />
            )}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
            <span>More</span>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[82dvh] rounded-t-3xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <SheetTitle className="text-left">More for your role</SheetTitle>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {moreItems.map(({ label, slug, Icon, group }) => {
                const href = slug === "dashboard" ? "/dashboard" : `/${slug}`;
                return (
                  <Link
                    key={slug}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className="flex min-h-14 items-center gap-3 rounded-xl border bg-card/70 p-3 transition-colors hover:border-primary/40 hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" aria-hidden="true" /></span>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{label}</span><span className="block truncate text-xs text-muted-foreground">{group}</span></span>
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet> : null}
      </div>
    </nav>
  );
}

export function AppShell({ children, currentUser, previewMode = false, previewHrefBase }: { children: React.ReactNode; currentUser?: ShellUser; previewMode?: boolean; previewHrefBase?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const readinessContext = dataReadinessContextForPath(pathname);
  const canViewDataReadiness = !previewMode && canAccessShellModule(currentUser, "data-readiness");
  const readinessRequestKey = `${currentUser?.email ?? "anonymous"}:${readinessContext ?? "global"}`;
  const [readinessState, setReadinessState] = useState<{
    key: string;
    summary: CountSummary | null;
    unavailable: boolean;
  } | null>(null);
  const currentReadinessState = readinessState?.key === readinessRequestKey ? readinessState : null;
  const readinessSummary = currentReadinessState?.summary ?? null;
  const readinessLoading = canViewDataReadiness && !currentReadinessState;
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResponse, setSearchResponse] = useState<{ query: string; results: GlobalSearchResult[]; error: string }>({
    query: "",
    results: [],
    error: "",
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchUserEmail = previewMode ? "" : currentUser?.email ?? "";
  const displayUserName = currentUser
    ? removeDemoMarkersFromUserView(currentUser.name)
    : undefined;
  const trimmedSearchQuery = searchQuery.trim();
  const activeSearchResults = searchResponse.query === trimmedSearchQuery ? searchResponse.results : [];
  const activeSearchError = searchResponse.query === trimmedSearchQuery ? searchResponse.error : "";
  const searchPending = trimmedSearchQuery.length >= 2 && searchResponse.query !== trimmedSearchQuery;
  const hasRoleBottomNav = Boolean(currentUser);
  const parentFacing = isParentFacingUser(currentUser);
  const showWorkspaceTools = !parentFacing;
  const showNotificationTools = Boolean(currentUser && !previewMode);
  const visualDomain = workspaceVisualDomain(pathname, currentUser?.role);
  const visibleCommandItems = navGroups
    .flatMap((group) => group.items.map(([label, slug, Icon]) => ({ label, slug, Icon, group: group.title })))
    .filter((item) => canAccessShellModule(currentUser, item.slug))
    .slice(0, 12);
  const searchDestination = canAccessShellModule(currentUser, "crm-leads")
    ? "crm-leads"
    : canAccessShellModule(currentUser, "parent-portal")
      ? "parent-portal"
      : canAccessShellModule(currentUser, "billing-invoices")
        ? "billing-invoices"
        : canAccessShellModule(currentUser, "messages")
          ? "messages"
          : "dashboard";
  const searchPlaceholder = searchDestination === "crm-leads"
    ? "Search families, children, invoices, tours, tasks…"
    : searchDestination === "parent-portal"
      ? "Search your family portal…"
      : searchDestination === "billing-invoices"
        ? "Search billing accounts and invoices…"
        : searchDestination === "messages"
          ? "Search messages…"
          : "Search your dashboard…";

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("bee-suite-theme");
    if (storedTheme === "dark") document.documentElement.classList.add("dark");
    if (storedTheme === "light") document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    const branding = currentUser?.branding;
    if (!branding) return;

    const previousTitle = document.title;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const previousFavicon = favicon?.href;
    document.title = `${branding.name} | The BEE Suite`;
    if (favicon) favicon.href = branding.markSrc;

    return () => {
      document.title = previousTitle;
      if (favicon && previousFavicon) favicon.href = previousFavicon;
    };
  }, [currentUser?.branding]);

  useEffect(() => {
    if (!canViewDataReadiness) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ mode: "count" });
    if (readinessContext) params.set("context", readinessContext);
    fetch(`/api/data-readiness?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((result: { ok?: boolean; summary?: CountSummary }) => {
        setReadinessState({
          key: readinessRequestKey,
          summary: result.ok && result.summary ? result.summary : null,
          unavailable: !result.ok || !result.summary,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setReadinessState({ key: readinessRequestKey, summary: null, unavailable: true });
        }
      });
    return () => controller.abort();
  }, [canViewDataReadiness, readinessContext, readinessRequestKey]);

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


  useEffect(() => {
    if (!showWorkspaceTools) return;

    function handleSearchShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
    }

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [showWorkspaceTools]);

  async function logout() {
    try {
      clearClassroomOfflineQueues(window.localStorage);
    } catch {
      // Logout must still revoke the server session when managed storage is unavailable.
    }
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  function submitGlobalSearch() {
    const query = searchQuery.trim();
    if (!query) return;
    const firstResult = query.length >= 2 ? activeSearchResults[0] : undefined;
    setSearchOpen(false);
    setMobileSearchOpen(false);
    router.push(firstResult?.href ?? `/${searchDestination}?q=${encodeURIComponent(query)}`);
  }

  function toggleTheme() {
    const root = document.documentElement;
    const nextDark = !root.classList.contains("dark");
    root.classList.toggle("dark", nextDark);
    window.localStorage.setItem("bee-suite-theme", nextDark ? "dark" : "light");
  }

  return (
    <SchoolTimeZoneProvider timeZone={currentUser?.timeZone} timeZonesByCenterId={currentUser?.timeZonesByCenterId}>
    <div
      className="bee-app-frame min-h-screen"
      data-module={visualDomain}
      data-role={currentUser?.role ?? "PUBLIC"}
      data-honeyglass={honeyglassUiEnabled() ? "true" : "false"}
    >
      <a href="#workspace-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-xl">
        Skip to workspace content
      </a>
      <aside className="app-sidebar fixed inset-y-0 left-0 z-20 hidden h-dvh w-20 overflow-hidden border-r bg-sidebar/90 backdrop-blur-xl lg:block 2xl:hidden">
        <SidebarRail currentUser={currentUser} onLogout={previewMode ? undefined : logout} />
      </aside>
      <aside className="app-sidebar fixed inset-y-0 left-0 z-20 hidden h-dvh w-72 overflow-hidden border-r bg-sidebar/90 backdrop-blur-xl 2xl:block">
        <SidebarNav currentUser={currentUser} onLogout={previewMode ? undefined : logout} />
      </aside>
      <div className="min-w-0 lg:pl-20 2xl:pl-72">
        <header className="app-header sticky top-0 z-10 min-w-0 border-b bg-background/75 backdrop-blur-xl">
          <div className="flex min-h-16 min-w-0 items-center gap-2 px-3 sm:px-4 lg:px-6">
            <Sheet>
              <SheetTrigger
                render={
                  <Button variant="outline" size="icon" className="shrink-0 touch-manipulation lg:hidden" aria-label="Open navigation" />
                }
              >
                <Menu aria-hidden="true" />
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarNav currentUser={currentUser} onLogout={previewMode ? undefined : logout} />
              </SheetContent>
            </Sheet>
            {showWorkspaceTools ? <div className="hidden min-w-0 flex-1 items-center lg:flex">
              <div className="relative min-w-0 w-full max-w-2xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  ref={searchInputRef}
                  aria-autocomplete="list"
                  aria-controls="global-search-results"
                  aria-expanded={searchOpen && searchQuery.trim().length >= 2}
                  className="app-global-search h-11 rounded-xl border-border/70 bg-card/70 pl-10 pr-16"
                  autoComplete="off"
                  name="workspace-search"
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
                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border bg-background/80 px-2 py-1 text-[0.65rem] font-medium text-muted-foreground lg:block">/</kbd>
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
                              <span className="block truncate text-sm font-medium">{shellUserViewText(result.label, currentUser)}</span>
                              <span className="block truncate text-xs text-muted-foreground">{shellUserViewText(result.detail, currentUser)}</span>
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
            </div> : null}
            <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
              {showWorkspaceTools ? <Dialog open={mobileSearchOpen} onOpenChange={setMobileSearchOpen}>
                <DialogTrigger render={<Button variant="outline" size="icon" aria-label="Search workspace" className="touch-manipulation lg:hidden" />}>
                  <Search aria-hidden="true" />
                </DialogTrigger>
                <DialogContent className="sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Search workspace</DialogTitle>
                    <DialogDescription>Find families, child records, billing items, tasks, and messages for your role.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <Input autoComplete="off" name="mobile-workspace-search" placeholder={searchPlaceholder} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitGlobalSearch(); }} />
                    {trimmedSearchQuery.length < 2 ? (
                      <p className="text-sm text-muted-foreground">Type at least two characters to search scoped workspace records.</p>
                    ) : searchPending ? (
                      <p className="text-sm text-muted-foreground" aria-live="polite">Searching…</p>
                    ) : activeSearchError ? (
                      <p className="text-sm text-destructive">{activeSearchError}</p>
                    ) : activeSearchResults.length ? (
                      <div className="max-h-80 overflow-auto rounded-xl border p-2">
                        {activeSearchResults.slice(0, 6).map((result) => (
                          <Link key={result.id} href={result.href} onClick={() => setMobileSearchOpen(false)} className="flex items-center justify-between gap-3 rounded-lg p-3 text-sm transition hover:bg-primary/10">
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{shellUserViewText(result.label, currentUser)}</span>
                              <span className="block truncate text-xs text-muted-foreground">{shellUserViewText(result.detail, currentUser)}</span>
                            </span>
                            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No matching records. Press Enter to search {searchDestination.replaceAll("-", " ")}.</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog> : null}
              {showWorkspaceTools ? (
                <Badge variant="secondary" className="hidden gap-1 rounded-lg px-3 py-1 2xl:inline-flex">
                  <Sparkles data-icon="inline-start" aria-hidden="true" />
                  AI suggestions require review
                </Badge>
              ) : null}
              {canViewDataReadiness ? <DataReadinessContextBadge summary={readinessSummary} context={readinessContext} /> : null}
              {currentUser && !previewMode ? <LiveRefreshStatus role={currentUser.role} /> : null}
              {showWorkspaceTools ? (
                <div className="hidden lg:block">
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
                </div>
              ) : null}
              {!previewMode && canViewAccountBalances(currentUser) ? (
                <div className="hidden lg:block">
                  <AccountsReceivableSheet executive={isExecutiveAccountBalanceView(currentUser)} />
                </div>
              ) : null}
              {showNotificationTools ? <NotificationDropdown currentUser={currentUser} /> : null}
              <Button variant="outline" size="icon" aria-label="Toggle theme" onClick={toggleTheme}>
                <Moon className="dark:hidden" />
                <Sun className="hidden dark:block" />
              </Button>
              {currentUser ? (
                <>
                  <div className="sm:hidden">
                    <AccountMenu currentUser={currentUser} onLogout={logout} previewMode={previewMode} />
                  </div>
                  <div className="hidden items-center gap-2 sm:flex">
                    <AccountMenu currentUser={currentUser} onLogout={logout} previewMode={previewMode} />
                    <div className="hidden rounded-lg border bg-card/70 px-3 py-1.5 text-right 2xl:block">
                      <div className="text-xs font-medium leading-none">{displayUserName}</div>
                      <div className="mt-1 text-[0.65rem] text-muted-foreground">{currentUser.role.replaceAll("_", " ")}</div>
                    </div>
                    {!previewMode ? (
                      <Button variant="outline" size="icon" className="hidden 2xl:inline-flex" aria-label="Sign out" onClick={logout}>
                        <LogOut aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <Button variant="secondary" className="hidden gap-2 sm:inline-flex" nativeButton={false} render={<Link href="/directors" />}>
                  Live workspace
                  <ChevronDown data-icon="inline-end" />
                </Button>
              )}
            </div>
          </div>
          {currentUser?.scopeContext ? (
            <div className="border-t border-border/60 px-3 py-2 lg:hidden">
              <ScopeContextLink currentUser={currentUser} mobile />
            </div>
          ) : null}
        </header>
        <main id="workspace-main" className={cn("dashboard-workspace min-h-[calc(100vh-4rem)] min-w-0 scroll-mt-20 p-4 sm:p-6 xl:p-8", hasRoleBottomNav && "pb-24 lg:pb-6 xl:pb-8")}>
          {canViewDataReadiness && readinessContext ? <DataReadinessContextPanel context={readinessContext} summary={readinessSummary} loading={readinessLoading} /> : null}
          {children}
        </main>
      </div>
      <RoleBottomNav currentUser={currentUser} previewMode={previewMode} previewHrefBase={previewHrefBase} />
    </div>
    </SchoolTimeZoneProvider>
  );
}
