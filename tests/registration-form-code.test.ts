import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRegistrationFormCode } from "@/lib/registration-form-code";

test("registration website code opens the locked school form", () => {
  const code = buildRegistrationFormCode({
    schoolLabel: "FL | Vero Beach",
    registrationUrl: "https://thebeesuite.io/registration?centerId=center_vero",
  });

  assert.match(code, /href="https:\/\/thebeesuite\.io\/registration\?centerId=center_vero"/);
  assert.match(code, /Start registration for FL \| Vero Beach/);
  assert.match(code, /target="_blank"/);
  assert.match(code, /rel="noopener noreferrer"/);
  assert.doesNotMatch(code, /iframe/);
});

test("registration website code escapes school labels and URLs for HTML attributes", () => {
  const code = buildRegistrationFormCode({
    schoolLabel: `School "A" & <Friends>`,
    registrationUrl: "https://thebeesuite.io/registration?centerId=a&source=site",
  });

  assert.match(code, /School &quot;A&quot; &amp; &lt;Friends&gt;/);
  assert.match(code, /centerId=a&amp;source=site/);
  assert.doesNotMatch(code, /School "A" & <Friends>/);
});
