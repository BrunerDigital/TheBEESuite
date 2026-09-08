import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { hasTrustedMutationOrigin } from "../src/lib/request-origin";

test("mutation origin guard accepts exact same-origin browser requests", () => {
  const request = new NextRequest("https://thebeesuite.io/api/example", {
    method: "POST",
    headers: { origin: "https://thebeesuite.io" },
  });
  assert.equal(hasTrustedMutationOrigin(request), true);
});

test("mutation origin guard rejects sibling subdomains and cross-site fetches", () => {
  const sibling = new NextRequest("https://thebeesuite.io/api/example", {
    method: "POST",
    headers: { origin: "https://beta.thebeesuite.io" },
  });
  assert.equal(hasTrustedMutationOrigin(sibling), false);

  const crossSite = new NextRequest("https://thebeesuite.io/api/example", {
    method: "POST",
    headers: { "sec-fetch-site": "cross-site" },
  });
  assert.equal(hasTrustedMutationOrigin(crossSite), false);
});

test("mutation origin guard permits native first-party requests without browser metadata", () => {
  const request = new NextRequest("https://thebeesuite.io/api/example", { method: "POST" });
  assert.equal(hasTrustedMutationOrigin(request), true);
});
