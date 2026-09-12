import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isInternalSignatureRequest, isParentDocumentSubmissionReceipt, optimisticParentDocumentIds, parentDocumentPagePlan, parentDocumentState, parentDocumentStatusLabel } from "../src/lib/parent-document-state";
import { parentDocumentScope, readParentDocumentPage } from "../src/lib/parent-document-query";
import { parentPortalWorkspaceHref } from "../src/lib/parent-portal-navigation";

type Row = Record<string, unknown>;
// Deliberately small evaluator for the Prisma operators used by this reader.
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (value as Row[]).every((part) => matches(row, part));
    if (key === "OR") return (value as Row[]).some((part) => matches(row, part));
    if (value === null || typeof value !== "object") return row[key] === value;
    const filter = value as Row;
    if ("in" in filter) return (filter.in as unknown[]).includes(row[key]);
    if ("notIn" in filter) return !(filter.notIn as unknown[]).includes(row[key]);
    if ("not" in filter) return row[key] !== filter.not;
    return Boolean(row[key] && typeof row[key] === "object" && matches(row[key] as Row, filter));
  });
}
function fixture(rows: Row[]) {
  const calls: Array<{ method: string; args: Row }> = [];
  function select(args: Row) {
    let selected = rows.filter((row) => matches(row, args.where as Row));
    for (const order of [...((args.orderBy as Row[]) ?? [])].reverse()) {
      const [field, specification] = Object.entries(order)[0];
      const direction = typeof specification === "string" ? specification : (specification as Row).sort;
      selected = selected.toSorted((left, right) => {
        if (left[field] === right[field]) return 0;
        if (left[field] === null) return 1;
        if (right[field] === null) return -1;
        return String(left[field]).localeCompare(String(right[field])) * (direction === "desc" ? -1 : 1);
      });
    }
    return selected.slice(Number(args.skip ?? 0), Number(args.skip ?? 0) + Number(args.take ?? selected.length));
  }
  const delegate = {
    async count(args: Row) { calls.push({ method: "count", args }); return select(args).length; },
    async findMany(args: Row) { calls.push({ method: "findMany", args }); return select(args); },
    async findFirst(args: Row) { calls.push({ method: "findFirst", args }); return select(args)[0] ?? null; },
  } as unknown as Parameters<typeof readParentDocumentPage>[0];
  return { delegate, calls };
}
function doc(id: string, status = "APPROVED", extra: Row = {}): Row {
  return { id, name: `Fake ${id}`, type: "school_form", status, familyId: "family-a", childId: null, child: null, createdAt: id, expiresAt: null, storageKey: null, ...extra };
}
const input = { familyId: "family-a", childIds: ["child-a"], enabled: true };

test("fresh server review decisions retire optimistic submission state", () => {
  const source = { id: "fake-document", status: "REQUESTED" };
  const confirmed = new Map([[source.id, source]]);
  assert.equal(optimisticParentDocumentIds([source], confirmed).has(source.id), true, "Held refresh still receives immediate submission feedback");
  for (const status of ["SUBMITTED", "APPROVED", "REJECTED", "REQUESTED"]) {
    const refreshed = { ...source, status };
    assert.equal(optimisticParentDocumentIds([refreshed], confirmed).has(source.id), false, `${status} from a new server snapshot must not be masked`);
  }
});

test("document lifecycle overrides stale signature markers and leaves submitted work with the school", () => {
  for (const storageKey of ["internal_signature_pending", "signature_provider_pending"]) {
    assert.equal(isInternalSignatureRequest({ storageKey: ` ${storageKey.toUpperCase()} ` }), true);
    for (const status of ["APPROVED", " complete ", "COMPLETED", "SIGNED"]) assert.equal(parentDocumentState({ status }), "complete");
    assert.equal(parentDocumentState({ status: " submitted " }), "awaiting_review");
    assert.equal(parentDocumentStatusLabel({ status: "SUBMITTED" }), "Awaiting school review");
  }
  for (const status of ["DRAFT", "REQUESTED", "REJECTED", "EXPIRED", "PENDING"]) assert.equal(parentDocumentState({ status }), "action_required");
  assert.equal(parentDocumentState({ status: "unexpected" }), "unavailable");
});

test("one required request stays on page one even after twenty-five completed documents", async () => {
  const { delegate, calls } = fixture([...Array.from({ length: 25 }, (_, i) => doc(`complete-${i}`)), doc("required", "REQUESTED")]);
  const result = await readParentDocumentPage(delegate, { ...input, requestedPage: "1" });
  assert.equal(result.summary.actionRequired, 1);
  assert.equal(result.summary.total, 26);
  assert.equal(result.summary.firstRequired?.id, "required");
  assert.equal(result.documents[0].id, "required");
  assert.equal(result.documents.length, 20);
  const scope = parentDocumentScope(input.familyId, input.childIds);
  for (const call of calls) assert.deepEqual((call.args.where as { AND: unknown[] }).AND[0], scope);
});

