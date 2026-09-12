import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertPackagedPrivacyManifest, assertPrivacyManifest, parsePrivacyManifest } from "../scripts/ios-privacy-manifest.mjs";

const prefix = "NSPrivacyCollectedDataType";
const messageType = `${prefix}EmailsOrTextMessages`;
const read = (role: string) => readFileSync(`${role === "parent" ? "ios" : "ios-teacher"}/App/App/PrivacyInfo.xcprivacy`, "utf8");
type Manifest = { NSPrivacyTracking: boolean; NSPrivacyTrackingDomains: string[]; NSPrivacyAccessedAPITypes: unknown[];
  NSPrivacyCollectedDataTypes: Record<string, unknown>[] };
const manifest = (role: string): Manifest => parsePrivacyManifest(read(role));
const message = (value: Manifest) => value.NSPrivacyCollectedDataTypes.find((entry) => entry[prefix] === messageType)!;

for (const role of ["parent", "teacher"]) {
  test(`${role} reviewed inventory declares private messages once without changing role-specific financial collection`, () => {
    const value = manifest(role);
    assertPrivacyManifest(value, role);
    assert.equal(value.NSPrivacyCollectedDataTypes.filter((entry) => entry[prefix] === messageType).length, 1);
    assert.equal(value.NSPrivacyCollectedDataTypes.length, role === "parent" ? 17 : 14);
    assertPackagedPrivacyManifest(structuredClone(value), value, role);
  });

  test(`${role} rejects missing or duplicate message categories`, () => {
    const missing = manifest(role);
    missing.NSPrivacyCollectedDataTypes = missing.NSPrivacyCollectedDataTypes.filter((entry) => entry[prefix] !== messageType);
    assert.throws(() => assertPrivacyManifest(missing, role), /exactly once/);
    const duplicate = manifest(role);
    duplicate.NSPrivacyCollectedDataTypes.push(structuredClone(message(duplicate)));
    assert.throws(() => assertPrivacyManifest(duplicate, role), /exactly once/);
  });

  test(`${role} checks each message dictionary's flags and purposes without borrowing adjacent values`, () => {
    for (const [key, value] of [
      [`${prefix}Linked`, false], [`${prefix}Linked`, "true"], [`${prefix}Linked`, undefined],
      [`${prefix}Tracking`, true], [`${prefix}Tracking`, "false"], [`${prefix}Tracking`, undefined],
      [`${prefix}Purposes`, []], [`${prefix}Purposes`, undefined], [`${prefix}Purposes`, "AppFunctionality"],
      [`${prefix}Purposes`, [`${prefix}PurposeAnalytics`]],
      [`${prefix}Purposes`, [`${prefix}PurposeAppFunctionality`, `${prefix}PurposeAppFunctionality`]],
    ] as const) {
      const bad = manifest(role);
      message(bad)[key] = value;
      assert.throws(() => assertPrivacyManifest(bad, role), `${key} must reject ${JSON.stringify(value)}`);
      assert.throws(() => assertPackagedPrivacyManifest(bad, manifest(role), role));
    }
  });

  test(`${role} compiled privacy inventory cannot drift from the reviewed source`, () => {
    const source = manifest(role);
    const missing = manifest(role);
    missing.NSPrivacyCollectedDataTypes.pop();
    assert.throws(() => assertPackagedPrivacyManifest(missing, source, role));
    const reordered = manifest(role);
    reordered.NSPrivacyCollectedDataTypes.reverse();
    assertPrivacyManifest(reordered, role);
    assert.throws(() => assertPackagedPrivacyManifest(reordered, source, role), /differs from reviewed source/);
    const objectKeysReordered = Object.fromEntries(Object.entries(source).reverse());
    assertPackagedPrivacyManifest(objectKeysReordered, source, role);
    assert.throws(() => assertPackagedPrivacyManifest(source, source, role === "parent" ? "teacher" : "parent"));
  });

  test(`${role} rejects tracking or undeclared required-reason changes`, () => {
    for (const change of [
      { NSPrivacyTracking: true }, { NSPrivacyTracking: "false" },
      { NSPrivacyTrackingDomains: ["tracking.invalid"] },
      { NSPrivacyAccessedAPITypes: [{ NSPrivacyAccessedAPIType: "unreviewed" }] },
      { UnexpectedKey: false }, { NSPrivacyCollectedDataTypes: {} },
    ]) assert.throws(() => assertPrivacyManifest({ ...manifest(role), ...change }, role));
  });
}

test("privacy XML parser rejects ambiguous dictionaries, malformed values and custom entities", () => {
  const wrap = (body: string) => `<?xml version="1.0"?><plist version="1.0"><dict>${body}</dict></plist>`;
  for (const xml of [
    wrap("<key>NSPrivacyTracking</key><true/><key>NSPrivacyTracking</key><false/>"),
    wrap("<key>missing</key>"), wrap("<key>bad</key><key>value</key>"),
    wrap("<key>bad</key><integer>0</integer>"), wrap("<key>__proto__</key><dict/>"),
    wrap("<key>value</key><false>not false</false>"), wrap("<key>nested</key><string><false/></string>"),
    wrap("<key>array</key><array><key>bad</key></array>"),
    wrap("<key>broken</key><true>"), wrap("<key>bad</key><false/>").replace("</plist>", ""),
    `<!DOCTYPE plist [<!ENTITY injected SYSTEM "file:///never-read">]>${wrap("<key>x</key><string>&injected;</string>")}`,
    "<plist><dict/><dict/></plist>",
    '<!DOCTYPE plist SYSTEM "https://untrusted.invalid/evil.dtd"><plist><dict/></plist>',
  ]) assert.throws(() => parsePrivacyManifest(xml), "Malformed or ambiguous XML must not silently pass");
  assert.throws(() => parsePrivacyManifest("x".repeat(128 * 1024 + 1)));
});

test("static and compiled native checks both use the semantic privacy inventory", () => {
  const staticCheck = readFileSync("scripts/mobile-store-readiness-check.mjs", "utf8");
  const nativeCheck = readFileSync("scripts/verify-ios-native.mjs", "utf8");
  assert.match(staticCheck, /assertPrivacyManifest\(parsePrivacyManifest\(privacy\), role.key\)/);
  assert.match(nativeCheck, /assertPackagedPrivacyManifest\(compiledPrivacy, sourcePrivacy, role\)/);
  assert.match(nativeCheck, /report.privacyManifests\[sdk\]/);
  assert.match(nativeCheck, /"plutil", \["-convert", "json", "-o", "-", sourcePrivacyPath\]/);
  const workflow = readFileSync(".github/workflows/ios-native-verify.yml", "utf8");
  assert.equal(workflow.match(/'scripts\/\*ios\*'/g)?.length, 2);
  assert.equal(workflow.match(/'tests\/ios-privacy-manifest.test.ts'/g)?.length, 2);
  const deploymentIgnore = readFileSync(".vercelignore", "utf8");
  for (const rule of ["ios/*", "!ios/App", "ios/App/*", "!ios/App/App", "ios/App/App/*", "!ios/App/App/PrivacyInfo.xcprivacy"]) {
    assert.ok(deploymentIgnore.split(/\r?\n/).includes(rule), `Keep the reviewed manifest in Vercel's test input: ${rule}`);
  }
});
