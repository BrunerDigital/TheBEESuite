import Image from "next/image";
import {
  Activity,
  BadgeDollarSign,
  Bell,
  BookOpen,
  Bot,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  HeartHandshake,
  Image as ImageIcon,
  Inbox,
  KeyRound,
  Link2,
  MapPin,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Star,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AuditLogViewer } from "@/components/audit-log-viewer";
import {
  BillingWorkbench,
  type BillingWorkbenchCenter,
  type BillingWorkbenchFamily,
  type BillingWorkbenchProduct,
  type BillingWorkbenchTuitionPlan,
} from "@/components/billing-workbench";
import { ExecutiveAdminConsole } from "@/components/executive-admin-console";
import { DocumentReviewActions } from "@/components/document-review-actions";
import { OperationsActionHub } from "@/components/operations-action-hub";
import { ParentPortalInviteButton } from "@/components/parent-portal-invite-button";
import { NotificationReadAction } from "@/components/notification-read-actions";
import { MessageReplyPanel, type MessageFamilyOption } from "@/components/message-reply-panel";
import { OperationalCalendar, type CalendarEventRow } from "@/components/operational-calendar";
import { FamilyRecordEditor, type EditableFamilyRecord } from "@/components/family-record-editor";
import { FamilyStudentIntakeForm } from "@/components/family-student-intake-form";
import { FteBulkImportPanel } from "@/components/fte-bulk-import-panel";
import { FteReportExplorer } from "@/components/fte-report-explorer";
import { FteReportForm, type FteReportCenterOption, type FteReportRow } from "@/components/fte-report-form";
import { GuardianPinManager } from "@/components/guardian-pin-manager";
import { MediaReviewActions } from "@/components/media-review-actions";
import { ProcareImportPanel } from "@/components/procare-import-panel";
import { StaffManagementPanel } from "@/components/staff-management-panel";
import { StripeConnectPanel, type StripeConnectCenter } from "@/components/stripe-connect-panel";
import type { FteSnapshot } from "@/lib/fte-reports";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatUtcDate(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function jsonSummary(value: unknown) {
  if (!value) return "Not set";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 3)
      .map(([key, item]) => `${key}: ${Array.isArray(item) ? item.join(", ") : String(item)}`)
      .join(" · ");
  }
  return String(value);
}

