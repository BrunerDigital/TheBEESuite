import assert from "node:assert/strict";
import test from "node:test";
import { isEligiblePublicInquiryCenter } from "../src/lib/inquiry-routing";
import { filterPublicKidCityLocations, isActivePublicSchoolCandidate, mergePublicKidCityLocations, toPublicKidCityLocation } from "../src/lib/active-school-locations";

test("suspended schools cannot return through active records, legacy IDs, merged lists, or stale form routing", () => {
  for (const id of ["FL | Jacksonville - Beach", "Kid City USA - FL | Jacksonville - Beach", "FL | Jacksonville - Beach Blvd", "Kid City USA - FL | Jacksonville - Beach Blvd", "FL | Jacksonville - Fruit Cove", "FL | Deland - Amelia", "FL | Port Orange", "IN | Fishers", "IN | Evansville", "TX | Tyler"]) {
    const center = { status: "active", crmLocationId: id, locationId: id, name: id };
    assert.equal(isActivePublicSchoolCandidate(center), false, id);
    assert.equal(isEligiblePublicInquiryCenter(center, true), false, id);
    assert.equal(isEligiblePublicInquiryCenter(center, false), false, id);
    const location = toPublicKidCityLocation(center);
    assert.deepEqual(filterPublicKidCityLocations([location]), []);
    assert.deepEqual(mergePublicKidCityLocations([location], [location]), []);
  }
});

test("Centennial and eligible Kid City locations retain routing without altering school records", () => {
  for (const crmLocationId of ["Miss Honey's Learning Center - CO | Centennial", "Kid City USA - IN | Kokomo", "Kid City USA - FL | Sarasota"]) {
    const center = { status: "active", crmLocationId, locationId: crmLocationId, name: crmLocationId };
    assert.equal(isEligiblePublicInquiryCenter(center, true), true);
    assert.equal(center.status, "active");
    assert.equal(isEligiblePublicInquiryCenter({ ...center, status: "closed" }, true), false);
  }
});

test("retained-school instructions preserve active feeds and inquiry routing", () => {
  for (const id of ["FL | Altamonte - Douglas", "FL | Daytona Beach East", "FL | Longwood - Wekiva", "FL | Vero Beach", "IN | Jasper", "IN | Jasper - Truman", "IN | Jasper - Baden Strasse", "IN | Whitestown"]) {
    const center = { status: "active", crmLocationId: id, locationId: id, name: id };
    assert.equal(isActivePublicSchoolCandidate(center), true, id);
    assert.equal(isEligiblePublicInquiryCenter(center, true), true, id);
    const location = toPublicKidCityLocation(center);
    assert.deepEqual(filterPublicKidCityLocations([location]), [location], id);
    assert.deepEqual(mergePublicKidCityLocations([location], [location]), [location], id);
    assert.equal(isEligiblePublicInquiryCenter({ ...center, status: "closed" }, true), false, id);
  }
});

test("Cordera public retirement rejects branded and legacy stale options without changing school status", () => {
  for (const id of ["CO | Colorado Springs - Cordera", "Kid City USA - CO | Colorado Springs - Cordera"]) {
    const center = { status: "active", crmLocationId: id, locationId: id, name: id };
    assert.equal(isActivePublicSchoolCandidate(center), false, id);
    assert.equal(isEligiblePublicInquiryCenter(center, true), false, id);
    assert.equal(isEligiblePublicInquiryCenter(center, false), false, id);
    const location = toPublicKidCityLocation(center);
    assert.deepEqual(mergePublicKidCityLocations([location], [location]), [], id);
    assert.equal(center.status, "active");
  }
});