test("every priority and historical document is reachable with stable counts and stale-page clamping", async () => {
  const { delegate } = fixture([...Array.from({ length: 25 }, (_, i) => doc(`required-${String(i).padStart(2, "0")}`, "REQUESTED")), ...Array.from({ length: 25 }, (_, i) => doc(`complete-${i}`))]);
  const pages = await Promise.all(["1", "2", "3"].map((requestedPage) => readParentDocumentPage(delegate, { ...input, requestedPage })));
  assert.equal(new Set(pages.flatMap((page) => page.documents.map((item) => item.id))).size, 50);
  assert.deepEqual(pages.map((page) => page.summary.actionRequired), [25, 25, 25]);
  assert.equal(pages[1].documents.filter((row) => row.status === "REQUESTED").length, 5);
  assert.equal((await readParentDocumentPage(delegate, { ...input, requestedPage: "999" })).pagination.page, 3);
  assert.equal(parentDocumentPagePlan("invalid", 25, 50).pagination.page, 1);
});

test("all document owner shapes fail closed except the exact current family and children", async () => {
  const child = { id: "child-a", familyId: "family-a", enrollmentStatus: "active", classroomId: "class-a" };
  const rows = [doc("family-only"), doc("child-only", "REQUESTED", { familyId: null, childId: "child-a", child }), doc("dual", "REQUESTED", { childId: "child-a", child, restricted: true }),
    doc("wrong-family", "REQUESTED", { familyId: "family-b", childId: "child-a", child }), doc("wrong-child", "REQUESTED", { childId: "child-b", child: { ...child, id: "child-b", familyId: "family-b" } }),
    doc("moved-child", "REQUESTED", { childId: "child-a", child: { ...child, familyId: "family-b" } }), doc("inactive", "REQUESTED", { childId: "child-a", child: { ...child, enrollmentStatus: "inactive" } }), doc("ownerless", "REQUESTED", { familyId: null })];
  const { delegate } = fixture(rows);
  const result = await readParentDocumentPage(delegate, { ...input, requestedDocumentId: "wrong-family" });
  assert.deepEqual(result.documents.map((row) => row.id).sort(), ["child-only", "dual", "family-only"]);
  assert.equal(result.linkedDocument, null);
  assert.equal(result.requestedDocumentUnavailable, true);
  const denied = await readParentDocumentPage(delegate, { ...input, enabled: false, requestedDocumentId: "family-only" });
  assert.equal(denied.summary.total, 0);
  assert.equal(denied.summary.actionRequired, 0);
  assert.deepEqual(denied.documents, []);
  assert.equal(denied.linkedDocument, null);
});

test("exact linked requests outside the page remain separately reachable without changing page scope", async () => {
  const { delegate, calls } = fixture(Array.from({ length: 41 }, (_, i) => doc(`record-${String(i).padStart(2, "0")}`)));
  const result = await readParentDocumentPage(delegate, { ...input, requestedPage: "1", requestedDocumentId: "record-00" });
  assert.equal(result.documents.some((row) => row.id === "record-00"), false);
  assert.equal(result.linkedDocument?.id, "record-00");
  assert.equal(result.documents.length, 20);
  assert.equal(result.pagination.total, 41);
  const exact = calls.find((call) => call.method === "findFirst")!;
  assert.deepEqual(exact.args.where, { AND: [parentDocumentScope(input.familyId, input.childIds), { id: "record-00" }] });
  for (const call of calls.filter((call) => call.args.orderBy)) assert.deepEqual((call.args.orderBy as unknown[]).at(-1), { id: "desc" });
});

test("document links preserve encoded family scope and clear stale paging when leaving documents", () => {
  const href = parentPortalWorkspaceHref({ view: "family", section: "documents", familyId: "a&b", documentId: "doc /?", documentsPage: 3, hash: "documents" });
  const url = new URL(href, "https://example.test");
  assert.equal(url.searchParams.get("familyId"), "a&b");
  assert.equal(url.searchParams.get("documentId"), "doc /?");
  assert.equal(url.searchParams.get("documentsPage"), "3");
  const left = new URL(parentPortalWorkspaceHref({ view: "home", previewHrefBase: "/device-preview?view=parent&documentsPage=3&documentId=old", familyId: "next" }), "https://example.test");
  assert.equal(left.searchParams.get("documentsPage"), null);
  assert.equal(left.searchParams.get("documentId"), null);
  assert.equal(left.searchParams.get("screen"), "home");
});

test("only an exact submitted receipt clears a document draft", () => {
  for (const value of [null, {}, { ok: false }, { ok: true, document: { id: "other", status: "SUBMITTED" } }, { ok: true, document: { id: "a", status: "REQUESTED" } }]) assert.equal(isParentDocumentSubmissionReceipt(value, "a"), false);
  assert.equal(isParentDocumentSubmissionReceipt({ ok: true, document: { id: "a", status: "SUBMITTED" } }, "a"), true);
  const source = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  assert.ok(source.indexOf('data-parent-home-actions="true"') < source.indexOf('id="today"'));
  assert.match(source, /useUnsavedChangesGuard\(hasUnsentPortalDraft/);
  assert.match(source, /<ParentPortalDocumentLink[^>]*href=\{workspaceHref\("family",[^}]*documentsPage: documentPagination\.page \+ 1/);
  assert.doesNotMatch(source, /from "@\/lib\/signature-capture"/);
});
