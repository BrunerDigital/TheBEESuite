import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildProcareMultiReportRowsFromFiles,
  PROCARE_MULTI_REPORT_COVERAGE_MANIFEST,
} from "@/lib/procare-multi-report-import";

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csv(headers: string[], rows: string[][], encoding: BufferEncoding = "utf8") {
  return Buffer.from(
    [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n"),
    encoding,
  );
}

function standardFiles(input: {
  enrollment: string[][];
  parents: string[][];
  relationships: string[][];
  childInfo?: string[][];
}) {
  return new Map<string, Buffer>([
    ["enrollment.csv", csv(
      [
        "Child ID", "Person ID", "Person Type", "Full Name", "Last Name", "First Name", "Middle Initial",
        "Date of Birth", "Gender", "Primary Classroom", "Classroom ID", "Enrollment Status", "Status Start Date",
        "Status End Date", "Relationship 1 Id", "Relationship 2 Id", "Relationship 3 Id", "Row ID",
      ],
      input.enrollment,
    )],
    ["parentinfo.csv", csv(
      [
        "Account ID", "Account Key", "Person ID", "Person Type", "Person Sort ID", "Full Name", "Last Name",
        "First Name", "Middle Initial", "Email", "Add 1, Line 1", "Add 1, City", "Add 1, Region",
        "Add 1, Postal Code", "Phone 1", "Phone 2", "Person Comment",
      ],
      input.parents,
    )],
    ["relationships.csv", csv(
      [
        "Child ID", "Row ID", "Person ID", "Person Type", "Person Sort Order", "Full Name", "Last Name",
        "First Name", "Middle Initial", "Email", "Comment", "Relationship Type", "Lives With", "Emergency",
        "Authorized Pickup", "Add 1, Line 1", "Add 1, City", "Add 1, Region", "Add 1, Postal Code",
        "Phone 1", "Phone 2", "Phone 3", "Phone 4", "Phone 5",
      ],
      input.relationships,
    )],
    ["childinfo.csv", csv(
      [
        "Child ID", "Person ID", "Full Name", "Category Description", "Category Sort ID", "Item Description",
        "Item Sort ID", "Item Is Active",
      ],
      input.childInfo ?? [],
    )],
  ]);
}

test("multi-report account joins use identifiers and keep same-surname accounts separate", async () => {
  const files = standardFiles({
    enrollment: [
      ["child-a", "child-person-a", "Child", "Avery Smith", "Smith", "Avery", "", "2021-01-02", "F", "Preschool", "room-1", "Enrolled", "2026-01-01", "", "person-a", "person-a2", "", "child-row-a"],
      ["child-b", "child-person-b", "Child", "Blake Smith", "Smith", "Blake", "", "2022-02-03", "M", "Toddlers", "room-2", "Enrolled", "2026-02-01", "", "person-b", "", "", "child-row-b"],
    ],
    parents: [
      ["account-a", "reused-key", "person-a2", "Payer", "2", "Casey Smith", "Smith", "Casey", "", "casey@example.test", "1 A St", "Testville", "CO", "80001", "5550000002", "", "second payer"],
      ["account-a", "reused-key", "person-a", "Payer", "1", "Alex Smith", "Smith", "Alex", "", "alex@example.test", "1 A St", "Testville", "CO", "80001", "5550000001", "", "first payer"],
      ["account-b", "reused-key", "person-b", "Payer", "1", "Bailey Smith", "Smith", "Bailey", "", "bailey@example.test", "2 B St", "Testville", "CO", "80002", "5550000003", "", "other account"],
    ],
    relationships: [
      ["child-a", "rel-a2", "person-a2", "Relationship", "2", "Casey Smith", "Smith", "Casey", "", "casey@example.test", "retained comment", "Parent", "Checked", "Checked", "Checked", "1 A St", "Testville", "CO", "80001", "5550000002", "", "", "", ""],
      ["child-a", "rel-a1", "person-a", "Relationship", "1", "Alex Smith", "Smith", "Alex", "", "alex@example.test", "primary", "Parent", "Checked", "Checked", "Checked", "1 A St", "Testville", "CO", "80001", "5550000001", "", "", "", ""],
      ["child-b", "rel-b1", "person-b", "Relationship", "1", "Bailey Smith", "Smith", "Bailey", "", "bailey@example.test", "separate household", "Parent", "Checked", "Checked", "Checked", "2 B St", "Testville", "CO", "80002", "5550000003", "", "", "", ""],
    ],
  });

  const rows = await buildProcareMultiReportRowsFromFiles(files);

  assert.equal(rows.length, 2);
  assert.equal(rows[0]["account id"], "account-a");
  assert.equal(rows[1]["account id"], "account-b");
  assert.equal(rows[0]["family name"], "Smith Household");
  assert.equal(rows[1]["family name"], "Smith Household");
  assert.equal(rows[0]["guardian id"], "person-a");
  assert.equal(rows[0]["secondary guardian id"], "person-a2");
  assert.equal(rows[0]["import warning"], "");
  assert.equal(rows[1]["import warning"], "");
  assert.equal(JSON.parse(rows[0]["procare account person records"]).length, 2);
});

test("multi-report account joins retain non-PII diagnostics instead of guessing ambiguous accounts", async () => {
  const files = standardFiles({
    enrollment: [
      ["child-1", "child-person-1", "Child", "Synthetic Child", "Example", "Synthetic", "", "2022-01-01", "", "Room", "room-1", "Enrolled", "", "", "person-shared", "", "", "child-row-1"],
      ["child-2", "child-person-2", "Child", "Unlinked Child", "Example", "Unlinked", "", "2023-01-01", "", "Room", "room-1", "Enrolled", "", "", "", "", "", "child-row-2"],
    ],
    parents: [
      ["account-secret-a", "key-a", "person-shared", "Payer", "1", "Private Adult", "Adult", "Private", "", "private@example.test", "", "", "", "", "", "", ""],
      ["account-secret-b", "key-b", "person-shared", "Payer", "1", "Private Adult", "Adult", "Private", "", "private@example.test", "", "", "", "", "", "", ""],
      ["account-blank-person", "key-c", "", "Payer", "1", "Must Not Join", "Join", "Must Not", "", "blank@example.test", "", "", "", "", "", "", ""],
    ],
    relationships: [
      ["child-1", "rel-1", "person-shared", "Relationship", "1", "Private Adult", "Adult", "Private", "", "private@example.test", "", "Parent", "Checked", "Checked", "Checked", "", "", "", "", "", "", "", "", ""],
      ["child-2", "rel-2", "", "Relationship", "1", "Must Not Join", "Join", "Must Not", "", "blank@example.test", "", "Parent", "Checked", "Checked", "Checked", "", "", "", "", "", "", "", "", ""],
    ],
  });

  const rows = await buildProcareMultiReportRowsFromFiles(files);
  const ambiguousDiagnostics = JSON.parse(rows[0]["procare import diagnostics"]);
  const missingDiagnostics = JSON.parse(rows[1]["procare import diagnostics"]);
  const diagnosticText = [
    rows[0]["import warning"],
    rows[0]["procare import diagnostics"],
    rows[0]["procare coverage manifest"],
  ].join(" ");

  assert.equal(rows[0]["account id"], "");
  assert.equal(ambiguousDiagnostics[0].code, "account_link_ambiguous");
  assert.equal(ambiguousDiagnostics[0].candidateAccountCount, 2);
  assert.equal(rows[1]["account id"], "");
  assert.equal(missingDiagnostics[0].code, "account_link_missing");
  assert.equal(missingDiagnostics[0].candidateAccountCount, 0);
  assert.doesNotMatch(diagnosticText, /Private Adult|private@example|account-secret|person-shared/);
});

test("multi-report account joins merge parents for a child shared by two accounts when one unique sibling household exists", async () => {
  const files = standardFiles({
    enrollment: [
      ["child-shared", "person-child-shared", "Child", "Harley Example", "Example", "Harley", "", "2022-01-01", "F", "PreK", "room-1", "Enrolled", "", "", "person-child-shared", "", "", "child-row-shared"],
      ["child-sibling", "person-child-sibling", "Child", "Alayna Example", "Example", "Alayna", "", "2025-01-01", "F", "Infants", "room-2", "Enrolled", "", "", "person-parent-b", "", "", "child-row-sibling"],
    ],
    parents: [
      ["account-a", "example", "person-child-shared", "Payer", "0", "Harley Example", "Example", "Harley", "", "", "", "", "", "", "", "", "duplicate child payer row"],
      ["account-a", "example", "person-parent-a", "Payer", "1", "Garrett Example", "Example", "Garrett", "", "garrett@example.test", "", "", "", "", "", "", "first household parent"],
      ["account-a", "example", "person-child-shared", "Child", "1001", "Harley Example", "Example", "Harley", "", "", "", "", "", "", "", "", "shared child"],
      ["account-b", "example", "person-parent-b", "Payer", "0", "Jeyden Example", "Example", "Jeyden", "", "jeyden@example.test", "", "", "", "", "", "", "sibling household parent"],
      ["account-b", "example", "person-child-shared", "Child", "1001", "Harley Example", "Example", "Harley", "", "", "", "", "", "", "", "", "shared child"],
      ["account-b", "example", "person-child-sibling", "Child", "1002", "Alayna Example", "Example", "Alayna", "", "", "", "", "", "", "", "", "sibling"],
    ],
    relationships: [
      ["child-shared", "rel-self", "person-child-shared", "Relationship", "1", "Harley Example", "Example", "Harley", "", "", "self source row", "Unknown", "Checked", "Checked", "Checked", "", "", "", "", "", "", "", "", ""],
      ["child-sibling", "rel-parent-b", "person-parent-b", "Relationship", "1", "Jeyden Example", "Example", "Jeyden", "", "jeyden@example.test", "parent", "Parent", "Checked", "Checked", "Checked", "", "", "", "", "", "", "", "", ""],
    ],
  });

  const rows = await buildProcareMultiReportRowsFromFiles(files);
  const shared = rows.find((row) => row["child id"] === "child-shared")!;
  const diagnostics = JSON.parse(shared["procare import diagnostics"]);
  const accountPeople = JSON.parse(shared["procare account person records"]);
  const relationships = JSON.parse(shared["procare relationship records"]);

  assert.equal(shared["account id"], "account-b");
  assert.equal(shared["guardian id"], "person-parent-b");
  assert.equal(shared["secondary guardian id"], "person-parent-a");
  assert.equal(shared["import warning"], "");
  assert.equal(diagnostics[0].code, "shared_child_accounts_merged");
  assert.equal(accountPeople.length, 6);
  assert.equal(relationships[0].guardian, false);
  assert.equal(relationships[0].emergency, false);
  assert.equal(relationships[0].authorizedPickup, false);
  assert.equal(PROCARE_MULTI_REPORT_COVERAGE_MANIFEST.version, 4);
});

test("multi-report rows retain complete relationship, allergy, and child-info source records with coverage", async () => {
  const files = standardFiles({
    enrollment: [
      ["child-1", "child-person-1", "Child", "Avery Rivera", "Rivera", "Avery", "J", "2022-03-04", "F", "Preschool", "room-1", "Enrolled", "2026-01-01", "", "person-1", "", "", "enrollment-row-1"],
    ],
    parents: [
      ["account-1", "family-key", "person-1", "Payer", "1", "Jordan Rivera", "Rivera", "Jordan", "", "parent@example.test", "10 Main St", "Testville", "CO", "80001", "5551112222", "5552223333", "retain parent comment"],
    ],
    relationships: [
      ["child-1", "relationship-row-1", "person-1", "Relationship", "1", "Jordan Rivera", "Rivera", "Jordan", "", "parent@example.test", "retain relationship comment", "Mother", "Checked", "Checked", "Checked", "10 Main St", "Testville", "CO", "80001", "5551112222", "5552223333", "", "", "5559990000"],
    ],
    childInfo: [
      ["child-1", "child-person-1", "Avery Rivera", "Allergies", "1", "Peanuts", "10", "Checked"],
      ["child-1", "child-person-1", "Avery Rivera", "Allergies", "1", "Tree nuts", "20", "Unchecked"],
      ["child-1", "child-person-1", "Avery Rivera", "Medication", "2", "Synthetic medication instruction", "30", "Checked"],
    ],
  });

  const [row] = await buildProcareMultiReportRowsFromFiles(files);
  const relationships = JSON.parse(row["procare relationship records"]);
  const allergyLabels = JSON.parse(row["procare allergy records"]);
  const allergySources = JSON.parse(row["procare allergy source records"]);
  const childInfoSources = JSON.parse(row["procare child info source records"]);
  const enrollmentSource = JSON.parse(row["procare enrollment source record"]);
  const coverage = JSON.parse(row["procare coverage manifest"]);

  assert.equal(relationships[0].relationshipExternalId, "relationship-row-1");
  assert.equal(relationships[0].personId, "person-1");
  assert.equal(relationships[0].sourceFields.Comment, "retain relationship comment");
  assert.equal(relationships[0].sourceFields["Phone 5"], "5559990000");
  assert.deepEqual(allergyLabels, ["Peanuts"]);
  assert.equal(allergySources.length, 2);
  assert.equal(allergySources[1]["Item Is Active"], "Unchecked");
  assert.equal(childInfoSources.length, 3);
  assert.equal(childInfoSources[2]["Category Description"], "Medication");
  assert.equal(enrollmentSource["Row ID"], "enrollment-row-1");
  assert.deepEqual(coverage.sourceRows, {
    enrollment: 1,
    accountPeople: 1,
    candidateAccountPeople: 0,
    payers: 1,
    relationships: 1,
    childInfo: 3,
    allergyItems: 2,
    activeAllergyItems: 1,
    otherChildInfoItems: 1,
  });
  assert.equal(coverage.identifiers.relationshipRowsWithRowId, 1);
  assert.equal(PROCARE_MULTI_REPORT_COVERAGE_MANIFEST.reports.relationships.retainedAs, "procare relationship source records and procare relationship records[].sourceFields");
});

test("multi-report normalization retains accounts and child source rows that have no enrollment row", async () => {
  const files = standardFiles({
    enrollment: [
      ["child-enrolled", "child-person-enrolled", "Child", "Enrolled Child", "Enrolled", "Child", "", "2022-01-01", "", "Room", "room-1", "Enrolled", "", "", "person-linked", "", "", "enrollment-row"],
    ],
    parents: [
      ["account-linked", "key-linked", "person-linked", "Payer", "1", "Linked Adult", "Adult", "Linked", "", "linked@example.test", "", "", "", "", "", "", "linked-source-row"],
      ["account-orphan-child", "key-orphan", "person-orphan", "Payer", "1", "Orphan Adult", "Adult", "Orphan", "", "orphan@example.test", "", "", "", "", "", "", "orphan-source-row"],
      ["account-family-only", "key-family", "person-family", "Payer", "1", "Family Only Adult", "Adult", "Family", "", "family@example.test", "", "", "", "", "", "", "family-source-row"],
    ],
    relationships: [
      ["child-enrolled", "relationship-enrolled", "person-linked", "Relationship", "1", "Linked Adult", "Adult", "Linked", "", "linked@example.test", "", "Parent", "Checked", "Checked", "Checked", "", "", "", "", "", "", "", "", ""],
      ["child-enrolled", "relationship-child-source", "child-person-enrolled", "Child", "0", "Enrolled Child", "Enrolled", "Child", "", "", "child source row", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["child-without-enrollment", "relationship-orphan-parent", "person-orphan", "Relationship", "1", "Orphan Adult", "Adult", "Orphan", "", "orphan@example.test", "orphan parent source", "Parent", "Checked", "Checked", "Checked", "", "", "", "", "", "", "", "", ""],
      ["child-without-enrollment", "relationship-orphan-friend", "person-friend", "Relationship", "2", "Orphan Friend", "Friend", "Orphan", "", "friend@example.test", "orphan friend source", "Family Friend", "", "Checked", "Checked", "", "", "", "", "", "", "", "", ""],
    ],
    childInfo: [
      ["child-without-enrollment", "child-person-orphan", "Source Only Child", "Allergies", "1", "Synthetic allergen", "1", "Checked"],
      ["child-info-only", "child-person-info", "Info Only Child", "Medication", "2", "Synthetic retained note", "2", "Checked"],
    ],
  });

  const rows = await buildProcareMultiReportRowsFromFiles(files);
  const familyOnlyRows = rows.filter((row) => row["row type"] === "procare_multi_report_family_only");
  const sourceChildRows = rows.filter((row) => row["row type"] === "procare_multi_report_source_child_without_enrollment");
  const datasetCoverage = JSON.parse(rows[0]["procare dataset coverage manifest"]);
  const retainedParentComments = new Set(rows.flatMap((row) => [
    ...JSON.parse(row["procare account person records"]),
    ...JSON.parse(row["procare candidate account person records"]),
  ]).map((record) => record["Person Comment"]).filter(Boolean));
  const retainedRelationshipIds = new Set(rows.flatMap((row) => (
    JSON.parse(row["procare relationship source records"]).map((record: Record<string, string>) => record["Row ID"])
  )).filter(Boolean));
  const mappedRelationshipIds = new Set(rows.flatMap((row) => (
    JSON.parse(row["procare relationship records"]).map((record: { sourceFields: Record<string, string> }) => record.sourceFields["Row ID"])
  )).filter(Boolean));
  const retainedChildInfoItems = new Set(rows.flatMap((row) => (
    JSON.parse(row["procare child info source records"]).map((record: Record<string, string>) => record["Item Description"])
  )).filter(Boolean));
  const retainedEnrollmentIds = new Set(rows.map((row) => JSON.parse(row["procare enrollment source record"]))
    .filter(Boolean)
    .map((record) => record["Row ID"]));

  assert.equal(rows.length, 4);
  assert.equal(familyOnlyRows.length, 1);
  assert.equal(sourceChildRows.length, 2);
  assert.deepEqual(retainedParentComments, new Set(["linked-source-row", "orphan-source-row", "family-source-row"]));
  assert.deepEqual(retainedRelationshipIds, new Set(["relationship-enrolled", "relationship-child-source", "relationship-orphan-parent", "relationship-orphan-friend"]));
  assert.equal(mappedRelationshipIds.has("relationship-child-source"), false);
  assert.deepEqual(retainedChildInfoItems, new Set(["Synthetic allergen", "Synthetic retained note"]));
  assert.deepEqual(retainedEnrollmentIds, new Set(["enrollment-row"]));
  assert.deepEqual(datasetCoverage.sourceRows, { enrollment: 1, accountPeople: 3, relationships: 4, childInfo: 2 });
  assert.deepEqual(datasetCoverage.retainedSourceRows, datasetCoverage.sourceRows);
  assert.equal(datasetCoverage.warningCoverage.accountIdentifiersWithoutEnrollmentChild, 2);
  assert.equal(datasetCoverage.warningCoverage.familyOnlyAccountsWithoutAnyChildSource, 1);
  assert.equal(datasetCoverage.warningCoverage.accountsLinkedOnlyToSourceChildrenWithoutEnrollment, 1);
  assert.equal(datasetCoverage.warningCoverage.sourceChildrenWithoutEnrollment, 2);
  assert.equal(datasetCoverage.warningCoverage.relationshipRowsForChildrenWithoutEnrollment, 2);
  assert.equal(datasetCoverage.normalizedRows.byKind.procare_multi_report_family_only, 1);
  assert.equal(datasetCoverage.normalizedRows.byKind.procare_multi_report_source_child_without_enrollment, 2);
  assert.ok(familyOnlyRows.every((row) => JSON.parse(row["procare import diagnostics"])[0].code === "account_without_enrollment"));
  assert.ok(sourceChildRows.every((row) => JSON.parse(row["procare import diagnostics"])[0].code === "source_child_without_enrollment"));
  assert.ok(familyOnlyRows.every((row) => row["import warning"] === ""));
  assert.ok(sourceChildRows.every((row) => row["child status"] === "Withdrawn"));
  assert.ok(sourceChildRows.filter((row) => row["account id"]).every((row) => row["import warning"] === ""));

  const nonPiiSummaries = rows.map((row) => `${row["procare import diagnostics"]} ${row["procare coverage manifest"]} ${row["procare dataset coverage manifest"]}`).join(" ");
  assert.doesNotMatch(nonPiiSummaries, /Linked Adult|Orphan Adult|Family Only Adult|example\.test|account-linked|person-orphan|child-without-enrollment/);
});

test("multi-report normalization emits warning records for source rows with missing identifiers", async () => {
  const files = standardFiles({
    enrollment: [
      ["", "child-person-missing", "Child", "Missing Child ID", "Missing", "Child", "", "2022-01-01", "", "", "", "Enrolled", "", "", "", "", "", "enrollment-missing-id"],
    ],
    parents: [
      ["", "key-missing", "person-missing-account", "Payer", "1", "Missing Account Adult", "Adult", "Missing", "", "missing@example.test", "", "", "", "", "", "", "parent-missing-id"],
    ],
    relationships: [
      ["", "relationship-missing-id", "person-missing-account", "Relationship", "1", "Missing Link Adult", "Adult", "Missing", "", "missing@example.test", "missing child source", "Parent", "Checked", "Checked", "Checked", "", "", "", "", "", "", "", "", ""],
    ],
    childInfo: [
      ["", "child-person-missing", "Missing Child ID", "Medication", "1", "Missing child retained note", "1", "Checked"],
    ],
  });

  const rows = await buildProcareMultiReportRowsFromFiles(files);
  const rowByKind = new Map(rows.map((row) => [row["row type"], row]));
  const diagnostics = (rowType: string) => JSON.parse(rowByKind.get(rowType)!["procare import diagnostics"]).map((item: { code: string }) => item.code);
  const datasetCoverage = JSON.parse(rows[0]["procare dataset coverage manifest"]);

  assert.equal(rows.length, 4);
  assert.ok(diagnostics("procare_multi_report_child").includes("enrollment_child_id_missing"));
  assert.deepEqual(diagnostics("procare_multi_report_parent_without_account_id"), ["parent_account_id_missing"]);
  assert.ok(diagnostics("procare_multi_report_relationship_without_child_id").includes("relationship_child_id_missing"));
  assert.deepEqual(diagnostics("procare_multi_report_child_info_without_child_id"), ["child_info_child_id_missing"]);
  assert.equal(JSON.parse(rowByKind.get("procare_multi_report_parent_without_account_id")!["procare account person records"])[0]["Person Comment"], "parent-missing-id");
  assert.equal(JSON.parse(rowByKind.get("procare_multi_report_relationship_without_child_id")!["procare relationship records"])[0].sourceFields["Row ID"], "relationship-missing-id");
  assert.equal(JSON.parse(rowByKind.get("procare_multi_report_child_info_without_child_id")!["procare child info source records"])[0]["Item Description"], "Missing child retained note");
  assert.equal(datasetCoverage.warningCoverage.enrollmentRowsWithoutChildIdentifier, 1);
  assert.equal(datasetCoverage.warningCoverage.parentRowsWithoutAccountIdentifier, 1);
  assert.equal(datasetCoverage.warningCoverage.relationshipRowsWithoutChildIdentifier, 1);
  assert.equal(datasetCoverage.warningCoverage.childInfoRowsWithoutChildIdentifier, 1);
  assert.deepEqual(datasetCoverage.retainedSourceRows, datasetCoverage.sourceRows);
});

test("multi-report CSV parsing accepts UTF-16LE exports and rejects missing identity columns", async () => {
  const files = standardFiles({
    enrollment: [["child-1", "child-person-1", "Child", "Avery Rivera", "Rivera", "Avery", "", "2022-03-04", "", "Preschool", "room-1", "Enrolled", "", "", "person-1", "", "", "row-1"]],
    parents: [["account-1", "key-1", "person-1", "Payer", "1", "Jordan Rivera", "Rivera", "Jordan", "", "parent@example.test", "", "", "", "", "5551112222", "", ""]],
    relationships: [["child-1", "rel-1", "person-1", "Relationship", "1", "Jordan Rivera", "Rivera", "Jordan", "", "parent@example.test", "", "Parent", "Checked", "Checked", "Checked", "", "", "", "", "5551112222", "", "", "", ""]],
  });
  const enrollmentText = files.get("enrollment.csv")!.toString("utf8");
  files.set("enrollment.csv", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(enrollmentText, "utf16le")]));

  const [row] = await buildProcareMultiReportRowsFromFiles(files);
  assert.equal(row["child id"], "child-1");

  const invalid = new Map(files);
  invalid.set("relationships.csv", csv(["Child ID", "Row ID", "Person Type"], [["child-1", "rel-1", "Relationship"]]));
  await assert.rejects(
    buildProcareMultiReportRowsFromFiles(invalid),
    /Missing or ambiguous report data: relationships/,
  );
});

