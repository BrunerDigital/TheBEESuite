"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertCircle, Archive, Building2, CheckCircle2, FileUp, KeyRound, LogOut, MapPin, Save, ShieldCheck, UserPlus } from "lucide-react";
import {
  CRM_LOCATION_ID_EXAMPLE,
  defaultCenterNameFromCrmLocationId,
  isValidCrmLocationId,
  parseCrmLocationId,
} from "@/lib/active-school-locations";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseExecutiveBulkImportCsv, summarizeExecutiveBulkImport } from "@/lib/executive-bulk-import";

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
  _count?: { leads: number; staff: number; classrooms: number };
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
};

type Props = {
  centers: CenterOption[];
  ownerGroups: OwnerGroupOption[];
  users: UserOption[];
};

type ExecutiveActionResponse = {
  error?: string;
  center?: { name?: string; crmLocationId?: string | null; status?: string };
  user?: { name?: string; email?: string; isActive?: boolean; sessionVersion?: number };
  auth?: { passwordResetSent?: boolean; authUserCreated?: boolean };
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
  const [activeAction, setActiveAction] = useState("");
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
  const [bulkCsv, setBulkCsv] = useState("");
  const [bulkResults, setBulkResults] = useState<Array<{ rowNumber: number; type: string; ok: boolean; id?: string; error?: string }>>([]);

  const sortedCenters = useMemo(
    () => [...centers].sort((a, b) => shortCenterLabel(a).localeCompare(shortCenterLabel(b))),
    [centers],
  );
  const activeSchools = useMemo(
    () => sortedCenters.filter((center) => center.status === "active"),
    [sortedCenters],
  );
  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.email.localeCompare(b.email)).slice(0, 75),
    [users],
  );
  const centerLocationIdIsValid = isValidCrmLocationId(centerForm.crmLocationId);
  const bulkRows = useMemo(() => parseExecutiveBulkImportCsv(bulkCsv), [bulkCsv]);
  const bulkSummary = useMemo(() => summarizeExecutiveBulkImport(bulkRows), [bulkRows]);

  function setCenterField(key: keyof ReturnType<typeof blankCenterForm>, value: string) {
    setCenterForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "crmLocationId") {
        const parsed = parseCrmLocationId(value);
        if (parsed) {
          if (!current.name) next.name = defaultCenterNameFromCrmLocationId(value);
          if (!current.locationId) next.locationId = parsed.crmLocationId;
          if (!current.city) next.city = parsed.city;
          if (!current.state) next.state = parsed.state;
        }
      }
      if (key === "state") next.state = value.toUpperCase();
      return next;
    });
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

  function executiveSuccessDetail(action: string, fallback: string, json: ExecutiveActionResponse | null) {
    if (action === "saveCenter" && json?.center) {
      return `${json.center.crmLocationId ?? json.center.name ?? "Location"} saved. Status: ${json.center.status ?? "updated"}.`;
    }
    if (action === "setCenterStatus" && json?.center) {
      return `${json.center.crmLocationId ?? json.center.name ?? "Location"} is now ${json.center.status ?? "updated"}.`;
    }
    if (action === "saveUser" && json?.user) {
      const resetDetail = json.auth?.passwordResetSent ? " Setup/reset email requested." : "";
      return `${json.user.email ?? json.user.name ?? "User"} saved and scoped.${resetDetail}`;
    }
    if (action === "resetUserPassword" && json?.user) {
      return json.auth?.passwordResetSent
        ? `Password setup/reset email sent to ${json.user.email ?? "the user"}.`
        : `Temporary password set for ${json.user.email ?? "the user"}.`;
    }
    if (action === "setUserStatus" && json?.user) {
      return `${json.user.email ?? "User"} ${json.user.isActive ? "reactivated" : "deactivated"}.`;
    }
    if (action === "revokeUserSessions" && json?.user) {
      return `Active sessions revoked for ${json.user.email ?? "the user"}. New session version: ${json.user.sessionVersion ?? "updated"}.`;
    }
    return fallback;
  }

  function post(action: string, payload: Record<string, unknown>, success: string, after?: () => void, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    startTransition(async () => {
      setMessage("");
      setError("");
      setActiveAction(success);
      try {
        const response = await fetch("/api/admin/executive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        });
        const json = (await response.json().catch(() => null)) as ExecutiveActionResponse | null;
        if (!response.ok) {
          setError(json?.error || "Executive action failed.");
          return;
        }
        setMessage(executiveSuccessDetail(action, success, json));
        after?.();
        router.refresh();
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Executive action failed before the server responded.");
      } finally {
        setActiveAction("");
      }
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
    setCenterStatusById(centerForm.centerId, status);
  }

  function setCenterStatusById(centerId: string, status: string) {
    const center = centers.find((item) => item.id === centerId);
    post(
      "setCenterStatus",
      { centerId, status },
      status === "closed" ? "Location removed from active schools." : "Location status updated.",
      undefined,
      status === "closed"
        ? `Archive ${center?.crmLocationId ?? center?.name ?? "this location"}? It will be removed from active school dropdowns but CRM, billing, FTE, and audit history will stay intact.`
        : undefined,
    );
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
    post(
      "resetUserPassword",
      resetForm,
      resetForm.password ? "Temporary password set." : "Password reset email sent.",
      () => setResetForm({ email: "", password: "" }),
      resetForm.password
        ? `Set a temporary password for ${resetForm.email}? The user will be required to replace it.`
        : `Send a password setup/reset email to ${resetForm.email}?`,
    );
  }

  function setUserStatus(status: "active" | "inactive") {
    post(
      "setUserStatus",
      { email: resetForm.email, status },
      status === "active" ? "User reactivated." : "User deactivated.",
      undefined,
      status === "inactive" ? `Deactivate ${resetForm.email}? The account will lose access until reactivated.` : undefined,
    );
  }

  function revokeSessions() {
    post(
      "revokeUserSessions",
      { email: resetForm.email },
      "Active sessions revoked. The user must log in again.",
      undefined,
      `Log ${resetForm.email} out of every device? They will need to sign in again.`,
    );
  }

  function importBulkRows() {
    if (!window.confirm(`Import ${bulkRows.length} executive row${bulkRows.length === 1 ? "" : "s"}? Location rows will be applied before user rows.`)) return;
    startTransition(async () => {
      setMessage("");
      setError("");
      setActiveAction("Importing executive CSV rows...");
      setBulkResults([]);
      try {
        const response = await fetch("/api/admin/executive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "bulkImport", rows: bulkRows }),
        });
        const json = (await response.json().catch(() => null)) as {
          error?: string;
          summary?: { imported: number; failed: number };
          results?: Array<{ rowNumber: number; type: string; ok: boolean; id?: string; error?: string }>;
        } | null;
        if (!response.ok) {
          setError(json?.error || "Bulk import failed.");
          return;
        }
        setBulkResults(json?.results ?? []);
        setMessage(`Bulk import finished: ${json?.summary?.imported ?? 0} imported, ${json?.summary?.failed ?? 0} failed.`);
        router.refresh();
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Bulk import failed before the server responded.");
      } finally {
        setActiveAction("");
      }
    });
  }

  async function loadBulkFile(file: File | null) {
    if (!file) return;
    setBulkCsv(await file.text());
    setBulkResults([]);
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
            <CheckCircle2 className="size-4" />
            <AlertTitle>Completed</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {isPending && activeAction ? (
          <Alert className="border-primary/30 bg-primary/10">
            <Save className="size-4" />
            <AlertTitle>Working</AlertTitle>
            <AlertDescription>{activeAction}</AlertDescription>
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
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="size-5 text-primary" />
                Active Schools
              </CardTitle>
              <CardDescription>Active schools are available to dashboards, CRM routing, and the Kid City USA inquiry dropdown.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location ID</TableHead>
                    <TableHead>School</TableHead>
                    <TableHead>Routing</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeSchools.map((center) => (
                    <TableRow key={center.id}>
                      <TableCell>
                        <div className="font-medium">{center.crmLocationId ?? "Missing"}</div>
                        <div className="text-xs text-muted-foreground">{center.locationId ?? center.name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{center.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[center.city, center.state].filter(Boolean).join(", ") || center.address || "Address pending"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{center.email ?? "No routing email"}</div>
                        <div className="text-xs text-muted-foreground">{center.phone ?? "No phone"}</div>
                      </TableCell>
                      <TableCell>
                        <div>{center.licensedCapacity.toLocaleString()} capacity</div>
                        <div className="text-xs text-muted-foreground">
                          {(center._count?.leads ?? 0).toLocaleString()} leads · {(center._count?.staff ?? 0).toLocaleString()} teachers · {(center._count?.classrooms ?? 0).toLocaleString()} rooms
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => loadCenter(center.id)}>Edit</Button>
                          <Button variant="outline" size="sm" onClick={() => setCenterStatusById(center.id, "closed")} disabled={isPending}>
                            <Archive data-icon="inline-start" />
                            Remove
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!activeSchools.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        No active schools are available in this scope yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileUp className="size-5 text-primary" />
                Bulk User and Location Import
              </CardTitle>
              <CardDescription>
                Paste or upload CSV rows for locations and users. Location rows are imported first, then center-scoped users are matched by Location ID.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-1">
                  <Label htmlFor="executive-bulk-csv">CSV</Label>
                  <Textarea
                    id="executive-bulk-csv"
                    value={bulkCsv}
                    onChange={(event) => {
                      setBulkCsv(event.target.value);
                      setBulkResults([]);
                    }}
                    rows={8}
                    placeholder={"type,name,email,role,locationId,capacity,title,sendPasswordReset\nlocation,,school@example.com,,FL | Sarasota,120,,\nuser,Jane Director,jane@example.com,CENTER_DIRECTOR,FL | Sarasota,,Center Director,yes"}
                  />
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="executive-bulk-file">CSV file</Label>
                    <Input id="executive-bulk-file" type="file" accept=".csv,text/csv" onChange={(event) => void loadBulkFile(event.target.files?.[0] ?? null)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg border bg-background/40 p-3">
                      <div className="text-lg font-semibold">{bulkSummary.locations}</div>
                      <div className="text-muted-foreground">Locations</div>
                    </div>
                    <div className="rounded-lg border bg-background/40 p-3">
                      <div className="text-lg font-semibold">{bulkSummary.users}</div>
                      <div className="text-muted-foreground">Users</div>
                    </div>
                    <div className="rounded-lg border bg-background/40 p-3">
                      <div className="text-lg font-semibold">{bulkSummary.total}</div>
                      <div className="text-muted-foreground">Rows</div>
                    </div>
                    <div className="rounded-lg border bg-background/40 p-3">
                      <div className="text-lg font-semibold">{bulkSummary.errors}</div>
                      <div className="text-muted-foreground">Errors</div>
                    </div>
                  </div>
                  <Button onClick={importBulkRows} disabled={isPending || !bulkRows.length || bulkSummary.errors > 0}>
                    <FileUp data-icon="inline-start" />
                    Import rows
                  </Button>
                </div>
              </div>
              {bulkRows.length ? (
                <div className="rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Location ID</TableHead>
                        <TableHead>Email / role</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bulkRows.slice(0, 12).map((row) => {
                        const result = bulkResults.find((item) => item.rowNumber === row.rowNumber);
                        return (
                          <TableRow key={`${row.rowNumber}-${row.type}`}>
                            <TableCell>{row.rowNumber}</TableCell>
                            <TableCell><Badge variant="outline">{row.type}</Badge></TableCell>
                            <TableCell>{row.name || "Missing"}</TableCell>
                            <TableCell>{row.crmLocationId || row.locationId || "None"}</TableCell>
                            <TableCell>
                              <div>{row.email || "No email"}</div>
                              <div className="text-xs text-muted-foreground">{row.role || "No role"}</div>
                            </TableCell>
                            <TableCell>
                              {row.errors.length ? (
                                <Badge variant="destructive">{row.errors.join(" ")}</Badge>
                              ) : result ? (
                                <Badge variant={result.ok ? "default" : "destructive"}>{result.ok ? "Imported" : result.error}</Badge>
                              ) : (
                                <Badge variant="secondary">Ready</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="size-5 text-primary" />
                Add or Edit School
              </CardTitle>
              <CardDescription>Create a school profile or edit an existing one. Location IDs must use {CRM_LOCATION_ID_EXAMPLE} format.</CardDescription>
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
                  <Label>Location ID</Label>
                  <Input value={centerForm.crmLocationId} onChange={(event) => setCenterField("crmLocationId", event.target.value)} placeholder={CRM_LOCATION_ID_EXAMPLE} />
                  {centerForm.crmLocationId && !centerLocationIdIsValid ? (
                    <p className="text-xs text-destructive">Use ST | City format.</p>
                  ) : null}
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
                <Button onClick={saveCenter} disabled={isPending || !centerLocationIdIsValid}>
                  <Save data-icon="inline-start" />
                  Save School
                </Button>
                <Button variant="outline" onClick={() => setCenterStatus("closed")} disabled={isPending || !centerForm.centerId}>
                  Remove from Active Schools
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
              <CardDescription>Create school users, assign scope, and set or send temporary credentials. Temporary-password users must choose a new private password before workspace access.</CardDescription>
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
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={user.isActive ? "default" : "outline"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                          {user.mustResetPassword ? <Badge variant="secondary">Reset required</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => loadUserForEdit(user)}>Edit</Button>
                          <Button variant="outline" size="sm" onClick={() => setResetForm((current) => ({ ...current, email: user.email }))}>Reset</Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              post(
                                "revokeUserSessions",
                                { email: user.email },
                                "Active sessions revoked. The user must log in again.",
                                undefined,
                                `Log ${user.email} out of every device? They will need to sign in again.`,
                              )
                            }
                          >
                            Sessions
                          </Button>
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
              <CardDescription>Send a reset email, set a temporary password, deactivate users, or force a fresh login. Password resets also require the user to replace temporary credentials.</CardDescription>
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
