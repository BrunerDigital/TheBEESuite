import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { launchGuides, launchSafety, launchCheckedAt } from "../src/lib/mobile-launch";

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
async function main() {
  await mkdir("public/guides", { recursive: true });
  await mkdir("docs/ios-launch", { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const scripts = ["# Recording-ready walkthroughs", "Generated from src/lib/mobile-launch.ts. Re-run node --import tsx scripts/export-mobile-guides.ts after guide edits.", "Use only the isolated demo school and designated synthetic accounts. Hide notifications, account emails, PINs, credentials, and all real child/payment information. Never submit payments, invitations, attendance, or messages while recording. Record web fallback until the approved native binary is verified."];
    for (const guide of launchGuides) {
      const page = await browser.newPage();
      await page.setContent(`<html><head><meta charset="utf-8"><style>@page{size:Letter;margin:18mm}body{font:11pt Arial;color:#172b40;line-height:1.5}header{background:#d9ecff;padding:22px;border-radius:16px;border-top:9px solid #f5c542}h1{font-size:28pt;margin:6px 0}h2{font-size:13pt;margin-bottom:5px}section{break-inside:avoid;margin-top:18px}aside{background:#fff2b8;padding:14px;margin:18px 0}a{color:#174a80}footer{font-size:9pt;margin-top:22px}</style></head><body><header><b>THE BEE SUITE · FIRST-DAY GUIDE</b><h1>${escape(guide.title)}</h1>${escape(guide.intro)}</header><aside>${escape(launchSafety)}</aside>${guide.steps.map(([title, body], i) => `<section><h2>${i + 1}. ${escape(title)}</h2><p>${escape(body)}</p></section>`).join("")}<footer>Updated ${launchCheckedAt} · <a href="https://thebeesuite.io/mobile-apps#${guide.id}">Current guide and downloads</a> · <a href="https://thebeesuite.io${guide.login}">Web sign-in</a> · <a href="https://thebeesuite.io/mobile-apps#support">Support</a></footer></body></html>`);
      await page.pdf({ path: `public/guides/mobile-${guide.id}.pdf`, printBackground: true, format: "Letter", displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: '<div style="font:9px Arial;width:100%;text-align:center">The BEE Suite · <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
      await page.close();
      const segment = Math.floor(150 / guide.steps.length);
      scripts.push(`\n## ${guide.title} — approximately 2:30\n\nPace: read the narration naturally and pause on each screen until the next time mark. Allow an additional 15 seconds for a 2:45 cut if needed.\n\n| Time | Shot | Narration |\n| --- | --- | --- |`);
      guide.steps.forEach(([title, body], i) => { const seconds = i * segment; scripts.push(`| ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} | ${title}: show the relevant demo screen; use a title card when the feature or store listing is unavailable. | ${body} |`); });
      scripts.push("| 2:30 | End card: thebeesuite.io/mobile-apps | Find your current guide, web sign-in, and support here. |\n");
    }
    await writeFile("docs/ios-launch/walkthroughs.md", scripts.join("\n") + "\n");
  } finally { await browser.close(); }
}
main().catch(() => { console.error("Guide export failed. Check local Chrome availability."); process.exitCode = 1; });
