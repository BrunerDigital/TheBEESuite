import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the family editor defaults to a family with guardian contacts", () => {
  const familyEditor = readFileSync(new URL("../src/components/family-record-editor.tsx", import.meta.url), "utf8");

  assert.match(
    familyEditor,
    /return families\.find\(\(family\) => family\.guardians\.length > 0\) \?\? families\[0\] \?\? null;/,
  );
  assert.match(familyEditor, /These contacts belong to the selected family/);
});

test("the school-scoped family page lists guardians without requiring portal links", () => {
  const enrollmentPanel = readFileSync(new URL("../src/components/enrollment-visibility-panels.tsx", import.meta.url), "utf8");

  assert.match(enrollmentPanel, /<CardTitle>Parent \/ Guardian Directory<\/CardTitle>/);
  assert.match(enrollmentPanel, /Portal access is shown separately and is not required for a contact to appear here/);
  assert.match(enrollmentPanel, /visibleFamilies[\s\S]*?\.flatMap\(\(family\) => family\.guardians\.map/);
  assert.doesNotMatch(enrollmentPanel, /guardianDirectoryRows[\s\S]{0,300}\.filter\(\(guardian\) => guardian\.userId\)/);
  assert.match(enrollmentPanel, /Search guardian, family, relationship, email, or phone/);
  assert.match(enrollmentPanel, /contactsWithoutEmailOrPhone/);
  assert.match(enrollmentPanel, /No parent or guardian contacts are visible for this school scope/);
});
