import { createRoot } from "react-dom/client";
import { SchoolPaymentsReadonly } from "../../src/components/school-payments-readonly";
import type { SchoolPaymentsReadView } from "../../src/lib/school-payments-readonly";

declare const FIXTURE_PAYMENTS_PAGE: { view: SchoolPaymentsReadView; schools: Array<{ id: string; name: string }> };
const { view, schools } = FIXTURE_PAYMENTS_PAGE;
createRoot(document.getElementById("root")!).render(<main className="mx-auto max-w-5xl p-4"><SchoolPaymentsReadonly schools={[view]} schoolNavigation={
  <form method="get" action="/" className="flex flex-wrap gap-2"><div><label htmlFor="fixture-payments-center">School</label><select id="fixture-payments-center" className="block rounded border p-2" name="center" defaultValue={view.centerId}>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><button className="rounded border px-4" type="submit">View school</button></form>
} /></main>);
