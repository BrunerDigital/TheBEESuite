import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  canonicalPublicRequestRedirectUrl,
  securePublicAppUrlForPath,
} from "../src/lib/public-app-url";

test("official app requests are upgraded to the canonical HTTPS origin", () => {
  assert.equal(
    canonicalPublicRequestRedirectUrl("http://thebeesuite.io/parents?next=%2Fparent-portal"),
    "https://thebeesuite.io/parents?next=%2Fparent-portal",
  );
  assert.equal(
    canonicalPublicRequestRedirectUrl("https://www.thebeesuite.io/parents/setup#continue"),
    "https://thebeesuite.io/parents/setup#continue",
  );
  assert.equal(
    canonicalPublicRequestRedirectUrl("https://thebeesuite.io/parents"),
    null,
  );
  assert.equal(
    canonicalPublicRequestRedirectUrl("http://localhost:3000/parents"),
    null,
  );
});

test("secure install fallback preserves the parent route and token parameters", () => {
  assert.equal(
    securePublicAppUrlForPath("/parents/setup", "?token=private-token", "#continue"),
    "https://thebeesuite.io/parents/setup?token=private-token#continue",
  );
});

test("proxy redirects before session work and insecure install guidance blocks installation", () => {
  const proxySource = readFileSync("src/proxy.ts", "utf8");
  assert.ok(
    proxySource.indexOf("canonicalPublicRequestRedirectUrl(request.url)") <
      proxySource.indexOf("updateSession(request)"),
  );

  const installManagerSource = readFileSync("src/components/pwa-install-manager.tsx", "utf8");
  assert.match(installManagerSource, /Do not install from this page/);
  assert.match(installManagerSource, /Do not enter a password or add this page to your iPhone Home Screen/);
  assert.match(installManagerSource, /window\.location\.replace\(secureInstallState\.secureUrl\)/);
  assert.match(installManagerSource, /https:\/\/thebeesuite\.io/);
});