test("multi-report detection ignores filenames and canonicalizes common header variations", async () => {
  const files = new Map<string, Buffer>([
    ["July roster from office.dat", csv(
      ["Student Number", "Child Person ID", "Child Full Name", "Given Name", "Surname", "Birthdate", "Room Name", "Room Key", "Enrollment State", "First Day", "Contact 1 ID"],
      [["child-1", "child-person-1", "Avery Rivera", "Avery", "Rivera", "2022-03-04", "Preschool", "room-1", "Active", "2026-01-01", "person-1"]],
    )],
    ["contacts export without extension", csv(
      ["Family Number", "Contact ID", "Role", "Sort Order", "Contact Name", "Given Name", "Surname", "Email Address", "Phone Number"],
      [["account-1", "person-1", "Payer", "1", "Jordan Rivera", "Jordan", "Rivera", "parent@example.test", "5551112222"]],
    )],
    ["permissions report.txt", csv(
      ["Student Number", "Relationship ID", "Related Person ID", "Relationship Person Type", "Contact Name", "Relation", "Resides With", "Is Emergency Contact", "Can Pickup", "Phone Number"],
      [["child-1", "rel-1", "person-1", "Relationship", "Jordan Rivera", "Parent", "Yes", "Yes", "Yes", "5551112222"]],
    )],
    ["health details.anything", Buffer.from([
      ["Student Number", "Information Category", "Information Item", "Active Item"],
      ["child-1", "Allergy", "Peanuts", "Yes"],
    ].map((row) => row.join("\t")).join("\r\n"))],
  ]);

  const [row] = await buildProcareMultiReportRowsFromFiles(files);
  const coverage = JSON.parse(row["procare dataset coverage manifest"]);

  assert.equal(row["account id"], "account-1");
  assert.equal(row["child id"], "child-1");
  assert.equal(row["child name"], "Avery Rivera");
  assert.equal(row["guardian id"], "person-1");
  assert.equal(row["classroom"], "Preschool");
  assert.equal(row["child status"], "Active");
  assert.equal(row["allergies"], "Peanuts");
  assert.equal(JSON.parse(row["procare relationship records"])[0].authorizedPickup, true);
  assert.equal(coverage.reportDetection.enrollment.sourceName, "July roster from office.dat");
  assert.ok(coverage.reportDetection.enrollment.matchedHeaderAliases > 0);
});
