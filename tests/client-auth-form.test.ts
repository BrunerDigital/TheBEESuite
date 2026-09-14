import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientAuthForm } from "../src/components/client-auth-form";

test("server-rendered credentials cannot be entered or submitted before hydration", () => {
  const html = renderToStaticMarkup(createElement(ClientAuthForm, { action: "/api/auth/login" },
    createElement("input", { name: "password", type: "password" }),
    createElement("button", { type: "submit" }, "Sign in")));
  assert.match(html, /<form[^>]*method="post"/);
  assert.match(html, /<fieldset[^>]*disabled=""[^>]*>.*name="password".*<button/s);
  assert.match(html, /<noscript>Enable JavaScript/);
});

test("native fallback remains POST even if a caller supplies GET at runtime", () => {
  const props = { action: "/api/auth/reset-password", method: "get" };
  const html = renderToStaticMarkup(createElement(ClientAuthForm, props));
  assert.match(html, /method="post"/);
  assert.doesNotMatch(html, /method="get"/);
});
