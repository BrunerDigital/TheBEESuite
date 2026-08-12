import { Clock3, MapPin, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type AuthorizedPickupChild = {
  id: string;
  name: string;
  classroomName: string | null;
  isAtSchool: boolean;
  latestActivityAt: Date | null;
};

export function AuthorizedPickupAccessBlocked() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle as="h1">Pickup access needs review</CardTitle>
          <CardDescription>
            No family or child details are being shown because this login is not linked to one reviewed authorized-pickup record.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Please contact the school so staff can verify the correct pickup record. Existing parent and guardian check-in PINs are not changed by this review.
        </CardContent>
      </Card>
    </div>
  );
}

export function AuthorizedPickupWorkspace({
  familyName,
  centerName,
  pickupChildren,
}: {
  familyName: string;
  centerName: string | null;
  pickupChildren: AuthorizedPickupChild[];
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <section className="rounded-2xl border bg-card p-5 sm:p-7">
        <Badge className="mb-4"><ShieldCheck data-icon="inline-start" aria-hidden="true" /> Authorized pickup</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">{familyName} pickup</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          View current pickup status and use the school kiosk when it is time to pick up. Billing, messages, documents, and family profile details are not available here.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Pickup access</CardTitle>
          <CardDescription>{centerName ?? "Linked school"}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {pickupChildren.length ? pickupChildren.map((child) => (
            <div key={child.id} className="flex min-h-20 items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <div className="font-medium">{child.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {child.classroomName ? <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden="true" />{child.classroomName}</span> : null}
                  {child.latestActivityAt ? <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" aria-hidden="true" />Status updated today</span> : null}
                </div>
              </div>
              <Badge variant={child.isAtSchool ? "secondary" : "outline"}>{child.isAtSchool ? "At school" : "Not checked in"}</Badge>
            </div>
          )) : (
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">No currently enrolled children are available for this pickup record.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
