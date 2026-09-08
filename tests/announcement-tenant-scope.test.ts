import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { announcementWhereForViewer, canWriteCenterlessAnnouncement } from "../src/lib/announcement-scope";

test("only platform owners can author a centerless platform announcement", () => {
  assert.equal(canWriteCenterlessAnnouncement(UserRole.PLATFORM_OWNER), true);
  assert.equal(canWriteCenterlessAnnouncement(UserRole.BRAND_ADMIN), false);
  assert.equal(canWriteCenterlessAnnouncement(UserRole.REGIONAL_MANAGER), false);
  assert.equal(canWriteCenterlessAnnouncement(UserRole.CENTER_DIRECTOR), false);
});

test("tenant-wide announcement views remain limited to authorized schools and platform notices", () => {
  assert.deepEqual(
    announcementWhereForViewer({
      role: UserRole.BRAND_ADMIN,
      allCenters: true,
      centerIds: ["school_a", "school_b"],
    }),
    { OR: [{ centerId: { in: ["school_a", "school_b"] } }, { centerId: null }] },
  );
  assert.deepEqual(
    announcementWhereForViewer({
      role: UserRole.PLATFORM_OWNER,
      allCenters: true,
      centerIds: [],
    }),
    {},
  );
});

test("email sending requires an exact school-owned announcement", () => {
  const source = readFileSync("src/app/api/communications/announcements/[id]/send/route.ts", "utf8");
  assert.match(source, /if \(!announcement\.centerId\)/);
  assert.match(source, /Choose one school before sending an announcement email/);
});
