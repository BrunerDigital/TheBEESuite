import type { ReactNode } from "react";
import {
  AlertTriangle,
  Baby,
  BadgeDollarSign,
  Building2,
  ChevronRight,
  HeartHandshake,
  KeyRound,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { EditableFamilyRecord } from "@/components/family-record-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { CUSTODY_WARNING_LABEL, hasCustodyWarning } from "@/lib/custody-visibility";
import { hasAssignedClassroom, needsEnrollmentSetup } from "@/lib/enrollment-status";
import { cn } from "@/lib/utils";

type Props = {
  family: EditableFamilyRecord;
  duplicateCounts: {
    families: number;
    guardians: number;
    children: number;
  };
  onSelectGuardian: (guardianId: string) => boolean;
  onSelectChild: (childId: string) => boolean;
  onSelectPickup: (pickupId: string) => boolean;
  onSelectEmergencyContact: (contactId: string) => boolean;
};

type RelationshipNodeProps = {
  title: string;
  detail: string;
  status?: string;
  tone?: "default" | "warning" | "positive";
  icon: ReactNode;
  onClick: () => void;
};

function RelationshipNode({ title, detail, status, tone = "default", icon, onClick }: RelationshipNodeProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        "h-auto min-h-16 w-full justify-start gap-3 rounded-lg border bg-background px-3 py-3 text-left shadow-none hover:border-primary/30 hover:bg-muted/40",
        tone === "warning" && "border-amber-500/45 bg-amber-500/5",
        tone === "positive" && "border-emerald-500/35 bg-emerald-500/5",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-md border bg-muted/30 text-primary" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{detail}</span>
        {status ? (
          <span className="mt-1.5 block whitespace-normal break-words text-xs font-medium text-primary">{status}</span>
        ) : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Button>
  );
}

function EmptyRelationship({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-5 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function confirmRelationshipRecordSwitch({
  currentId,
  targetId,
  targetLabel,
  draftLabel,
  confirmDiscard,
  onSelect,
}: {
  currentId: string;
  targetId: string;
  targetLabel: string;
  draftLabel: string;
  confirmDiscard: (message: string) => boolean;
  onSelect: (targetId: string) => void;
}) {
  if (currentId === targetId) return true;
  const confirmed = confirmDiscard(
    `Switch to this ${targetLabel}? Any unsaved ${draftLabel} edits will be discarded.`,
  );
  if (!confirmed) return false;
  onSelect(targetId);
  return true;
}

function scrollToEditor(sectionId: string, focusId: string, select: () => boolean) {
  if (!select()) return;
  window.requestAnimationFrame(() => {
    const target = document.getElementById(sectionId);
    const focusTarget = document.getElementById(focusId);
    focusTarget?.focus({ preventScroll: true });
    (focusTarget ?? target)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  });
}

export function FamilyRelationshipMap({
  family,
  duplicateCounts,
  onSelectGuardian,
  onSelectChild,
  onSelectPickup,
  onSelectEmergencyContact,
}: Props) {
  const billingGuardians = family.guardians.filter((guardian) => guardian.isBillingContact);
  const portalAccountGuardians = family.guardians.filter((guardian) => guardian.userId);
  const childrenNeedingEnrollmentSetup = family.children.filter(needsEnrollmentSetup);
  const custodyReviewRequired = hasCustodyWarning(family);
  const duplicateTotal = duplicateCounts.families + duplicateCounts.guardians + duplicateCounts.children;
  const billingEmail = normalizedEmail(family.billingEmail);
  const billingEmailMatchesGuardian = Boolean(
    billingEmail && family.guardians.some((guardian) => normalizedEmail(guardian.email) === billingEmail),
  );
  const reviewSignals = [
    family.guardians.length === 0 ? "No guardian is connected to this family." : null,
    billingGuardians.length === 0 && family.billingAccount ? "No guardian is marked as the billing contact for this linked billing account." : null,
    billingEmail && !billingEmailMatchesGuardian ? "The family billing email does not match a visible guardian email." : null,
    childrenNeedingEnrollmentSetup.length
      ? `${childrenNeedingEnrollmentSetup.length} current child${childrenNeedingEnrollmentSetup.length === 1 ? " needs" : "ren need"} a classroom assignment.`
      : null,
    duplicateTotal
      ? `${duplicateTotal} possible duplicate candidate${duplicateTotal === 1 ? " relates" : "s relate"} to the selected family, guardian, or child records. Confirm school scope and supporting evidence before merging.`
      : null,
    custodyReviewRequired ? `${CUSTODY_WARNING_LABEL} is required before related changes.` : null,
  ].filter((signal): signal is string => Boolean(signal));

  return (
    <Card id="family-relationships" className="scroll-mt-36 overflow-hidden border-border bg-card shadow-none">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Badge variant="secondary" className="mb-3">
              <HeartHandshake data-icon="inline-start" />
              Relationship map
            </Badge>
            <h2 className="font-heading text-balance text-xl font-medium leading-snug">See who is connected and why</h2>
            <CardDescription className="mt-1 max-w-3xl text-pretty">
              This read-only map uses the family data already visible in this workspace. Selecting a person loads that existing record in the editor below; save or discard draft edits before switching.
            </CardDescription>
          </div>
          <Badge variant={reviewSignals.length ? "secondary" : "default"} className="w-fit tabular-nums">
            {reviewSignals.length ? `${reviewSignals.length} visible review signal${reviewSignals.length === 1 ? "" : "s"}` : "No displayed review signals"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5 lg:p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,1.25fr)_minmax(0,1fr)] lg:items-start">
          <section aria-labelledby="relationship-guardians-title" className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <h3 id="relationship-guardians-title" className="text-sm font-semibold">Parents and guardians</h3>
              <Badge variant="outline" className="tabular-nums">{family.guardians.length}</Badge>
            </div>
            {family.guardians.length ? family.guardians.map((guardian) => {
              const status = [guardian.userId ? "Portal account linked" : null, guardian.isBillingContact ? "Billing contact" : null]
                .filter(Boolean)
                .join(" + ") || "Family contact";
              return (
                <RelationshipNode
                  key={guardian.id}
                  title={guardian.fullName}
                  detail={guardian.relation || "Guardian"}
                  status={status}
                  icon={guardian.userId ? <KeyRound className="size-5" /> : <UserRound className="size-5" />}
                  onClick={() => scrollToEditor("family-guardians", "family-guardian-selector", () => onSelectGuardian(guardian.id))}
                />
              );
            }) : <EmptyRelationship>No guardian is connected yet.</EmptyRelationship>}
          </section>

          <section aria-labelledby="relationship-family-title" className="rounded-lg border border-primary/30 bg-primary/[0.04] p-4 sm:p-5">
            <div>
              <div className="mx-auto grid size-16 place-items-center rounded-lg border border-primary/30 bg-background text-primary" aria-hidden="true">
                <UsersRound className="size-8" />
              </div>
              <div className="mt-3 text-center">
                <h3 id="relationship-family-title" className="text-balance text-lg font-semibold">{family.name}</h3>
                <div className="mt-1 flex flex-wrap justify-center gap-2">
                  <Badge variant="outline" className="h-auto min-h-5 max-w-full shrink whitespace-normal break-words py-1 text-center"><Building2 data-icon="inline-start" />{family.centerName || "School not set"}</Badge>
                  {family.billingAccount ? <Badge variant="outline"><BadgeDollarSign data-icon="inline-start" />Billing linked</Badge> : null}
                  {custodyReviewRequired ? <Badge variant="destructive"><ShieldCheck data-icon="inline-start" />{CUSTODY_WARNING_LABEL}</Badge> : null}
                </div>
              </div>

              <div className="my-4 h-px bg-border" />
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-muted-foreground">Children</span>
                <Badge variant="outline" className="tabular-nums">{family.children.length}</Badge>
              </div>
              <div className="space-y-2">
                {family.children.length ? family.children.map((child) => {
                  const classroomAssigned = hasAssignedClassroom(child.classroomId);
                  const classroomRequired = needsEnrollmentSetup(child);
                  return (
                    <RelationshipNode
                      key={child.id}
                      title={child.fullName}
                      detail={[child.ageGroup, child.enrollmentStatus.replaceAll("_", " ")].filter(Boolean).join(" · ")}
                      status={classroomAssigned ? "Classroom assigned" : classroomRequired ? "Classroom required" : "No classroom assigned"}
                      tone={classroomRequired ? "warning" : classroomAssigned ? "positive" : "default"}
                      icon={<Baby className="size-5" />}
                      onClick={() => scrollToEditor("family-children", "family-child-selector", () => onSelectChild(child.id))}
                    />
                  );
                }) : <EmptyRelationship>No child record is connected yet.</EmptyRelationship>}
              </div>
            </div>
          </section>

          <div className="space-y-5">
            <section aria-labelledby="relationship-pickups-title" className="space-y-3">
              <div className="flex items-center justify-between gap-2 px-1">
                <h3 id="relationship-pickups-title" className="text-sm font-semibold">Authorized pickups</h3>
                <Badge variant="outline" className="tabular-nums">{family.pickups.length}</Badge>
              </div>
              {family.pickups.length ? family.pickups.map((pickup) => (
                <RelationshipNode
                  key={pickup.id}
                  title={pickup.fullName}
                  detail={pickup.relation || "Pickup contact"}
                  status={pickup.verificationNotes ? "Verification notes present" : "Authorized pickup record"}
                  icon={<ShieldCheck className="size-5" />}
                  onClick={() => scrollToEditor("family-contacts", "family-pickup-selector", () => onSelectPickup(pickup.id))}
                />
              )) : <EmptyRelationship>No authorized pickup is listed.</EmptyRelationship>}
            </section>

            <section aria-labelledby="relationship-emergency-title" className="space-y-3">
              <div className="flex items-center justify-between gap-2 px-1">
                <h3 id="relationship-emergency-title" className="text-sm font-semibold">Emergency contacts</h3>
                <Badge variant="outline" className="tabular-nums">{family.emergencyContacts.length}</Badge>
              </div>
              {family.emergencyContacts.length ? family.emergencyContacts.map((contact) => (
                <RelationshipNode
                  key={contact.id}
                  title={contact.fullName}
                  detail={contact.relation || "Emergency contact"}
                  status="Emergency contact"
                  icon={<AlertTriangle className="size-5" />}
                  onClick={() => scrollToEditor("family-contacts", "family-emergency-contact-selector", () => onSelectEmergencyContact(contact.id))}
                />
              )) : <EmptyRelationship>No emergency contact is listed.</EmptyRelationship>}
            </section>
          </div>
        </div>

        <section aria-labelledby="relationship-review-title" className={cn(
          "rounded-lg border p-4",
          reviewSignals.length ? "border-amber-500/35 bg-amber-500/8" : "border-border bg-muted/20",
        )}>
          <div className="flex items-start gap-3">
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-md", reviewSignals.length ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground")} aria-hidden="true">
              {reviewSignals.length ? <AlertTriangle className="size-5" /> : <HeartHandshake className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <h3 id="relationship-review-title" className="font-semibold">{reviewSignals.length ? "Relationship review signals" : "No displayed review signals"}</h3>
              {reviewSignals.length ? (
                <ul className="mt-2 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                  {reviewSignals.map((signal) => <li key={signal} className="flex gap-2"><span aria-hidden="true">•</span><span className="text-pretty">{signal}</span></li>)}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No displayed signal was found by the family-level checks and the duplicate checks for the currently selected guardian and child. Duplicate review is not aggregated across every visible household member. Human review is still required before any merge, unlink, access, billing-contact, pickup, or custody-related change.</p>
              )}
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium">Parent Portal account links</div>
            <div className="text-muted-foreground">
              {portalAccountGuardians.length} of {family.guardians.length} guardian profiles have a linked Parent Portal account record. A link does not by itself confirm that sign-in is working.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{billingGuardians.length} billing contact{billingGuardians.length === 1 ? "" : "s"}</Badge>
            <Badge variant="outline">{family.pickups.length} pickup{family.pickups.length === 1 ? "" : "s"}</Badge>
            <Badge variant="outline">{family.emergencyContacts.length} emergency contact{family.emergencyContacts.length === 1 ? "" : "s"}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
