import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("teacher uploads flow through private storage into the parent-visible media state", () => {
  const teacherMediaRoute = readFileSync("src/app/api/teacher/media/route.ts", "utf8");

  assert.match(teacherMediaRoute, /uploadChildMediaBuffer\(\{/);
  assert.match(teacherMediaRoute, /storageKey = upload\.storageKey/);
  assert.match(teacherMediaRoute, /resolveTeacherMediaShareState\(\{/);
  assert.match(teacherMediaRoute, /sharedWithParents: shareState\.sharedWithParents/);
  assert.match(teacherMediaRoute, /status: shareState\.status/);
  assert.match(teacherMediaRoute, /buildParentPhotoNotifications\(\{/);
});

test("the parent portal scopes shared photos to linked children and signs private objects", () => {
  const parentPage = readFileSync("src/app/[slug]/page.tsx", "utf8");

  assert.match(
    parentPage,
    /prisma\.childMedia\.findMany\(\{[\s\S]*?childId: \{ in: childIds\.length \? childIds : \["__none__"\] \}[\s\S]*?sharedWithParents: true[\s\S]*?status: "shared"/,
  );
  assert.match(parentPage, /signChildMediaRecords\(media\)/);
  assert.match(parentPage, /media=\{signedMedia\}/);
});

test("the parent workspace renders signed classroom photos with a safe unavailable state", () => {
  const parentWorkspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");

  assert.match(parentWorkspace, /A classroom moment shared by your school\./);
  assert.match(parentWorkspace, /const imageSrc = renderableImageSrc\(item\.url\)/);
  assert.match(parentWorkspace, /<Image[\s\S]*?src=\{imageSrc\}[\s\S]*?unoptimized/);
  assert.match(parentWorkspace, /Image unavailable/);
});

test("director approval shares a held photo and alerts linked parents", () => {
  const mediaReviewRoute = readFileSync("src/app/api/parent/media-review/[id]/route.ts", "utf8");

  assert.match(mediaReviewRoute, /status: "shared"/);
  assert.match(mediaReviewRoute, /sharedWithParents: true/);
  assert.match(mediaReviewRoute, /buildParentPhotoNotifications\(\{/);
  assert.match(mediaReviewRoute, /skipDuplicates: true/);
});
