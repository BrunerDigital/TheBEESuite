import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BEE_SUITE_BRANDING,
  canUseKidCityCorporateBilling,
  KID_CITY_USA_BRANDING,
  MISS_HONEYS_LEARNING_CENTER_BRANDING,
  resolveWorkspaceBranding,
} from "@/lib/brand-assets";
import { defaultProfilePhotoUrlForRole, MISS_HONEYS_PROFILE_PHOTO_URL } from "@/lib/profile-photo";

test("Miss Honey's tenant and brand identifiers resolve to its isolated branding", () => {
  for (const input of [
    { tenantName: "Miss Honey's Learning Center" },
    { tenantSlug: "miss-honeys-learning-center" },
    { brandName: "Miss Honeys Learning Center" },
    { brandSlug: "miss-honeys-learning-center" },
  ]) {
    assert.deepEqual(resolveWorkspaceBranding(input), MISS_HONEYS_LEARNING_CENTER_BRANDING);
  }
});

test("brand resolution preserves Kid City and BEE Suite fallbacks", () => {
  assert.deepEqual(resolveWorkspaceBranding({ tenantSlug: "kid-city-usa" }), KID_CITY_USA_BRANDING);
  assert.deepEqual(resolveWorkspaceBranding({ tenantName: "Independent Childcare Group" }), BEE_SUITE_BRANDING);
});

test("Miss Honey's users never receive a Kid City default profile image", () => {
  assert.equal(
    defaultProfilePhotoUrlForRole("TEACHER", MISS_HONEYS_LEARNING_CENTER_BRANDING.kind),
    MISS_HONEYS_PROFILE_PHOTO_URL,
  );
  assert.equal(
    defaultProfilePhotoUrlForRole("BRAND_ADMIN", MISS_HONEYS_LEARNING_CENTER_BRANDING.kind),
    MISS_HONEYS_PROFILE_PHOTO_URL,
  );
});

test("Kid City corporate billing stays hidden from other tenants while platform owners retain support access", () => {
  assert.equal(canUseKidCityCorporateBilling("BRAND_ADMIN", MISS_HONEYS_LEARNING_CENTER_BRANDING.kind), false);
  assert.equal(canUseKidCityCorporateBilling("BRAND_ADMIN", KID_CITY_USA_BRANDING.kind), true);
  assert.equal(canUseKidCityCorporateBilling("PLATFORM_OWNER", BEE_SUITE_BRANDING.kind), true);
});
