import assert from "node:assert/strict";
import test from "node:test";
import { buildProcareMigrationReviewRow, finalizeProcareMigrationReview, summarizeProcareMigrationReview } from "../src/lib/procare-migration-review";

const relationships = JSON.stringify([{ guardian: true, personId: "person-1" }]);

test("current children require relationships, signed opening balance, and complete weekly tuition evidence", () => {
  const row = buildProcareMigrationReviewRow({
    "account id": "account-1",
    "child id": "child-1",
    "child name": "Current Child",
    "child status": "Enrolled",
    classroom: "Preschool",
    "procare relationship records": relationships,
    balance: "125.50",
    "weekly tuition cents": "15000",
    "source cadence": "weekly",
    "source description": "Preschool weekly tuition",
    "source effective date": "2026-08-24",
  }, 2);

  assert.ok(row);
  assert.equal(row.familyScope, "current");
  assert.equal(row.relationshipsReady, true);
  assert.equal(row.openingBalanceCents, 12_550);
  assert.equal(row.openingBalanceIncluded, true);
  assert.equal(row.weeklyTuitionCents, 15_000);
  assert.equal(row.weeklyTuitionReady, true);
  assert.deepEqual(row.blockers, []);
});

test("withdrawn and hidden children remain historical and their balances stay outside current outstanding", () => {
  const row = buildProcareMigrationReviewRow({
    "account id": "account-old",
    "child id": "child-old",
    "child status": "Withdrawn",
    "is hidden": "Checked",
    balance: "99.15",
  }, 4);

  assert.ok(row);
  assert.equal(row.familyScope, "historical");
  assert.equal(row.openingBalanceStatus, "excluded_historical");
  assert.equal(row.openingBalanceIncluded, false);
  assert.equal(row.weeklyTuitionReady, true);
  assert.deepEqual(row.blockers, []);
});

test("review summary counts each family balance once when siblings share an account", () => {
  const make = (childId: string) => buildProcareMigrationReviewRow({
    "account id": "account-1",
    "child id": childId,
    "child status": "Enrolled",
    classroom: "Schoolers",
    "procare relationship records": relationships,
    balance: "200.00",
    "weekly tuition cents": "10000",
    "source cadence": "weekly",
    "source description": "Weekly tuition",
    "source effective date": "2026-W35",
  }, 2)!;
  const summary = summarizeProcareMigrationReview([make("child-1"), make("child-2")]);
  assert.equal(summary.currentFamilyAccounts, 1);
  assert.equal(summary.includedCurrentBalanceCents, 20_000);
  assert.equal(summary.currentChildren, 2);
  assert.equal(summary.weeklyTuitionReadyChildren, 2);
});

test("a withdrawn sibling does not move a current family's shared balance into historical outstanding", () => {
  const current = buildProcareMigrationReviewRow({
    "account id": "account-1", "child id": "current", "child status": "Enrolled", classroom: "Preschool",
    "procare relationship records": relationships, balance: "80.00",
    "weekly tuition cents": "10000", "source cadence": "weekly", "source description": "Weekly tuition", "source effective date": "2026-W35",
  }, 2)!;
  const withdrawn = buildProcareMigrationReviewRow({
    "account id": "account-1", "child id": "old", "child status": "Withdrawn", balance: "80.00",
  }, 3)!;
  const rows = finalizeProcareMigrationReview([current, withdrawn]);
  assert.equal(rows[1].childScope, "historical");
  assert.equal(rows[1].familyScope, "current");
  assert.equal(rows[1].openingBalanceStatus, "included_current_outstanding");
  const summary = summarizeProcareMigrationReview(rows);
  assert.equal(summary.includedCurrentBalanceCents, 8_000);
  assert.equal(summary.excludedHistoricalBalanceCents, 0);
});

test("current hidden accounts and incomplete tuition produce exact correction steps", () => {
  const row = buildProcareMigrationReviewRow({
    "account id": "account-1",
    "child id": "child-1",
    "child status": "Active",
    classroom: "Toddlers",
    "is hidden": "Checked",
    balance: "0",
  }, 8)!;
  assert.equal(row.familyScope, "current");
  assert.equal(row.openingBalanceIncluded, false);
  assert.match(row.blockers.join(" "), /current family hidden/);
  assert.match(row.blockers.join(" "), /source-backed guardian relationship/);
  assert.match(row.blockers.join(" "), /positive child-level weekly tuition/);
  assert.match(row.blockers.join(" "), /effective date/);
});
