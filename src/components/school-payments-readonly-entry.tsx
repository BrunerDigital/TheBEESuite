import Link from "next/link";
import { canAccessCenter, type CurrentUser } from "@/lib/auth";
import { canOpenSchoolPaymentsReadonly, schoolPaymentsReadonlyEnabled, schoolPaymentsReadonlyHref } from "@/lib/school-payments-readonly-entry";

export function SchoolPaymentsReadonlyEntry({ user, centerId }: { user: CurrentUser; centerId?: string }) {
  if (!schoolPaymentsReadonlyEnabled() || !canOpenSchoolPaymentsReadonly(user)) return null;
  return <div className="my-4"><Link className="rounded-lg border px-4 py-2 text-sm font-medium" href={schoolPaymentsReadonlyHref(centerId && canAccessCenter(user, centerId) ? centerId : undefined)}>Review payments and deposits</Link></div>;
}
