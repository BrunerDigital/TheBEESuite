"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, CreditCard, Eye, EyeOff, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FamilyRecordEditor, type EditableFamilyRecord } from "@/components/family-record-editor";
import { GuardianPinManager } from "@/components/guardian-pin-manager";
import { ParentPortalInviteButton } from "@/components/parent-portal-invite-button";
import { CUSTODY_WARNING_LABEL, custodyWarningPreview, hasCustodyWarning } from "@/lib/custody-visibility";

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
  family: { name: string; centerId: string | null; custodyNotes: string | null };
  classroom: { name: string; center: { name: string; crmLocationId: string | null } } | null;
  _count: { allergies: number; medicalNotes: number; documents: number; incidents: number; dailyReports: number };
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatRecordLabel(value: string | null | undefined) {
  return String(value || "not_set").replaceAll("_", " ");
}

function EnrollmentVisibilityToggle({
  showGraduated,
  setShowGraduated,
  hiddenCount,
  noun,
  pluralNoun,
}: {
  showGraduated: boolean;
  setShowGraduated: (value: boolean) => void;
  hiddenCount: number;
  noun: string;
  pluralNoun: string;
}) {
  const label = hiddenCount === 1 ? noun : pluralNoun;

  return (
    <Card className="glass-panel">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium">Graduated</div>
          <div className="text-xs text-muted-foreground">
            {hiddenCount.toLocaleString()} {label} no longer enrolled {hiddenCount === 1 ? "is" : "are"} hidden from the main lists.
          </div>
        </div>
        <Button type="button" variant={showGraduated ? "default" : "outline"} onClick={() => setShowGraduated(!showGraduated)}>
          {showGraduated ? <EyeOff data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
          {showGraduated ? "Hide Graduated" : "Show Graduated"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function FamilyProfilesEnrollmentPanel({
  currentFamilies,
  allFamilies,
  centers,
  graduatedChildren,
  ageGroups,
}: {
  currentFamilies: FamilyProfileVisibilityRecord[];
  allFamilies: FamilyProfileVisibilityRecord[];
  centers: IntakeCenter[];
  graduatedChildren: number;
  ageGroups?: string[];
}) {
  const searchParams = useSearchParams();
  const requestedFamilyId = searchParams.get("familyId") ?? "";
  const requestedChildId = searchParams.get("childId") ?? "";
  const requestedSearchQuery = searchParams.get("q") ?? "";
  const requestedFamilyIsGraduated = Boolean(
    requestedFamilyId &&
    !currentFamilies.some((family) => family.id === requestedFamilyId) &&
    allFamilies.some((family) => family.id === requestedFamilyId),
  );
  const [showGraduated, setShowGraduated] = useState(requestedFamilyIsGraduated);
  const effectiveShowGraduated = showGraduated || requestedFamilyIsGraduated;
  const visibleFamilies = effectiveShowGraduated ? allFamilies : currentFamilies;
  const hasVisibleGuardians = visibleFamilies.some((family) => family.guardians.length);

  return (
    <div className="flex flex-col gap-6">
      <EnrollmentVisibilityToggle
        showGraduated={effectiveShowGraduated}
        setShowGraduated={setShowGraduated}
        hiddenCount={graduatedChildren}
        noun="student record"
        pluralNoun="student records"
      />

      {visibleFamilies.length ? (
        <FamilyRecordEditor
          key={`${effectiveShowGraduated ? "all-families" : "current-families"}-${requestedFamilyId}-${requestedChildId}-${requestedSearchQuery}`}
          families={visibleFamilies}
          centers={centers}
          ageGroups={ageGroups}
          initialFamilyId={requestedFamilyId}
          initialChildId={requestedChildId}
          searchQuery={requestedSearchQuery}
        />
      ) : (
        <Card className="glass-panel">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No currently enrolled families are visible for this scope.
          </CardContent>
        </Card>
      )}

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Family Directory</CardTitle>
          <CardDescription>{showGraduated ? "Current and graduated family profile snapshot" : "Currently enrolled family profile snapshot"}</CardDescription>
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
                  <TableCell>{family.children.map((child) => `${child.fullName} (${child.ageGroup})`).join(", ") || "None"}</TableCell>
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
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No families match this view.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Lobby Kiosk Credentials</CardTitle>
          <CardDescription>Directors set the 4 digit guardian PIN and QR scan payload used on the check-in/check-out tablet.</CardDescription>
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
            <p className="text-sm text-muted-foreground">No guardians are visible for this scope yet.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Parent Portal Access</CardTitle>
          <CardDescription>
            Send parent portal login emails for linked parent accounts. Parents sign in with their guardian email and the school
            default parent password, then only see family records connected through that guardian profile.
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
            <p className="text-sm text-muted-foreground">No guardians are visible for this scope yet.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function ChildProfilesEnrollmentPanel({
  currentChildren,
  allChildren,
  graduatedChildren,
}: {
  currentChildren: ChildProfileVisibilityRecord[];
  allChildren: ChildProfileVisibilityRecord[];
  graduatedChildren: number;
}) {
  const [showGraduated, setShowGraduated] = useState(false);
  const visibleChildren = useMemo(
    () => showGraduated ? allChildren : currentChildren,
    [allChildren, currentChildren, showGraduated],
  );

  return (
    <div className="flex flex-col gap-6">
      <EnrollmentVisibilityToggle
        showGraduated={showGraduated}
        setShowGraduated={setShowGraduated}
        hiddenCount={graduatedChildren}
        noun="student record"
        pluralNoun="student records"
      />

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Children</CardTitle>
          <CardDescription>
            {showGraduated ? "Current and graduated student records" : "Currently enrolled student records"}
          </CardDescription>
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
              {visibleChildren.map((child) => (
                <TableRow key={child.id}>
                  <TableCell>
                    <div className="font-medium">{child.fullName}</div>
                    <div className="text-xs text-muted-foreground">{child.ageGroup} · DOB {formatDate(child.dateOfBirth)}</div>
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
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No students match this view.
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
