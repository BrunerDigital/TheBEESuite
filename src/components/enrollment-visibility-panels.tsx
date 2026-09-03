"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, CheckCircle2, CreditCard, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FamilyRecordEditor, type EditableFamilyRecord } from "@/components/family-record-editor";
import { GuardianPinManager } from "@/components/guardian-pin-manager";
import { ParentPortalInviteButton } from "@/components/parent-portal-invite-button";
import { ChildProfilePhotoControl } from "@/components/child-profile-photo-control";
import { CUSTODY_WARNING_LABEL, custodyWarningPreview, hasCustodyWarning } from "@/lib/custody-visibility";
import { BULK_ENROLLMENT_STATUSES } from "@/lib/child-enrollment-bulk";
import {
  isCurrentlyEnrolledChildRecord,
  needsEnrollmentSetup,
  normalizedEnrollmentStatus,
  type EnrollmentLifecycleCounts,
} from "@/lib/enrollment-status";
import { familiesForCompleteRecordEditing } from "@/lib/family-profile-visibility";

type IntakeCenter = { id: string; name: string; classrooms: Array<{ id: string; name: string; ageGroup: string }> };

export type FamilyProfileVisibilityRecord = EditableFamilyRecord & {
  createdAt: Date | string;
  guardians: Array<EditableFamilyRecord["guardians"][number] & {
    userId: string | null;
    checkInPinSetAt: Date | string | null;
    qrToken?: string | null;
    kioskPath?: string | null;
    centerName?: string | null;
  }>;
  _count: { documents: number; messages: number; pickups: number; emergencyContacts: number };
};

