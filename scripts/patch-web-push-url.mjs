import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const packageEntry = require.resolve("web-push");
const packageDirectory = dirname(packageEntry);
const packageMetadata = JSON.parse(
  readFileSync(join(packageDirectory, "..", "package.json"), "utf8"),
);

if (packageMetadata.version !== "3.6.7") {
  throw new Error(
    `Refusing to patch unexpected web-push version ${String(packageMetadata.version)}.`,
  );
}

const implementationPath = join(packageDirectory, "web-push-lib.js");
let implementation = readFileSync(implementationPath, "utf8");
const replacements = [
  ["const url = require('url');\n", ""],
  [
    "const parsedUrl = url.parse(subscription.endpoint);",
    "const parsedUrl = new URL(subscription.endpoint);",
  ],
  [
    "const urlParts = url.parse(requestDetails.endpoint);",
    "const urlParts = new URL(requestDetails.endpoint);",
  ],
  ["httpsOptions.port = urlParts.port;", "httpsOptions.port = urlParts.port || undefined;"],
  ["httpsOptions.path = urlParts.path;", "httpsOptions.path = urlParts.pathname + urlParts.search;"],
];

let changed = false;
for (const [legacySource, replacement] of replacements) {
  if (implementation.includes(legacySource)) {
    implementation = implementation.replace(legacySource, replacement);
    changed = true;
    continue;
  }
  if (replacement && implementation.includes(replacement)) continue;
  if (!replacement && !implementation.includes("const url = require('url');")) continue;
  throw new Error(`web-push patch context did not match: ${legacySource}`);
}

if (changed) writeFileSync(implementationPath, implementation);
console.log(`Verified web-push ${packageMetadata.version} uses the standard URL API.`);
