import type { CurrentUser } from "./auth";
import { canAccessCenter } from "./auth";
import { canOpenSchoolPaymentsReadonly } from "./school-payments-readonly-entry";
import { loadSchoolPaymentsReadonly } from "./school-payments-readonly-server";

type School = { id: string; name: string };
export async function readSchoolPaymentsPage(input: { enabled: boolean; centerId?: string }, deps: Parameters<typeof loadSchoolPaymentsReadonly>[1] & {
  schools(user: CurrentUser): Promise<School[]>;
}) {
  if (!input.enabled) return { status: "disabled" as const };
  const user = await deps.currentUser();
  if (!user || !canOpenSchoolPaymentsReadonly(user)) return { status: "denied" as const };
  const schools = (await deps.schools(user)).filter(s => canAccessCenter(user, s.id));
  const centerId = input.centerId || schools[0]?.id;
  if (!centerId || !schools.some(s => s.id === centerId)) return { status: "denied" as const };
  const result = await loadSchoolPaymentsReadonly(centerId, deps);
  // Never expose a stale school selector or school snapshot after revocation.
  if (!result.ok) return { status: "unavailable" as const };
  const latest = await deps.currentUser();
  if (!latest || latest.id !== user.id || latest.tenantId !== user.tenantId || latest.deviceSessionId !== user.deviceSessionId
    || latest.sessionVersion !== user.sessionVersion || !canOpenSchoolPaymentsReadonly(latest)
    || schools.some(s => !canAccessCenter(latest, s.id))) return { status: "denied" as const };
  return { status: "ready" as const, user: latest, schools, view: result.view };
}
