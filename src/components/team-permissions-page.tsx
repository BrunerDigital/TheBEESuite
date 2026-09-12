import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { DeviceSessionPanel, type DeviceSessionPanelRow, type DeviceSessionSummary } from "@/components/device-session-panel";
import { RecordPaginationNav } from "@/components/record-pagination";
import type { LinkedRecordPagination } from "@/lib/record-pagination";
import { StatCard } from "@/components/record-stat-card";
import { formatRecordLabel } from "@/lib/record-label";

export type TeamPermissionsData = {
  brandName: string;
  directory: LinkedRecordPagination & { query: string; totalAuthorized: number };
  sessionPagination: LinkedRecordPagination;
  sessionSummary: DeviceSessionSummary;
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
  deviceSessions: DeviceSessionPanelRow[];
  currentDeviceSessionId: string | null;
  canManageDeviceSessions: boolean;
};

export function TeamPermissionsPage({ data }: { data: TeamPermissionsData }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border bg-card/80 p-4 shadow-2xl shadow-black/15 sm:p-6">
        <Badge className="mb-2">
          <KeyRound data-icon="inline-start" />
          Role-based access
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Team, users, and permissions</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Review team roles, account status, location access, and active device sessions.
        </p>
      </section>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-2">
        <StatCard compact label="Accounts in directory" value={data.directory.totalAuthorized} />
        {data.roleCounts.toSorted((left, right) => right.count - left.count).slice(0, 3).map((role) => (
          <StatCard compact key={role.role} label={formatRecordLabel(role.role)} value={role.count} />
        ))}
      </div>
      {data.roleCounts.length > 3 ? <details className="rounded-xl border bg-card px-3 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium">All {data.roleCounts.length} role totals</summary><dl className="grid gap-2 pb-3 sm:grid-cols-2">{data.roleCounts.map((role) => <div key={role.role} className="flex items-center justify-between gap-3"><dt>{formatRecordLabel(role.role)}</dt><dd className="font-semibold tabular-nums">{role.count}</dd></div>)}</dl></details> : null}
      <Card id="user-directory" className="glass-panel scroll-mt-24">
        <CardHeader>
          <CardTitle as="h2">User Directory</CardTitle>
          <CardDescription>{data.brandName} accounts. Location details are limited to your current workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/staff#user-directory" method="get" role="search" aria-label="User directory" className="mb-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="view" value="permissions" />
            <label className="min-w-0 flex-1 basis-52 space-y-1 text-sm font-medium" htmlFor="team-user-search">Find a user
              <Input id="team-user-search" name="q" type="search" maxLength={120} defaultValue={data.directory.query} placeholder="Name, email, or role" />
            </label>
            <input type="hidden" name="sessionPage" value={data.sessionPagination.page} />
            <button type="submit" className={buttonVariants({ variant: "default" })}>Search</button>
            {data.directory.query ? <Link href={`/staff?view=permissions&sessionPage=${data.sessionPagination.page}#user-directory`} className={buttonVariants({ variant: "outline" })}>Clear search</Link> : null}
          </form>
          <RecordPaginationNav pagination={data.directory} label="Users" />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Center</TableHead>
                <TableHead>Location access</TableHead>
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
                  <TableCell>{formatRecordLabel(user.role)}</TableCell>
                  <TableCell>{user.staffProfile?.center?.crmLocationId ?? user.staffProfile?.center?.name ?? "No staff location in this workspace"}</TableCell>
                  <TableCell>
                    {user.accessGrants.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {user.accessGrants.slice(0, 3).map((grant) => (
                          <Badge key={grant.id} variant="outline">
                            {formatRecordLabel(grant.scopeType)}: {grant.center?.crmLocationId ?? grant.center?.name ?? grant.ownerGroup?.name ?? grant.organization?.name ?? grant.brand?.name ?? "All locations"}
                          </Badge>
                        ))}
                        {user.accessGrants.length > 3 ? <details className="w-full text-xs"><summary className="min-h-11 cursor-pointer py-3 font-medium">Show {user.accessGrants.length - 3} more assignments</summary><div className="flex flex-wrap gap-1.5">{user.accessGrants.slice(3).map((grant) => <Badge key={grant.id} variant="outline">{formatRecordLabel(grant.scopeType)}: {grant.center?.crmLocationId ?? grant.center?.name ?? grant.ownerGroup?.name ?? grant.organization?.name ?? grant.brand?.name ?? "All locations"}</Badge>)}</div></details> : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No separate access grant in this workspace</span>
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
              {!data.users.length ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">{data.directory.query ? "No users match this search in your current workspace. Try a different name, email, or role." : "No users are available in your current workspace."}</TableCell></TableRow> : null}
            </TableBody>
          </Table>
          {data.directory.totalPages > 1 ? <RecordPaginationNav pagination={data.directory} label="Users" /> : null}
        </CardContent>
      </Card>
      <DeviceSessionPanel
        sessions={data.deviceSessions}
        summary={data.sessionSummary}
        pagination={data.sessionPagination}
        currentDeviceSessionId={data.currentDeviceSessionId}
        canManage={data.canManageDeviceSessions}
      />
    </div>
  );
}
