import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = path.join(root, "public", "brand", "the-bee-suite", "explainers");
const iconPath = path.join(root, "public", "brand", "the-bee-suite", "app-icon-yellow.png");
const width = 1600;
const height = 1000;
const exportSuffix = "-v3";

const graphics = [
  {
    id: "bee-suite-school-launch-gates-2026-07-27",
    eyebrow: "SCHOOL LAUNCH",
    title: "Launch by independent gates",
    subtitle: "Setup, parent access, kiosk, billing, payments, ProCare cutover, and wider rollout are separate decisions.",
    steps: [
      ["1", "Verify scope", "Confirm the school, timezone, classrooms, staff, and role access."],
      ["2", "Validate records", "Review source coverage and 10 representative families."],
      ["3", "Test each role", "Use approved director, teacher, parent, billing, kiosk, and executive accounts."],
      ["4", "Decide each gate", "Record separate GO or NO-GO decisions for invitations, kiosk, billing, and payments."],
      ["5", "Train by role", "Give each user the current guide for approved features."],
      ["6", "Monitor launch", "Keep ProCare until signed cutover; stop on wrong-scope data."],
    ],
    warning: "A software release, training session, or import preview does not activate a school or module.",
  },
  {
    id: "bee-suite-parent-access-install-2026-07-27",
    eyebrow: "PARENT ACCESS",
    title: "Invite, sign in, then install",
    subtitle: "Use the verified guardian email, school-issued first-login password, and secure BEE Suite address.",
    steps: [
      ["1", "Confirm guardian", "Verify email, phone, family link, children, and pickup access."],
      ["2", "Send invitation", "Use the approved invite with the secure URL, email, and first-login password."],
      ["3", "Open secure site", "Use thebeesuite.io/parents. Stop if Safari says Not Secure."],
      ["4", "Sign in", "Enter the guardian email and issued password."],
      ["5", "Install", "Use Add to Home Screen on iPhone or Install app on Android or Fire."],
      ["6", "Check family", "Confirm the correct school and children before continuing."],
    ],
    warning: "Never forward credentials or request passwords, bank logins, or full card numbers by message.",
  },
  {
    id: "bee-suite-parent-payment-options-2026-07-27",
    eyebrow: "PARENT PAYMENTS",
    title: "Review the total, then choose",
    subtitle: "Debit/credit card is presented first. Instant Bank and One-Time Bank remain available when the school enables them.",
    steps: [
      ["1", "Open Billing", "Confirm the family, invoice, due date, balance, and amount."],
      ["2", "Choose payment", "Select Debit/Credit Card, Instant Bank, or One-Time Bank."],
      ["3", "Review total", "Check the exact total and any approved card recovery."],
      ["4", "Continue to Stripe", "Enter card or bank details only on the secure Stripe screen."],
      ["5", "Wait for status", "Bank payments may remain processing until settlement."],
      ["6", "Avoid duplicates", "Do not repay an invoice while its payment is processing."],
    ],
    warning: "Use the exact total shown before submitting.",
  },
  {
    id: "bee-suite-weekly-tuition-flow-2026-07-27",
    eyebrow: "WEEKLY TUITION",
    title: "One school, one child, one source",
    subtitle: "The selected child's school-scoped assignment is the canonical weekly rate everywhere it is displayed.",
    steps: [
      ["1", "Select school", "Filter the billing workspace to the intended school."],
      ["2", "Choose family + child", "Verify the context header before changing tuition."],
      ["3", "Choose local plan", "Assign only a tuition plan belonging to that school."],
      ["4", "Save recurring", "Set the amount, status, and start period; reopen to verify."],
      ["5", "Thursday run", "Create next week's invoice and attempt eligible autopay."],
      ["6", "Separate immediate charge", "Charge This Child Now does not replace recurring tuition."],
    ],
    warning: "A saved payment method is required for automatic collection, not for invoice creation.",
  },
  {
    id: "bee-suite-director-daily-flow-2026-07-27",
    eyebrow: "DIRECTOR OPERATIONS",
    title: "Open, verify, operate, close",
    subtitle: "Work inside the assigned school and stop if the displayed school, family, or classroom is wrong.",
    steps: [
      ["1", "Open correctly", "Confirm school, staffing, attendance, ratios, and exceptions."],
      ["2", "Verify family", "Check the family, child, guardian, and billing account."],
      ["3", "Run classrooms", "Review rosters, teacher access, reports, incidents, and sync."],
      ["4", "Review billing", "Check tuition, balances, payment status, and payout readiness."],
      ["5", "Message carefully", "Use the smallest correct audience and review drafts before sending."],
      ["6", "Close exceptions", "Assign every unresolved item to a named follow-up owner."],
    ],
    warning: "Custody, pickup, medical, incident, billing, and compliance decisions remain human-reviewed.",
  },
  {
    id: "bee-suite-teacher-daily-flow-2026-07-27",
    eyebrow: "TEACHER WORKFLOW",
    title: "Work only the assigned classroom",
    subtitle: "Attendance, care entries, reports, incidents, and messages stay classroom-scoped and use school-local time.",
    steps: [
      ["1", "Confirm scope", "Check your school, classroom, roster, schedule, and child alerts."],
      ["2", "Record attendance", "Mark real arrival, absence, classroom, and departure states."],
      ["3", "Add care details", "Record meals, naps, diapers, activities, mood, and notes."],
      ["4", "Confirm save", "Check the saved or synced state before moving on."],
      ["5", "Sync once", "Let queued actions finish; do not repeat a pending action."],
      ["6", "Escalate", "Send incidents, roster conflicts, and safety concerns for review."],
    ],
    warning: "Never use another teacher's account or enter information for a child outside your assigned classroom.",
  },
  {
    id: "bee-suite-kiosk-pickup-flow-2026-07-27",
    eyebrow: "KIOSK + PICKUP",
    title: "Verify before every handoff",
    subtitle: "The lobby device must show the correct school, and staff must verify every pickup.",
    steps: [
      ["1", "Open correct kiosk", "Confirm the school, network, and approved kiosk activation."],
      ["2", "Enter credential", "Use the school-specific four-digit PIN or approved QR code."],
      ["3", "Confirm family", "Verify the expected family and children; stop if anything is wrong."],
      ["4", "Review warnings", "Resolve custody, authorization, or identity concerns."],
      ["5", "Select + sign", "Choose the children and enter the adult's full-name signature."],
      ["6", "Complete + reset", "Wait for confirmation, then return to the start screen."],
    ],
    warning: "A PIN or QR match does not override custody, pickup, identity, or emergency procedures.",
  },
  {
    id: "bee-suite-fte-reporting-flow-2026-07-27",
    eyebrow: "WEEKLY FTE",
    title: "Report the selected period",
    subtitle: "The selected reporting week is separate from submission time and drives reminders, history, corrections, and exports.",
    steps: [
      ["1", "Choose school", "Confirm the location is inside your authorized scope."],
      ["2", "Select week", "Set the intended week; do not assume today's date."],
      ["3", "Review prefill", "Verify enrollment, schedules, billing, payroll, and capacity."],
      ["4", "Resolve unknowns", "Correct schedules and totals before using FTE or occupancy."],
      ["5", "Submit by cutoff", "Current-week reports are due Friday by 12:00 PM ET."],
      ["6", "Review outcome", "Executives request corrections, approve, and export."],
    ],
    warning: "A report covering the selected week satisfies reminders even when it was submitted on a different date.",
  },
  {
    id: "bee-suite-terminal-payment-flow-2026-07-27",
    eyebrow: "IN-PERSON CARD",
    title: "School-scoped Stripe Terminal",
    subtitle: "Authorized staff can collect an in-person card payment on a certified reader assigned to the school.",
    steps: [
      ["1", "Verify context", "Confirm the school, family, invoice, amount, and payout account."],
      ["2", "Choose reader", "Select an online reader registered to that school."],
      ["3", "Confirm parent", "The parent must be present and able to cancel on the reader."],
      ["4", "Review total", "Confirm the amount and any approved card recovery."],
      ["5", "Collect card", "The parent taps, inserts, or swipes on the Stripe reader."],
      ["6", "Wait for ledger", "Finish only after the processor and ledger confirm payment."],
    ],
    warning: "Use only a network reader assigned to the school.",
  },
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrap(value, maxChars) {
  const words = String(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textLines(value, x, y, { size = 24, fill = "#cbd5e1", weight = 500, maxChars = 48, lineHeight = 31, attributes = "" } = {}) {
  return wrap(value, maxChars)
    .map((line, index) => `<text ${attributes} x="${x}" y="${y + index * lineHeight}" fill="${fill}" font-size="${size}" font-weight="${weight}">${escapeXml(line)}</text>`)
    .join("\n");
}

function stepCard(step, index) {
  const [number, title, body] = step;
  const column = index % 3;
  const row = Math.floor(index / 3);
  const x = 72 + column * 496;
  const y = 314 + row * 238;
  const titleLines = wrap(title, 18);
  const bodyY = titleLines.length > 1 ? y + 138 : y + 108;
  return `
    <g data-safe-box="true" data-safe-x="${x + 18}" data-safe-y="${y + 16}" data-safe-width="${456 - 36}" data-safe-height="${204 - 32}">
      <rect x="${x}" y="${y}" width="456" height="204" rx="24" fill="rgba(255,255,255,.075)" stroke="rgba(255,255,255,.16)"/>
      <circle data-layout-item="true" cx="${x + 46}" cy="${y + 48}" r="25" fill="url(#gold)"/>
      <text x="${x + 46}" y="${y + 57}" text-anchor="middle" fill="#15100a" font-size="25" font-weight="900">${escapeXml(number)}</text>
      ${titleLines.map((line, lineIndex) => `<text data-layout-item="true" x="${x + 96}" y="${y + 56 + lineIndex * 34}" fill="#fff" font-size="24" font-weight="900">${escapeXml(line)}</text>`).join("\n")}
      ${textLines(body, x + 32, bodyY, { size: 21, maxChars: 40, lineHeight: 28, attributes: 'data-layout-item="true"' })}
    </g>`;
}

function renderSvg(graphic, iconDataUrl) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(graphic.title)}</title>
  <desc id="desc">${escapeXml(graphic.subtitle)}</desc>
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="#080b10"/>
      <stop offset=".72" stop-color="#05070a"/>
      <stop offset="1" stop-color="#241805"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" x2="1"><stop stop-color="#fde68a"/><stop offset="1" stop-color="#f5b51b"/></linearGradient>
    <pattern id="honey" width="108" height="94" patternUnits="userSpaceOnUse">
      <path d="M27 2h54l27 45-27 45H27L0 47z" fill="none" stroke="#f5b51b" stroke-opacity=".08" stroke-width="2"/>
    </pattern>
    <style>text{font-family:Inter,Arial,sans-serif;letter-spacing:0}</style>
  </defs>
  <rect width="1600" height="1000" fill="url(#bg)"/>
  <rect width="1600" height="1000" fill="url(#honey)"/>
  <circle cx="1390" cy="72" r="250" fill="#f5b51b" opacity=".08"/>
  <image href="${iconDataUrl}" x="72" y="54" width="66" height="66"/>
  <text x="158" y="78" fill="#fde68a" font-size="18" font-weight="900" letter-spacing=".12em">THE BEE SUITE • ${escapeXml(graphic.eyebrow)}</text>
  <text x="72" y="185" fill="#fff" font-size="62" font-weight="950">${escapeXml(graphic.title)}</text>
  ${textLines(graphic.subtitle, 72, 235, { size: 27, maxChars: 104, lineHeight: 35 })}
  ${graphic.steps.map(stepCard).join("\n")}
  <g data-safe-box="true" data-safe-x="96" data-safe-y="838" data-safe-width="1408" data-safe-height="94">
    <rect x="72" y="822" width="1456" height="130" rx="24" fill="rgba(245,181,27,.11)" stroke="rgba(245,181,27,.42)"/>
    <text x="104" y="866" fill="#fde68a" font-size="20" font-weight="900" letter-spacing=".08em">STOP / VERIFY</text>
    ${textLines(graphic.warning, 104, 908, { size: 24, fill: "#f8fafc", maxChars: 108, lineHeight: 30 })}
  </g>
  </svg>`;
}

async function validateLayout(page, fileName) {
  const rootName = await page.evaluate(() => document.documentElement.localName);
  if (rootName !== "svg") {
    throw new Error(`${fileName} did not render as SVG; received ${rootName}.`);
  }
  const violations = await page.evaluate(({ width, height }) => {
    const tolerance = 1;
    return [...document.querySelectorAll("text")].flatMap((element) => {
      const box = element.getBBox();
      const safeParent = element.closest("[data-safe-box]");
      const safe = safeParent
        ? {
            x: Number(safeParent.getAttribute("data-safe-x")),
            y: Number(safeParent.getAttribute("data-safe-y")),
            width: Number(safeParent.getAttribute("data-safe-width")),
            height: Number(safeParent.getAttribute("data-safe-height")),
          }
        : { x: 32, y: 20, width: width - 64, height: height - 40 };
      const outside =
        box.x < safe.x - tolerance ||
        box.y < safe.y - tolerance ||
        box.x + box.width > safe.x + safe.width + tolerance ||
        box.y + box.height > safe.y + safe.height + tolerance;
      return outside
        ? [{
            text: element.textContent,
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
            safe,
          }]
        : [];
    });
  }, { width, height });
  if (violations.length) {
    throw new Error(`${fileName} has text outside its safe area:\n${JSON.stringify(violations, null, 2)}`);
  }
  const collisions = await page.evaluate(() => {
    const intersects = (a, b) =>
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;
    return [...document.querySelectorAll("[data-safe-box]")].flatMap((safeBox) => {
      const items = [...safeBox.querySelectorAll("[data-layout-item]")].map((element) => ({
        element,
        box: element.getBBox(),
      }));
      const overlaps = [];
      for (let first = 0; first < items.length; first += 1) {
        for (let second = first + 1; second < items.length; second += 1) {
          if (intersects(items[first].box, items[second].box)) {
            overlaps.push({
              first: items[first].element.textContent || items[first].element.localName,
              second: items[second].element.textContent || items[second].element.localName,
            });
          }
        }
      }
      return overlaps;
    });
  });
  if (collisions.length) {
    throw new Error(`${fileName} has overlapping layout items:\n${JSON.stringify(collisions, null, 2)}`);
  }
}

async function renderPng(svgPath, pngPath) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(svgPath).href);
    await validateLayout(page, path.basename(svgPath));
    await page.screenshot({ path: pngPath, type: "png" });
  } finally {
    await browser.close();
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const icon = await readFile(iconPath);
  const iconDataUrl = `data:image/png;base64,${icon.toString("base64")}`;
  for (const graphic of graphics) {
    const svg = renderSvg(graphic, iconDataUrl).replace(/[ \t]+(?=\r?$)/gm, "");
    const svgPath = path.join(outDir, `${graphic.id}${exportSuffix}.svg`);
    const pngPath = path.join(outDir, `${graphic.id}${exportSuffix}.png`);
    await writeFile(svgPath, svg, "utf8");
    await renderPng(svgPath, pngPath);
    console.log(`Rendered ${path.relative(root, svgPath)}`);
    console.log(`Rendered ${path.relative(root, pngPath)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
