"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertCircle, Building2, KeyRound, LogOut, MapPin, Save, ShieldCheck, UserPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type CenterOption = {
  id: string;
  name: string;
  crmLocationId: string | null;
  locationId?: string | null;
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
};

type OwnerGroupOption = {
  id: string;
  name: string;
  ownerType: string;
  billingEmail: string | null;
  contactName: string | null;
};

type UserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
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
};

type Props = {
  centers: CenterOption[];
  ownerGroups: OwnerGroupOption[];
  users: UserOption[];
};

const roles = [
  ["BRAND_ADMIN", "Executive / brand admin"],
  ["REGIONAL_MANAGER", "Regional manager"],
  ["CENTER_DIRECTOR", "Center director"],
  ["ASSISTANT_DIRECTOR", "Assistant director"],
  ["TEACHER", "Teacher"],
  ["BILLING_ADMIN", "Billing/admin user"],
  ["READ_ONLY_AUDITOR", "Read-only auditor"],
];

const centerStatuses = [
  ["active", "Active"],
  ["trial_setup", "Trial/setup"],
  ["paused", "Paused"],
  ["closed", "Archived / closed"],
];

function blankCenterForm() {
  return {
    centerId: "",
    name: "",
    crmLocationId: "",
    locationId: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    phone: "",
    email: "",
    licensedCapacity: "",
    ownerGroupId: "",
    status: "active",
  };
}

function shortCenterLabel(center: CenterOption) {
  return [center.crmLocationId ?? center.name, [center.city, center.state].filter(Boolean).join(", ")].filter(Boolean).join(" - ");
}

