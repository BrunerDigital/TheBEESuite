import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterPublicInquiryLocations, isBlockedPublicInquiryIdentifier } from "../src/lib/public-inquiry-policy";
import { isEligiblePublicInquiryCenter } from "../src/lib/inquiry-routing";
import { filterPublicKidCityLocations, isActivePublicSchoolCandidate, isActiveSchoolFinanceOperationsCandidate, toPublicKidCityLocation } from "../src/lib/active-school-locations";

const daytona = "Kid City USA - FL | Daytona Beach East";
const douglas = "Kid City USA - FL | Altamonte - Douglas";
const center = (id: string) => ({ crmLocationId: id, locationId: id, name: id, status: "active" });

test("Daytona inquiry-only hold accepts exact legacy, canonical and displayed names", () => {
  for (const id of [daytona, "FL | Daytona Beach East", " fl| DAYTONA BEACH EAST ", "Kid City USA – FL | Daytona Beach East", "Kid City USA - Daytona Beach East", "Daytona Beach East", "Daytona.Beach.East", "Kid City USA: FL | Daytona Beach East"]) {
    assert.equal(isBlockedPublicInquiryIdentifier(id), true, id);
    assert.equal(isEligiblePublicInquiryCenter(center(id), true), false, id);
    assert.equal(isEligiblePublicInquiryCenter(center(id), false), false, id);
  }
});

test("Daytona directory, registration catalog and financial eligibility stay unchanged", () => {
  const school = center(daytona);
  const location = toPublicKidCityLocation(school);
  assert.equal(isActivePublicSchoolCandidate(school), true);
  assert.equal(isActiveSchoolFinanceOperationsCandidate(school), true);
  assert.deepEqual(filterPublicKidCityLocations([location]), [location]);
  assert.deepEqual(filterPublicInquiryLocations([location]), []);
  assert.equal(school.status, "active");
});

test("Douglas and unrelated locations/families are not blocked", () => {
  for (const id of [douglas, "FL | Altamonte - Douglas", "FL | Daytona Beach West", "Daytona Beach", "IN | Kokomo", "FL | Longwood - Wekiva", "TN | Lewisburg", "TN | Pulaski", "Other Brand - FL | Daytona Beach East"]) {
    assert.equal(isBlockedPublicInquiryIdentifier(id), false, id);
    assert.equal(isEligiblePublicInquiryCenter(center(id), true), true, id);
  }
});

test("conflicting center identity cannot hide Daytona behind an eligible alias", () => {
  assert.equal(isEligiblePublicInquiryCenter({ ...center(douglas), locationId: daytona }, false), false);
  assert.equal(isEligiblePublicInquiryCenter({ ...center(douglas), name: "Kid City USA - Daytona Beach East" }, false), false);
});

test("inquiry filter removes Daytona and Vero from the unchanged static directory catalog", () => {
  const locations = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8")).locations;
  const filtered = filterPublicInquiryLocations(locations);
  assert.equal(locations.length - filtered.length, 2);
  assert.equal(filtered.some((item) => item.crmLocationId === daytona), false);
  assert.equal(filtered.some((item) => item.crmLocationId === "Kid City USA - FL | Vero Beach"), false);
  assert.equal(filtered.some((item) => item.crmLocationId === douglas), true);
  const html = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
  assert.doesNotMatch(html, /<option[^>]*Daytona Beach East/);
  assert.match(html, /<option[^>]*Altamonte - Douglas/);
});
