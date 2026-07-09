import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  getCenterInquiryEmbedCode,
  getKidCityInquiryEmbedCode,
  getKidCityLocationInquiryEmbedCode,
} from "../src/lib/inquiry-embed";

test("Kid City multi-location embed uses the hosted Kid City form and inquiry endpoint", () => {
  const snippet = getKidCityInquiryEmbedCode("https://thebeesuite.io/");

  assert.match(snippet, /src="https:\/\/thebeesuite\.io\/kidcity-inquiry-form\.js"/);
  assert.match(snippet, /data-endpoint="https:\/\/thebeesuite\.io\/api\/inquiries"/);
});

test("Kid City location embed pins the selected school for CRM routing", () => {
  const snippet = getKidCityLocationInquiryEmbedCode({
    baseUrl: "https://thebeesuite.io/",
    centerId: "center_vero",
    centerName: "Kid City USA - Vero Beach",
    crmLocationId: "FL | Vero Beach",
    locationId: "Kid City USA - Vero Beach",
  });

  assert.match(snippet, /kidcity-inquiry-form\.js/);
  assert.doesNotMatch(snippet, /bee-suite-inquiry-form\.js/);
  assert.match(snippet, /data-center-id="center_vero"/);
  assert.match(snippet, /data-location-id="FL \| Vero Beach"/);
  assert.match(snippet, /data-public-location-id="Kid City USA - Vero Beach"/);
  assert.match(snippet, /data-location-name="Kid City USA - Vero Beach"/);
});

test("generic center embed stays on the generic Bee Suite form", () => {
  const snippet = getCenterInquiryEmbedCode({
    baseUrl: "https://thebeesuite.io/",
    centerId: "center_demo",
    centerName: "Demo Learning Center",
    brandName: "The BEE Suite",
  });

  assert.match(snippet, /bee-suite-inquiry-form\.js/);
  assert.doesNotMatch(snippet, /kidcity-inquiry-form\.js/);
});

test("hosted Kid City script supports fixed-location embeds", () => {
  const script = readFileSync("public/kidcity-inquiry-form.js", "utf8");

  assert.match(script, /fixedCenterId/);
  assert.match(script, /fixedLocationId/);
  assert.match(script, /publicLocationId/);
  assert.match(script, /centerId: String\(formData\.get\("centerId"\)/);
});