export function ExecutiveAdminConsole({ centers, ownerGroups, users }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [centerForm, setCenterForm] = useState(blankCenterForm());
  const [ownerGroupForm, setOwnerGroupForm] = useState({ name: "", ownerType: "franchisee", billingEmail: "", contactName: "" });
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    role: "CENTER_DIRECTOR",
    centerId: "",
    ownerGroupId: "",
    accessScopeType: "CENTER",
    title: "Center Director",
    password: "",
    sendPasswordReset: "no",
  });
  const [resetForm, setResetForm] = useState({ email: "", password: "" });

  const sortedCenters = useMemo(
    () => [...centers].sort((a, b) => shortCenterLabel(a).localeCompare(shortCenterLabel(b))),
    [centers],
  );
  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.email.localeCompare(b.email)).slice(0, 75),
    [users],
  );

  function setCenterField(key: keyof ReturnType<typeof blankCenterForm>, value: string) {
    setCenterForm((current) => ({ ...current, [key]: value }));
  }

  function loadCenter(centerId: string) {
    const center = centers.find((item) => item.id === centerId);
    if (!center) {
      setCenterForm(blankCenterForm());
      return;
    }
    setCenterForm({
      centerId: center.id,
      name: center.name,
      crmLocationId: center.crmLocationId ?? "",
      locationId: center.locationId ?? center.crmLocationId ?? "",
      address: center.address ?? "",
      city: center.city ?? "",
      state: center.state ?? "",
      postalCode: center.postalCode ?? "",
      phone: center.phone ?? "",
      email: center.email ?? "",
      licensedCapacity: String(center.licensedCapacity ?? 0),
      ownerGroupId: center.ownerGroupId ?? "",
      status: center.status || "active",
    });
  }

  function post(action: string, payload: Record<string, unknown>, success: string, after?: () => void) {
    startTransition(async () => {
      setMessage("");
      setError("");
      const response = await fetch("/api/admin/executive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(json?.error || "Executive action failed.");
        return;
      }
      setMessage(success);
      after?.();
      router.refresh();
    });
  }

  function saveCenter() {
    post("saveCenter", centerForm, centerForm.centerId ? "Location updated." : "Location created.", () => {
      if (!centerForm.centerId) setCenterForm(blankCenterForm());
    });
  }

  function setCenterStatus(status: string) {
    if (!centerForm.centerId) {
      setError("Select a location first.");
      return;
    }
    post("setCenterStatus", { centerId: centerForm.centerId, status }, status === "closed" ? "Location archived." : "Location status updated.");
  }

  function createOwnerGroup() {
    post("createOwnerGroup", ownerGroupForm, "Owner group created.", () => setOwnerGroupForm({ name: "", ownerType: "franchisee", billingEmail: "", contactName: "" }));
  }

  function saveUser() {
    post("saveUser", { ...userForm, sendPasswordReset: userForm.sendPasswordReset === "yes" }, "User saved and access scoped.", () =>
      setUserForm((current) => ({ ...current, name: "", email: "", password: "" })),
    );
  }

  function resetPassword() {
    post("resetUserPassword", resetForm, resetForm.password ? "Temporary password set." : "Password reset email sent.", () => setResetForm({ email: "", password: "" }));
  }

  function setUserStatus(status: "active" | "inactive") {
    post("setUserStatus", { email: resetForm.email, status }, status === "active" ? "User reactivated." : "User deactivated.");
  }

  function revokeSessions() {
    post("revokeUserSessions", { email: resetForm.email }, "Active sessions revoked. The user must log in again.");
  }

  function loadUserForEdit(user: UserOption) {
    const grant = user.accessGrants.find((item) => item.isActive) ?? user.accessGrants[0];
    setUserForm({
      name: user.name,
      email: user.email,
      role: user.role,
      centerId: grant?.centerId ?? user.staffProfile?.center?.id ?? "",
      ownerGroupId: grant?.ownerGroupId ?? "",
      accessScopeType: grant?.scopeType ?? (user.staffProfile?.center?.id ? "CENTER" : "TENANT"),
      title: user.staffProfile?.title ?? user.role.replaceAll("_", " ").toLowerCase(),
      password: "",
      sendPasswordReset: "no",
    });
  }

  return (
    <Card className="glass-panel border-primary/30">
      <CardHeader>
        <Badge className="w-fit">
          <ShieldCheck data-icon="inline-start" />
          Executive self-service
        </Badge>
        <CardTitle>Corporate Admin Controls</CardTitle>
        <CardDescription>
          Add or archive locations, create owner groups, assign users, and reset passwords without developer changes. Location removal archives records so CRM, billing, FTE, and audit history stay intact.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {message ? (
          <Alert>
            <Save className="size-4" />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="size-5 text-primary" />
                Location Profile
              </CardTitle>
              <CardDescription>Create a new school or edit/archive an existing one.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Existing location</Label>
                <Select value={centerForm.centerId || "new"} onValueChange={(value) => (value ?? "new") === "new" ? setCenterForm(blankCenterForm()) : loadCenter(value ?? "")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Create new location</SelectItem>
                    {sortedCenters.map((center) => (
                      <SelectItem key={center.id} value={center.id}>{shortCenterLabel(center)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>School name</Label>
                  <Input value={centerForm.name} onChange={(event) => setCenterField("name", event.target.value)} placeholder="Kid City USA - New Location" />
                </div>
                <div className="space-y-1">
                  <Label>CRM / location ID</Label>
                  <Input value={centerForm.crmLocationId} onChange={(event) => setCenterField("crmLocationId", event.target.value)} placeholder="Kid City USA - City" />
                </div>
                <div className="space-y-1">
                  <Label>Routing email</Label>
                  <Input value={centerForm.email} onChange={(event) => setCenterField("email", event.target.value)} placeholder="school@kidcityusa.com" type="email" />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input value={centerForm.phone} onChange={(event) => setCenterField("phone", event.target.value)} placeholder="555-555-1212" />
                </div>
                <div className="space-y-1">
                  <Label>City</Label>
                  <Input value={centerForm.city} onChange={(event) => setCenterField("city", event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>State</Label>
                  <Input value={centerForm.state} onChange={(event) => setCenterField("state", event.target.value)} placeholder="FL" />
                </div>
                <div className="space-y-1">
                  <Label>Licensed capacity</Label>
                  <Input value={centerForm.licensedCapacity} onChange={(event) => setCenterField("licensedCapacity", event.target.value)} inputMode="numeric" />
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={centerForm.status} onValueChange={(value) => setCenterField("status", value ?? "active")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {centerStatuses.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Owner group</Label>
                  <Select value={centerForm.ownerGroupId || "default"} onValueChange={(value) => setCenterField("ownerGroupId", (value ?? "default") === "default" ? "" : value ?? "")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Use default corporate/network group</SelectItem>
                      {ownerGroups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Address</Label>
                  <Input value={centerForm.address} onChange={(event) => setCenterField("address", event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Postal code</Label>
                  <Input value={centerForm.postalCode} onChange={(event) => setCenterField("postalCode", event.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveCenter} disabled={isPending || !centerForm.name}>
                  <Save data-icon="inline-start" />
                  Save Location
                </Button>
                <Button variant="outline" onClick={() => setCenterStatus("closed")} disabled={isPending || !centerForm.centerId}>
                  Archive Location
                </Button>
                <Button variant="outline" onClick={() => setCenterStatus("active")} disabled={isPending || !centerForm.centerId}>
                  Reactivate
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserPlus className="size-5 text-primary" />
                User and Password Access
              </CardTitle>
              <CardDescription>Create school users, assign scope, and set or send temporary credentials.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={userForm.name} onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} type="email" />
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select value={userForm.role} onValueChange={(value) => setUserForm((current) => ({ ...current, role: value ?? current.role }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {roles.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Title</Label>
                  <Input value={userForm.title} onChange={(event) => setUserForm((current) => ({ ...current, title: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Access scope</Label>
                  <Select value={userForm.accessScopeType} onValueChange={(value) => setUserForm((current) => ({ ...current, accessScopeType: value ?? current.accessScopeType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TENANT">All Kid City USA locations</SelectItem>
                      <SelectItem value="OWNER_GROUP">Owner group</SelectItem>
                      <SelectItem value="CENTER">Single location</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Location</Label>
                  <Select value={userForm.centerId || "none"} onValueChange={(value) => setUserForm((current) => ({ ...current, centerId: (value ?? "none") === "none" ? "" : value ?? "" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No single-location assignment</SelectItem>
                      {sortedCenters.map((center) => <SelectItem key={center.id} value={center.id}>{shortCenterLabel(center)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Owner group</Label>
                  <Select value={userForm.ownerGroupId || "none"} onValueChange={(value) => setUserForm((current) => ({ ...current, ownerGroupId: (value ?? "none") === "none" ? "" : value ?? "" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No owner group assignment</SelectItem>
                      {ownerGroups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Temporary password</Label>
                  <Input value={userForm.password} onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))} type="password" placeholder="Optional" />
                </div>
                <div className="space-y-1">
                  <Label>Password reset email</Label>
                  <Select value={userForm.sendPasswordReset} onValueChange={(value) => setUserForm((current) => ({ ...current, sendPasswordReset: value ?? current.sendPasswordReset }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">Do not send</SelectItem>
                      <SelectItem value="yes">Send setup/reset email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={saveUser} disabled={isPending || !userForm.email || !userForm.name}>
                <UserPlus data-icon="inline-start" />
                Save User
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="size-5 text-primary" />
              Existing User Accounts
            </CardTitle>
            <CardDescription>Find live users quickly, then load them into the edit or password-reset forms.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Center</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUsers.map((user) => {
                  const grant = user.accessGrants.find((item) => item.isActive) ?? user.accessGrants[0];
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-medium">{user.name}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </TableCell>
                      <TableCell>{user.role.replaceAll("_", " ")}</TableCell>
                      <TableCell>{grant?.scopeType.replaceAll("_", " ") ?? "Role fallback"}</TableCell>
                      <TableCell>{grant?.center?.crmLocationId ?? grant?.center?.name ?? user.staffProfile?.center?.crmLocationId ?? user.staffProfile?.center?.name ?? grant?.ownerGroup?.name ?? "Tenant"}</TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? "default" : "outline"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => loadUserForEdit(user)}>Edit</Button>
                          <Button variant="outline" size="sm" onClick={() => setResetForm((current) => ({ ...current, email: user.email }))}>Reset</Button>
                          <Button variant="outline" size="sm" onClick={() => post("revokeUserSessions", { email: user.email }, "Active sessions revoked. The user must log in again.")}>Sessions</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!sortedUsers.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No users are available in this scope yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="size-5 text-primary" />
                Owner Group
              </CardTitle>
              <CardDescription>Create franchisee or multi-location owner containers before assigning schools/users.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={ownerGroupForm.name} onChange={(event) => setOwnerGroupForm((current) => ({ ...current, name: event.target.value }))} placeholder="Smith Family Ownership Group" />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={ownerGroupForm.ownerType} onValueChange={(value) => setOwnerGroupForm((current) => ({ ...current, ownerType: value ?? current.ownerType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="franchisee">Franchisee</SelectItem>
                    <SelectItem value="multi_location_operator">Multi-location operator</SelectItem>
                    <SelectItem value="single_location_owner">Single-location owner</SelectItem>
                    <SelectItem value="brand_network">Corporate / brand network</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Billing email</Label>
                <Input value={ownerGroupForm.billingEmail} onChange={(event) => setOwnerGroupForm((current) => ({ ...current, billingEmail: event.target.value }))} type="email" />
              </div>
              <div className="space-y-1">
                <Label>Contact name</Label>
                <Input value={ownerGroupForm.contactName} onChange={(event) => setOwnerGroupForm((current) => ({ ...current, contactName: event.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <Button onClick={createOwnerGroup} disabled={isPending || !ownerGroupForm.name}>
                  <Building2 data-icon="inline-start" />
                  Create Owner Group
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="size-5 text-primary" />
                Password and Session Controls
              </CardTitle>
              <CardDescription>Send a reset email, set a temporary password, deactivate users, or force a fresh login.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>User email</Label>
                <Input value={resetForm.email} onChange={(event) => setResetForm((current) => ({ ...current, email: event.target.value }))} type="email" />
              </div>
              <div className="space-y-1">
                <Label>Temporary password</Label>
                <Input value={resetForm.password} onChange={(event) => setResetForm((current) => ({ ...current, password: event.target.value }))} type="password" placeholder="Blank sends reset email" />
              </div>
              <div className="md:col-span-2">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={resetPassword} disabled={isPending || !resetForm.email}>
                    <KeyRound data-icon="inline-start" />
                    Reset Password
                  </Button>
                  <Button variant="outline" onClick={() => setUserStatus("inactive")} disabled={isPending || !resetForm.email}>
                    Deactivate User
                  </Button>
                  <Button variant="outline" onClick={() => setUserStatus("active")} disabled={isPending || !resetForm.email}>
                    Reactivate User
                  </Button>
                  <Button variant="outline" onClick={revokeSessions} disabled={isPending || !resetForm.email}>
                    <LogOut data-icon="inline-start" />
                    Log Out All Devices
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
