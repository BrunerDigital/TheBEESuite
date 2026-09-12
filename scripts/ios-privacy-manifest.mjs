import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Reuse the plist/XML readers installed for our direct Capacitor CLI dependency.
const require = createRequire(import.meta.url);
const capacitorRequire = createRequire(require.resolve("@capacitor/cli/package.json"));
const plist = capacitorRequire("plist");
const { DOMParser } = createRequire(capacitorRequire.resolve("plist/package.json"))("@xmldom/xmldom");

const prefix = "NSPrivacyCollectedDataType";
const functionality = `${prefix}PurposeAppFunctionality`;
const analytics = `${prefix}PurposeAnalytics`;
const analyticsTypes = ["ProductInteraction", "CrashData", "PerformanceData"];
const sharedTypes = ["Name", "EmailAddress", "PhoneNumber", "PhysicalAddress", "UserID", "DeviceID",
  "PhotosorVideos", "EmailsOrTextMessages", "OtherUserContent", "Health", "SensitiveInfo", ...analyticsTypes];
const financialTypes = ["PaymentInfo", "PurchaseHistory", "OtherFinancialInfo"];

export function parsePrivacyManifest(xml) {
  assert.equal(typeof xml, "string");
  assert.ok(xml.length <= 128 * 1024, "Privacy manifest unexpectedly large");
  // Only the standard external plist DOCTYPE is allowed; no custom entities/subsets.
  assert.doesNotMatch(xml, /<!ENTITY|<!DOCTYPE[^>]*\[/i);
  const doctype = xml.match(/<!DOCTYPE[^>]*>/gi);
  if (doctype) assert.deepEqual(doctype, ['<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'], "Only the standard plist DOCTYPE is allowed");
  const document = new DOMParser({ onError: (level, message) => { throw new Error(`Invalid privacy XML (${level}): ${message}`); } })
    .parseFromString(xml, "text/xml");
  assert.equal(document.documentElement?.tagName, "plist", "Expected plist root");
  function elements(node) {
    return Array.from(node.childNodes).filter((child) => {
      if (child.nodeType === 8) return false;
      if (child.nodeType === 3) { assert.equal(child.nodeValue.trim(), "", "Unexpected plist text"); return false; }
      assert.equal(child.nodeType, 1, "Unexpected plist node");
      return true;
    });
  }
  function validate(node) {
    if (["key", "string"].includes(node.tagName)) {
      assert.ok(Array.from(node.childNodes).every((child) => child.nodeType === 3), "Expected plain plist string");
      return;
    }
    const children = elements(node);
    if (["true", "false"].includes(node.tagName)) { assert.equal(children.length, 0); return; }
    assert.ok(["dict", "array", "plist"].includes(node.tagName), "Unsupported privacy plist value");
    if (node.tagName === "plist") { assert.equal(children.length, 1); assert.equal(children[0].tagName, "dict"); }
    if (node.tagName === "dict") {
      assert.equal(children.length % 2, 0, "Every dictionary key needs a value");
      const keys = new Set();
      for (let index = 0; index < children.length; index += 2) {
        assert.equal(children[index].tagName, "key");
        const key = children[index].textContent;
        assert.ok(key && !["__proto__", "constructor", "prototype"].includes(key), "Invalid plist key");
        assert.ok(!keys.has(key), `Duplicate privacy dictionary key: ${key}`);
        assert.notEqual(children[index + 1].tagName, "key", "Missing dictionary value");
        keys.add(key);
      }
    } else {
      assert.ok(children.every((child) => child.tagName !== "key"), "Key outside dictionary");
    }
    children.forEach(validate);
  }
  validate(document.documentElement);
  return plist.parse(xml);
}

export function assertPrivacyManifest(manifest, role) {
  assert.ok(["parent", "teacher"].includes(role), "Privacy role must be parent or teacher");
  assert.ok(manifest && typeof manifest === "object" && !Array.isArray(manifest), "Expected privacy dictionary");
  assert.deepEqual(Object.keys(manifest).sort(), ["NSPrivacyAccessedAPITypes", "NSPrivacyCollectedDataTypes", "NSPrivacyTracking", "NSPrivacyTrackingDomains"]);
  assert.equal(manifest.NSPrivacyTracking, false, "Neither app tracks users");
  assert.deepEqual(manifest.NSPrivacyTrackingDomains, []);
  assert.deepEqual(manifest.NSPrivacyAccessedAPITypes, [], "App-owned required-reason API additions require inventory review; SDK manifests are separate");
  const entries = manifest.NSPrivacyCollectedDataTypes;
  assert.ok(Array.isArray(entries), "Collected data must be an array");
  const expected = [...sharedTypes, ...(role === "parent" ? financialTypes : [])].map((type) => `${prefix}${type}`);
  assert.deepEqual(entries.map((entry) => entry?.[prefix]).sort(), expected.sort(), "Every reviewed category must appear exactly once for this app");
  for (const entry of entries) {
    const type = entry[prefix];
    assert.deepEqual(Object.keys(entry).sort(), [prefix, `${prefix}Linked`, `${prefix}Purposes`, `${prefix}Tracking`]);
    assert.equal(entry[`${prefix}Linked`], true, `${type} must declare identity linkage`);
    assert.equal(entry[`${prefix}Tracking`], false, `${type} must not declare tracking`);
    const purposes = entry[`${prefix}Purposes`];
    assert.ok(Array.isArray(purposes), `${type} needs a purposes array`);
    assert.deepEqual([...purposes].sort(), [functionality, ...(analyticsTypes.includes(type.slice(prefix.length)) ? [analytics] : [])].sort(),
      `${type} purposes must match the reviewed inventory`);
  }
}

export function assertPackagedPrivacyManifest(compiled, source, role) {
  assertPrivacyManifest(source, role);
  assertPrivacyManifest(compiled, role);
  assert.deepEqual(compiled, source, "Compiled privacy manifest differs from reviewed source");
}
