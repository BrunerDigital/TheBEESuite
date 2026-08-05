import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProcareAccountContactDataset,
  buildProcareRelationshipDataset,
  buildProcareRelationshipPersonDataset,
  missingProcareGuardianContactFields,
  procareRelationshipGuardian,
  resolveProcareChildAccount,
} from "@/lib/procare-family-relationship-reconciliation";

test("guardian contact enrichment fills only missing Procare phone and email fields", () => {
  assert.deepEqual(
    missingProcareGuardianContactFields(
      { email: "Parent@Example.com", phone: "(555) 111-2222" },
      { email: null, phone: "" },
    ),
    { email: "parent@example.com", phone: "(555) 111-2222" },
  );
  assert.deepEqual(
    missingProcareGuardianContactFields(
      { email: "new@example.com", phone: "555-999-0000" },
      { email: "kept@example.com", phone: "555-333-4444" },
    ),
    {},
  );
});

test("account contact parsing keeps exact account, payer, and person identifiers", () => {
  const dataset = buildProcareAccountContactDataset(csv(
    ["Account ID", "Account Key", "Person ID", "Person Type", "Full Name", "Email", "Phone 1"],
    [
      ["A-10", "SMITH", "P-1", "Payer", "Smith, Jordan", "Jordan@Example.com", "555-100-2000"],
      ["A-10", "SMITH", "C-1", "Child", "Smith, Avery", "", ""],
    ],
  ));
  assert.deepEqual(dataset.inventory, { accountRows: 2, accounts: 1, payers: 1 });
  assert.deepEqual(dataset.accounts.get("A-10"), {
    accountId: "A-10",
    accountKey: "SMITH",
    payers: [{
      personId: "P-1",
      personType: "Payer",
      fullName: "Jordan Smith",
      email: "jordan@example.com",
      phone: "555-100-2000",
      relation: "Unknown",
      livesWith: false,
      emergency: false,
      authorizedPickup: false,
    }],
  });
});

test("relationship person parsing supports alternate Procare relationship columns", () => {
  const dataset = buildProcareRelationshipPersonDataset(csv(
    ["Child ID", "Relationship Person ID", "Relationship Full Name", "Relationship Type", "Lives With", "Emergency Contact", "Pickup Allowed"],
    [["C-1", "P-1", "Smith, Jordan", "Mom", "Yes", "Yes", "Yes"]],
  ));
  assert.equal(dataset.inventory.people, 1);
  assert.deepEqual(dataset.people[0], {
    personId: "P-1",
    personType: "Relationship",
    fullName: "Jordan Smith",
    email: "",
    phone: "",
    relation: "Mom",
    livesWith: true,
    emergency: true,
    authorizedPickup: true,
  });
});

function csv(headers: string[], rows: string[][]) {
  const escape = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return Buffer.from([headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n"), "utf8");
}

test("payer-account intersection safely narrows a shared payer", () => {
  const resolution = resolveProcareChildAccount({
    directAccountIds: [],
    payerAccountSets: [["A", "B"], ["A"]],
  });
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.accountId, "A");
  assert.equal(resolution.tier, "single_payer_intersection");
});

test("disjoint payer evidence does not let direct membership silently win", () => {
  const resolution = resolveProcareChildAccount({
    directAccountIds: ["A"],
    payerAccountSets: [["A"], ["B"]],
  });
  assert.equal(resolution.status, "ambiguous");
  assert.equal(resolution.accountId, null);
  assert.equal(resolution.tier, "disjoint_payer_accounts");
});

test("unique direct child membership can disambiguate one shared payer", () => {
  const resolution = resolveProcareChildAccount({
    directAccountIds: ["A"],
    payerAccountSets: [["A", "B"]],
  });
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.accountId, "A");
  assert.equal(resolution.tier, "direct_disambiguates_shared_payer");
});

test("source parser joins exact IDs and decodes Windows-1252 names", () => {
  const account = csv(
    ["Account ID", "Account Key", "Person ID", "Person Type", "Full Name", "Email", "Phone 1"],
    [
      ["A", "HOUSE", "P1", "Payer", "O'Neil, Pat", "pat@example.test", "5551112222"],
      ["A", "HOUSE", "CP1", "Child", "O'Neil, Riley", "", ""],
    ],
  );
  const relationshipsText = [
    "Child ID,Person ID,Person Type,Full Name,Date of Birth,Enrollment Status,Relationship Type,Lives With,Emergency,Authorized Pickup,Phone 1",
    "C1,CP1,Child,\"O\x92Neil, Riley\",1/2/2020,Enrolled,,Indeterminate,Indeterminate,Indeterminate,",
    "C1,P1,Relationship,\"O\x92Neil, Pat\",,,Mom,Checked,Checked,Checked,5551112222",
  ].join("\r\n");
  const relationship = Buffer.from(relationshipsText, "latin1");

  const dataset = buildProcareRelationshipDataset(account, relationship);
  assert.equal(dataset.children.size, 1);
  const child = dataset.children.get("C1")!;
  assert.equal(child.accountResolution.accountId, "A");
  assert.equal(child.accountResolution.tier, "direct_confirmed");
  assert.match(child.fullName, /O’Neil/);
  assert.equal(child.contacts[0].authorizedPickup, true);
  assert.equal(dataset.schema.authoritativeForLiveReconciliation, false);
  assert.deepEqual(dataset.schema.missingRelationshipColumns, ["Row ID", "Status Date"]);
});