export type ChildProfileVisibilityRecord = {
  id: string;
  fullName: string;
  preferredName: string | null;
  dateOfBirth: Date | string;
  ageGroup: string;
  enrollmentStatus: string;
  startDate: Date | string | null;
  photoVideoPermission: boolean;
  fieldTripPermission: boolean;
  familyId: string;
  classroomId: string | null;
  profilePhotoUrl?: string | null;
  family: { id: string; name: string; centerId: string | null; custodyNotes: string | null };
  classroom: { id: string; name: string; center: { name: string; crmLocationId: string | null } } | null;
  _count: { allergies: number; medicalNotes: number; documents: number; incidents: number; dailyReports: number };
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  if (new Date(value).getUTCFullYear() === 1900) return "Missing DOB";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function hasPortalPhone(phone: string | null | undefined) {
  return (phone?.replace(/\D/g, "").length ?? 0) >= 4;
}

type PastEnrollmentRow = {
  id: string;
  familyId: string;
  familyName: string;
  centerId: string | null;
  fullName: string;
  ageGroup: string;
  enrollmentStatus: string;
  classroomId: string | null;
  classroomName: string | null;
};

function PastEnrollmentRecordsTable({ rows, centers }: { rows: PastEnrollmentRow[]; centers: IntakeCenter[] }) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [statusFilter, setStatusFilter] = useState(rows.some((row) => normalizedEnrollmentStatus(row.enrollmentStatus) === "withdrawn") ? "withdrawn" : "all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetStatus, setTargetStatus] = useState("enrolled");
  const [targetClassroomId, setTargetClassroomId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [postSaveBillingHref, setPostSaveBillingHref] = useState<string | null>(null);

  const statusCounts = useMemo(() => rows.reduce<Record<string, number>>((counts, row) => {
    const status = normalizedEnrollmentStatus(row.enrollmentStatus) || "not_set";
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {}), [rows]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = statusFilter === "all" || normalizedEnrollmentStatus(row.enrollmentStatus) === statusFilter;
      const matchesSearch = !query || [row.fullName, row.familyName, row.ageGroup, row.classroomName, row.enrollmentStatus]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [rows, search, statusFilter]);
  const selectedRows = useMemo(() => rows.filter((row) => selectedIds.has(row.id)), [rows, selectedIds]);
  const selectedCenterIds = [...new Set(selectedRows.map((row) => row.centerId).filter((value): value is string => Boolean(value)))];
  const selectedCenterId = selectedCenterIds.length === 1 ? selectedCenterIds[0] : "";
  const classroomOptions = centers.find((center) => center.id === selectedCenterId)?.classrooms ?? [];
  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(row.id));
  const movingToEnrolled = targetStatus === "enrolled";
  const canSubmit = selectedIds.size > 0
    && !busy
    && !isRefreshing
    && (!movingToEnrolled || (selectedCenterIds.length === 1 && Boolean(targetClassroomId)));

  function toggleChild(childId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(childId); else next.delete(childId);
      return next;
    });
    setMessage("");
    setError("");
    setPostSaveBillingHref(null);
  }

  function toggleFiltered(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const row of filteredRows) {
        if (checked) next.add(row.id); else next.delete(row.id);
      }
      return next;
    });
    setMessage("");
    setError("");
    setPostSaveBillingHref(null);
  }

  async function applyStatusChange() {
    if (!canSubmit) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/operations/records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: "childStatusBulk",
          childIds: [...selectedIds],
          enrollmentStatus: targetStatus,
          classroomId: movingToEnrolled ? targetClassroomId : null,
        }),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        updatedCount?: number;
        reenrollments?: Array<{ familyId: string; centerId: string; childId: string }>;
      } | null;
      if (!response.ok) throw new Error(json?.error || "The selected records could not be updated.");
      setMessage(`${json?.updatedCount ?? selectedIds.size} child record(s) updated to ${formatRecordLabel(targetStatus)}.`);
      if (json?.reenrollments?.length === 1) {
        const reenrollment = json.reenrollments[0];
        const params = new URLSearchParams({
          familyId: reenrollment.familyId,
          centerId: reenrollment.centerId,
          childId: reenrollment.childId,
        });
        setPostSaveBillingHref(`/billing-invoices?${params.toString()}#billing-workbench`);
      }
      setSelectedIds(new Set());
      startRefresh(() => router.refresh());
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "The selected records could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="past-enrollment-records" className="scroll-mt-24">
      <CardHeader>
        <CardTitle as="h2">Past & Other Student Records</CardTitle>
        <CardDescription>
          Review withdrawn and other non-current children without mixing them into active dashboards. Select one row or many, then change status. Moving a child to enrolled requires a classroom so every dashboard updates correctly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_auto]">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child, family, or classroom…" aria-label="Search past student records" />
          <Select value={statusFilter} onValueChange={(value) => value && setStatusFilter(value)}>
            <SelectTrigger aria-label="Filter past students by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All past & other ({rows.length.toLocaleString()})</SelectItem>
              {Object.entries(statusCounts).sort(([left], [right]) => left.localeCompare(right)).map(([status, count]) => (
                <SelectItem key={status} value={status}>{formatRecordLabel(status)} ({count.toLocaleString()})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={targetStatus} onValueChange={(value) => {
            if (!value) return;
            setTargetStatus(value);
            if (value !== "enrolled") setTargetClassroomId("");
          }}>
            <SelectTrigger aria-label="New enrollment status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BULK_ENROLLMENT_STATUSES.map((status) => <SelectItem key={status} value={status}>Change to {formatRecordLabel(status)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" disabled={!canSubmit} aria-busy={busy || isRefreshing} onClick={applyStatusChange}>
            {busy || isRefreshing ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}
            {busy || isRefreshing ? "Updating…" : `Update ${selectedIds.size || "selected"}`}
          </Button>
        </div>
        {movingToEnrolled ? (
          <div className="grid gap-2 sm:max-w-xl">
            <Select value={targetClassroomId} onValueChange={(value) => setTargetClassroomId(value ?? "")} disabled={selectedCenterIds.length !== 1}>
              <SelectTrigger aria-label="Classroom for enrolled children"><SelectValue placeholder="Choose classroom for enrolled children" /></SelectTrigger>
              <SelectContent>
                {classroomOptions.map((classroom) => <SelectItem key={classroom.id} value={classroom.id}>{classroom.name} · {classroom.ageGroup}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {selectedCenterIds.length > 1
                ? "Select children from one school at a time when enrolling so the classroom assignment stays correct."
                : "A classroom is required before enrolled children can appear in active family, attendance, and classroom totals."}
            </p>
          </div>
        ) : null}
        {message ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300" role="status" aria-live="polite">
            <span>{message}</span>
            {postSaveBillingHref ? (
              <Link href={postSaveBillingHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Open billing
              </Link>
            ) : null}
          </div>
        ) : null}
        {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</div> : null}
        <div className="text-xs text-muted-foreground">
          Showing {filteredRows.length.toLocaleString()} records · {selectedIds.size.toLocaleString()} selected
        </div>
        <div className="max-h-[42rem] overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-12">
                  <label className="inline-flex size-11 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={(event) => toggleFiltered(event.target.checked)}
                      aria-label="Select all filtered past students"
                      className="size-5 accent-primary"
                    />
                  </label>
                </TableHead>
                <TableHead>Child</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>Current status</TableHead>
                <TableHead>Last classroom</TableHead>
                <TableHead>Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.id} data-state={selectedIds.has(row.id) ? "selected" : undefined}>
                  <TableCell>
                    <label className="inline-flex size-11 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={(event) => toggleChild(row.id, event.target.checked)}
                        aria-label={`Select ${row.fullName}`}
                        className="size-5 accent-primary"
                      />
                    </label>
                  </TableCell>
                  <TableCell><div className="font-medium">{row.fullName}</div><div className="text-xs text-muted-foreground">{row.ageGroup}</div></TableCell>
                  <TableCell>{row.familyName}</TableCell>
                  <TableCell>
                    <Badge variant={needsEnrollmentSetup(row) ? "destructive" : "outline"}>
                      {needsEnrollmentSetup(row) ? "Needs enrollment setup" : formatRecordLabel(row.enrollmentStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.classroomName ?? "Unassigned"}</TableCell>
                  <TableCell>
                    <Link href={`/family-detail?familyId=${encodeURIComponent(row.familyId)}&childId=${encodeURIComponent(row.id)}#family-editor`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <ArrowUpRight data-icon="inline-start" /> Profile
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {!filteredRows.length ? <TableRow><TableCell colSpan={6} className="text-muted-foreground">No past student records match this filter.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function formatRecordLabel(value: string | null | undefined) {
  return String(value || "not_set").replaceAll("_", " ");
}

function EnrollmentVisibilityToggle({
  showOtherStatuses,
  setShowOtherStatuses,
  lifecycle,
  noun,
  pluralNoun,
}: {
  showOtherStatuses: boolean;
  setShowOtherStatuses: (value: boolean) => void;
  lifecycle: EnrollmentLifecycleCounts;
  noun: string;
  pluralNoun: string;
}) {
  const hiddenCount = lifecycle.other;
  const label = hiddenCount === 1 ? noun : pluralNoun;
  const statusBreakdown = [
    `${lifecycle.pending.toLocaleString()} pending`,
    `${lifecycle.waitlisted.toLocaleString()} waitlisted`,
    `${lifecycle.tourScheduled.toLocaleString()} tour scheduled`,
    `${lifecycle.summerBreak.toLocaleString()} summer break`,
    `${lifecycle.closed.toLocaleString()} closed`,
    `${lifecycle.needsReview.toLocaleString()} needing status or classroom review`,
  ].join(" · ");

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium">Past students and other enrollment statuses</div>
          <div className="text-xs text-muted-foreground">
            {hiddenCount.toLocaleString()} {label} {hiddenCount === 1 ? "is" : "are"} hidden from the active lists. {statusBreakdown}.
          </div>
        </div>
        <Button type="button" variant={showOtherStatuses ? "default" : "outline"} onClick={() => setShowOtherStatuses(!showOtherStatuses)}>
          {showOtherStatuses ? <EyeOff data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
          {showOtherStatuses ? "Show Active Only" : "Show Past & Other"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function FamilyProfilesEnrollmentPanel({
  currentFamilies,
  allFamilies,
  centers,
  enrollmentLifecycle,
  currentFamilyCount,
  ageGroups,
}: {
  currentFamilies: FamilyProfileVisibilityRecord[];
  allFamilies: FamilyProfileVisibilityRecord[];
  centers: IntakeCenter[];
  enrollmentLifecycle: EnrollmentLifecycleCounts;
  currentFamilyCount: number;
  allFamilyCount: number;
  ageGroups?: string[];
}) {
  const searchParams = useSearchParams();
  const requestedFamilyId = searchParams.get("familyId") ?? "";
  const requestedChildId = searchParams.get("childId") ?? "";
  const requestedSearchQuery = searchParams.get("q") ?? "";
  const requestedPastView = searchParams.get("showPast") === "1";
  const requestedFamilyHasOtherStatus = Boolean(
    requestedFamilyId &&
    !currentFamilies.some((family) => family.id === requestedFamilyId) &&
    allFamilies.some((family) => family.id === requestedFamilyId),
  );
  const [showOtherStatuses, setShowOtherStatuses] = useState(requestedFamilyHasOtherStatus || requestedPastView);
  const effectiveShowOtherStatuses = showOtherStatuses || requestedFamilyHasOtherStatus || requestedPastView;
  const editorFamilies = useMemo(() => familiesForCompleteRecordEditing({
    currentFamilies,
    allFamilies,
    requestedFamilyId,
  }), [allFamilies, currentFamilies, requestedFamilyId]);
  const [guardianDirectorySearch, setGuardianDirectorySearch] = useState("");
  const visibleFamilies = currentFamilies;
  const visibleFamilyCount = currentFamilyCount;
  const hasVisibleGuardians = visibleFamilies.some((family) => family.guardians.length);
  const allGuardianDirectoryRows = useMemo(
    () => editorFamilies
      .flatMap((family) => family.guardians.map((guardian) => ({
        ...guardian,
        familyId: family.id,
        familyName: family.name,
      })))
      .sort((left, right) => (
        Number(Boolean(right.isBillingContact && !right.email)) - Number(Boolean(left.isBillingContact && !left.email))
        || Number(Boolean(right.isBillingContact && !hasPortalPhone(right.phone))) - Number(Boolean(left.isBillingContact && !hasPortalPhone(left.phone)))
        || Number(Boolean(right.isBillingContact)) - Number(Boolean(left.isBillingContact))
        || left.fullName.localeCompare(right.fullName)
        || left.familyName.localeCompare(right.familyName)
      )),
    [editorFamilies],
  );
  const guardianDirectoryRows = useMemo(() => {
    const query = guardianDirectorySearch.trim().toLocaleLowerCase();
    if (!query) return allGuardianDirectoryRows;
    return allGuardianDirectoryRows.filter((guardian) => [
      guardian.fullName,
      guardian.familyName,
      guardian.relation,
      guardian.email,
      guardian.phone,
    ].some((value) => value?.toLocaleLowerCase().includes(query)));
  }, [allGuardianDirectoryRows, guardianDirectorySearch]);
  const familiesWithoutGuardians = editorFamilies.filter((family) => family.guardians.length === 0).length;
  const contactsWithoutEmailOrPhone = allGuardianDirectoryRows.filter((guardian) => !guardian.email && !guardian.phone).length;
  const billingGuardians = allGuardianDirectoryRows.filter((guardian) => guardian.isBillingContact);
  const billingGuardiansMissingEmail = billingGuardians.filter((guardian) => !guardian.email).length;
  const billingGuardiansMissingPhone = billingGuardians.filter((guardian) => guardian.email && !hasPortalPhone(guardian.phone)).length;
  const pastEnrollmentRows = useMemo<PastEnrollmentRow[]>(() => allFamilies.flatMap((family) => family.children
    .filter((child) => !isCurrentlyEnrolledChildRecord(child))
    .map((child) => ({
      id: child.id,
      familyId: family.id,
      familyName: family.name,
      centerId: family.centerId,
      fullName: child.fullName,
      ageGroup: child.ageGroup,
      enrollmentStatus: child.enrollmentStatus,
      classroomId: child.classroomId ?? null,
      classroomName: centers.flatMap((center) => center.classrooms).find((classroom) => classroom.id === child.classroomId)?.name ?? null,
    }))), [allFamilies, centers]);

  return (
    <div className="flex flex-col gap-6">
      <EnrollmentVisibilityToggle
        showOtherStatuses={effectiveShowOtherStatuses}
        setShowOtherStatuses={setShowOtherStatuses}
        lifecycle={enrollmentLifecycle}
        noun="student record"
        pluralNoun="student records"
      />

      {effectiveShowOtherStatuses ? <PastEnrollmentRecordsTable rows={pastEnrollmentRows} centers={centers} /> : null}

      {editorFamilies.length && (!effectiveShowOtherStatuses || requestedFamilyHasOtherStatus) ? (
        <FamilyRecordEditor
          key={`${requestedFamilyHasOtherStatus ? "requested-past-family" : "current-families"}-${requestedFamilyId}-${requestedChildId}-${requestedSearchQuery}`}
          families={editorFamilies}
          centers={centers}
          ageGroups={ageGroups}
          initialFamilyId={requestedFamilyId}
          initialChildId={requestedChildId}
          searchQuery={requestedSearchQuery}
        />
      ) : !effectiveShowOtherStatuses ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No currently enrolled families are visible for this scope.
          </CardContent>
        </Card>
      ) : null}

      {visibleFamilies.length < visibleFamilyCount ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Showing the first {visibleFamilies.length.toLocaleString()} of {visibleFamilyCount.toLocaleString()} families in this view.
          </CardContent>
        </Card>
      ) : null}

      <Card id="family-directory" className="scroll-mt-28">
        <CardHeader>
          <CardTitle as="h2">Family Directory</CardTitle>
          <CardDescription>Currently enrolled family profile snapshot</CardDescription>
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
                  <TableHead>Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleFamilies.map((family) => (
                <TableRow key={family.id} className="group">
                  <TableCell>
                    <Link
                      href={`/family-detail?familyId=${encodeURIComponent(family.id)}#family-editor`}
                      className="inline-flex max-w-full items-center gap-1 font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="truncate">{family.name}</span>
                      <ArrowUpRight className="size-3 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                    </Link>
                    <div className="text-xs text-muted-foreground">{family.billingEmail ?? "No billing email"}</div>
                  </TableCell>
                  <TableCell>{family.guardians.map((guardian) => guardian.fullName).join(", ") || "None"}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {family.children.map((child) => (
                        <div key={child.id}>
                          {child.fullName} ({child.ageGroup})
                          {child.tuitionAssignment?.enabled && typeof child.tuitionAssignment.amountCents === "number"
                            ? <span className="ml-1 text-xs font-medium text-muted-foreground">· {money(child.tuitionAssignment.amountCents)}/week</span>
                            : null}
                        </div>
                      ))}
                      {!family.children.length ? "None" : null}
                    </div>
                  </TableCell>
                  <TableCell>{family._count.documents} docs · {family._count.messages} messages</TableCell>
                  <TableCell>
                    {hasCustodyWarning(family) ? (
                      <div className="space-y-1">
                        <Badge variant="destructive">
                          <ShieldAlert data-icon="inline-start" />
                          {CUSTODY_WARNING_LABEL}
                        </Badge>
                        <div className="max-w-xs text-xs text-muted-foreground">{custodyWarningPreview(family)}</div>
                      </div>
                    ) : "Standard"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/family-detail?familyId=${encodeURIComponent(family.id)}#family-editor`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        <ArrowUpRight data-icon="inline-start" />
                        Profile
                      </Link>
                      <Link href={`/billing-invoices?familyId=${encodeURIComponent(family.id)}${family.centerId ? `&centerId=${encodeURIComponent(family.centerId)}` : ""}#billing-workbench`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        <CreditCard data-icon="inline-start" />
                        Billing
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!visibleFamilies.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No families match this view.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card id="guardian-directory" className="scroll-mt-36">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle as="h2">Parent / Guardian Directory</CardTitle>
              <CardDescription>
                All imported and manually entered contacts for the currently visible school families. Billing contacts need their own email and phone before an invitation can be reviewed; the invitation action also checks source completeness and duplicate identity.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{allGuardianDirectoryRows.length.toLocaleString()} contacts</Badge>
              {familiesWithoutGuardians ? (
                <Badge variant="secondary">
                  {familiesWithoutGuardians.toLocaleString()} famil{familiesWithoutGuardians === 1 ? "y" : "ies"} need{familiesWithoutGuardians === 1 ? "s" : ""} a guardian
                </Badge>
              ) : null}
              {contactsWithoutEmailOrPhone ? (
                <Badge variant="secondary">
                  {contactsWithoutEmailOrPhone.toLocaleString()} need email or phone
                </Badge>
              ) : null}
              {billingGuardiansMissingEmail ? (
                <Badge variant="destructive">
                  {billingGuardiansMissingEmail.toLocaleString()} payer{billingGuardiansMissingEmail === 1 ? "" : "s"} need email
                </Badge>
              ) : null}
              {billingGuardiansMissingPhone ? (
                <Badge variant="secondary">
                  {billingGuardiansMissingPhone.toLocaleString()} payer{billingGuardiansMissingPhone === 1 ? "" : "s"} need phone
                </Badge>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Input
              value={guardianDirectorySearch}
              onChange={(event) => setGuardianDirectorySearch(event.target.value)}
              placeholder="Search guardian, family, relationship, email, or phone"
              aria-label="Search parent and guardian directory"
            />
            {guardianDirectorySearch.trim() ? (
              <p className="text-xs text-muted-foreground">
                Showing {guardianDirectoryRows.length.toLocaleString()} of {allGuardianDirectoryRows.length.toLocaleString()} contacts.
              </p>
            ) : null}
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parent / guardian</TableHead>
                  <TableHead>Family</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Portal</TableHead>
                  <TableHead>Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guardianDirectoryRows.map((guardian) => (
                  <TableRow key={guardian.id}>
                    <TableCell className="font-medium">{guardian.fullName}</TableCell>
                    <TableCell>{guardian.familyName}</TableCell>
                    <TableCell>{guardian.relation || "Not specified"}</TableCell>
                    <TableCell>
                      {guardian.isBillingContact ? <Badge variant="secondary">Pays bills</Badge> : "—"}
                    </TableCell>
                    <TableCell>
                      <div className={guardian.isBillingContact && !guardian.email ? "font-medium text-destructive" : undefined}>
                        {guardian.email || (guardian.isBillingContact ? "Email required for payer" : "No email")}
                      </div>
                      <div className="text-xs text-muted-foreground">{guardian.phone || "No phone"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={guardian.userId ? "secondary" : guardian.isBillingContact && !guardian.email ? "destructive" : "outline"}>
                        {guardian.userId
                          ? "Portal linked"
                          : !guardian.email
                            ? "Email required"
                            : !hasPortalPhone(guardian.phone)
                              ? "Phone required"
                              : "Contact ready"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/family-detail?familyId=${encodeURIComponent(guardian.familyId)}#family-guardians`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <ArrowUpRight data-icon="inline-start" />
                        Family
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {!guardianDirectoryRows.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      {allGuardianDirectoryRows.length
                        ? "No parent or guardian contacts match this search."
                        : "No parent or guardian contacts are visible for this school scope."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Lobby kiosk credentials</CardTitle>
          <CardDescription>Directors set the 4-digit guardian PIN and QR code used at the check-in and checkout tablet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {visibleFamilies.flatMap((family) =>
            family.guardians.map((guardian) => (
              <GuardianPinManager
                key={guardian.id}
                guardianId={guardian.id}
                guardianName={guardian.fullName}
                familyName={family.name}
                centerId={family.centerId}
                centerName={guardian.centerName}
                pinSetAt={guardian.checkInPinSetAt}
                qrToken={guardian.qrToken}
                kioskPath={guardian.kioskPath}
              />
            )),
          )}
          {!hasVisibleGuardians ? (
            <p className="text-sm text-muted-foreground">No guardians are available for the selected school.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Parent Portal access</CardTitle>
          <CardDescription>
            Create Parent Portal access for the guardian email, send the welcome and installation steps, or send the parent feature
            guide after the account is linked. The invitation includes the password.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {visibleFamilies.flatMap((family) =>
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
          {!hasVisibleGuardians ? (
            <p className="text-sm text-muted-foreground">No guardians are available for the selected school.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function ChildProfilesEnrollmentPanel({
  currentChildren,
  allChildren,
  centers,
  enrollmentLifecycle,
  currentChildCount,
}: {
  currentChildren: ChildProfileVisibilityRecord[];
  allChildren: ChildProfileVisibilityRecord[];
  centers: IntakeCenter[];
  enrollmentLifecycle: EnrollmentLifecycleCounts;
  currentChildCount: number;
  allChildCount: number;
}) {
  const [showOtherStatuses, setShowOtherStatuses] = useState(false);
  const visibleChildren = currentChildren;
  const visibleChildCount = currentChildCount;
  const pastEnrollmentRows = useMemo<PastEnrollmentRow[]>(() => allChildren
    .filter((child) => !isCurrentlyEnrolledChildRecord(child))
    .map((child) => ({
      id: child.id,
      familyId: child.familyId,
      familyName: child.family.name,
      centerId: child.family.centerId,
      fullName: child.fullName,
      ageGroup: child.ageGroup,
      enrollmentStatus: child.enrollmentStatus,
      classroomId: child.classroomId,
      classroomName: child.classroom?.name ?? null,
    })), [allChildren]);

  return (
    <div className="flex flex-col gap-6">
      <EnrollmentVisibilityToggle
        showOtherStatuses={showOtherStatuses}
        setShowOtherStatuses={setShowOtherStatuses}
        lifecycle={enrollmentLifecycle}
        noun="student record"
        pluralNoun="student records"
      />

      {showOtherStatuses ? <PastEnrollmentRecordsTable rows={pastEnrollmentRows} centers={centers} /> : null}

      {!showOtherStatuses && visibleChildren.length < visibleChildCount ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Showing the first {visibleChildren.length.toLocaleString()} of {visibleChildCount.toLocaleString()} children in this view.
          </CardContent>
        </Card>
      ) : null}

      {!showOtherStatuses ? <Card id="child-directory" className="scroll-mt-28">
        <CardHeader>
          <CardTitle as="h2">Children</CardTitle>
          <CardDescription>
            {showOtherStatuses ? "Students across all enrollment statuses" : "Currently enrolled student records"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Child</TableHead>
                <TableHead>Profile photo</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>Classroom</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Safety</TableHead>
                <TableHead>Permissions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleChildren.map((child) => (
                <TableRow key={child.id}>
                  <TableCell>
                    <div className="font-medium">{child.fullName}</div>
                    <div className="text-xs text-muted-foreground">{child.ageGroup} · DOB {formatDate(child.dateOfBirth)}</div>
                  </TableCell>
                  <TableCell>
                    <ChildProfilePhotoControl childId={child.id} childName={child.fullName} initialUrl={child.profilePhotoUrl} />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{child.family.name}</div>
                    {hasCustodyWarning(child.family) ? (
                      <Badge variant="destructive" className="mt-1">
                        <ShieldAlert data-icon="inline-start" />
                        {CUSTODY_WARNING_LABEL}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{child.classroom?.name ?? "Unassigned"}</TableCell>
                  <TableCell>{formatRecordLabel(child.enrollmentStatus)}</TableCell>
                  <TableCell>
                    {child._count.allergies} allergies · {child._count.medicalNotes} medical notes · {child._count.incidents} incidents
                    {hasCustodyWarning(child.family) ? (
                      <div className="mt-1 text-xs text-destructive">Review custody/pickup restrictions before release or contact changes.</div>
                    ) : null}
                  </TableCell>
                  <TableCell>{child.photoVideoPermission ? "Photo ok" : "Photo restricted"} · {child.fieldTripPermission ? "Trips ok" : "Trips restricted"}</TableCell>
                </TableRow>
              ))}
              {!visibleChildren.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No students match this view.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card> : null}
    </div>
  );
}
