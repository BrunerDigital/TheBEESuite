import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const deckPath = path.join(repoRoot, "docs", "KOKOMO_ROLE_WALKTHROUGHS_2026-06-16.html");
const outputDir = path.join(repoRoot, "outputs", "walkthroughs");
const tempDir = path.join(outputDir, ".tmp");

const roleSlugs = [
  "platform-owner",
  "brand-admin",
  "regional-manager",
  "center-director",
  "assistant-director",
  "billing-admin",
  "teacher",
  "parent-guardian",
  "authorized-pickup",
  "read-only-auditor",
];

const roleLabels = {
  "platform-owner": "Platform Owner",
  "brand-admin": "Brand Admin",
  "regional-manager": "Regional Manager",
  "center-director": "Center Director",
  "assistant-director": "Assistant Director",
  "billing-admin": "Billing Admin",
  "teacher": "Teacher",
  "parent-guardian": "Parent Guardian",
  "authorized-pickup": "Authorized Pickup",
  "read-only-auditor": "Read-only Auditor",
};

function videoName(roleSlug) {
  return `kokomo-${roleSlug}-walkthrough.webm`;
}

await mkdir(outputDir, { recursive: true });
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

const browser = await chromium.launch();
const deckUrl = pathToFileURL(deckPath).toString();
const written = [];

try {
  for (const roleSlug of roleSlugs) {
    const finalPath = path.join(outputDir, videoName(roleSlug));
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      recordVideo: {
        dir: tempDir,
        size: { width: 1280, height: 720 },
      },
    });
    const page = await context.newPage();
    await page.goto(`${deckUrl}?role=${encodeURIComponent(roleSlug)}`);
    await page.waitForFunction(() => window.walkthroughReady === true);
    await page.evaluate(() => document.fonts?.ready);
    await page.evaluate(() => window.playWalkthrough({ stepMs: 2400 }));
    await page.waitForFunction(() => window.walkthroughDone === true, null, { timeout: 30000 });
    const video = page.video();
    await page.close();
    if (!video) throw new Error(`No video was captured for ${roleSlug}.`);
    await video.saveAs(finalPath);
    await context.close();
    written.push(finalPath);
    console.log(`wrote ${finalPath}`);
  }
} finally {
  await browser.close();
}

await rm(tempDir, { recursive: true, force: true });

const indexLines = [
  "# Kokomo Role Walkthrough Videos",
  "",
  "Generated from `docs/KOKOMO_ROLE_WALKTHROUGHS_2026-06-16.html`.",
  "",
  "These are silent, captioned WebM walkthroughs for the Kokomo launch. Open them in a browser or attach them to training messages.",
  "",
  "| User type | Video |",
  "| --- | --- |",
  ...roleSlugs.map((roleSlug) => `| ${roleLabels[roleSlug]} | \`${videoName(roleSlug)}\` |`),
  "",
];

await writeFile(path.join(outputDir, "README.md"), indexLines.join("\n"), "utf8");
console.log(`wrote ${path.join(outputDir, "README.md")}`);
