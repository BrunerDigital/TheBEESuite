import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve("public/training/directors/current");
const html = readFileSync(path.join(root, "index.html"), "utf8");

test("take-home hub preserves the 36 tutorials and 50 task guides with their local media", () => {
  assert.equal((html.match(/<video\b/g) ?? []).length, 36);
  const guideNames = new Set([...html.matchAll(/href="guides\/([^"]+\.md)"/g)].map(match => match[1]));
  assert.equal(guideNames.size, 50);
  for (const match of html.matchAll(/(?:href|src|poster)="([^"]+)"/g)) {
    const value = match[1];
    if (/^(?:https?:|\/|#)/.test(value)) continue;
    assert.ok(existsSync(path.resolve(root, value.split(/[?#]/)[0])), `Missing local resource: ${value}`);
  }
  for (const title of ["Form walkthrough", "Local saved workflow", "Narrated procedure", "Screen orientation"]) {
    assert.ok(html.includes(title), `Preserve demonstration label: ${title}`);
  }
});

test("hub reuses 28 authenticated asset routes and preserves access boundaries", () => {
  const routes = new Set([...html.matchAll(/href="https:\/\/thebeesuite\.io(\/api\/asset-hub\/download\/[a-z0-9]+)"/g)].map(match => match[1]));
  assert.equal(routes.size, 28);
  assert.match(html, /school sign-in required/);
  assert.match(html, /\/login\?next=%2Fasset-hub/);
  assert.doesNotMatch(html, /sdmnt|supabase\.co\/storage|PREVIEW_ONLY|PRIVATE-MST|Campaign-03-|Campaign-17-/);
  assert.match(html, /https:\/\/www\.youtube\.com\/watch\?v=webytEmjKas/);
  assert.match(html, /parents earn one week of free tuition for every family they refer who enrolls/i);
  assert.match(html, /cmvjli78f0005kz07hxq8uu7f\">Download Marketing workshop slides · school PowerPoint/);
  assert.match(html, /cmvjlibt8000dl408jbql5pse\">Download Marketing take-home guide · PDF/);
});

test("take-home navigation and current registration guidance agree", () => {
  const resources = readFileSync("src/app/resources/page.tsx", "utf8");
  const homepage = readFileSync("src/app/page.tsx", "utf8");
  const guide = readFileSync(path.join(root, "guides/46-follow-a-lead-through-tours-and-enrollment.md"), "utf8");
  for (const source of [resources, homepage]) assert.match(source, /href="\/resources\/director-training"/);
  for (const source of [html, resources, guide]) {
    for (const label of ["Copy registration link", "Preview form", "Application Submitted", "Registration Packets"]) assert.ok(source.includes(label), label);
  }
  for (const id of ["start-here", "bee-how-to", "marketing-downloads", "referral-program", "enrollment-forms", "troubleshooting-help", "tutorial-enrollment", "guide-46"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Every lead, whatever its source, enters BEE Suite/);
  assert.match(guide, /Parent Portal invitations are separate/);
  const embedded = html.match(/<details id="guide-46"[\s\S]*?<div class="body">([\s\S]*?)<\/div><\/details>/)?.[1];
  assert.ok(embedded);
  const plain = (text: string) => text.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
  const writtenSteps = [...guide.matchAll(/^\d+\. (.+)$/gm)].map(match => plain(match[1]));
  const embeddedSteps = [...embedded.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(match => plain(match[1]));
  assert.equal(writtenSteps.length, 7);
  assert.deepEqual(embeddedSteps, writtenSteps, "Expanded guide must match the downloadable current procedure");
});