function localImageSrc(value: string | null | undefined) {
  return value?.startsWith("/") ? value : null;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <Card className="glass-panel">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {detail ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function MetricTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border bg-background/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function DemoDataNotice({ section }: { section: string }) {
  return (
    <Card className="border-primary/30 bg-primary/10">
      <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Badge variant="outline" className="border-primary/40 text-primary">
            Executive demo data
          </Badge>
          <p className="mt-2 text-sm text-muted-foreground">
            This {section} sample is visible only to executive roles and is not saved as live school data.
          </p>
        </div>
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Preview only</span>
      </CardContent>
    </Card>
  );
}

export type NotificationCenterData = {
  notifications: Array<{
    id: string;
    title: string;
    body: string;
    type: string;
    priority: string;
    readAt: Date | string | null;
    createdAt: Date | string;
  }>;
  derived: Array<{
    title: string;
    body: string;
    priority: string;
    type: string;
  }>;
  stats: {
    unread: number;
    openTasks: number;
    highIntentLeads: number;
    pendingIncidents: number;
  };
};

export function NotificationCenterPage({ data }: { data: NotificationCenterData }) {
  const items = [...data.derived, ...data.notifications].slice(0, 50);
  const isStoredNotification = (
    item: (typeof items)[number],
  ): item is NotificationCenterData["notifications"][number] => "id" in item && "readAt" in item;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <Bell data-icon="inline-start" />
          Live action queue
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Notification Center</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Role-scoped alerts from CRM tasks, high-intent leads, incident review queues, and system notifications.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Unread notifications" value={data.stats.unread} detail="Assigned to this user or system-wide" />
        <StatCard label="Open lead tasks" value={data.stats.openTasks} detail="Follow-ups needing action" />
        <StatCard label="High-intent leads" value={data.stats.highIntentLeads} detail="Lead score 75+" />
        <StatCard label="Incidents pending" value={data.stats.pendingIncidents} detail="Director review queue" />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Current Queue</CardTitle>
              <CardDescription>Newest alerts and derived CRM actions</CardDescription>
            </div>
            <NotificationReadAction label="Mark my notifications read" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Alert</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={"id" in item ? String(item.id) : `${item.type}-${index}`}>
                  <TableCell>
                    <div className="font-medium">{item.title}</div>
                    <div className="mt-1 max-w-2xl whitespace-normal text-xs text-muted-foreground">{item.body}</div>
                  </TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>
                    <Badge variant={item.priority === "high" ? "destructive" : "outline"}>{item.priority}</Badge>
                  </TableCell>
                  <TableCell>{"readAt" in item && item.readAt ? "Read" : "Open"}</TableCell>
                  <TableCell>
                    {isStoredNotification(item) ? (
                      <NotificationReadAction notificationId={item.id} readAt={item.readAt} compact />
                    ) : (
                      <span className="text-xs text-muted-foreground">Derived</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!items.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No notifications are queued for this scope.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type AuditLogsData = {
  logs: Array<{
    id: string;
    action: string;
    resource: string;
    resourceId: string | null;
    createdAt: Date | string;
    user: { name: string; email: string } | null;
    center: { name: string; crmLocationId: string | null } | null;
  }>;
  stats: {
    total: number;
    sensitive: number;
    leadActions: number;
  };
};

export function AuditLogsPage({ data }: { data: AuditLogsData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <ShieldCheck data-icon="inline-start" />
          Sensitive workflow evidence
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Audit Logs</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Live audit trail for lead creation, pipeline updates, notes, tasks, reviewed emails, and future restricted-data events.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Events" value={data.stats.total} detail="Visible to this role" />
        <StatCard label="Lead actions" value={data.stats.leadActions} detail="CRM workflow changes" />
        <StatCard label="Sensitive markers" value={data.stats.sensitive} detail="Restricted/security events" />
      </div>
      <AuditLogViewer logs={data.logs} />
    </div>
  );
}

export type TeamPermissionsData = {
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    mustResetPassword: boolean;
    accessGrants: Array<{
      id: string;
      role: string;
      scopeType: string;
      brand: { name: string } | null;
      organization: { name: string } | null;
      ownerGroup: { name: string } | null;
      center: { name: string; crmLocationId: string | null } | null;
    }>;
    staffProfile: {
      title: string;
      center: { name: string; crmLocationId: string | null } | null;
    } | null;
  }>;
  roleCounts: Array<{ role: string; count: number }>;
};

export function TeamPermissionsPage({ data }: { data: TeamPermissionsData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <KeyRound data-icon="inline-start" />
          Role-based access
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Team, Users, and Permissions</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Live user directory with role, active status, and center assignments. Passwords are managed through Supabase Auth, not stored here.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Users visible" value={data.users.length} detail="Scoped by role and center" />
        {data.roleCounts.slice(0, 3).map((role) => (
          <StatCard key={role.role} label={role.role.replaceAll("_", " ")} value={role.count} />
        ))}
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>User Directory</CardTitle>
          <CardDescription>Kid City USA pilot accounts and SaaS role model</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Center</TableHead>
                <TableHead>Access scope</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </TableCell>
                  <TableCell>{user.role.replaceAll("_", " ")}</TableCell>
                  <TableCell>{user.staffProfile?.center?.crmLocationId ?? user.staffProfile?.center?.name ?? "Organization-wide"}</TableCell>
                  <TableCell>
                    {user.accessGrants.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {user.accessGrants.slice(0, 3).map((grant) => (
                          <Badge key={grant.id} variant="outline">
                            {grant.scopeType.replaceAll("_", " ")}: {grant.center?.crmLocationId ?? grant.center?.name ?? grant.ownerGroup?.name ?? grant.organization?.name ?? grant.brand?.name ?? "Tenant"}
                          </Badge>
                        ))}
                        {user.accessGrants.length > 3 ? <Badge variant="outline">+{user.accessGrants.length - 3}</Badge> : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Role fallback</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={user.isActive ? "default" : "outline"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                      {user.mustResetPassword ? <Badge variant="secondary">Reset required</Badge> : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type AgencyAdminData = {
  stats: {
    organizations: number;
    centers: number;
    users: number;
    leads: number;
  };
  centers: Array<{
    id: string;
    name: string;
    crmLocationId: string | null;
    locationId: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    phone: string | null;
    email: string | null;
    status: string;
    licensedCapacity: number;
    ownerGroupId: string | null;
    ownerGroup: { name: string; ownerType: string } | null;
    _count: { leads: number; staff: number; classrooms: number };
  }>;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    mustResetPassword: boolean;
    accessGrants: Array<{
      id: string;
      role: string;
      scopeType: string;
      isActive: boolean;
      centerId: string | null;
      ownerGroupId: string | null;
      center: { name: string; crmLocationId: string | null } | null;
      ownerGroup: { name: string } | null;
    }>;
    staffProfile: {
      title: string;
      center: { id: string; name: string; crmLocationId: string | null } | null;
    } | null;
  }>;
  ownerGroups: Array<{
    id: string;
    name: string;
    slug: string;
    ownerType: string;
    billingEmail: string | null;
    contactName: string | null;
    status: string;
    _count: { centers: number; accessGrants: number };
  }>;
  accessGrants: Array<{
    id: string;
    role: string;
    scopeType: string;
    user: { name: string; email: string };
    brand: { name: string } | null;
    organization: { name: string } | null;
    ownerGroup: { name: string } | null;
    center: { name: string; crmLocationId: string | null } | null;
  }>;
};

export function AgencyAdminPage({ data }: { data: AgencyAdminData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <Building2 data-icon="inline-start" />
          Enterprise control
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Executive / Franchise Admin</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Corporate controls for location lifecycle, owner groups, scoped users, password resets, and multi-location visibility for Kid City USA and future SaaS tenants.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Organizations" value={data.stats.organizations} />
        <StatCard label="Centers" value={data.stats.centers} />
        <StatCard label="Users" value={data.stats.users} />
        <StatCard label="Leads" value={data.stats.leads.toLocaleString()} />
      </div>
      <ExecutiveAdminConsole centers={data.centers} ownerGroups={data.ownerGroups} users={data.users} />
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Ownership Containers</CardTitle>
            <CardDescription>Franchisees, multi-location owners, and single-center operators under a brand</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Owner group</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Centers</TableHead>
                  <TableHead>Users</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.ownerGroups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>
                      <div className="font-medium">{group.name}</div>
                      <div className="text-xs text-muted-foreground">{group.contactName ?? group.billingEmail ?? group.slug}</div>
                    </TableCell>
                    <TableCell>{group.ownerType.replaceAll("_", " ")}</TableCell>
                    <TableCell>{group._count.centers}</TableCell>
                    <TableCell>{group._count.accessGrants}</TableCell>
                  </TableRow>
                ))}
                {!data.ownerGroups.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">No owner groups have been created yet.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Scoped Access Grants</CardTitle>
            <CardDescription>Explicit visibility rules layered over roles</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Container</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.accessGrants.map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell>
                      <div className="font-medium">{grant.user.name}</div>
                      <div className="text-xs text-muted-foreground">{grant.user.email}</div>
                    </TableCell>
                    <TableCell>{grant.role.replaceAll("_", " ")}</TableCell>
                    <TableCell>{grant.scopeType.replaceAll("_", " ")}</TableCell>
                    <TableCell>{grant.center?.crmLocationId ?? grant.center?.name ?? grant.ownerGroup?.name ?? grant.organization?.name ?? grant.brand?.name ?? "Tenant"}</TableCell>
                  </TableRow>
                ))}
                {!data.accessGrants.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">No explicit grants yet. Legacy role fallbacks still apply.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Center Profiles</CardTitle>
          <CardDescription>Location routing, capacity, and recipient readiness</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Center</TableHead>
                <TableHead>Owner group</TableHead>
                <TableHead>Place</TableHead>
                <TableHead>Email routing</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Teachers</TableHead>
                <TableHead>Capacity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.centers.map((center) => (
                <TableRow key={center.id}>
                  <TableCell>
                    <div className="font-medium">{center.crmLocationId ?? center.name}</div>
                    <div className="text-xs text-muted-foreground">{center.name}</div>
                  </TableCell>
                  <TableCell>{center.ownerGroup?.name ?? "Unassigned"}</TableCell>
                  <TableCell>{[center.city, center.state].filter(Boolean).join(", ") || "Not set"}</TableCell>
                  <TableCell>
                    <Badge variant={center.email ? "default" : "outline"}>{center.email ? "Ready" : "Missing"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={center.status === "active" ? "default" : "outline"}>{center.status}</Badge>
                  </TableCell>
                  <TableCell>{center._count.leads.toLocaleString()}</TableCell>
                  <TableCell>{center._count.staff}</TableCell>
                  <TableCell>{center.licensedCapacity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type IntegrationsData = {
  integrations: Array<{
    name: string;
    purpose: string;
    status: "Connected" | "Configured" | "Missing" | "Placeholder";
    detail: string;
  }>;
  deliveryStats?: {
    total: number;
    delivered: number;
    pending: number;
    failed: number;
    skipped: number;
  };
  recentDeliveries?: Array<{
    id: string;
    provider: string;
    purpose: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    lastError: string | null;
    nextAttemptAt: Date | string | null;
    deliveredAt: Date | string | null;
    createdAt: Date | string;
    center: { name: string; crmLocationId: string | null } | null;
  }>;
};

export function IntegrationsPage({ data }: { data: IntegrationsData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <Link2 data-icon="inline-start" />
          Credential readiness
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Live environment status without exposing secrets. Credentialed integrations run from server routes with human review and audit logging where sensitive workflows are involved.
        </p>
      </section>
      {data.deliveryStats ? (
        <div className="grid gap-4 md:grid-cols-5">
          <StatCard label="Deliveries" value={data.deliveryStats.total.toLocaleString()} detail="Email and Sheets" />
          <StatCard label="Delivered" value={data.deliveryStats.delivered.toLocaleString()} />
          <StatCard label="Pending retry" value={data.deliveryStats.pending.toLocaleString()} />
          <StatCard label="Failed" value={data.deliveryStats.failed.toLocaleString()} />
          <StatCard label="Skipped" value={data.deliveryStats.skipped.toLocaleString()} detail="Not configured" />
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.integrations.map((integration) => (
          <Card key={integration.name} className="glass-panel">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{integration.name}</CardTitle>
                  <CardDescription>{integration.purpose}</CardDescription>
                </div>
                <Badge variant={integration.status === "Connected" || integration.status === "Configured" ? "default" : "outline"}>
                  {integration.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">{integration.detail}</p>
              {integration.status === "Connected" || integration.status === "Configured" ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-primary">
                  <CheckCircle2 data-icon="inline-start" />
                  Ready for pilot workflows
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      {data.recentDeliveries ? (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Integration Delivery Health</CardTitle>
            <CardDescription>
              Recent outbound inquiry delivery attempts. Pending rows are retried by the daily cron job.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Center</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Next retry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentDeliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell>{formatDateTime(delivery.createdAt)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{delivery.provider.replaceAll("_", " ")}</div>
                      <div className="text-xs text-muted-foreground">{delivery.purpose.replaceAll("_", " ")}</div>
                      {delivery.lastError ? (
                        <div className="mt-1 max-w-md whitespace-normal text-xs text-destructive">{delivery.lastError}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>{delivery.center?.crmLocationId ?? delivery.center?.name ?? "Tenant-wide"}</TableCell>
                    <TableCell>
                      <Badge variant={delivery.status === "failed" ? "destructive" : delivery.status === "delivered" ? "default" : "outline"}>
                        {delivery.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {delivery.attempts}/{delivery.maxAttempts}
                    </TableCell>
                    <TableCell>
                      {delivery.nextAttemptAt ? formatDateTime(delivery.nextAttemptAt) : delivery.deliveredAt ? "Delivered" : "Not scheduled"}
                    </TableCell>
                  </TableRow>
                ))}
                {!data.recentDeliveries.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No integration deliveries have been recorded for this scope yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export type CenterDashboardData = {
  centerId: string | null;
  centerName: string;
  place: string;
  fteCenters: FteReportCenterOption[];
  fteReports: FteReportRow[];
  stats: {
    leads: number;
    highIntentLeads: number;
    staff: number;
    classrooms: number;
    toursUpcoming: number;
    openTasks: number;
    currentWeekFte: number | null;
    latestFte: number | null;
    fteSubmittedThisWeek: boolean;
  };
  recentLeads: Array<{
    id: string;
    familyName: string;
    stage: string;
    score: number;
    createdAt: Date | string;
  }>;
};

export function CenterDashboardPage({ data }: { data: CenterDashboardData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <MapPin data-icon="inline-start" />
          Today at {data.centerName}
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Center Dashboard</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Live center-scoped snapshot for enrollment work, tours, teachers, classrooms, and follow-up tasks. {data.place}
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Leads" value={data.stats.leads.toLocaleString()} />
        <StatCard label="High intent" value={data.stats.highIntentLeads.toLocaleString()} />
        <StatCard label="Teachers" value={data.stats.staff} />
        <StatCard label="Classrooms" value={data.stats.classrooms} />
        <StatCard label="Upcoming tours" value={data.stats.toursUpcoming} />
        <StatCard label="Open tasks" value={data.stats.openTasks} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Weekly FTE status"
          value={data.stats.fteSubmittedThisWeek ? "Submitted" : "Due"}
          detail="Current reporting week"
        />
        <StatCard
          label="Current week FTE"
          value={data.stats.currentWeekFte === null ? "Not submitted" : data.stats.currentWeekFte.toLocaleString()}
        />
        <StatCard
          label="Latest FTE"
          value={data.stats.latestFte === null ? "No reports" : data.stats.latestFte.toLocaleString()}
          detail="Most recent report on file"
        />
      </div>
      {data.fteCenters.length ? (
        <FteReportForm
          centers={data.fteCenters}
          reports={data.fteReports}
          mode="director"
          title="Submit Weekly FTE"
          description="Directors submit the weekly FTE report here. The latest rows show below for quick corrections."
        />
      ) : null}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Recent Leads</CardTitle>
          <CardDescription>Newest inquiries and manually added records</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Family</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentLeads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.familyName}</TableCell>
                  <TableCell>{lead.stage.replaceAll("_", " ")}</TableCell>
                  <TableCell><Badge>{lead.score}</Badge></TableCell>
                  <TableCell>{formatDate(lead.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {data.centerId ? (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Lobby Check-In Kiosk</CardTitle>
            <CardDescription>Open this on the lobby tablet or front desk computer for parent PIN check-in/out.</CardDescription>
          </CardHeader>
          <CardContent>
            <a className="text-sm font-medium text-primary underline-offset-4 hover:underline" href={`/check-in/${data.centerId}`} target="_blank" rel="noreferrer">
              Open kiosk screen
            </a>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export type EnrollmentPipelineData = {
  stages: Array<{
    stage: string;
    label: string;
    count: number;
    highIntent: number;
  }>;
  recentLeads: Array<{
    id: string;
    familyName: string;
    email: string | null;
    phone: string | null;
    stage: string;
    score: number;
    createdAt: Date | string;
    center: { name: string; crmLocationId: string | null };
  }>;
};

export function EnrollmentPipelinePage({ data }: { data: EnrollmentPipelineData }) {
  const total = data.stages.reduce((sum, stage) => sum + stage.count, 0);
  const highIntent = data.stages.reduce((sum, stage) => sum + stage.highIntent, 0);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <Workflow data-icon="inline-start" />
          Live enrollment pipeline
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Enrollment Pipeline</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Stage counts, high-intent families, and newest CRM records scoped to the current user.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Visible leads" value={total.toLocaleString()} />
        <StatCard label="High intent" value={highIntent.toLocaleString()} detail="Lead score 75+" />
        <StatCard label="Active stages" value={data.stages.filter((stage) => stage.count > 0).length} />
      </div>
      <div className="grid gap-4 xl:grid-cols-4">
        {data.stages.map((stage) => (
          <Card key={stage.stage} className="glass-panel">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{stage.label}</CardTitle>
                  <CardDescription>{stage.highIntent} high-intent</CardDescription>
                </div>
                <Badge>{stage.count}</Badge>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Newest Pipeline Activity</CardTitle>
          <CardDescription>Use CRM Leads to move stages, add notes, schedule tours, and contact families.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Family</TableHead>
                <TableHead>Center</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentLeads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <div className="font-medium">{lead.familyName}</div>
                    <div className="text-xs text-muted-foreground">{lead.email ?? lead.phone ?? "No contact info"}</div>
                  </TableCell>
                  <TableCell>{lead.center.crmLocationId ?? lead.center.name}</TableCell>
                  <TableCell>{lead.stage.replaceAll("_", " ")}</TableCell>
                  <TableCell><Badge>{lead.score}</Badge></TableCell>
                  <TableCell>{formatDate(lead.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type ToursPageData = {
  tours: Array<{
    id: string;
    startsAt: Date | string;
    status: string;
    notes: string | null;
    center: { name: string; crmLocationId: string | null };
    lead: { familyName: string; email: string | null; phone: string | null } | null;
  }>;
  stats: {
    upcoming: number;
    today: number;
    completed: number;
  };
};

export function ToursPage({ data }: { data: ToursPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <MapPin data-icon="inline-start" />
          Tour calendar
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Tours</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Scheduled family tours from the enrollment CRM. New tours can be scheduled from a selected lead.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Upcoming tours" value={data.stats.upcoming} />
        <StatCard label="Today" value={data.stats.today} />
        <StatCard label="Completed" value={data.stats.completed} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Tour Schedule</CardTitle>
          <CardDescription>Newest and upcoming tours by school</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>Center</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.tours.map((tour) => (
                <TableRow key={tour.id}>
                  <TableCell>{formatDateTime(tour.startsAt)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{tour.lead?.familyName ?? "Unlinked tour"}</div>
                    <div className="text-xs text-muted-foreground">{tour.lead?.email ?? tour.lead?.phone ?? ""}</div>
                  </TableCell>
                  <TableCell>{tour.center.crmLocationId ?? tour.center.name}</TableCell>
                  <TableCell><Badge variant={tour.status === "completed" ? "secondary" : "default"}>{tour.status}</Badge></TableCell>
                  <TableCell className="max-w-sm whitespace-normal text-muted-foreground">{tour.notes ?? ""}</TableCell>
                </TableRow>
              ))}
              {!data.tours.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No tours are scheduled for this scope yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type WaitlistPageData = {
  leadWaitlist: Array<{
    id: string;
    familyName: string;
    childName: string | null;
    programInterest: string | null;
    score: number;
    createdAt: Date | string;
    center: { name: string; crmLocationId: string | null };
  }>;
  entries: Array<{
    id: string;
    childName: string;
    familyName: string;
    ageGroup: string;
    desiredStartDate: Date | string | null;
    priority: number;
    status: string;
    notes: string | null;
  }>;
};

export function WaitlistPage({ data }: { data: WaitlistPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <Workflow data-icon="inline-start" />
          Enrollment demand
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Waitlist</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Families in the waitlisted CRM stage plus imported waitlist entries where available.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <StatCard label="Waitlisted leads" value={data.leadWaitlist.length} />
        <StatCard label="Waitlist entries" value={data.entries.length} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>CRM Waitlist</CardTitle>
          <CardDescription>Leads currently in the Waitlisted stage</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Family</TableHead>
                <TableHead>Child</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Center</TableHead>
                <TableHead>Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.leadWaitlist.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.familyName}</TableCell>
                  <TableCell>{lead.childName ?? "Not set"}</TableCell>
                  <TableCell>{lead.programInterest ?? "Not set"}</TableCell>
                  <TableCell>{lead.center.crmLocationId ?? lead.center.name}</TableCell>
                  <TableCell><Badge>{lead.score}</Badge></TableCell>
                </TableRow>
              ))}
              {!data.leadWaitlist.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No CRM leads are currently waitlisted in this scope.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Imported Waitlist Entries</CardTitle>
          <CardDescription>Standalone waitlist records from the data model</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Family</TableHead>
                <TableHead>Child</TableHead>
                <TableHead>Age group</TableHead>
                <TableHead>Desired start</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.familyName}</TableCell>
                  <TableCell>{entry.childName}</TableCell>
                  <TableCell>{entry.ageGroup}</TableCell>
                  <TableCell>{formatDate(entry.desiredStartDate)}</TableCell>
                  <TableCell><Badge variant="outline">{entry.status}</Badge></TableCell>
                </TableRow>
              ))}
              {!data.entries.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No standalone waitlist entries have been imported yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type MessagesPageData = {
  messages: Array<{
    id: string;
    familyId: string | null;
    subject: string | null;
    body: string;
    channel: string;
    priority: string;
    sentiment: string | null;
    readAt: Date | string | null;
    createdAt: Date | string;
    family: { name: string; billingEmail: string | null; centerId: string | null } | null;
    sender: { name: string; email: string } | null;
  }>;
  stats: {
    total: number;
    unread: number;
    priority: number;
    aiReview: number;
  };
  familyOptions: MessageFamilyOption[];
  demoMode?: boolean;
};

export function MessagesPage({ data }: { data: MessagesPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <MessageSquare data-icon="inline-start" />
          Family communication
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Parent Messaging Inbox</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Live parent and staff communication records scoped to the current user. Mr. Bee can draft responses, but reviewed human approval remains required before sensitive outreach.
        </p>
      </section>
      {data.demoMode ? <DemoDataNotice section="parent messaging" /> : null}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Messages" value={data.stats.total.toLocaleString()} />
        <StatCard label="Unread" value={data.stats.unread.toLocaleString()} />
        <StatCard label="Priority" value={data.stats.priority.toLocaleString()} />
        <StatCard label="AI review queue" value={data.stats.aiReview.toLocaleString()} detail="Human approval before sending" />
      </div>
      <MessageReplyPanel familyOptions={data.familyOptions} />
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Recent Conversations</CardTitle>
          <CardDescription>Email, portal, classroom, and future SMS-style records</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Conversation</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Sentiment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.messages.map((message) => (
                <TableRow key={message.id}>
                  <TableCell>{formatDateTime(message.createdAt)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{message.subject ?? message.family?.name ?? "Untitled message"}</div>
                    <div className="text-xs text-muted-foreground">{message.family?.name ?? message.sender?.name ?? "System"}</div>
                    <div className="mt-1 max-w-2xl whitespace-normal text-xs text-muted-foreground">{message.body}</div>
                  </TableCell>
                  <TableCell>{message.channel}</TableCell>
                  <TableCell>
                    <Badge variant={message.priority === "high" || message.priority === "urgent" ? "destructive" : "outline"}>
                      {message.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>{message.sentiment ?? (message.readAt ? "Reviewed" : "Unread")}</TableCell>
                </TableRow>
              ))}
              {!data.messages.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No messages are visible for this scope yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type AnnouncementsPageData = {
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    audience: unknown;
    status: string;
    sendAt: Date | string | null;
    center: { name: string; crmLocationId: string | null } | null;
  }>;
  stats: {
    total: number;
    draft: number;
    scheduled: number;
    sent: number;
  };
  demoMode?: boolean;
};

export function AnnouncementsPage({ data }: { data: AnnouncementsPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <Megaphone data-icon="inline-start" />
          Center broadcasts
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Announcements</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Warm, professional broadcast drafts and scheduled notices by school. Emergency alert delivery remains a future integration workflow.
        </p>
      </section>
      {data.demoMode ? <DemoDataNotice section="announcement" /> : null}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Announcements" value={data.stats.total} />
        <StatCard label="Drafts" value={data.stats.draft} />
        <StatCard label="Scheduled" value={data.stats.scheduled} />
        <StatCard label="Sent" value={data.stats.sent} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Broadcast Queue</CardTitle>
          <CardDescription>Audience, center, status, and scheduled delivery</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Announcement</TableHead>
                <TableHead>Center</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Send time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.announcements.map((announcement) => (
                <TableRow key={announcement.id}>
                  <TableCell>
                    <div className="font-medium">{announcement.title}</div>
                    <div className="mt-1 max-w-xl whitespace-normal text-xs text-muted-foreground">{announcement.body}</div>
                  </TableCell>
                  <TableCell>{announcement.center?.crmLocationId ?? announcement.center?.name ?? "All centers"}</TableCell>
                  <TableCell>{jsonSummary(announcement.audience)}</TableCell>
                  <TableCell><Badge variant={announcement.status === "sent" ? "default" : "outline"}>{announcement.status}</Badge></TableCell>
                  <TableCell>{formatDateTime(announcement.sendAt)}</TableCell>
                </TableRow>
              ))}
              {!data.announcements.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No announcements have been created for this scope yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <OperationsActionHub title="Create or Edit Announcement" defaultEntity="announcement" compact />
    </div>
  );
}

export type CampaignsPageData = {
  campaigns: Array<{
    id: string;
    name: string;
    type: string;
    audience: unknown;
    status: string;
    metrics: unknown;
    brand: { name: string } | null;
  }>;
  stats: {
    total: number;
    active: number;
    draft: number;
    paused: number;
  };
};

export function CampaignsPage({ data }: { data: CampaignsPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <Inbox data-icon="inline-start" />
          Enrollment marketing
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Campaign templates and nurture sequences for inquiries, tours, applications, waitlist updates, newsletters, and review requests.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Campaigns" value={data.stats.total} />
        <StatCard label="Active" value={data.stats.active} />
        <StatCard label="Draft" value={data.stats.draft} />
        <StatCard label="Paused" value={data.stats.paused} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Campaign Library</CardTitle>
          <CardDescription>Brand-level campaign records and performance snapshots</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Metrics</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell className="font-medium">{campaign.name}</TableCell>
                  <TableCell>{campaign.brand?.name ?? "Tenant-wide"}</TableCell>
                  <TableCell>{campaign.type}</TableCell>
                  <TableCell>{jsonSummary(campaign.audience)}</TableCell>
                  <TableCell>{jsonSummary(campaign.metrics)}</TableCell>
                  <TableCell><Badge variant={campaign.status === "active" ? "default" : "outline"}>{campaign.status}</Badge></TableCell>
                </TableRow>
              ))}
              {!data.campaigns.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No campaigns have been configured yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <OperationsActionHub title="Create or Edit Campaign" defaultEntity="campaign" compact />
    </div>
  );
}

export type AutomationsPageData = {
  automations: Array<{
    id: string;
    name: string;
    trigger: string;
    condition: unknown;
    action: unknown;
    delay: string | null;
    status: string;
    brand: { name: string } | null;
    runs: Array<{ id: string; status: string; createdAt: Date | string; logs: unknown }>;
  }>;
  stats: {
    total: number;
    active: number;
    paused: number;
    recentRuns: number;
  };
};

export function AutomationsPage({ data }: { data: AutomationsPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <Bot data-icon="inline-start" />
          Human-approved workflows
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Automations</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Workflow foundations for lead routing, tour reminders, document follow-ups, billing reminders, and Mr. Bee summaries. Sensitive decisions still require staff review.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Workflows" value={data.stats.total} />
        <StatCard label="Active" value={data.stats.active} />
        <StatCard label="Paused" value={data.stats.paused} />
        <StatCard label="Recent runs" value={data.stats.recentRuns} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Workflow Builder Foundation</CardTitle>
          <CardDescription>Trigger, condition, action, delay, status, and execution log summary</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Delay</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.automations.map((automation) => (
                <TableRow key={automation.id}>
                  <TableCell>
                    <div className="font-medium">{automation.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {automation.brand?.name ?? "Tenant-wide"} · {automation.runs.length} recent runs
                    </div>
                  </TableCell>
                  <TableCell>{automation.trigger}</TableCell>
                  <TableCell>{jsonSummary(automation.condition)}</TableCell>
                  <TableCell>{jsonSummary(automation.action)}</TableCell>
                  <TableCell>{automation.delay ?? "None"}</TableCell>
                  <TableCell><Badge variant={automation.status === "active" ? "default" : "outline"}>{automation.status}</Badge></TableCell>
                </TableRow>
              ))}
              {!data.automations.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No automations have been configured yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <OperationsActionHub title="Create or Edit Automation" defaultEntity="automation" compact />
    </div>
  );
}

export type ClassroomDashboardData = {
  centers: Array<{ id: string; name: string }>;
  classrooms: Array<{
    id: string;
    name: string;
    ageGroup: string;
    capacity: number;
    ratioRule: string | null;
    center: { name: string; crmLocationId: string | null };
    _count: { children: number; staff: number; dailyReports: number; incidents: number };
  }>;
  demoMode?: boolean;
};

export function ClassroomDashboardPage({ data }: { data: ClassroomDashboardData }) {
  const children = data.classrooms.reduce((sum, classroom) => sum + classroom._count.children, 0);
  const capacity = data.classrooms.reduce((sum, classroom) => sum + classroom.capacity, 0);
  const staff = data.classrooms.reduce((sum, classroom) => sum + classroom._count.staff, 0);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <Activity data-icon="inline-start" />
          Classroom operations
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Classroom Dashboard</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Live classroom capacity, roster, teacher assignment, daily report, and incident snapshot.
        </p>
      </section>
      {data.demoMode ? <DemoDataNotice section="classroom operations" /> : null}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Classrooms" value={data.classrooms.length} />
        <StatCard label="Children assigned" value={children} />
        <StatCard label="Licensed seats shown" value={capacity} />
        <StatCard label="Teachers assigned" value={staff} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Classrooms</CardTitle>
          <CardDescription>Capacity and ratio-ready operating view</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Classroom</TableHead>
                <TableHead>Center</TableHead>
                <TableHead>Age group</TableHead>
                <TableHead>Children</TableHead>
                <TableHead>Teachers</TableHead>
                <TableHead>Ratio rule</TableHead>
                <TableHead>Incidents</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.classrooms.map((classroom) => (
                <TableRow key={classroom.id}>
                  <TableCell className="font-medium">{classroom.name}</TableCell>
                  <TableCell>{classroom.center.crmLocationId ?? classroom.center.name}</TableCell>
                  <TableCell>{classroom.ageGroup}</TableCell>
                  <TableCell>{classroom._count.children}/{classroom.capacity}</TableCell>
                  <TableCell>{classroom._count.staff}</TableCell>
                  <TableCell>{classroom.ratioRule ?? "Not set"}</TableCell>
                  <TableCell>{classroom._count.incidents}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <OperationsActionHub title="Create or Edit Classroom" defaultEntity="classroom" compact centers={data.centers} />
    </div>
  );
}

export type AttendancePageData = {
  records: Array<{
    id: string;
    date: Date | string;
    status: string;
    absenceReason: string | null;
    child: { fullName: string; ageGroup: string } | null;
    classroom: { name: string; center: { name: string; crmLocationId: string | null } } | null;
  }>;
  stats: {
    total: number;
    present: number;
    absent: number;
    other: number;
  };
  reconciliation: {
    serviceDate: Date | string;
    checkIns: number;
    checkOuts: number;
    stillCheckedIn: number;
    latePickups: number;
    authorizationWarnings: number;
    signaturesCaptured: number;
    logs: Array<{
      id: string;
      type: string;
      occurredAt: Date | string;
      pickupName: string | null;
      pinVerified: boolean;
      signatureCaptured: boolean;
      latePickup: boolean;
      pickupAuthorizationWarning: boolean;
      child: { fullName: string; ageGroup: string } | null;
      guardian: { fullName: string; email: string | null } | null;
      classroom: { name: string } | null;
      center: { name: string; crmLocationId: string | null } | null;
    }>;
  };
};

export function AttendancePage({ data }: { data: AttendancePageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <ClipboardCheck data-icon="inline-start" />
          Check-in foundation
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Attendance</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Child attendance records, PIN kiosk check-ins, typed guardian signatures, late pickup flags, and end-of-day reconciliation.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Records" value={data.stats.total} />
        <StatCard label="Present" value={data.stats.present} />
        <StatCard label="Absent" value={data.stats.absent} />
        <StatCard label="Other" value={data.stats.other} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>End-of-Day Reconciliation</CardTitle>
              <CardDescription>
                Kiosk activity for {formatDate(data.reconciliation.serviceDate)} with unresolved check-ins and front desk review flags.
              </CardDescription>
            </div>
            <Badge variant={data.reconciliation.stillCheckedIn > 0 ? "destructive" : "default"}>
              {data.reconciliation.stillCheckedIn > 0 ? "Needs closeout" : "Balanced"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              ["Check-ins", data.reconciliation.checkIns],
              ["Check-outs", data.reconciliation.checkOuts],
              ["Still checked in", data.reconciliation.stillCheckedIn],
              ["Late pickups", data.reconciliation.latePickups],
              ["Pickup warnings", data.reconciliation.authorizationWarnings],
              ["Signatures", data.reconciliation.signaturesCaptured],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-background/45 p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-1 text-2xl font-semibold">{value}</div>
              </div>
            ))}
          </div>
          {data.reconciliation.logs.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Child</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Guardian</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.reconciliation.logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{formatDateTime(log.occurredAt)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{log.child?.fullName ?? "Unlinked child"}</div>
                      <div className="text-xs text-muted-foreground">{log.classroom?.name ?? log.child?.ageGroup ?? ""}</div>
                    </TableCell>
                    <TableCell>{log.center?.crmLocationId ?? log.center?.name ?? "No center"}</TableCell>
                    <TableCell>
                      <div>{log.pickupName ?? log.guardian?.fullName ?? "Not captured"}</div>
                      <div className="text-xs text-muted-foreground">{log.guardian?.email ?? ""}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.type === "check_in" ? "default" : "secondary"}>
                        {log.type === "check_in" ? "Check-in" : "Check-out"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={log.pinVerified ? "default" : "outline"}>{log.pinVerified ? "PIN" : "No PIN"}</Badge>
                        <Badge variant={log.signatureCaptured ? "default" : "outline"}>
                          {log.signatureCaptured ? "Signature" : "No signature"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {log.latePickup ? <Badge variant="destructive">Late pickup</Badge> : null}
                        {log.pickupAuthorizationWarning ? <Badge variant="destructive">Front desk</Badge> : null}
                        {!log.latePickup && !log.pickupAuthorizationWarning ? (
                          <span className="text-xs text-muted-foreground">None</span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
              No kiosk check-in/out activity has been recorded for this service day yet.
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Recent Attendance</CardTitle>
          <CardDescription>Absences, sick days, vacations, and ratio-supporting classroom records</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Child</TableHead>
                <TableHead>Classroom</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{formatDate(record.date)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{record.child?.fullName ?? "Unlinked child"}</div>
                    <div className="text-xs text-muted-foreground">{record.child?.ageGroup ?? ""}</div>
                  </TableCell>
                  <TableCell>{record.classroom?.name ?? "No classroom"}</TableCell>
                  <TableCell><Badge variant={record.status === "present" ? "default" : "outline"}>{record.status}</Badge></TableCell>
                  <TableCell>{record.absenceReason ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type DailyReportsPageData = {
  reports: Array<{
    id: string;
    date: Date | string;
    mood: string | null;
    teacherNote: string | null;
    suppliesNeeded: string | null;
    sentAt: Date | string | null;
    child: { fullName: string; ageGroup: string };
    classroom: { name: string; center: { name: string; crmLocationId: string | null } } | null;
    _count: { meals: number; naps: number; diapers: number; activities: number };
  }>;
  stats: {
    total: number;
    sent: number;
    inProgress: number;
    needsSupplies: number;
  };
  demoMode?: boolean;
};

export function DailyReportsPage({ data }: { data: DailyReportsPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <BookOpen data-icon="inline-start" />
          Teacher daily sheets
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Daily Reports</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Meals, naps, diapers, activities, supplies, and teacher notes prepared for parent-facing daily reports.
        </p>
      </section>
      {data.demoMode ? <DemoDataNotice section="daily report" /> : null}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Reports" value={data.stats.total} />
        <StatCard label="Sent" value={data.stats.sent} />
        <StatCard label="In progress" value={data.stats.inProgress} />
        <StatCard label="Needs supplies" value={data.stats.needsSupplies} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Recent Daily Reports</CardTitle>
          <CardDescription>Classroom-ready activity summaries</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Child</TableHead>
                <TableHead>Classroom</TableHead>
                <TableHead>Logged Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>{formatDate(report.date)}</TableCell>
                  <TableCell className="font-medium">{report.child.fullName}</TableCell>
                  <TableCell>{report.classroom?.name ?? "No classroom"}</TableCell>
                  <TableCell>{report._count.meals} meals · {report._count.naps} naps · {report._count.activities} activities</TableCell>
                  <TableCell><Badge variant={report.sentAt ? "default" : "outline"}>{report.sentAt ? "sent" : "draft"}</Badge></TableCell>
                  <TableCell className="max-w-sm whitespace-normal text-muted-foreground">{report.suppliesNeeded ?? report.teacherNote ?? report.mood ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type ParentMediaReviewPageData = {
  media: Array<{
    id: string;
    url: string;
    caption: string | null;
    status: string;
    sharedWithParents: boolean;
    takenAt: Date | string;
    createdAt: Date | string;
    child: {
      id: string;
      fullName: string;
      preferredName: string | null;
      ageGroup: string;
      photoVideoPermission: boolean;
      family: { name: string; centerId: string | null };
    };
    classroom: { name: string } | null;
    uploadedBy: { name: string; email: string; role: string } | null;
    center: { id: string; name: string; crmLocationId: string | null; city: string | null; state: string | null } | null;
  }>;
  stats: {
    pending: number;
    sharedThirtyDays: number;
    rejectedThirtyDays: number;
    restrictedChildren: number;
  };
};

export function ParentMediaReviewPage({ data }: { data: ParentMediaReviewPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <ImageIcon data-icon="inline-start" />
          Parent engagement safety
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Parent Media Review</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Review teacher-uploaded child photos that were held because photo/video permission was missing. Approval is a human confirmation and is written to the audit trail.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Needs review" value={data.stats.pending} />
        <StatCard label="Shared in 30 days" value={data.stats.sharedThirtyDays} />
        <StatCard label="Rejected in 30 days" value={data.stats.rejectedThirtyDays} />
        <StatCard label="Restricted children" value={data.stats.restrictedChildren} />
      </div>
      <div className="grid gap-4">
        {data.media.map((item) => (
          <Card key={item.id} className="glass-panel overflow-hidden">
            <CardContent className="p-0">
              <div className="grid gap-0 lg:grid-cols-[280px_1fr_320px]">
                <div className="bg-muted/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.caption || `${item.child.fullName} classroom moment`}
                    className="aspect-video h-full min-h-52 w-full object-cover lg:aspect-auto"
                  />
                </div>
                <div className="space-y-4 p-5">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{item.status.replaceAll("_", " ")}</Badge>
                    <Badge variant={item.child.photoVideoPermission ? "default" : "secondary"}>
                      {item.child.photoVideoPermission ? "Permission verified" : "Permission missing"}
                    </Badge>
                    <Badge variant="outline">{item.child.ageGroup}</Badge>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">{item.child.fullName}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.child.family.name} · {item.classroom?.name ?? "No classroom"} · {item.center?.crmLocationId ?? item.center?.name ?? "No center"}
                    </p>
                  </div>
                  <div className="grid gap-3 text-sm md:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Uploaded by</div>
                      <div className="mt-1 font-medium">{item.uploadedBy?.name ?? "Unknown staff"}</div>
                      <div className="text-xs text-muted-foreground">{item.uploadedBy?.email ?? "No email"}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Submitted</div>
                      <div className="mt-1 font-medium">{formatDateTime(item.createdAt)}</div>
                      <div className="text-xs text-muted-foreground">Taken {formatDate(item.takenAt)}</div>
                    </div>
                  </div>
                  <p className="rounded-xl border bg-background/50 p-3 text-sm leading-6 text-muted-foreground">
                    {item.caption || "No caption was added. Review the image before approving parent visibility."}
                  </p>
                </div>
                <div className="border-t bg-background/45 p-5 lg:border-l lg:border-t-0">
                  <div className="mb-3 text-sm font-medium">Director decision</div>
                  <p className="mb-4 text-xs leading-5 text-muted-foreground">
                    Approving confirms the center has verified photo/video permission for this child and shares this photo in the parent portal.
                  </p>
                  <MediaReviewActions mediaId={item.id} childName={item.child.fullName} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!data.media.length ? (
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>No photos need review</CardTitle>
              <CardDescription>
                Teacher-uploaded parent photos with missing permission will appear here before they can be shared.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

export type IncidentReportsPageData = {
  incidents: Array<{
    id: string;
    occurredAt: Date | string;
    type: string;
    description: string;
    actionTaken: string;
    parentNotified: boolean;
    parentAcknowledgedAt: Date | string | null;
    adminReviewStatus: string;
    child: { fullName: string };
    classroom: { name: string; center: { name: string; crmLocationId: string | null } } | null;
  }>;
  stats: {
    total: number;
    pending: number;
    parentNotified: number;
    acknowledged: number;
  };
};

export function IncidentReportsPage({ data }: { data: IncidentReportsPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <ShieldCheck data-icon="inline-start" />
          Safety review
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Incident Reports</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Human-reviewed incident documentation. AI can assist wording only and must not make final safety, medical, legal, or custody decisions.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Incidents" value={data.stats.total} />
        <StatCard label="Pending review" value={data.stats.pending} />
        <StatCard label="Parents notified" value={data.stats.parentNotified} />
        <StatCard label="Acknowledged" value={data.stats.acknowledged} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Incident Queue</CardTitle>
          <CardDescription>Director review and parent acknowledgment status</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Child</TableHead>
                <TableHead>Classroom</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.incidents.map((incident) => (
                <TableRow key={incident.id}>
                  <TableCell>{formatDateTime(incident.occurredAt)}</TableCell>
                  <TableCell className="font-medium">{incident.child.fullName}</TableCell>
                  <TableCell>{incident.classroom?.name ?? "No classroom"}</TableCell>
                  <TableCell>{incident.type}</TableCell>
                  <TableCell><Badge variant={incident.adminReviewStatus === "pending" ? "destructive" : "outline"}>{incident.adminReviewStatus}</Badge></TableCell>
                  <TableCell className="max-w-md whitespace-normal text-muted-foreground">{incident.description} Action: {incident.actionTaken}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type StaffPageData = {
  centers: Array<{ id: string; name: string }>;
  classrooms: Array<{ id: string; centerId: string; name: string; ageGroup: string }>;
  schedules: Array<{
    id: string;
    startsAt: Date | string;
    endsAt: Date | string;
    status: string;
    staff: { id: string; user: { name: string } };
    center: { name: string; crmLocationId: string | null };
  }>;
  staff: Array<{
    id: string;
    centerId: string;
    classroomId: string | null;
    title: string;
    phone: string | null;
    backgroundCheckStatus: string | null;
    user: { name: string; email: string; role: string; isActive: boolean };
    center: { id: string; name: string; crmLocationId: string | null };
    classroom: { id: string; name: string } | null;
    certifications: Array<{ id: string; name: string; status: string; expiresAt: Date | string | null }>;
  }>;
  stats: {
    total: number;
    activeUsers: number;
    expiringCerts: number;
    backgroundPending: number;
  };
};

export function StaffPage({ data }: { data: StaffPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <HeartHandshake data-icon="inline-start" />
          Teacher operations
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Teacher Staff Management</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Teacher profiles, classroom assignments, certifications, and background-check readiness for ratio-aware operations.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Teachers" value={data.stats.total} />
        <StatCard label="Active users" value={data.stats.activeUsers} />
        <StatCard label="Expiring certs" value={data.stats.expiringCerts} />
        <StatCard label="Background pending" value={data.stats.backgroundPending} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Teacher Directory</CardTitle>
          <CardDescription>Role, classroom, and certification snapshot</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teacher</TableHead>
                <TableHead>Center</TableHead>
                <TableHead>Classroom</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Background</TableHead>
                <TableHead>Certifications</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.staff.map((staff) => (
                <TableRow key={staff.id}>
                  <TableCell>
                    <div className="font-medium">{staff.user.name}</div>
                    <div className="text-xs text-muted-foreground">{staff.user.email}</div>
                  </TableCell>
                  <TableCell>{staff.center.crmLocationId ?? staff.center.name}</TableCell>
                  <TableCell>{staff.classroom?.name ?? "Unassigned"}</TableCell>
                  <TableCell>{staff.user.role.replaceAll("_", " ")}</TableCell>
                  <TableCell><Badge variant={staff.backgroundCheckStatus?.includes("clear") ? "default" : "outline"}>{staff.backgroundCheckStatus ?? "Not set"}</Badge></TableCell>
                  <TableCell>{staff.certifications.map((cert) => `${cert.name} (${cert.status})`).join(", ") || "None"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <StaffManagementPanel centers={data.centers} classrooms={data.classrooms} staff={data.staff} schedules={data.schedules} />
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Upcoming Staff Schedule</CardTitle>
          <CardDescription>Published teacher coverage for the visible school scope</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teacher</TableHead>
                <TableHead>Center</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.schedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell className="font-medium">{schedule.staff.user.name}</TableCell>
                  <TableCell>{schedule.center.crmLocationId ?? schedule.center.name}</TableCell>
                  <TableCell>{formatDateTime(schedule.startsAt)}</TableCell>
                  <TableCell>{formatDateTime(schedule.endsAt)}</TableCell>
                  <TableCell><Badge variant="outline">{schedule.status}</Badge></TableCell>
                </TableRow>
              ))}
              {!data.schedules.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">No upcoming staff schedules are visible for this scope.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type CalendarPageData = {
  centers: Array<{ id: string; name: string }>;
  events: CalendarEventRow[];
  generatedAt: string;
};

export function CalendarPage({ data }: { data: CalendarPageData }) {
  return <OperationalCalendar centers={data.centers} events={data.events} generatedAt={data.generatedAt} />;
}

export type FormsPageData = {
  forms: Array<{
    id: string;
    name: string;
    type: string;
    schema: unknown;
    status: string;
    _count: { submissions: number };
  }>;
  submissions: Array<{
    id: string;
    status: string;
    data: unknown;
    submittedAt: Date | string | null;
    signaturePlaceholder: boolean;
    form: { name: string; type: string };
  }>;
};

export function FormsPage({ data }: { data: FormsPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <FileText data-icon="inline-start" />
          Digital paperwork
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Forms</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Enrollment, emergency contact, medical, permission, policy acknowledgment, incident, and staff onboarding form foundations.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Forms" value={data.forms.length} />
        <StatCard label="Submissions" value={data.submissions.length} />
        <StatCard label="Signature placeholders" value={data.submissions.filter((submission) => submission.signaturePlaceholder).length} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Form Library</CardTitle>
          <CardDescription>Schema-ready form builder foundation</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Fields</TableHead>
                <TableHead>Submissions</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.forms.map((form) => (
                <TableRow key={form.id}>
                  <TableCell className="font-medium">{form.name}</TableCell>
                  <TableCell>{form.type}</TableCell>
                  <TableCell>{jsonSummary(form.schema)}</TableCell>
                  <TableCell>{form._count.submissions}</TableCell>
                  <TableCell><Badge>{form.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <OperationsActionHub title="Create or Edit Form Record" defaultEntity="form" compact />
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Recent Submissions</CardTitle>
          <CardDescription>Online registration packets and other submitted forms visible to this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Submitted</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Signature</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.submissions.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell>{formatDateTime(submission.submittedAt)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{submission.form.name}</div>
                    <div className="text-xs text-muted-foreground">{submission.form.type}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{submission.status}</Badge></TableCell>
                  <TableCell>{submission.signaturePlaceholder ? "Captured placeholder" : "Not required"}</TableCell>
                  <TableCell className="max-w-xl whitespace-normal text-xs text-muted-foreground">{jsonSummary(submission.data)}</TableCell>
                </TableRow>
              ))}
              {!data.submissions.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">No submitted forms are visible for this scope.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type DocumentsPageData = {
  documents: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    expiresAt: Date | string | null;
    restricted: boolean;
    storageKey?: string | null;
    downloadUrl?: string | null;
    family: { name: string } | null;
    child: { fullName: string; family: { centerId: string | null } } | null;
  }>;
  stats: {
    total: number;
    expiring: number;
    restricted: number;
    pending: number;
  };
};

export function DocumentsPage({ data }: { data: DocumentsPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <FileText data-icon="inline-start" />
          Document checklist
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Family and child documents with secure uploads, review status, expiration reminders, and restricted visibility markers.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Documents" value={data.stats.total} />
        <StatCard label="Expiring soon" value={data.stats.expiring} />
        <StatCard label="Restricted" value={data.stats.restricted} />
        <StatCard label="Pending" value={data.stats.pending} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Document Records</CardTitle>
          <CardDescription>Compliance-ready document tracking without legal compliance guarantees</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.documents.map((document) => (
                <TableRow key={document.id}>
                  <TableCell className="font-medium">{document.name}</TableCell>
                  <TableCell>{document.child?.fullName ?? document.family?.name ?? "Unassigned"}</TableCell>
                  <TableCell>{document.type}</TableCell>
                  <TableCell><Badge variant={document.status === "pending" ? "outline" : "default"}>{document.status}</Badge></TableCell>
                  <TableCell>{formatDate(document.expiresAt)}</TableCell>
                  <TableCell>{document.restricted ? <Badge variant="destructive">Restricted</Badge> : "Standard"}</TableCell>
                  <TableCell>
                    {document.downloadUrl ? (
                      <a className="text-sm font-medium text-primary underline-offset-4 hover:underline" href={document.downloadUrl} target="_blank" rel="noreferrer">
                        Open file
                      </a>
                    ) : document.storageKey && document.storageKey !== "upload_pending" ? (
                      <span className="text-xs text-muted-foreground">File unavailable</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Pending upload</span>
                    )}
                  </TableCell>
                  <TableCell><DocumentReviewActions documentId={document.id} status={document.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <OperationsActionHub title="Create or Edit Document Request" defaultEntity="document" compact />
    </div>
  );
}

export type CompliancePageData = {
  stats: {
    pendingIncidents: number;
    expiringCertifications: number;
    expiringDocuments: number;
    allergies: number;
    restrictedMedicalNotes: number;
  };
  certifications: Array<{
    id: string;
    name: string;
    status: string;
    expiresAt: Date | string | null;
    staff: { user: { name: string }; center: { name: string; crmLocationId: string | null } };
  }>;
  allergies: Array<{
    id: string;
    allergen: string;
    severity: string;
    actionPlan: string | null;
    child: { fullName: string; family: { centerId: string | null } };
  }>;
};

export function CompliancePage({ data }: { data: CompliancePageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <ShieldCheck data-icon="inline-start" />
          Documentation support
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Compliance-Readiness Dashboard</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Compliance-ready workflows and documentation support for licensing checklists, certifications, incident review, immunization placeholders, allergies, and audit readiness. This is not legal or licensing advice.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-5">
        <StatCard label="Incidents pending" value={data.stats.pendingIncidents} />
        <StatCard label="Certs expiring" value={data.stats.expiringCertifications} />
        <StatCard label="Docs expiring" value={data.stats.expiringDocuments} />
        <StatCard label="Allergies" value={data.stats.allergies} />
        <StatCard label="Medical notes" value={data.stats.restrictedMedicalNotes} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Certification Reminders</CardTitle>
            <CardDescription>Expiring teacher documentation</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Center</TableHead>
                  <TableHead>Certification</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.certifications.map((certification) => (
                  <TableRow key={certification.id}>
                    <TableCell className="font-medium">{certification.staff.user.name}</TableCell>
                    <TableCell>{certification.staff.center.crmLocationId ?? certification.staff.center.name}</TableCell>
                    <TableCell>{certification.name}</TableCell>
                    <TableCell>{formatDate(certification.expiresAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Allergy List</CardTitle>
            <CardDescription>Restricted child safety information</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Child</TableHead>
                  <TableHead>Allergen</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Action Plan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.allergies.map((allergy) => (
                  <TableRow key={allergy.id}>
                    <TableCell className="font-medium">{allergy.child.fullName}</TableCell>
                    <TableCell>{allergy.allergen}</TableCell>
                    <TableCell><Badge variant={allergy.severity === "High" ? "destructive" : "outline"}>{allergy.severity}</Badge></TableCell>
                    <TableCell className="max-w-sm whitespace-normal text-muted-foreground">{allergy.actionPlan ?? "Not set"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export type MultiLocationDashboardData = {
  centers: Array<{
    id: string;
    name: string;
    crmLocationId: string | null;
    city: string | null;
    state: string | null;
    licensedCapacity: number;
    _count: { leads: number; staff: number; classrooms: number };
  }>;
  stats: {
    centers: number;
    leads: number;
    highIntentLeads: number;
    upcomingTours: number;
    staff: number;
    submittedFteReports: number;
    latestFteTotal: number;
    currentWeekFteTotal: number;
    currentWeekSubmittedCenters: number;
    missingFteReports: number;
  };
  currentWeekStart: string;
  dueCenters: Array<{ id: string; name: string }>;
  fte?: FteSnapshot;
  fteCenters: FteReportCenterOption[];
  fteReports: FteReportRow[];
};

export function MultiLocationDashboardPage({ data }: { data: MultiLocationDashboardData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <Building2 data-icon="inline-start" />
          Multi-location visibility
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Multi-Location Dashboard</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Brand and regional visibility across Kid City USA school profiles, enrollment demand, staff, and upcoming tours.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-5">
        <StatCard label="Centers" value={data.stats.centers} />
        <StatCard label="Leads" value={data.stats.leads.toLocaleString()} />
        <StatCard label="High intent" value={data.stats.highIntentLeads.toLocaleString()} />
        <StatCard label="Upcoming tours" value={data.stats.upcomingTours} />
        <StatCard label="Teachers" value={data.stats.staff} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Latest submitted FTE" value={data.stats.latestFteTotal.toLocaleString()} detail="Most recent report per school" />
        <StatCard label="FTE rows" value={data.stats.submittedFteReports.toLocaleString()} detail="Editable weekly reports in The Bee Suite" />
        <StatCard label="Schools due" value={data.stats.missingFteReports.toLocaleString()} detail="No current-week FTE report" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Current week FTE"
          value={data.stats.currentWeekFteTotal.toLocaleString()}
          detail={`Week of ${formatDate(data.currentWeekStart)}`}
        />
        <StatCard
          label="Schools submitted"
          value={`${data.stats.currentWeekSubmittedCenters}/${data.stats.centers}`}
          detail="Current weekly cycle"
        />
        <StatCard
          label="Schools still due"
          value={data.dueCenters.length.toLocaleString()}
          detail={data.dueCenters.slice(0, 2).map((center) => center.name).join("; ") || "All visible schools submitted"}
        />
      </div>
      <FteReportForm
        centers={data.fteCenters}
        reports={data.fteReports}
        allowCenterSelect
        mode="executive"
        title="Executive FTE Reporting"
        description="Submit, correct, or manually enter weekly FTE data for any visible school. Rows can also forward to the configured FTE Google Sheet backup."
      />
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Current Week Submission Tracker</CardTitle>
          <CardDescription>Visible schools without a report for the current FTE week</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-60 overflow-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.dueCenters.slice(0, 50).map((center) => (
                  <TableRow key={center.id}>
                    <TableCell className="font-medium">{center.name}</TableCell>
                    <TableCell><Badge variant="outline">Due</Badge></TableCell>
                  </TableRow>
                ))}
                {!data.dueCenters.length ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-muted-foreground">
                      Every visible school has submitted for the current week.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {data.fte ? (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>FTE Report Snapshot</CardTitle>
            <CardDescription>
              {data.fte.status === "ready"
                ? `Synced from ${data.fte.sourceMode === "template_week_tab" ? "template" : "rolling"} Google Sheets tab "${data.fte.sheetName}".`
                : "Connect the Kid City USA FTE Google Sheet to show live full-time-equivalent reporting."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[16rem_1fr]">
            <div className="grid gap-3">
              <div className="rounded-xl border bg-background/40 p-4">
                <div className="text-sm text-muted-foreground">Total FTE</div>
                <div className="mt-2 text-2xl font-semibold">{data.fte.totalFte.toLocaleString()}</div>
                <div className="mt-1 text-xs text-muted-foreground">{data.fte.status.replaceAll("_", " ")}</div>
              </div>
              <div className="rounded-xl border bg-background/40 p-4">
                <div className="text-sm text-muted-foreground">Locations reported</div>
                <div className="mt-2 text-2xl font-semibold">{data.fte.locationCount.toLocaleString()}</div>
              </div>
            </div>
            <div className="max-h-72 overflow-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>School</TableHead>
                    <TableHead>CRM Location ID</TableHead>
                    <TableHead>FTE</TableHead>
                    <TableHead>Report Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.fte.rows.slice(0, 20).map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">{row.centerName}</TableCell>
                      <TableCell>{row.crmLocationId ?? "Not mapped"}</TableCell>
                      <TableCell>{row.fte.toLocaleString()}</TableCell>
                      <TableCell>{row.reportDate ?? "Not set"}</TableCell>
                    </TableRow>
                  ))}
                  {!data.fte.rows.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        {data.fte.error || "No FTE rows are available yet."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>School Network</CardTitle>
          <CardDescription>Location profile readiness and CRM volume</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>Place</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Teachers</TableHead>
                <TableHead>Classrooms</TableHead>
                <TableHead>Capacity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.centers.map((center) => (
                <TableRow key={center.id}>
                  <TableCell className="font-medium">{center.crmLocationId ?? center.name}</TableCell>
                  <TableCell>{[center.city, center.state].filter(Boolean).join(", ") || "Not set"}</TableCell>
                  <TableCell>{center._count.leads.toLocaleString()}</TableCell>
                  <TableCell>{center._count.staff}</TableCell>
                  <TableCell>{center._count.classrooms}</TableCell>
                  <TableCell>{center.licensedCapacity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type FteReportsPageData = {
  mode: "director" | "executive";
  centers: Array<{
    id: string;
    name: string;
    crmLocationId: string | null;
    city: string | null;
    state: string | null;
    ownerGroup: { name: string; ownerType: string } | null;
  }>;
  stats: {
    centers: number;
    submittedFteReports: number;
    latestFteTotal: number;
    currentWeekFteTotal: number;
    currentWeekSubmittedCenters: number;
    missingCurrentWeekReports: number;
  };
  currentWeekStart: string;
  dueCenters: Array<{ id: string; name: string }>;
  dueState: {
    label: string;
    phase: "open" | "due_soon" | "overdue";
    priority: "normal" | "high";
    dueAt: string;
    reminder: string;
  };
  trendWeeks: Array<{
    weekStart: string;
    fteTotal: number;
    enrolledTotal: number;
    submittedCenters: number;
    approvedReports: number;
    correctedReports: number;
    missingCenters: number;
  }>;
  centerSnapshots: Array<{
    id: string;
    name: string;
    latestWeekStart: string | null;
    latestFte: number | null;
    currentWeekFte: number | null;
    status: string;
  }>;
  fte?: FteSnapshot;
  fteCenters: FteReportCenterOption[];
  fteReports: FteReportRow[];
  exportHref: string;
};

export function FteReportsPage({ data }: { data: FteReportsPageData }) {
  const isExecutive = data.mode === "executive";
  const maxTrendFte = Math.max(...data.trendWeeks.map((week) => week.fteTotal), 1);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Badge className="mb-4">
              <ClipboardCheck data-icon="inline-start" />
              Weekly FTE reporting
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight">FTE Reports</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {isExecutive
                ? "Executive review, correction, approval, CSV export, and missing-school tracking for weekly FTE submissions."
                : "Submit this week's full-time-equivalent report for your assigned school and review recent submissions."}
            </p>
          </div>
          <a
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold text-primary transition hover:bg-muted"
            href={data.exportHref}
          >
            <Link2 data-icon="inline-start" />
            Export CSV
          </a>
        </div>
        <div className="mt-5 rounded-xl border bg-background/45 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold">Weekly deadline: {formatUtcDate(data.dueState.dueAt)}</div>
              <div className="text-sm text-muted-foreground">{data.dueState.reminder}</div>
            </div>
            <Badge variant={data.dueState.priority === "high" ? "destructive" : "outline"}>{data.dueState.label}</Badge>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Current week FTE"
          value={data.stats.currentWeekFteTotal.toLocaleString()}
          detail={`Week of ${formatUtcDate(data.currentWeekStart)}`}
        />
        <StatCard
          label={isExecutive ? "Schools submitted" : "Submitted this week"}
          value={isExecutive ? `${data.stats.currentWeekSubmittedCenters}/${data.stats.centers}` : data.stats.currentWeekSubmittedCenters ? "Yes" : "No"}
          detail="Current weekly cycle"
        />
        <StatCard
          label={isExecutive ? "Schools still due" : "Report status"}
          value={isExecutive ? data.stats.missingCurrentWeekReports.toLocaleString() : data.stats.missingCurrentWeekReports ? "Due" : "Complete"}
          detail={isExecutive ? "Missing current-week report" : "Assigned center only"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="FTE rows" value={data.stats.submittedFteReports.toLocaleString()} detail="Visible reports" />
        <StatCard label="Latest FTE total" value={data.stats.latestFteTotal.toLocaleString()} detail="Most recent report per visible school" />
        <StatCard label="Visible schools" value={data.stats.centers.toLocaleString()} detail={isExecutive ? "Executive scope" : "Director scope"} />
      </div>

      {isExecutive ? (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Weekly FTE Trend</CardTitle>
              <CardDescription>Last visible reporting weeks by total FTE, submitted schools, and missing reports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex min-h-64 items-end gap-3 overflow-x-auto border-b pb-4">
                {data.trendWeeks.map((week) => (
                  <div key={week.weekStart} className="flex min-w-24 flex-1 flex-col items-center gap-2">
                    <div className="flex h-44 w-full items-end rounded-t-xl bg-muted/35 px-3 pt-3">
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-amber-500 to-yellow-300"
                        style={{ height: `${Math.max(8, (week.fteTotal / maxTrendFte) * 100)}%` }}
                        aria-label={`${week.fteTotal} FTE for week of ${formatUtcDate(week.weekStart)}`}
                      />
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-semibold">{week.fteTotal.toLocaleString()}</div>
                      <div className="text-[11px] text-muted-foreground">{formatUtcDate(week.weekStart)}</div>
                      <div className="text-[11px] text-muted-foreground">{week.submittedCenters} submitted · {week.missingCenters} due</div>
                    </div>
                  </div>
                ))}
                {!data.trendWeeks.length ? (
                  <div className="p-6 text-sm text-muted-foreground">No trend data is available yet.</div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>School FTE Snapshot</CardTitle>
              <CardDescription>Current week status by visible school</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-80 overflow-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>School</TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>Latest</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.centerSnapshots.map((center) => (
                      <TableRow key={center.id}>
                        <TableCell className="font-medium">{center.name}</TableCell>
                        <TableCell>{center.currentWeekFte?.toLocaleString() ?? "Due"}</TableCell>
                        <TableCell>{center.latestFte?.toLocaleString() ?? "None"}</TableCell>
                        <TableCell><Badge variant={center.status === "Due" ? "outline" : "secondary"}>{center.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {isExecutive ? <FteReportExplorer centers={data.centers} reports={data.fteReports} /> : null}

      <FteReportForm
        centers={data.fteCenters}
        reports={data.fteReports}
        allowCenterSelect={isExecutive}
        mode={data.mode}
        title={isExecutive ? "Review or Enter FTE" : "Submit Weekly FTE"}
        description={isExecutive
          ? "Executives can enter, correct, or approve visible school reports. Approved rows are locked for directors."
          : "Directors can submit or correct reports for their assigned school until an executive approves the row."}
      />

      {isExecutive ? <FteBulkImportPanel /> : null}

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>{isExecutive ? "Current Week Due Tracker" : "Assigned School Tracker"}</CardTitle>
          <CardDescription>
            {isExecutive
              ? "Schools without a report for the current reporting week"
              : "Your school's current reporting status"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-72 overflow-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.dueCenters.map((center) => (
                  <TableRow key={center.id}>
                    <TableCell className="font-medium">{center.name}</TableCell>
                    <TableCell><Badge variant="outline">Due</Badge></TableCell>
                  </TableRow>
                ))}
                {!data.dueCenters.length ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-muted-foreground">
                      All visible schools have submitted for the current week.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {isExecutive && data.fte ? (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Google Sheet Backup Snapshot</CardTitle>
            <CardDescription>
              {data.fte.status === "ready"
                ? `Synced from ${data.fte.sourceMode === "template_week_tab" ? "template" : "rolling"} Google Sheets tab "${data.fte.sheetName}".`
                : "Connect or publish the FTE Google Sheet backup to show sheet-side totals."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <StatCard label="Sheet FTE total" value={data.fte.totalFte.toLocaleString()} detail={data.fte.status.replaceAll("_", " ")} />
            <StatCard label="Sheet locations" value={data.fte.locationCount.toLocaleString()} detail={data.fte.error || "Backup source read"} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export type FamilyProfilesPageData = {
  families: Array<EditableFamilyRecord & {
    createdAt: Date | string;
    guardians: Array<EditableFamilyRecord["guardians"][number] & {
      userId: string | null;
      checkInPinSetAt: Date | string | null;
    }>;
    _count: { documents: number; messages: number; pickups: number; emergencyContacts: number };
  }>;
  importCenters: Array<{ id: string; name: string }>;
  bulkImportEnabled: boolean;
  intakeCenters: Array<{ id: string; name: string; classrooms: Array<{ id: string; name: string; ageGroup: string }> }>;
  stats: {
    total: number;
    withCustodyNotes: number;
    children: number;
    guardians: number;
  };
};

export function FamilyProfilesPage({ data }: { data: FamilyProfilesPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <HeartHandshake data-icon="inline-start" />
          Family lifecycle
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Family Profiles</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Guardian, child, document, pickup, emergency contact, billing email, and restricted custody-note visibility.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Families" value={data.stats.total} />
        <StatCard label="Children" value={data.stats.children} />
        <StatCard label="Guardians" value={data.stats.guardians} />
        <StatCard label="Restricted custody notes" value={data.stats.withCustodyNotes} />
      </div>
      <FamilyStudentIntakeForm centers={data.intakeCenters} />
      <FamilyRecordEditor families={data.families} centers={data.intakeCenters} />
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Family Directory</CardTitle>
          <CardDescription>Role-scoped family profile snapshot</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Family</TableHead>
                <TableHead>Guardians</TableHead>
                <TableHead>Children</TableHead>
                <TableHead>Records</TableHead>
                <TableHead>Restricted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.families.map((family) => (
                <TableRow key={family.id}>
                  <TableCell>
                    <div className="font-medium">{family.name}</div>
                    <div className="text-xs text-muted-foreground">{family.billingEmail ?? "No billing email"}</div>
                  </TableCell>
                  <TableCell>{family.guardians.map((guardian) => guardian.fullName).join(", ") || "None"}</TableCell>
                  <TableCell>{family.children.map((child) => `${child.fullName} (${child.ageGroup})`).join(", ") || "None"}</TableCell>
                  <TableCell>{family._count.documents} docs · {family._count.messages} messages</TableCell>
                  <TableCell>{family.custodyNotes ? <Badge variant="destructive">Custody note</Badge> : "Standard"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Lobby Kiosk PINs</CardTitle>
          <CardDescription>Directors set the 4 digit guardian PIN used on the check-in/check-out tablet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {data.families.flatMap((family) =>
            family.guardians.map((guardian) => (
              <GuardianPinManager
                key={guardian.id}
                guardianId={guardian.id}
                guardianName={`${guardian.fullName} · ${family.name}`}
                pinSetAt={guardian.checkInPinSetAt}
              />
            )),
          )}
          {!data.families.some((family) => family.guardians.length) ? (
            <p className="text-sm text-muted-foreground">No guardians are visible for this scope yet.</p>
          ) : null}
        </CardContent>
      </Card>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Parent Portal Access</CardTitle>
          <CardDescription>
            Create or reset linked parent accounts. Parents only see families connected through their guardian profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {data.families.flatMap((family) =>
            family.guardians.map((guardian) => (
              <ParentPortalInviteButton
                key={guardian.id}
                guardianId={guardian.id}
                guardianName={`${guardian.fullName} · ${family.name}`}
                email={guardian.email}
                linked={Boolean(guardian.userId)}
              />
            )),
          )}
          {!data.families.some((family) => family.guardians.length) ? (
            <p className="text-sm text-muted-foreground">No guardians are visible for this scope yet.</p>
          ) : null}
        </CardContent>
      </Card>
      <ProcareImportPanel centers={data.importCenters} allowBulkImport={data.bulkImportEnabled} />
      <OperationsActionHub title="Create or Edit Family / Guardian" defaultEntity="family" compact centers={data.importCenters} />
    </div>
  );
}

export type ChildProfilesPageData = {
  children: Array<{
    id: string;
    fullName: string;
    preferredName: string | null;
    dateOfBirth: Date | string;
    ageGroup: string;
    enrollmentStatus: string;
    startDate: Date | string | null;
    photoVideoPermission: boolean;
    fieldTripPermission: boolean;
    family: { name: string; centerId: string | null };
    classroom: { name: string; center: { name: string; crmLocationId: string | null } } | null;
    _count: { allergies: number; medicalNotes: number; documents: number; incidents: number; dailyReports: number };
  }>;
  intakeCenters: Array<{ id: string; name: string; classrooms: Array<{ id: string; name: string; ageGroup: string }> }>;
  stats: {
    total: number;
    enrolled: number;
    allergies: number;
    restrictedMedicalNotes: number;
  };
};

export function ChildProfilesPage({ data }: { data: ChildProfilesPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <ShieldCheck data-icon="inline-start" />
          Child safety records
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Child Profiles</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Child enrollment, classroom, allergy, medical note, document, incident, permission, and daily activity profile foundation.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Children" value={data.stats.total} />
        <StatCard label="Enrolled" value={data.stats.enrolled} />
        <StatCard label="Allergy records" value={data.stats.allergies} />
        <StatCard label="Medical notes" value={data.stats.restrictedMedicalNotes} />
      </div>
      <FamilyStudentIntakeForm centers={data.intakeCenters} compact />
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Children</CardTitle>
          <CardDescription>Sensitive records are marked for restricted access handling</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Child</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>Classroom</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Safety</TableHead>
                <TableHead>Permissions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.children.map((child) => (
                <TableRow key={child.id}>
                  <TableCell>
                    <div className="font-medium">{child.fullName}</div>
                    <div className="text-xs text-muted-foreground">{child.ageGroup} · DOB {formatDate(child.dateOfBirth)}</div>
                  </TableCell>
                  <TableCell>{child.family.name}</TableCell>
                  <TableCell>{child.classroom?.name ?? "Unassigned"}</TableCell>
                  <TableCell>{child.enrollmentStatus}</TableCell>
                  <TableCell>{child._count.allergies} allergies · {child._count.medicalNotes} medical notes · {child._count.incidents} incidents</TableCell>
                  <TableCell>{child.photoVideoPermission ? "Photo ok" : "Photo restricted"} · {child.fieldTripPermission ? "Trips ok" : "Trips restricted"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <OperationsActionHub title="Create or Edit Child Profile" defaultEntity="child" compact />
    </div>
  );
}

export type BillingInvoicesPageData = {
  workbench: {
    families: BillingWorkbenchFamily[];
    centers: BillingWorkbenchCenter[];
    products: BillingWorkbenchProduct[];
    tuitionPlans: BillingWorkbenchTuitionPlan[];
  };
  invoices: Array<{
    id: string;
    number: string;
    status: string;
    dueDate: Date | string;
    totalCents: number;
    billingAccount: { balanceCents: number; family: { name: string; billingEmail: string | null; centerId: string | null } };
    _count: { items: number };
  }>;
  ledgerEntries: Array<{
    id: string;
    type: string;
    description: string;
    amountCents: number;
    balanceAfterCents: number | null;
    effectiveAt: Date | string;
    billingAccount: { family: { name: string; billingEmail: string | null; centerId: string | null } };
  }>;
  stats: {
    total: number;
    open: number;
    paid: number;
    outstandingCents: number;
  };
  arReport: {
    currentCents: number;
    oneToThirtyCents: number;
    thirtyOneToSixtyCents: number;
    sixtyOnePlusCents: number;
    chargesCents: number;
    paymentsCents: number;
    creditsCents: number;
  };
};

export function BillingInvoicesPage({ data }: { data: BillingInvoicesPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <BadgeDollarSign data-icon="inline-start" />
          Billing foundation
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Billing and Invoices</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Family billing accounts, tuition invoices, balances, ProCare/imported ledger activity, and Stripe Checkout readiness for parent tuition payments.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Invoices" value={data.stats.total} />
        <StatCard label="Open" value={data.stats.open} />
        <StatCard label="Paid" value={data.stats.paid} />
        <StatCard label="Outstanding" value={money(data.stats.outstandingCents)} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Accounts Receivable Aging</CardTitle>
          <CardDescription>Open balance by due-date bucket and recent ledger movement.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <MetricTile label="Current" value={money(data.arReport.currentCents)} detail="not past due" />
            <MetricTile label="1-30 days" value={money(data.arReport.oneToThirtyCents)} />
            <MetricTile label="31-60 days" value={money(data.arReport.thirtyOneToSixtyCents)} />
            <MetricTile label="61+ days" value={money(data.arReport.sixtyOnePlusCents)} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MetricTile label="Recent charges" value={money(data.arReport.chargesCents)} detail="latest ledger window" />
            <MetricTile label="Recent payments" value={money(data.arReport.paymentsCents)} detail="posted credits from payments" />
            <MetricTile label="Credits/adjustments" value={money(data.arReport.creditsCents)} detail="manual credits and non-payment credits" />
          </div>
        </CardContent>
      </Card>
      <BillingWorkbench
        families={data.workbench.families}
        centers={data.workbench.centers}
        products={data.workbench.products}
        tuitionPlans={data.workbench.tuitionPlans}
      />
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Payment status and balances from the CRM database</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.number}</TableCell>
                  <TableCell>{invoice.billingAccount.family.name}</TableCell>
                  <TableCell><Badge variant={invoice.status === "OPEN" ? "outline" : "default"}>{invoice.status}</Badge></TableCell>
                  <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                  <TableCell>{money(invoice.totalCents)}</TableCell>
                  <TableCell>{invoice._count.items}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Family Ledger</CardTitle>
          <CardDescription>Tuition charges, imported ProCare balances, credits, and manual adjustments.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.ledgerEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDate(entry.effectiveAt)}</TableCell>
                  <TableCell>{entry.billingAccount.family.name}</TableCell>
                  <TableCell><Badge variant="outline">{entry.type}</Badge></TableCell>
                  <TableCell>{entry.description}</TableCell>
                  <TableCell>{money(entry.amountCents)}</TableCell>
                  <TableCell>{entry.balanceAfterCents === null ? "Not set" : money(entry.balanceAfterCents)}</TableCell>
                </TableRow>
              ))}
              {!data.ledgerEntries.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">No ledger entries have been created yet.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type PaymentsPageData = {
  payments: Array<{
    id: string;
    amountCents: number;
    status: string;
    provider: string;
    externalIdPlaceholder: string | null;
    paidAt: Date | string | null;
    billingAccount: { family: { name: string; billingEmail: string | null; centerId: string | null } };
  }>;
  stats: {
    total: number;
    paid: number;
    failed: number;
    draft: number;
    stripeConfigured: boolean;
    webhookConfigured: boolean;
    payoutReadyCenters: number;
    payoutStartedCenters: number;
  };
};

export function PaymentsPage({ data }: { data: PaymentsPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <BadgeDollarSign data-icon="inline-start" />
          Payment processing
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Payments</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Stripe Checkout and webhook reconciliation are live in the server layer. Parent payments are routed through The Bee Suite platform account to each school&apos;s connected payout account.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-6">
        <StatCard label="Payment records" value={data.stats.total} />
        <StatCard label="Paid" value={data.stats.paid} />
        <StatCard label="Failed" value={data.stats.failed} />
        <StatCard label="Draft/checkout" value={data.stats.draft} />
        <StatCard label="Stripe" value={data.stats.stripeConfigured && data.stats.webhookConfigured ? "Ready" : "Needs keys"} />
        <StatCard label="Payout schools" value={`${data.stats.payoutReadyCenters}/${data.stats.payoutStartedCenters}`} detail="ready / started" />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Payment Attempts</CardTitle>
          <CardDescription>Provider status, family, and reconciliation marker</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Family</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>External ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    <div className="font-medium">{payment.billingAccount.family.name}</div>
                    <div className="text-xs text-muted-foreground">{payment.billingAccount.family.billingEmail ?? "No billing email"}</div>
                  </TableCell>
                  <TableCell>{payment.provider}</TableCell>
                  <TableCell><Badge variant={payment.status === "PAID" ? "default" : "outline"}>{payment.status}</Badge></TableCell>
                  <TableCell>{money(payment.amountCents)}</TableCell>
                  <TableCell>{formatDateTime(payment.paidAt)}</TableCell>
                  <TableCell className="max-w-xs truncate">{payment.externalIdPlaceholder ?? ""}</TableCell>
                </TableRow>
              ))}
              {!data.payments.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">No payment attempts have been recorded yet.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export type AnalyticsPageData = {
  stats: {
    leads: number;
    enrolled: number;
    waitlisted: number;
    tours: number;
    openInvoices: number;
    outstandingCents: number;
    incidentsPending: number;
    unreadMessages: number;
  };
  stageCounts: Array<{ stage: string; count: number }>;
  fte?: FteSnapshot;
};

export function AnalyticsPage({ data }: { data: AnalyticsPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <Activity data-icon="inline-start" />
          Executive analytics
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Reporting and Analytics</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Live enrollment, tour, billing, message, incident, and pipeline health indicators for the pilot.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Leads" value={data.stats.leads.toLocaleString()} />
        <StatCard label="Enrolled" value={data.stats.enrolled.toLocaleString()} />
        <StatCard label="Waitlisted" value={data.stats.waitlisted.toLocaleString()} />
        <StatCard label="Tours" value={data.stats.tours.toLocaleString()} />
        <StatCard label="Open invoices" value={data.stats.openInvoices.toLocaleString()} />
        <StatCard label="Outstanding" value={money(data.stats.outstandingCents)} />
        <StatCard label="Incidents pending" value={data.stats.incidentsPending.toLocaleString()} />
        <StatCard label="Unread messages" value={data.stats.unreadMessages.toLocaleString()} />
      </div>
      {data.fte ? (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="FTE total" value={data.fte.totalFte.toLocaleString()} detail={data.fte.status.replaceAll("_", " ")} />
          <StatCard label="FTE locations" value={data.fte.locationCount.toLocaleString()} detail={`${data.fte.sourceMode === "template_week_tab" ? "Template" : "Rolling"} tab: ${data.fte.sheetName}`} />
          <StatCard
            label="FTE sync"
            value={data.fte.status === "ready" ? "Ready" : "Needs setup"}
            detail={data.fte.error || "Uses Google Sheets as the backup source for FTE reporting."}
          />
        </div>
      ) : null}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Pipeline Distribution</CardTitle>
          <CardDescription>Current lead counts by enrollment stage</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          {data.stageCounts.map((stage) => (
            <div key={stage.stage} className="rounded-xl border bg-background/40 p-4">
              <div className="text-sm text-muted-foreground">{stage.stage.replaceAll("_", " ")}</div>
              <div className="mt-2 text-2xl font-semibold">{stage.count.toLocaleString()}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export type ReputationPageData = {
  reviews: Array<{ id: string; source: string; rating: number; body: string | null; responseDraft: string | null; approvedForPublicTestimonial: boolean }>;
  surveys: Array<{ id: string; name: string; type: string; status: string; results: unknown }>;
  stats: { reviews: number; averageRating: number; testimonials: number; surveys: number };
};

export function ReputationPage({ data }: { data: ReputationPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <Star data-icon="inline-start" />
          Family trust signals
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Reputation and Reviews</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Review requests, parent satisfaction surveys, testimonial approval, and AI response drafts. Google Business integration remains mock-ready.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Reviews" value={data.stats.reviews} />
        <StatCard label="Average rating" value={data.stats.averageRating.toFixed(1)} />
        <StatCard label="Testimonials" value={data.stats.testimonials} />
        <StatCard label="Surveys" value={data.stats.surveys} />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Review Queue</CardTitle>
          <CardDescription>Public testimonial approval and draft response support</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>AI Draft</TableHead>
                <TableHead>Public</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.reviews.map((review) => (
                <TableRow key={review.id}>
                  <TableCell>{review.source}</TableCell>
                  <TableCell>{review.rating}/5</TableCell>
                  <TableCell className="max-w-md whitespace-normal text-muted-foreground">{review.body ?? ""}</TableCell>
                  <TableCell>{review.responseDraft ? "Draft ready" : "Not drafted"}</TableCell>
                  <TableCell>{review.approvedForPublicTestimonial ? <Badge>Approved</Badge> : <Badge variant="outline">Needs review</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <OperationsActionHub title="Create or Edit Review Response" defaultEntity="review" compact />
    </div>
  );
}

export type AiCommandPageData = {
  summaries: Array<{ id: string; scope: string; title: string; body: string; requiresReview: boolean; createdAt: Date | string }>;
  suggestions: Array<{ id: string; type: string; suggestion: string; status: string; guardrailNote: string; createdAt: Date | string }>;
  stats: { summaries: number; suggestions: number; pendingReview: number };
};

export function AiCommandPage({ data }: { data: AiCommandPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <Bot data-icon="inline-start" />
          Mr. Bee assistant
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">AI Command Center</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Mr. Bee helps summarize, draft, prioritize, and recommend next steps. Suggestions are labeled, logged, and require human review for sensitive workflows.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Summaries" value={data.stats.summaries} />
        <StatCard label="Suggestions" value={data.stats.suggestions} />
        <StatCard label="Pending review" value={data.stats.pendingReview} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Recent Summaries</CardTitle>
            <CardDescription>Daily center, family, lead, and compliance summaries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.summaries.map((summary) => (
              <div key={summary.id} className="rounded-xl border bg-background/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium">{summary.title}</div>
                  <Badge variant={summary.requiresReview ? "outline" : "default"}>{summary.scope}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{summary.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Suggestion Queue</CardTitle>
            <CardDescription>Human approval gate for generated content</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.suggestions.map((suggestion) => (
              <div key={suggestion.id} className="rounded-xl border bg-background/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium">{suggestion.type}</div>
                  <Badge variant={suggestion.status === "approved" ? "default" : "outline"}>{suggestion.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{suggestion.suggestion}</p>
                <p className="mt-2 text-xs text-amber-500">{suggestion.guardrailNote}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <OperationsActionHub title="Create or Edit Product / Tuition Plan" defaultEntity="tuitionPlan" compact />
    </div>
  );
}

export type WhiteLabelPageData = {
  settings: Array<{
    id: string;
    brandName: string;
    primaryColor: string;
    accentColor: string;
    themeMode: string;
    emailSenderPlaceholder: string | null;
    customDomainPlaceholder: string | null;
    legalFooterText: string | null;
    termsUrl: string | null;
    privacyUrl: string | null;
    brand: { name: string; slug: string };
  }>;
  customizations: Array<{
    id: string;
    scopeType: string;
    brandName: string;
    primaryColor: string;
    accentColor: string;
    themeMode: string;
    emailSenderPlaceholder: string | null;
    customDomainPlaceholder: string | null;
    parentPortalName: string | null;
    loginScreenTitle: string | null;
    legalFooterText: string | null;
    brand: { name: string; slug: string } | null;
    ownerGroup: { name: string } | null;
    center: { name: string; crmLocationId: string | null } | null;
  }>;
  assets: Array<{
    id: string;
    assetType: string;
    url: string | null;
    storageKey: string | null;
    altText: string | null;
    brand: { name: string } | null;
    ownerGroup: { name: string } | null;
    center: { name: string; crmLocationId: string | null } | null;
  }>;
};

export function WhiteLabelPage({ data }: { data: WhiteLabelPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <Sparkles data-icon="inline-start" />
          White-label controls
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">White-Label Settings</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Brand, color, sender, custom domain, portal, login, notification, and legal footer settings for the SaaS platform.
        </p>
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard label="Legacy brand settings" value={data.settings.length} detail="Backward-compatible white-label records" />
        <StatCard label="Customization layers" value={data.customizations.length} detail="Brand, owner group, and center-scoped overrides" />
        <StatCard label="Brand assets" value={data.assets.length} detail="Logos, favicon, mascot, and portal media references" />
      </div>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Customization Layers</CardTitle>
          <CardDescription>Brand defaults can be overridden by owner groups or individual schools without mixing tenants.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scope</TableHead>
                <TableHead>Branding</TableHead>
                <TableHead>Container</TableHead>
                <TableHead>Portal</TableHead>
                <TableHead>Domain</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.customizations.map((setting) => (
                <TableRow key={setting.id}>
                  <TableCell><Badge variant="outline">{setting.scopeType}</Badge></TableCell>
                  <TableCell>
                    <div className="font-medium">{setting.brandName}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="size-4 rounded-full border" style={{ backgroundColor: setting.primaryColor }} />
                      {setting.primaryColor}
                      <span className="size-4 rounded-full border" style={{ backgroundColor: setting.accentColor }} />
                      {setting.accentColor}
                    </div>
                  </TableCell>
                  <TableCell>{setting.center?.crmLocationId ?? setting.center?.name ?? setting.ownerGroup?.name ?? setting.brand?.name ?? "Tenant"}</TableCell>
                  <TableCell>{setting.parentPortalName ?? setting.loginScreenTitle ?? "Default portal"}</TableCell>
                  <TableCell>{setting.customDomainPlaceholder || "Not set"}</TableCell>
                </TableRow>
              ))}
              {!data.customizations.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">No layered customization records yet.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Asset Registry</CardTitle>
          <CardDescription>Where logos, mascot art, favicon, login, and parent portal assets are attached.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Container</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.assets.map((asset) => {
                const previewSrc = localImageSrc(asset.url);
                const assetLabel = asset.assetType.replaceAll("_", " ");

                return (
                  <TableRow key={asset.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {previewSrc ? (
                          <Image
                            src={previewSrc}
                            alt={asset.altText ?? assetLabel}
                            width={96}
                            height={56}
                            className="h-10 w-16 rounded-md border bg-white object-contain p-1"
                          />
                        ) : (
                          <span className="grid size-10 place-items-center rounded-md border bg-background/50 text-muted-foreground">
                            <ImageIcon className="size-4" />
                          </span>
                        )}
                        <div>
                          <div className="font-medium">{assetLabel}</div>
                          <div className="text-xs text-muted-foreground">{asset.altText ?? "No alt text"}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{asset.center?.crmLocationId ?? asset.center?.name ?? asset.ownerGroup?.name ?? asset.brand?.name ?? "Tenant"}</TableCell>
                    <TableCell>{asset.storageKey ?? asset.url ?? "Upload pending"}</TableCell>
                  </TableRow>
                );
              })}
              {!data.assets.length ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">No assets have been attached yet.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {data.settings.map((setting) => (
          <Card key={setting.id} className="glass-panel">
            <CardHeader>
              <CardTitle>{setting.brandName}</CardTitle>
              <CardDescription>{setting.brand.name} · {setting.brand.slug}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="size-5 rounded-full border" style={{ backgroundColor: setting.primaryColor }} />
                <span>Primary {setting.primaryColor}</span>
                <span className="size-5 rounded-full border" style={{ backgroundColor: setting.accentColor }} />
                <span>Accent {setting.accentColor}</span>
              </div>
              <div>Theme: {setting.themeMode}</div>
              <div>Email sender: {setting.emailSenderPlaceholder ?? "Not set"}</div>
              <div>Custom domain: {setting.customDomainPlaceholder ?? "Not set"}</div>
              <div className="text-muted-foreground">{setting.legalFooterText ?? "Legal footer not set"}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export type BillingSettingsPageData = {
  products: Array<{ id: string; name: string; type: string; amountCents: number }>;
  tuitionPlans: Array<{ id: string; name: string; ageGroup: string; cadence: string; amountCents: number }>;
  subscriptions: Array<{ id: string; name: string; plan: string; status: string }>;
  centers: StripeConnectCenter[];
  stripeConfigured: boolean;
  webhookConfigured: boolean;
  applicationFeeBps: number;
  parentSurchargeBps: number;
  applicationFeeFixedCents: number;
  parentSurchargeFixedCents: number;
};

export function BillingSettingsPage({ data }: { data: BillingSettingsPageData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card/80 p-6 shadow-2xl shadow-black/15">
        <Badge className="mb-4">
          <BadgeDollarSign data-icon="inline-start" />
          SaaS and tuition settings
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Billing Settings</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Tuition plans, products, fees, discounts, subscriptions, and Stripe Connect payout setup for each school.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Products and fees" value={data.products.length} />
        <StatCard label="Tuition plans" value={data.tuitionPlans.length} />
        <StatCard label="Subscription placeholders" value={data.subscriptions.length} />
        <StatCard label="Payout accounts" value={data.centers.filter((center) => {
          const fields = center.customFields && typeof center.customFields === "object" && !Array.isArray(center.customFields)
            ? center.customFields as Record<string, unknown>
            : {};
          return Boolean(fields.stripeConnectAccountId || fields.stripeConnectedAccountId);
        }).length} />
      </div>
      <StripeConnectPanel
        centers={data.centers}
        stripeConfigured={data.stripeConfigured}
        webhookConfigured={data.webhookConfigured}
        applicationFeeBps={data.applicationFeeBps}
        parentSurchargeBps={data.parentSurchargeBps}
        applicationFeeFixedCents={data.applicationFeeFixedCents}
        parentSurchargeFixedCents={data.parentSurchargeFixedCents}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Parent Tuition Flow</CardTitle>
            <CardDescription>
              Parent portal invoice buttons create Stripe Checkout sessions. Successful webhooks mark payments paid, close invoices, and write ledger credits.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>School Payout Flow</CardTitle>
            <CardDescription>
              Each school completes Stripe Connect onboarding before live parent payments are accepted for that school.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Platform Fee Flow</CardTitle>
            <CardDescription>
              The configured application fee is retained by The Bee Suite while the remaining payment amount is routed to the school payout account.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Tuition Plans</CardTitle>
            <CardDescription>Age group and cadence settings</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Age group</TableHead>
                  <TableHead>Cadence</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tuitionPlans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell>{plan.ageGroup}</TableCell>
                    <TableCell>{plan.cadence}</TableCell>
                    <TableCell>{money(plan.amountCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Products and Fees</CardTitle>
            <CardDescription>One-time and recurring billing items</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.type}</TableCell>
                    <TableCell>{money(product.amountCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
