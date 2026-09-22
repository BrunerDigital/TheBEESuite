import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getConfiguredInquiryAllowedOrigins,
  inquiryCorsHeaders,
  isAllowedInquiryOrigin,
} from "../src/lib/inquiry-origins";

test("inquiry origin defaults include live website and Bee Suite domains", () => {
  const env = {};
  const origins = getConfiguredInquiryAllowedOrigins(env);

  assert.ok(origins.includes("https://kidcityusa.com"));
  assert.ok(origins.includes("https://www.kidcityusa.com"));
  assert.ok(origins.includes("https://thebeesuite.io"));
  assert.ok(origins.includes("https://www.thebeesuite.io"));
  assert.equal(origins.some((origin) => origin.endsWith(".vercel.app")), false);
  assert.equal(isAllowedInquiryOrigin("https://thebeesuite.io", env), true);
  assert.equal(
    inquiryCorsHeaders("https://thebeesuite.io", env)["Access-Control-Allow-Origin"],
    "https://thebeesuite.io",
  );
});

test("configured inquiry origins extend trusted defaults and normalize additional origins", () => {
  const env = {
    INQUIRY_ALLOWED_ORIGINS: " https://kidcityusa.com/ , https://forms.example.test/ ",
  };

  assert.deepEqual(getConfiguredInquiryAllowedOrigins(env), [
    "https://kidcityusa.com",
    "https://www.kidcityusa.com",
    "https://misshoneyslearningcenter.com",
    "https://www.misshoneyslearningcenter.com",
    "https://thebeesuite.io",
    "https://www.thebeesuite.io",
    "https://forms.example.test",
  ]);
  assert.equal(isAllowedInquiryOrigin("https://thebeesuite.io", env), true);
  assert.equal(isAllowedInquiryOrigin("https://forms.example.test", env), true);
  assert.equal(isAllowedInquiryOrigin("https://example.com", env), false);
});

test("Miss Honey's inquiry requests allow exact production origins and reject lookalikes", () => {
  for (const origin of ["https://misshoneyslearningcenter.com", "https://www.misshoneyslearningcenter.com"]) {
    assert.equal(isAllowedInquiryOrigin(origin, {}), true);
    assert.equal(inquiryCorsHeaders(origin, {})["Access-Control-Allow-Origin"], origin);
  }
  for (const origin of ["http://misshoneyslearningcenter.com", "https://misshoneyslearningcenter.com.example.com", "https://untrusted.misshoneyslearningcenter.com"]) {
    assert.equal(isAllowedInquiryOrigin(origin, {}), false);
    assert.notEqual(inquiryCorsHeaders(origin, {})["Access-Control-Allow-Origin"], origin);
  }
});
