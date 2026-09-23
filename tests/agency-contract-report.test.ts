import assert from "node:assert/strict";
import test from "node:test";
import { agencyContractReportRow, contractReportCsvCell, contractReportRange } from "../src/lib/agency-contract-report";
const contract = { id: "a", childId: "child", coverageStart: new Date("2020-02-15T12:00:00Z"), coverageEnd: new Date("2020-03-15T12:00:00Z"), authorizedRateCents: 100000, familyCopayCents: 10000, unitType: "monthly", status: "expired" };
test("historical dates have no lookback cutoff and invalid calendar dates fail", () => {
  assert.ok(contractReportRange("1990-01-01", "2020-02-29"));
  assert.equal(contractReportRange("2021-02-29", "2021-03-01"), null);
  assert.equal(contractReportRange("2020-03-01", "2020-02-29"), null);
});
test("coverage clips selected dates and never extends a current rate backward", () => {
  assert.equal(agencyContractReportRow(contract, contractReportRange("2019-01-01", "2020-02-14")!), null);
  const row = agencyContractReportRow(contract, contractReportRange("2020-02-01", "2020-02-29")!)!;
  assert.equal(row.applicableStart, "2020-02-15"); assert.equal(row.applicableEnd, "2020-02-29");
  assert.equal(row.weeklyEquivalentCents, 25000); assert.equal(row.familyCopayCents, 10000);
});
test("coverage end is inclusive; daily units and revoked contracts are not invented", () => {
  const range = contractReportRange("2020-03-15", "2020-03-15")!;
  assert.ok(agencyContractReportRow(contract, range));
  assert.equal(agencyContractReportRow({ ...contract, unitType: "daily" }, range)!.weeklyEquivalentCents, null);
  assert.equal(agencyContractReportRow({ ...contract, status: "revoked" }, range)!.weeklyEquivalentCents, null);
});
test("CSV formula payloads and quotes are escaped", () => {
  assert.equal(contractReportCsvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
});
