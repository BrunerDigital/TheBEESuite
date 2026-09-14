import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("form builder keeps a saved draft immutable until its request settles", async () => {
  const source = await readSource("src/components/form-builder-panel.tsx");

  assert.match(source, /const savingRef = useRef\(false\);/);
  assert.match(source, /const \[isSaving, setIsSaving\] = useState\(false\);/);
  assert.match(source, /const controlsLocked = isSaving \|\| isPending;/);
  assert.match(source, /function loadForm[\s\S]*?if \(savingRef\.current\) return;/);
  assert.match(source, /function updateField[\s\S]*?if \(savingRef\.current\) return;/);
  assert.match(source, /const request = \{[\s\S]*?id: targetFormId \|\| undefined,/);
  assert.match(source, /try \{[\s\S]*?await fetch\("\/api\/operations\/records"[\s\S]*?\} catch \{[\s\S]*?\} finally \{[\s\S]*?savingRef\.current = false;[\s\S]*?setIsSaving\(false\);/);
  assert.match(source, /<Select value=\{selectedId\}[\s\S]*?disabled=\{controlsLocked\}/);
  assert.match(source, /<Input id=\{controlIds\.name\}[\s\S]*?disabled=\{controlsLocked\}/);
  assert.match(source, /onClick=\{\(\) => !savingRef\.current && setFields[\s\S]*?disabled=\{controlsLocked\}/);
});

test("documents paginate every loaded checklist row and hide mutations for read-only viewers", async () => {
  const checklist = await readSource("src/components/required-document-checklist-panel.tsx");
  const documents = await readSource("src/components/live-ops-pages.tsx");
  const page = await readSource("src/app/[slug]/page.tsx");

  assert.match(checklist, /const checklistPageSize = 50;/);
  assert.doesNotMatch(checklist, /visibleRowLimit|visibleSubjectLimit/);
  assert.match(checklist, /const \[rowPage, setRowPage\] = useState\(0\);/);
  assert.match(checklist, /detailItems\.slice\(currentRowPage \* checklistPageSize/);
  assert.match(checklist, /Page \{currentRowPage \+ 1\} of \{rowPageCount\}/);
  assert.match(checklist, /canRequest \? "expand to review or request information" : "expand to review"/);
  assert.match(checklist, /\{canRequest && requiresChecklistAction\(item\.status\) \?/);
  assert.match(documents, /canManageDocuments: boolean;/);
  assert.match(documents, /canRequest=\{data\.canManageDocuments\}/);
  assert.match(documents, /data\.canManageDocuments \? <DocumentUploadActions/);
  assert.match(documents, /data\.canManageDocuments \? <DocumentReviewActions/);
  assert.match(page, /canManageDocuments: canManageOperations\(user\)/);
});
