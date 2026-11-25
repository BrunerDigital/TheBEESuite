import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SchoolPaymentsReadonly } from "@/components/school-payments-readonly";
import { readSchoolPaymentsPage } from "@/lib/school-payments-readonly-page";
import { schoolPaymentsReadonlyEnabled } from "@/lib/school-payments-readonly-entry";
import { schoolPaymentsWindow } from "@/lib/school-payments-readonly-adapter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments | The BEE Suite", robots: { index: false, follow: false } };
export default async function SchoolPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!schoolPaymentsReadonlyEnabled()) notFound();
  const params = await searchParams;
  if (Object.keys(params).some(k => !["center", "start", "end"].includes(k)) || Object.values(params).some(v => Array.isArray(v))) notFound();
  let window;
  try { window = schoolPaymentsWindow(params.start as string | undefined, params.end as string | undefined); } catch { notFound(); }
  // Deferred import prevents disabled requests from constructing any provider or
  // database adapter. Only center and a bounded date window are caller choices.
  const { schoolPaymentsRuntime } = await import("@/lib/school-payments-readonly-runtime");
  const result = await readSchoolPaymentsPage({ enabled: true, centerId: params.center as string | undefined }, schoolPaymentsRuntime(window));
  if (result.status === "denied" || result.status === "disabled") notFound();
  if (result.status !== "ready") return <main className="p-6"><h1>Payments</h1><p role="status">School payment information is unavailable.</p></main>;
  return <AppShell currentUser={result.user}><SchoolPaymentsReadonly key={result.view.centerId} schools={[result.view]} schoolNavigation={
    <form action="/school-payments" method="get" className="flex flex-wrap items-end gap-2">
      <div><label htmlFor="school-payments-center" className="block text-sm font-medium">School</label><select id="school-payments-center" name="center" defaultValue={result.view.centerId} className="block rounded-lg border bg-background p-2">
        {result.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select></div>
      <label className="text-sm">From (UTC)<input type="date" name="start" defaultValue={window.start.toISOString().slice(0, 10)} className="block rounded-lg border p-2" /></label>
      <label className="text-sm">Through (UTC)<input type="date" name="end" defaultValue={window.end.toISOString().slice(0, 10)} className="block rounded-lg border p-2" /></label>
      <button type="submit" className="rounded-lg border px-4 py-2">View school</button>
    </form>
  } /></AppShell>;
}