test("live reconciliation requires the full reviewed identity and enrollment schema", () => {
  const account = csv(
    ["Account ID", "Account Key", "Person ID", "Person Type", "Full Name"],
    [
      ["A", "HOUSE", "P1", "Payer", "Parent One"],
      ["A", "HOUSE", "C1", "Child", "Child One"],
    ],
  );
  const relationship = csv(
    ["Child ID", "Row ID", "Person ID", "Person Type", "Full Name", "Date of Birth", "Enrollment Status", "Status Date", "Relationship Type", "Lives With", "Emergency", "Authorized Pickup"],
    [
      ["C1", "R1", "C1", "Child", "Child One", "1/2/2020", "Enrolled", "1/1/2024", "", "", "", ""],
      ["C1", "R1", "P1", "Relationship", "Parent One", "", "", "", "Parent", "Checked", "Checked", "Checked"],
    ],
  );

  const dataset = buildProcareRelationshipDataset(account, relationship);
  assert.equal(dataset.schema.authoritativeForLiveReconciliation, true);
  assert.deepEqual(dataset.schema.missingAccountColumns, []);
  assert.deepEqual(dataset.schema.missingRelationshipColumns, []);
});

test("duplicate or contradictory child-contact rows fail closed", () => {
  const account = csv(
    ["Account ID", "Account Key", "Person ID", "Person Type", "Full Name"],
    [["A", "HOUSE", "P1", "Payer", "Parent One"]],
  );
  const headers = ["Child ID", "Person ID", "Person Type", "Full Name", "Relationship Type", "Lives With", "Emergency", "Authorized Pickup"];
  const relationship = csv(headers, [
    ["C1", "C1", "Child", "Child One", "", "", "", ""],
    ["C1", "P1", "Relationship", "Parent One", "Parent", "Checked", "Checked", "Checked"],
    ["C1", "P1", "Relationship", "Parent One", "Parent", "Checked", "Unchecked", "Unchecked"],
  ]);

  const dataset = buildProcareRelationshipDataset(account, relationship);
  assert.equal(dataset.children.get("C1")?.accountResolution.status, "ambiguous");
  assert.equal(dataset.children.get("C1")?.accountResolution.tier, "malformed_relationship_group");
  assert.deepEqual(dataset.children.get("C1")?.contacts, []);
  assert.deepEqual(dataset.integrity, { malformedChildren: 1, duplicateContactRows: 1, childSelfContactRows: 0 });
});

test("a child self Person ID cannot also grant relationship authority", () => {
  const account = csv(
    ["Account ID", "Account Key", "Person ID", "Person Type", "Full Name"],
    [["A", "HOUSE", "C1", "Payer", "Child One"]],
  );
  const relationship = csv(
    ["Child ID", "Person ID", "Person Type", "Full Name", "Relationship Type", "Lives With", "Emergency", "Authorized Pickup"],
    [
      ["C1", "C1", "Child", "Child One", "", "", "", ""],
      ["C1", "C1", "Relationship", "Child One", "Unknown", "Checked", "Checked", "Checked"],
    ],
  );

  const dataset = buildProcareRelationshipDataset(account, relationship);
  assert.equal(dataset.children.get("C1")?.accountResolution.status, "ambiguous");
  assert.equal(dataset.children.get("C1")?.accountResolution.tier, "malformed_relationship_group");
  assert.deepEqual(dataset.children.get("C1")?.integrityIssues, ["child_self_person_is_contact"]);
  assert.deepEqual(dataset.integrity, { malformedChildren: 1, duplicateContactRows: 0, childSelfContactRows: 1 });
});

test("guardian classification is driven by parent relation or lives-with evidence", () => {
  const base = {
    personId: "P1",
    personType: "Relationship",
    fullName: "Person One",
    email: "",
    phone: "",
    emergency: false,
    authorizedPickup: false,
  };
  assert.equal(procareRelationshipGuardian({ ...base, relation: "Mom", livesWith: false }), true);
  assert.equal(procareRelationshipGuardian({ ...base, relation: "Unknown", livesWith: true }), true);
  assert.equal(procareRelationshipGuardian({ ...base, relation: "Family Friend", livesWith: false }), false);
});
