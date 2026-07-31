import assert from "node:assert/strict";
import { test } from "node:test";
import { preparedProcareCsv } from "../scripts/prepare-rendered-procare-import";

test("prepared ProCare CSV retains source coverage once without duplicating it on every family row", () => {
  const manifest = JSON.stringify({
    version: "rendered-procare-report-v1",
    sourceInventory: [{ sourceName: "synthetic.csv", reportKind: "rendered_account_information", rows: 2 }],
    normalizedRows: { total: 2, ready: 2, needsResolution: 0 },
  });
  const output = preparedProcareCsv([
    {
      "account id": "synthetic-account-1",
      "child id": "synthetic-child-1",
      "procare dataset coverage manifest": manifest,
    },
    {
      "account id": "synthetic-account-2",
      "child id": "synthetic-child-2",
      "procare dataset coverage manifest": manifest,
    },
  ]);

  assert.match(output.split(/\r?\n/)[0], /procare dataset coverage manifest/);
  assert.equal(output.split("rendered-procare-report-v1").length - 1, 1);
  assert.match(output, /synthetic-account-1/);
  assert.match(output, /synthetic-account-2/);
});
