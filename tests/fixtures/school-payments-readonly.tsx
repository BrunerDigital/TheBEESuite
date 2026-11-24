import { createRoot } from "react-dom/client";
import { SchoolPaymentsReadonly } from "../../src/components/school-payments-readonly";
import type { SchoolPaymentsReadView } from "../../src/lib/school-payments-readonly";
declare const FIXTURE_PAYMENTS_VIEWS: SchoolPaymentsReadView[];
createRoot(document.getElementById("root")!).render(<main className="mx-auto max-w-5xl p-4"><SchoolPaymentsReadonly schools={FIXTURE_PAYMENTS_VIEWS} /></main>);
