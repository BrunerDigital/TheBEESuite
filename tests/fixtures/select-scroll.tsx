// Local QA fixture: real select with synthetic options and no backend.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../src/components/ui/select";
import { useParentPaymentRecovery } from "../../src/components/use-parent-payment-recovery";

function RecoveryFixture() {
  const outcome = new URLSearchParams(location.search).get("outcome") || "unresolved";
  const recovery = useParentPaymentRecovery("fake-family", async (input) => {
    const query = new URL(String(input), location.origin).searchParams;
    return Response.json({ ok: true, version: 1, familyId: query.get("familyId"), invoiceId: query.get("invoiceId"),
      paymentId: query.get("paymentId"), requestNonce: query.get("requestNonce"), observedAt: new Date().toISOString(),
      accountPaymentBlocker: null, invoicePayments: [], outcome });
  }, () => {});
  return <section><h2>Payment recovery: {outcome}</h2>
    <button disabled={recovery.hasHolds} onClick={() => { const attempt = recovery.begin(null, "card"); if (attempt) recovery.hold(attempt, "fake-payment"); }}>Simulate interrupted checkout</button>
    <button onClick={() => void recovery.refresh()}>Refresh payment status</button>
    <p role="status">{recovery.hasHolds ? recovery.allSettled ? "Recorded; review balance" : "Attempt held" : "No local hold"}</p>
    <p>{recovery.refreshMessage}</p>
  </section>;
}

function Fixture() {
  const [value, setValue] = useState<string | null>("family-1");
  return <main style={{ padding: 24, maxWidth: 420 }}>
    <h1>Family selector scroll regression</h1>
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger aria-label="Family"><SelectValue /></SelectTrigger>
      <SelectContent>{Array.from({ length: 80 }, (_, i) => <SelectItem key={i} value={`family-${i + 1}`}>Synthetic family {i + 1}</SelectItem>)}</SelectContent>
    </Select>
    <p role="status">Selected: {value}</p>
    <button onClick={() => setValue("family-1")}>Reset selection</button>
    <a href="#navigation-check">Continue navigation</a>
    <p id="navigation-check">Navigation available</p>
    <RecoveryFixture />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
