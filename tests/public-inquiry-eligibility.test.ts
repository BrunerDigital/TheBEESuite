import assert from "node:assert/strict";
import test from "node:test";
import { isEligiblePublicInquiryCenter } from "../src/lib/inquiry-routing";
import { filterPublicKidCityLocations, isActivePublicSchoolCandidate, isActiveSchoolFinanceOperationsCandidate, mergePublicKidCityLocations, toPublicKidCityLocation } from "../src/lib/active-school-locations";

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

test("approved Soddy Daisy reinstatement accepts canonical and legacy IDs while closed records stay blocked", () => {
  for (const id of ["TN | Soddy Daisy", "Kid City USA - TN | Soddy Daisy"]) {
    const center = { status: "active", crmLocationId: id, locationId: id, name: id };
    assert.equal(isActivePublicSchoolCandidate(center), true, id);
    assert.equal(isEligiblePublicInquiryCenter(center, true), true, id);
    assert.equal(isEligiblePublicInquiryCenter(center, false), true, id);
    assert.equal(isActiveSchoolFinanceOperationsCandidate(center), false, "Public restoration preserves the financial hold");
    const location = toPublicKidCityLocation(center);
    assert.deepEqual(mergePublicKidCityLocations([location], [location]), [location]);
    assert.equal(isEligiblePublicInquiryCenter({ ...center, status: "closed" }, true), false);
  }
});

test("financial setup preserves other active, retired and invalid school selections", () => {
  for (const id of ["Kid City USA - IN | Kokomo", "IN | Kokomo", "Kid City USA - CO | Centennial", "FL | Vero Beach"]) {
    const center = { status: "active", crmLocationId: id, locationId: id, name: id };
    assert.equal(isActiveSchoolFinanceOperationsCandidate(center), true, id);
    assert.equal(isActiveSchoolFinanceOperationsCandidate({ ...center, status: "closed" }), false, id);
  }
  for (const id of ["CO | Colorado Springs - Cordera", "IN | Fishers", "not-a-location", ""]) {
    assert.equal(isActiveSchoolFinanceOperationsCandidate({ status: "active", crmLocationId: id, locationId: id, name: id }), false, id);
  }
});
