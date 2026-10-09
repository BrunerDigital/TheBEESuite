import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { withFixtureBrowser } from "./qa-fixture-browser";

// Exercise the real component with fake local data and intercepted API writes.
async function main() {
  const family = { id: "fake-family", centerId: "fake-school", name: "Fake Family", billingEmail: null, guardians: [],
    children: [1, 2].map(i => ({ id: "fake-child-" + i, fullName: "Fake Child " + i, ageGroup: "Preschool", classroomId: "fake-room", enrollmentStatus: "enrolled", startDate: null, careScheduleType: "full_time", scheduledDaysPerWeek: 5,
      tuitionAssignment: { enabled: true, tuitionPlanId: "fake-rate", tuitionPlanName: "Fake rate", cadence: "biweekly", amountCents: 18900, netAmountCents: 18900, billingDay: 4, startsPeriod: "2026-W40", description: "Fake rate", credits: [], additionalCharges: [] } })),
  };
  const fixture = await build({ stdin: { contents: `import React from "react";import {createRoot} from "react-dom/client";import {BillingWorkbench} from "./src/components/billing-workbench";
    createRoot(document.getElementById("root")).render(<><a href="/leave">Leave fixture</a><BillingWorkbench families={${JSON.stringify([family])}} centers={[{id:"fake-school",name:"Fake School",crmLocationId:null,classrooms:[{id:"fake-room",name:"Fake room",ageGroup:"Preschool"}]}]} products={[]} tuitionPlans={[{id:"fake-rate",centerId:"fake-school",name:"Fake rate",ageGroup:"Preschool",cadence:"weekly",amountCents:18900},{id:"fake-alternate",centerId:"fake-school",name:"Fake alternate",ageGroup:"Preschool",cadence:"weekly",amountCents:19000}]} currentRole="CENTER_DIRECTOR" canManageEnrollment initialFamilyId="fake-family" initialCenterId="fake-school" initialChildId="fake-child-1" /></>);`,
    resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "fake-next", setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: "fake-next" }));
      builder.onLoad({ filter: /.*/, namespace: "fake-next" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/navigation"
        ? "export const useRouter=()=>({refresh(){},push(){},replace(){}});export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>location.pathname;"
        : "import React from 'react';export default function Element({children,fill,priority,unoptimized,prefetch,...props}){return React.createElement('" + (args.path === "next/link" ? "a" : "img") + "',props,children)}" }));
    } }],
  });
  const server = createServer((req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(fixture.outputFiles[0].contents); }
    else { res.setHeader("Content-Type", "text/html"); res.end('<html><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port;
  await withFixtureBrowser(server, () => chromium.launch({ headless: true }), async browser => {
    for (const scenario of ["saved", "assignment-failed", "voucher", "save-assignment-button", "existing-rate", "disabled", "cancelled"]) {
      const page = await browser.newPage();
      const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
      const dialogs: string[] = [];
      page.on("dialog", async dialog => { dialogs.push(dialog.message()); if (scenario === "cancelled") await dialog.dismiss(); else await dialog.accept(); });
      await page.route("**/api/**", async route => {
        const pathname = new URL(route.request().url()).pathname;
        const body = route.request().postDataJSON();
        writes.push({ path: pathname, body });
        if (pathname === "/api/operations/records") {
          await route.fulfill({ status: body.id ? 409 : 200, json: body.id ? { code: "TUITION_PLAN_ASSIGNED_CREATE_NEW" } : { record: { id: "fake-new-rate" } } });
        } else {
          assert.equal(pathname, "/api/billing/tuition-assignments");
          await route.fulfill({ status: scenario === "assignment-failed" ? 409 : 200, json: scenario === "assignment-failed" ? { ok: false, error: "Review existing coverage." } : { ok: true, assignment: {} } });
        }
      });
      await page.goto(base);
      if (scenario === "voucher") {
        await page.locator("#billing-rate-funding").click();
        await page.getByRole("option", { name: /No family charge/ }).click();
      } else if (scenario === "existing-rate") {
        await page.locator("#billing-assignment-plan").click();
        await page.getByRole("option", { name: /Fake alternate/ }).click();
      } else await page.locator("#billing-rate-family-amount").fill("200");
      if (scenario === "disabled") {
        await page.locator("#billing-assignment-status").click();
        await page.getByRole("option", { name: "Disabled", exact: true }).click();
      }
      await page.getByRole("button", { name: ["save-assignment-button", "existing-rate", "disabled"].includes(scenario) ? "Save Tuition Assignment" : "Save Rate & Child Tuition", exact: true }).click();
      if (scenario === "cancelled") {
        assert.equal(writes.length, 0);
      } else if (scenario === "disabled") {
        await page.getByText("Recurring tuition disabled for Fake Child 1.", { exact: true }).waitFor();
        assert.equal(writes.length, 1);
        assert.equal(writes[0].body.enabled, false);
        assert.equal(writes[0].body.childId, "fake-child-1");
      } else if (scenario === "existing-rate") {
        await page.getByText(/Recurring tuition enabled for Fake Child 1/).waitFor();
        assert.equal(writes.length, 1);
        assert.equal(writes[0].body.tuitionPlanId, "fake-alternate");
        assert.equal(writes[0].body.billingCadence, "biweekly");
        assert.equal(writes[0].body.billingStartPeriod, "2026-W40");
        const priorDialogs = dialogs.length;
        await page.getByRole("link", { name: "Leave fixture" }).click();
        assert.equal(dialogs.length, priorDialogs);
      } else {
        await page.getByText(scenario === "assignment-failed" ? /Rate saved, but child tuition was not saved/ : /Rate and recurring tuition saved for Fake Child 1/).waitFor();
        const assignment = writes.find(write => write.path.endsWith("tuition-assignments"));
        assert.ok(assignment);
        assert.equal(assignment.body.childId, "fake-child-1");
        assert.equal(assignment.body.tuitionPlanId, "fake-new-rate");
        assert.equal(assignment.body.billingCadence, "biweekly");
        assert.equal(assignment.body.billingStartPeriod, "2026-W40");
        assert.ok(writes.every(write => write.body.childId !== "fake-child-2"));
        if (scenario === "voucher") assert.equal(writes[1].body.amountDollars, "0.00");
        const priorDialogs = dialogs.length;
        await page.getByRole("link", { name: "Leave fixture" }).click();
        assert.equal(dialogs.slice(priorDialogs).filter(message => message.includes("unsaved")).length, scenario === "assignment-failed" ? 1 : 0, scenario + " unsaved-exit behavior");
      }
      await page.close();
      console.log("PASS " + scenario);
    }
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
