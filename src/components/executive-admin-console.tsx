"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertCircle, Archive, Building2, CheckCircle2, Copy, FileUp, KeyRound, LogOut, MapPin, RefreshCw, Save, ShieldCheck, UserPlus } from "lucide-react";
import {
  CRM_LOCATION_ID_EXAMPLE,
  defaultCenterNameFromCrmLocationId,
  parseCrmLocationId,
} from "@/lib/active-school-locations";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseExecutiveBulkImportCsv, summarizeExecutiveBulkImport } from "@/lib/executive-bulk-import";
import {
  validateExecutiveCenterForm,
  validateExecutiveOwnerGroupForm,
  validateExecutivePasswordAction,
  validateExecutiveUserForm,
} from "@/lib/executive-admin-validation";

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
  slug?: string;
  ownerType: string;
  billingEmail: string | null;
  contactName: string | null;
  status: string;
  _count?: { centers: number; accessGrants: number };
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
  ownerGroup?: { name?: string; ownerType?: string; status?: string };
  user?: { name?: string; email?: string; isActive?: boolean; sessionVersion?: number };
  auth?: { passwordResetSent?: boolean; authUserCreated?: boolean };
  login?: TeacherLoginResponse;
  summary?: { imported: number; failed: number };
  results?: BulkImportResult[];
};

type TeacherLoginResponse = {
  email: string;
  temporary_password: string;
};

type BulkImportResult = { rowNumber: number; type: string; ok: boolean; id?: string; error?: string; loginEmail?: string };

type ConfirmationState = {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "default" | "destructive";
};

