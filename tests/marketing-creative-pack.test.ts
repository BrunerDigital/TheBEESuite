import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const releaseDir = path.join(
  "public",
  "brand",
  "the-bee-suite",
  "marketing",
  "current",
);
const manifest = JSON.parse(
  readFileSync(path.join(releaseDir, "manifest.json"), "utf8"),
) as {
  releaseVersion: string;
  concepts: Array<{
    id: string;
    landingPage: string;
    copy: {
      platformCopy: {
        google: {
          businessName: string;
          shortHeadlines: string[];
          longHeadline: string;
          descriptions: string[];
        };
      };
    } & Record<string, unknown>;
    sourceAssets: Array<{ path: string }>;
    exports: Array<{
      dimensions: string;
      file: string;
      format: string;
      placements: string[];
    }>;
  }>;
  guardrails: string[];
};

function pngDimensions(filePath: string) {
  const buffer = readFileSync(filePath);
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", filePath);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test("social and paid campaign pack covers seventeen concepts and six platform formats", () => {
  assert.equal(manifest.releaseVersion, "current");
  assert.equal(manifest.concepts.length, 17);

  const expectedDimensions = new Map([
    ["square", "1080x1080"],
    ["portrait", "1080x1350"],
    ["story", "1080x1920"],
    ["landscape", "1200x628"],
    ["google-square-clean", "1200x1200"],
    ["google-landscape-clean", "1200x628"],
  ]);

  for (const concept of manifest.concepts) {
    assert.equal(concept.exports.length, 6, concept.id);
    for (const creative of concept.exports) {
      assert.equal(
        creative.dimensions,
        expectedDimensions.get(creative.format),
        `${concept.id} ${creative.format}`,
      );
      assert.ok(creative.placements.length >= 2, `${concept.id} ${creative.format}`);

      const filePath = path.join(releaseDir, creative.file);
      assert.equal(existsSync(filePath), true, filePath);
      const [expectedWidth, expectedHeight] = creative.dimensions
        .split("x")
        .map(Number);
      assert.deepEqual(pngDimensions(filePath), {
        width: expectedWidth,
        height: expectedHeight,
      });
    }
  }
});

test("Google copy fields fit responsive display limits and clean files are explicit", () => {
  for (const concept of manifest.concepts) {
    const google = concept.copy.platformCopy.google;
    assert.ok(google.businessName.length <= 25, concept.id);
    assert.equal(google.shortHeadlines.length, 5, concept.id);
    assert.equal(google.descriptions.length, 4, concept.id);
    for (const headline of google.shortHeadlines) {
      assert.ok(headline.length <= 30, `${concept.id}: ${headline}`);
    }
    assert.ok(google.longHeadline.length <= 90, concept.id);
    for (const description of google.descriptions) {
      assert.ok(description.length <= 90, `${concept.id}: ${description}`);
    }

    const cleanExports = concept.exports.filter((creative) =>
      creative.format.includes("google-"),
    );
    assert.equal(cleanExports.length, 2, concept.id);
    assert.ok(cleanExports.every((creative) => creative.format.endsWith("-clean")));
  }
});

test("creative sources stay on approved current screenshots and brand assets", () => {
  const sourcePaths = manifest.concepts.flatMap((concept) =>
    concept.sourceAssets.map((asset) => asset.path),
  );

  assert.ok(
    sourcePaths.some((source) => source.includes("screenshots/current/")),
  );
  assert.equal(sourcePaths.some((source) => source.includes("2026-07-07")), false);

  for (const source of sourcePaths) {
    assert.ok(
      source.includes("screenshots/current/") ||
        source === "public/brand/the-bee-suite/mr-bee-profile.png",
      source,
    );
    assert.equal(existsSync(source), true, source);
  }
});

test("campaign copy avoids unsupported claims and the review library is complete", () => {
  const allCopy = JSON.stringify(manifest.concepts.map((concept) => concept.copy));
  assert.doesNotMatch(allCopy, /guarantees compliance/i);
  assert.doesNotMatch(allCopy, /fully automates/i);
  assert.doesNotMatch(allCopy, /HIPAA compliant/i);
  assert.doesNotMatch(allCopy, /warning banners/i);
  assert.ok(manifest.guardrails.some((guardrail) => guardrail.includes("separate approval")));

  const review = readFileSync(path.join(releaseDir, "index.html"), "utf8");
  for (const concept of manifest.concepts) {
    for (const creative of concept.exports) {
      assert.match(review, new RegExp(creative.file.replaceAll(".", "\\.")));
    }
  }
});

test("campaign destinations and calculator navigation match their promised actions", () => {
  const calculator = manifest.concepts.find(
    (concept) => concept.id === "model-fragmentation-cost",
  );
  assert.ok(calculator);
  assert.equal(
    calculator.landingPage,
    "https://thebeesuite.io/brand/the-bee-suite/marketing/current/savings-calculator.html",
  );

  const calculatorPage = readFileSync(
    path.join(releaseDir, "savings-calculator.html"),
    "utf8",
  );
  assert.match(calculatorPage, /class="brand" href="\/"/);
  assert.match(calculatorPage, /class="back" href="\/">← Product site<\/a>/);
});
