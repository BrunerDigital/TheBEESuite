import assert from "node:assert/strict";
import { test } from "node:test";
import {
  kidCityCorporateRolloutSchools,
  normalizeRolloutEmail,
  rolloutSchoolEmailCandidates,
  rolloutSchoolEmailCorrections,
} from "@/lib/kidcity-corporate-rollout";

test("corporate rollout list includes the requested school set and Longmont pilot", () => {
  assert.equal(kidCityCorporateRolloutSchools.length, 13);
  assert.equal(kidCityCorporateRolloutSchools.find((school) => school.location === "Longmont")?.pilot, true);
});

test("corporate rollout aliases cover known requested email mismatches", () => {
  const corrections = rolloutSchoolEmailCorrections();
  assert.deepEqual(corrections, [
    {
      location: "Garland",
      requestedEmail: "garland@kidcityus.com",
      canonicalEmail: "garland@kidcityusa.com",
    },
    {
      location: "Granbury",
      requestedEmail: "granbury1@kidcityusa.com",
      canonicalEmail: "granbury@kidcityusa.com",
    },
    {
      location: "Canton NC",
      requestedEmail: "cantonnc@kidcityusa.com",
      canonicalEmail: "canton@kidcityusa.com",
    },
  ]);
});

test("corporate rollout email candidates are normalized and deduplicated", () => {
  assert.deepEqual(
    rolloutSchoolEmailCandidates({
      requestedEmail: "  Longmont@KidCityUSA.com ",
      canonicalEmail: "longmont@kidcityusa.com",
    }),
    ["longmont@kidcityusa.com"],
  );
  assert.equal(normalizeRolloutEmail(" Garland@KidCityUSA.com "), "garland@kidcityusa.com");
});