type ExecutiveActionConfig = {
  action: string;
  payload: Record<string, unknown>;
  success: string;
  working?: string;
  after?: () => void;
  onSuccess?: (json: ExecutiveActionResponse | null) => void;
  confirmation?: ConfirmationState;
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

function blankOwnerGroupForm() {
  return {
    ownerGroupId: "",
    name: "",
    ownerType: "franchisee",
    billingEmail: "",
    contactName: "",
    status: "active",
  };
}

function shortCenterLabel(center: CenterOption) {
  return [center.crmLocationId ?? center.name, [center.city, center.state].filter(Boolean).join(", ")].filter(Boolean).join(" - ");
}

function statusBadgeVariant(status: string) {
  if (status === "active") return "default" as const;
  if (status === "closed" || status === "inactive") return "outline" as const;
  return "secondary" as const;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function ExecutiveAdminConsole({ centers, ownerGroups, users }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [activeAction, setActiveAction] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<ExecutiveActionConfig | null>(null);
  const [lastFailedAction, setLastFailedAction] = useState<ExecutiveActionConfig | null>(null);
  const [centerForm, setCenterForm] = useState(blankCenterForm());
  const [ownerGroupForm, setOwnerGroupForm] = useState(blankOwnerGroupForm());
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
  const [bulkResults, setBulkResults] = useState<BulkImportResult[]>([]);
  const [generatedLogin, setGeneratedLogin] = useState<TeacherLoginResponse | null>(null);

  const sortedCenters = useMemo(
    () => [...centers].sort((a, b) => shortCenterLabel(a).localeCompare(shortCenterLabel(b))),
    [centers],
  );
  const activeSchools = useMemo(() => sortedCenters.filter((center) => center.status === "active"), [sortedCenters]);
  const sortedOwnerGroups = useMemo(
    () => [...ownerGroups].sort((a, b) => a.name.localeCompare(b.name)),
    [ownerGroups],
  );
  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.email.localeCompare(b.email)).slice(0, 75),
    [users],
  );
  const centerValidationErrors = useMemo(() => validateExecutiveCenterForm(centerForm), [centerForm]);
  const ownerGroupValidationErrors = useMemo(() => validateExecutiveOwnerGroupForm(ownerGroupForm), [ownerGroupForm]);
  const userValidationErrors = useMemo(() => validateExecutiveUserForm(userForm), [userForm]);
  const passwordValidationErrors = useMemo(() => validateExecutivePasswordAction(resetForm), [resetForm]);
  const bulkRows = useMemo(() => parseExecutiveBulkImportCsv(bulkCsv), [bulkCsv]);
  const bulkSummary = useMemo(() => summarizeExecutiveBulkImport(bulkRows), [bulkRows]);
  const userFormIsTeacher = userForm.role === "TEACHER";

  function clearInlineFeedback() {
    if (validationErrors.length) setValidationErrors([]);
    if (error) setError("");
  }

  function setCenterField(key: keyof ReturnType<typeof blankCenterForm>, value: string) {
    clearInlineFeedback();
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

  function setOwnerGroupField(key: keyof ReturnType<typeof blankOwnerGroupForm>, value: string) {
    clearInlineFeedback();
    setOwnerGroupForm((current) => ({ ...current, [key]: value }));
  }

  function setUserField(key: keyof typeof userForm, value: string) {
    clearInlineFeedback();
    setUserForm((current) => ({ ...current, [key]: value }));
  }

  function setResetField(key: keyof typeof resetForm, value: string) {
    clearInlineFeedback();
    setResetForm((current) => ({ ...current, [key]: value }));
  }

  function setBulkCsvText(value: string) {
    clearInlineFeedback();
    setBulkCsv(value);
    setBulkResults([]);
  }

  function loadCenter(centerId: string) {
    clearInlineFeedback();
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

  function loadOwnerGroup(ownerGroupId: string) {
    clearInlineFeedback();
    const ownerGroup = ownerGroups.find((item) => item.id === ownerGroupId);
    if (!ownerGroup) {
      setOwnerGroupForm(blankOwnerGroupForm());
      return;
    }
    setOwnerGroupForm({
      ownerGroupId: ownerGroup.id,
      name: ownerGroup.name,
      ownerType: ownerGroup.ownerType || "franchisee",
      billingEmail: ownerGroup.billingEmail ?? "",
      contactName: ownerGroup.contactName ?? "",
      status: ownerGroup.status || "active",
    });
  }

  function executiveSuccessDetail(action: string, fallback: string, json: ExecutiveActionResponse | null) {
    if (action === "saveCenter" && json?.center) {
      return `${json.center.crmLocationId ?? json.center.name ?? "Location"} saved. Status: ${json.center.status ?? "updated"}.`;
    }
    if (action === "setCenterStatus" && json?.center) {
      return `${json.center.crmLocationId ?? json.center.name ?? "Location"} is now ${json.center.status ?? "updated"}.`;
    }
    if (action === "saveOwnerGroup" && json?.ownerGroup) {
      return `${json.ownerGroup.name ?? "Owner group"} saved. Status: ${json.ownerGroup.status ?? "updated"}.`;
    }
    if (action === "setOwnerGroupStatus" && json?.ownerGroup) {
      return `${json.ownerGroup.name ?? "Owner group"} is now ${json.ownerGroup.status ?? "updated"}.`;
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
    if (action === "bulkImport" && json?.summary) {
      return `Bulk import finished: ${json.summary.imported} imported, ${json.summary.failed} failed.`;
    }
    return fallback;
  }

  function showValidation(errors: string[]) {
    setMessage("");
    setError("");
    setLastFailedAction(null);
    setValidationErrors(errors);
  }

  function runAction(config: ExecutiveActionConfig) {
    startTransition(async () => {
      setMessage("");
      setError("");
      setValidationErrors([]);
      setGeneratedLogin(null);
      setActiveAction(config.working ?? config.success);
      try {
        const response = await fetch("/api/admin/executive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: config.action, ...config.payload }),
        });
        const json = (await response.json().catch(() => null)) as ExecutiveActionResponse | null;
        if (!response.ok) {
          setError(json?.error || "Executive action failed.");
          setLastFailedAction(config);
          return;
        }
        setLastFailedAction(null);
        setMessage(executiveSuccessDetail(config.action, config.success, json));
        if (config.action === "saveUser" && json?.login) setGeneratedLogin(json.login);
        config.onSuccess?.(json);
        config.after?.();
        router.refresh();
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Executive action failed before the server responded.");
        setLastFailedAction(config);
      } finally {
        setActiveAction("");
      }
    });
  }

  function requestAction(config: ExecutiveActionConfig) {
    if (config.confirmation) {
      setMessage("");
      setError("");
      setValidationErrors([]);
      setPendingConfirmation(config);
      return;
    }
    runAction(config);
  }

  function submitValidated(errors: string[], config: ExecutiveActionConfig) {
    if (errors.length) {
      showValidation(errors);
      return;
    }
    requestAction(config);
  }

  function confirmPendingAction() {
    const config = pendingConfirmation;
    setPendingConfirmation(null);
    if (config) runAction(config);
  }

  function saveCenter() {
    const existing = centers.find((item) => item.id === centerForm.centerId);
    const archiveOnSave = Boolean(existing && existing.status !== "closed" && centerForm.status === "closed");
    submitValidated(centerValidationErrors, {
      action: "saveCenter",
      payload: centerForm,
      success: centerForm.centerId ? "Location updated." : "Location created.",
      working: centerForm.centerId ? "Saving school changes..." : "Creating school...",
      confirmation: centerForm.centerId
        ? {
            title: archiveOnSave ? "Archive school?" : "Save school changes?",
            description: archiveOnSave
              ? `${existing?.crmLocationId ?? existing?.name ?? "This school"} will leave active operational dropdowns. CRM, billing, FTE, and audit history remain available.`
              : `Save profile, routing, capacity, owner group, and status updates for ${existing?.crmLocationId ?? existing?.name ?? "this school"}?`,
            confirmLabel: archiveOnSave ? "Archive school" : "Save changes",
            tone: archiveOnSave ? "destructive" : "default",
          }
        : undefined,
      after: () => {
        if (!centerForm.centerId) setCenterForm(blankCenterForm());
      },
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
    requestAction({
      action: "setCenterStatus",
      payload: { centerId, status },
      success: status === "closed" ? "Location removed from active schools." : "Location status updated.",
      working: status === "closed" ? "Archiving school..." : "Updating school status...",
      confirmation: {
        title: status === "closed" ? "Archive school?" : "Update school status?",
        description: status === "closed"
          ? `${center?.crmLocationId ?? center?.name ?? "This location"} will leave active school dropdowns, while CRM, billing, FTE, and audit history stay intact.`
          : `${center?.crmLocationId ?? center?.name ?? "This location"} will be set to ${statusLabel(status)}.`,
        confirmLabel: status === "closed" ? "Archive school" : "Update status",
        tone: status === "closed" ? "destructive" : "default",
      },
    });
  }

  function saveOwnerGroup() {
    const existing = ownerGroups.find((item) => item.id === ownerGroupForm.ownerGroupId);
    const archiveOnSave = Boolean(existing && existing.status !== "closed" && ownerGroupForm.status === "closed");
    submitValidated(ownerGroupValidationErrors, {
      action: "saveOwnerGroup",
      payload: ownerGroupForm,
      success: ownerGroupForm.ownerGroupId ? "Owner group updated." : "Owner group created.",
      working: ownerGroupForm.ownerGroupId ? "Saving owner group..." : "Creating owner group...",
      confirmation: ownerGroupForm.ownerGroupId
        ? {
            title: archiveOnSave ? "Archive owner group?" : "Save owner group changes?",
            description: archiveOnSave
              ? `${existing?.name ?? "This owner group"} will be archived. Assigned schools and users remain linked until you reassign them.`
              : `Save owner type, contact, billing, and status updates for ${existing?.name ?? "this owner group"}?`,
            confirmLabel: archiveOnSave ? "Archive owner group" : "Save changes",
            tone: archiveOnSave ? "destructive" : "default",
          }
        : undefined,
      after: () => {
        if (!ownerGroupForm.ownerGroupId) setOwnerGroupForm(blankOwnerGroupForm());
      },
    });
  }

  function setOwnerGroupStatusById(ownerGroupId: string, status: string) {
    const ownerGroup = ownerGroups.find((item) => item.id === ownerGroupId);
    requestAction({
      action: "setOwnerGroupStatus",
      payload: { ownerGroupId, status },
      success: status === "closed" ? "Owner group archived." : "Owner group status updated.",
      working: status === "closed" ? "Archiving owner group..." : "Updating owner group status...",
      confirmation: {
        title: status === "closed" ? "Archive owner group?" : "Update owner group status?",
        description: status === "closed"
          ? `${ownerGroup?.name ?? "This owner group"} will be archived. Assigned schools and users remain linked until you reassign them.`
          : `${ownerGroup?.name ?? "This owner group"} will be set to ${statusLabel(status)}.`,
        confirmLabel: status === "closed" ? "Archive owner group" : "Update status",
        tone: status === "closed" ? "destructive" : "default",
      },
    });
  }

  function saveUser() {
    const existing = users.find((item) => item.email.toLowerCase() === userForm.email.trim().toLowerCase());
    submitValidated(userValidationErrors, {
      action: "saveUser",
      payload: {
        ...userForm,
        password: userFormIsTeacher ? "" : userForm.password,
        sendPasswordReset: userFormIsTeacher ? false : userForm.sendPasswordReset === "yes",
      },
      success: "User saved and access scoped.",
      working: existing ? "Updating user access..." : "Creating user...",
      confirmation: existing
        ? {
            title: "Update user access?",
            description: `Save role and scope changes for ${existing.email}? Active access grants will be replaced with the selected scope.`,
            confirmLabel: "Update user",
          }
        : undefined,
      after: () =>
        setUserForm((current) => ({
          ...current,
          name: existing ? current.name : "",
          email: existing ? current.email : "",
          password: "",
        })),
    });
  }

  function copyGeneratedLogin() {
    if (!generatedLogin || !navigator.clipboard) return;
    void navigator.clipboard.writeText(`Username: ${generatedLogin.email}\nTemporary password: ${generatedLogin.temporary_password}`);
  }

  function resetPassword() {
    submitValidated(passwordValidationErrors, {
      action: "resetUserPassword",
      payload: resetForm,
      success: resetForm.password ? "Temporary password set." : "Password reset email sent.",
      working: resetForm.password ? "Setting temporary password..." : "Sending password reset...",
      after: () => setResetForm({ email: "", password: "" }),
      confirmation: {
        title: resetForm.password ? "Set temporary password?" : "Send password reset?",
        description: resetForm.password
          ? `${resetForm.email} will be required to replace the temporary password before workspace access.`
          : `${resetForm.email} will receive a password setup/reset email.`,
        confirmLabel: resetForm.password ? "Set password" : "Send reset",
      },
    });
  }

  function setUserStatus(status: "active" | "inactive") {
    setUserStatusForEmail(resetForm.email, status);
  }

  function setUserStatusForEmail(email: string, status: "active" | "inactive") {
    submitValidated(validateExecutivePasswordAction({ email }), {
      action: "setUserStatus",
      payload: { email, status },
      success: status === "active" ? "User reactivated." : "User deactivated.",
      working: status === "active" ? "Reactivating user..." : "Deactivating user...",
      confirmation: {
        title: status === "active" ? "Reactivate user?" : "Deactivate user?",
        description: status === "active"
          ? `${email} will be able to access their assigned workspace again.`
          : `${email} will lose access until an executive reactivates the account.`,
        confirmLabel: status === "active" ? "Reactivate user" : "Deactivate user",
        tone: status === "inactive" ? "destructive" : "default",
      },
    });
  }

  function revokeSessions() {
    revokeSessionsForEmail(resetForm.email);
  }

  function revokeSessionsForEmail(email: string) {
    submitValidated(validateExecutivePasswordAction({ email }), {
      action: "revokeUserSessions",
      payload: { email },
      success: "Active sessions revoked. The user must log in again.",
      working: "Revoking active sessions...",
      confirmation: {
        title: "Log out all devices?",
        description: `${email} will need to sign in again on every device.`,
        confirmLabel: "Log out devices",
        tone: "destructive",
      },
    });
  }

  function importBulkRows() {
    const errors: string[] = [];
    if (!bulkRows.length) errors.push("Bulk import needs at least one CSV row.");
    if (bulkSummary.errors > 0) errors.push("Fix CSV validation errors before importing.");
    submitValidated(errors, {
      action: "bulkImport",
      payload: { rows: bulkRows },
      success: "Bulk import finished.",
      working: "Importing executive CSV rows...",
      onSuccess: (json) => setBulkResults(json?.results ?? []),
      confirmation: {
        title: "Import executive rows?",
        description: `${bulkRows.length} row${bulkRows.length === 1 ? "" : "s"} will be imported. Location rows run first, then user rows are matched by Location ID.`,
        confirmLabel: "Import rows",
      },
    });
  }

  async function loadBulkFile(file: File | null) {
    if (!file) return;
    clearInlineFeedback();
    setBulkCsv(await file.text());
    setBulkResults([]);
  }

  function loadUserForEdit(user: UserOption) {
    clearInlineFeedback();
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
    <>
      <Dialog open={Boolean(pendingConfirmation)} onOpenChange={(open) => {
        if (!open) setPendingConfirmation(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingConfirmation?.confirmation?.title ?? "Confirm executive action"}</DialogTitle>
            <DialogDescription>{pendingConfirmation?.confirmation?.description ?? "Confirm this executive console change."}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingConfirmation(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={pendingConfirmation?.confirmation?.tone === "destructive" ? "destructive" : "default"}
              onClick={confirmPendingAction}
              disabled={isPending}
            >
              {pendingConfirmation?.confirmation?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <AlertDescription>
              <div className="space-y-3">
                <p>{error}</p>
                {lastFailedAction ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => runAction(lastFailedAction)} disabled={isPending}>
                    <RefreshCw data-icon="inline-start" />
                    Retry last action
                  </Button>
                ) : null}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {validationErrors.length ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Fix before saving</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4">
                {validationErrors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="size-5 text-primary" />
                School Lifecycle
              </CardTitle>
              <CardDescription>
                {activeSchools.length} active school{activeSchools.length === 1 ? "" : "s"} are available to dashboards, CRM routing, and the Kid City USA inquiry dropdown. Archived schools stay visible here for recovery.
              </CardDescription>
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
                  {sortedCenters.map((center) => (
                    <TableRow key={center.id}>
                      <TableCell>
                        <div className="font-medium">{center.crmLocationId ?? "Missing"}</div>
                        <div className="text-xs text-muted-foreground">{center.locationId ?? center.name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{center.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant={statusBadgeVariant(center.status)}>{statusLabel(center.status)}</Badge>
                          <span>{[center.city, center.state].filter(Boolean).join(", ") || center.address || "Address pending"}</span>
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCenterStatusById(center.id, center.status === "closed" ? "active" : "closed")}
                            disabled={isPending}
                          >
                            <Archive data-icon="inline-start" />
                            {center.status === "closed" ? "Reactivate" : "Archive"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!sortedCenters.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        No schools are available in this scope yet.
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
                    onChange={(event) => setBulkCsvText(event.target.value)}
                    rows={8}
                    placeholder={"type,name,email,role,locationId,capacity,title,sendPasswordReset\nlocation,,school@example.com,,FL | Sarasota,120,,\nuser,Jane Director,jane@example.com,CENTER_DIRECTOR,FL | Sarasota,,Center Director,yes\nteacher,Sarah Johnson,,TEACHER,FL | Sarasota,,Lead Teacher,"}
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
                  <Button onClick={importBulkRows} disabled={isPending}>
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
                                <div className="space-y-1">
                                  <Badge variant={result.ok ? "default" : "destructive"}>{result.ok ? "Imported" : result.error}</Badge>
                                  {result.loginEmail ? <div className="break-all text-xs text-muted-foreground">{result.loginEmail}</div> : null}
                                </div>
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
                <Select value={centerForm.centerId || "new"} onValueChange={(value) => {
                  if ((value ?? "new") === "new") {
                    clearInlineFeedback();
                    setCenterForm(blankCenterForm());
                  } else {
                    loadCenter(value ?? "");
                  }
                }}>
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
                  {centerForm.crmLocationId && centerValidationErrors.some((item) => item.startsWith("Location ID must")) ? (
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
                      {sortedOwnerGroups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name} ({statusLabel(group.status)})</SelectItem>)}
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
                <Button onClick={saveCenter} disabled={isPending}>
                  <Save data-icon="inline-start" />
                  Save School
                </Button>
                <Button variant="outline" onClick={() => setCenterStatus("closed")} disabled={isPending || !centerForm.centerId}>
                  Archive School
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
              {generatedLogin ? (
                <Alert>
                  <KeyRound className="size-4" />
                  <AlertTitle>Teacher login</AlertTitle>
                  <AlertDescription>
                    <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <div className="text-xs font-medium uppercase text-muted-foreground">Username</div>
                          <div className="break-all font-mono">{generatedLogin.email}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium uppercase text-muted-foreground">Temporary password</div>
                          <div className="font-mono">{generatedLogin.temporary_password}</div>
                        </div>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={copyGeneratedLogin}>
                        <Copy data-icon="inline-start" />
                        Copy
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={userForm.name} onChange={(event) => setUserField("name", event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{userFormIsTeacher ? "Contact email" : "Email"}</Label>
                  <Input value={userForm.email} onChange={(event) => setUserField("email", event.target.value)} type="email" />
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select value={userForm.role} onValueChange={(value) => setUserField("role", value ?? userForm.role)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {roles.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Title</Label>
                  <Input value={userForm.title} onChange={(event) => setUserField("title", event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Access scope</Label>
                  <Select value={userForm.accessScopeType} onValueChange={(value) => setUserField("accessScopeType", value ?? userForm.accessScopeType)}>
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
                  <Select value={userForm.centerId || "none"} onValueChange={(value) => setUserField("centerId", (value ?? "none") === "none" ? "" : value ?? "")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No single-location assignment</SelectItem>
                      {sortedCenters.map((center) => <SelectItem key={center.id} value={center.id}>{shortCenterLabel(center)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Owner group</Label>
                  <Select value={userForm.ownerGroupId || "none"} onValueChange={(value) => setUserField("ownerGroupId", (value ?? "none") === "none" ? "" : value ?? "")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No owner group assignment</SelectItem>
                      {sortedOwnerGroups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name} ({statusLabel(group.status)})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {!userFormIsTeacher ? (
                  <>
                    <div className="space-y-1">
                      <Label>Temporary password</Label>
                      <Input value={userForm.password} onChange={(event) => setUserField("password", event.target.value)} type="password" placeholder="Optional" />
                    </div>
                    <div className="space-y-1">
                      <Label>Password reset email</Label>
                      <Select value={userForm.sendPasswordReset} onValueChange={(value) => setUserField("sendPasswordReset", value ?? userForm.sendPasswordReset)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">Do not send</SelectItem>
                          <SelectItem value="yes">Send setup/reset email</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : null}
              </div>
              <Button onClick={saveUser} disabled={isPending}>
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
                          <Button variant="outline" size="sm" onClick={() => {
                            clearInlineFeedback();
                            setResetForm((current) => ({ ...current, email: user.email }));
                          }}>Reset</Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUserStatusForEmail(user.email, user.isActive ? "inactive" : "active")}
                            disabled={isPending}
                          >
                            {user.isActive ? "Deactivate" : "Reactivate"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => revokeSessionsForEmail(user.email)}
                            disabled={isPending}
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
              <CardDescription>Create, edit, archive, or reactivate franchisee and multi-location owner containers before assigning schools/users.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <Label>Existing owner group</Label>
                <Select value={ownerGroupForm.ownerGroupId || "new"} onValueChange={(value) => {
                  if ((value ?? "new") === "new") {
                    clearInlineFeedback();
                    setOwnerGroupForm(blankOwnerGroupForm());
                  } else {
                    loadOwnerGroup(value ?? "");
                  }
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Create new owner group</SelectItem>
                    {sortedOwnerGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>{group.name} ({statusLabel(group.status)})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={ownerGroupForm.name} onChange={(event) => setOwnerGroupField("name", event.target.value)} placeholder="Smith Family Ownership Group" />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={ownerGroupForm.ownerType} onValueChange={(value) => setOwnerGroupField("ownerType", value ?? ownerGroupForm.ownerType)}>
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
                <Input value={ownerGroupForm.billingEmail} onChange={(event) => setOwnerGroupField("billingEmail", event.target.value)} type="email" />
              </div>
              <div className="space-y-1">
                <Label>Contact name</Label>
                <Input value={ownerGroupForm.contactName} onChange={(event) => setOwnerGroupField("contactName", event.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Status</Label>
                <Select value={ownerGroupForm.status} onValueChange={(value) => setOwnerGroupField("status", value ?? "active")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="closed">Archived / closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={saveOwnerGroup} disabled={isPending}>
                    <Building2 data-icon="inline-start" />
                    {ownerGroupForm.ownerGroupId ? "Save Owner Group" : "Create Owner Group"}
                  </Button>
                  <Button variant="outline" onClick={() => setOwnerGroupStatusById(ownerGroupForm.ownerGroupId, "closed")} disabled={isPending || !ownerGroupForm.ownerGroupId}>
                    Archive Owner Group
                  </Button>
                  <Button variant="outline" onClick={() => setOwnerGroupStatusById(ownerGroupForm.ownerGroupId, "active")} disabled={isPending || !ownerGroupForm.ownerGroupId}>
                    Reactivate
                  </Button>
                </div>
              </div>
              {sortedOwnerGroups.length ? (
                <div className="md:col-span-2 rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Owner group</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Assignments</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedOwnerGroups.slice(0, 8).map((group) => (
                        <TableRow key={group.id}>
                          <TableCell>
                            <div className="font-medium">{group.name}</div>
                            <div className="text-xs text-muted-foreground">{group.contactName ?? group.billingEmail ?? group.slug ?? group.ownerType}</div>
                          </TableCell>
                          <TableCell><Badge variant={statusBadgeVariant(group.status)}>{statusLabel(group.status)}</Badge></TableCell>
                          <TableCell>
                            <div>{group._count?.centers ?? 0} schools</div>
                            <div className="text-xs text-muted-foreground">{group._count?.accessGrants ?? 0} scoped users</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => loadOwnerGroup(group.id)}>Edit</Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setOwnerGroupStatusById(group.id, group.status === "closed" ? "active" : "closed")}
                                disabled={isPending}
                              >
                                {group.status === "closed" ? "Reactivate" : "Archive"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
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
                <Input value={resetForm.email} onChange={(event) => setResetField("email", event.target.value)} type="email" />
              </div>
              <div className="space-y-1">
                <Label>Temporary password</Label>
                <Input value={resetForm.password} onChange={(event) => setResetField("password", event.target.value)} type="password" placeholder="Blank sends reset email" />
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
    </>
  );
}
