import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = path.join(root, "public", "brand", "the-bee-suite", "explainers");
const iconPath = path.join(root, "public", "brand", "the-bee-suite", "app-icon-yellow.png");
const width = 1600;
const height = 1000;
const snapshot = "JULY 27, 2026";

const graphics = [
  {
    id: "bee-suite-school-launch-gates-2026-07-27",
    eyebrow: "SCHOOL LAUNCH",
    title: "Launch by independent gates",
    subtitle: "Setup, parent access, kiosk, billing, payments, ProCare cutover, and the wider school wave are separate decisions.",
    steps: [
      ["1", "Verify scope", "Confirm the school, owner, timezone, classrooms, staff, and role-limited access."],
      ["2", "Validate records", "Review ProCare coverage and at least 10 representative families before any cutover."],
      ["3", "Test roles", "Run director, teacher, parent, billing, kiosk, and executive checks with approved accounts."],
      ["4", "Decide modules", "Record a dated GO or NO-GO separately for invitations, kiosk, billing, and payments."],
      ["5", "Train users", "Give each role only its current guide and keep support ownership visible."],
      ["6", "Monitor safely", "Retain ProCare until signed cutover and stop on wrong-scope or unsafe data."],
    ],
    warning: "A software release, completed training, or a successful import preview does not activate a school or module.",
  },
  {
    id: "bee-suite-parent-access-install-2026-07-27",
    eyebrow: "PARENT ACCESS",
    title: "Invite, sign in, then install",
    subtitle: "Use the guardian's verified email, the school-issued first-login password, and only the secure BEE Suite address.",
    steps: [
      ["1", "Verify guardian", "Confirm the personal email, phone, family link, children, and pickup relationship."],
      ["2", "Send approved invite", "The invitation provides the secure parent URL, login email, and first-login password."],
      ["3", "Open secure site", "Use https://thebeesuite.io/parents. Close any page that Safari labels Not Secure."],
      ["4", "Sign in", "Enter the guardian email and issued password. A private password can be chosen later in settings."],
      ["5", "Install safely", "On iPhone use Safari Share > Add to Home Screen; Android/Fire use Install app or Add to Home screen."],
      ["6", "Verify family", "Confirm the correct school and children appear before using messages, documents, kiosk, or billing."],
    ],
    warning: "Never forward another guardian's credentials or request passwords, bank logins, or full card numbers by message.",
  },
  {
    id: "bee-suite-parent-payment-options-2026-07-27",
    eyebrow: "PARENT PAYMENTS",
    title: "Review the total, then choose",
    subtitle: "Debit/credit card is presented first. Instant Bank and One-Time Bank remain available when the school enables them.",
    steps: [
      ["1", "Open Billing", "Confirm the family, invoice number, due date, balance, and payment amount."],
      ["2", "Choose a method", "Use Debit/Credit Card, Instant Bank, or One-Time Bank based on the option you want."],
      ["3", "Review disclosure", "Card recovery appears only when approved and is shown before submission."],
      ["4", "Use secure handoff", "Stripe collects card or bank details. The BEE Suite never stores full credentials."],
      ["5", "Wait for status", "Cards can confirm quickly; bank payments may remain processing until settlement."],
      ["6", "Avoid duplicates", "Do not pay the same invoice again while a payment is processing."],
    ],
    warning: "The invoice amount remains the family ledger amount. Always use the exact total shown before submitting.",
  },
  {
    id: "bee-suite-weekly-tuition-flow-2026-07-27",
    eyebrow: "WEEKLY TUITION",
    title: "One school, one child, one source",
    subtitle: "The selected child's school-scoped assignment is the canonical weekly rate everywhere it is displayed.",
    steps: [
      ["1", "Select school", "Confirm the billing workbench is filtered to the intended school."],
      ["2", "Select family + child", "Verify the sticky context header before changing tuition."],
      ["3", "Choose local plan", "Only a tuition plan belonging to that school can be assigned."],
      ["4", "Save recurring", "Set the amount, enabled status, and start period; then reopen to verify."],
      ["5", "Thursday run", "The Thursday scheduler creates the following week's invoice and attempts autopay when eligible."],
      ["6", "Keep Charge Now separate", "Charge This Child Now creates an approved immediate invoice; it does not replace recurring tuition."],
    ],
    warning: "A saved payment method is required for automatic collection, not for invoice creation.",
  },
  {
    id: "bee-suite-director-daily-flow-2026-07-27",
    eyebrow: "DIRECTOR OPERATIONS",
    title: "Open, verify, operate, close",
    subtitle: "Directors work inside the assigned school and stop immediately if the displayed school, family, or classroom is wrong.",
    steps: [
      ["1", "Open correctly", "Confirm school, staffing, attendance, ratios, messages, documents, and exceptions."],
      ["2", "Verify family context", "Check the school, family, selected child, guardian, billing account, and record counts."],
      ["3", "Run classrooms", "Validate rosters, teacher access, daily reports, incidents, media, and offline warnings."],
      ["4", "Review billing", "Check child tuition assignments, family totals, balances, payment status, and payout readiness."],
      ["5", "Communicate narrowly", "Use the smallest correct audience and review AI-drafted copy before sending."],
      ["6", "Close exceptions", "Confirm attendance, reports, incidents, queued actions, and named follow-up owners."],
    ],
    warning: "Custody, pickup, medical, incident, billing, and compliance decisions remain human-reviewed.",
  },
  {
    id: "bee-suite-teacher-daily-flow-2026-07-27",
    eyebrow: "TEACHER WORKFLOW",
    title: "Work only the assigned classroom",
    subtitle: "Attendance, care entries, reports, incidents, and messages stay classroom-scoped and use the school's local time.",
    steps: [
      ["1", "Confirm identity", "Check your name, school, classroom, roster, schedule, and child alerts."],
      ["2", "Record attendance", "Mark real arrival, absence, classroom, and departure states for assigned children."],
      ["3", "Add care details", "Record meals, naps, diapers, activities, supplies, mood, and notes with school-local times."],
      ["4", "Save visibly", "Watch the saved or unsaved state and verify before changing child or leaving the page."],
      ["5", "Handle offline once", "Allow queued actions to sync; do not repeat the same action while it is pending."],
      ["6", "Escalate + close", "Send incidents for review, finish reports, confirm sync, and report roster or safety conflicts."],
    ],
    warning: "Never use another teacher's account or enter information for a child outside your assigned classroom.",
  },
  {
    id: "bee-suite-kiosk-pickup-flow-2026-07-27",
    eyebrow: "KIOSK + PICKUP",
    title: "Verify before every handoff",
    subtitle: "The lobby device must show the correct school, and every pickup remains subject to staff identity and safety review.",
    steps: [
      ["1", "Open correct kiosk", "Confirm the location, network, device reset behavior, and approved kiosk activation."],
      ["2", "Enter credential", "The adult uses the center-specific four-digit PIN or approved QR credential."],
      ["3", "Confirm family", "Verify the expected family and children; stop if any record is wrong."],
      ["4", "Review warnings", "Staff resolve custody, protected pickup, missing authorization, or identity concerns."],
      ["5", "Select + sign", "Choose the arriving or leaving children and enter the adult's full-name signature."],
      ["6", "Complete + reset", "Wait for confirmation, then return the kiosk to its starting screen."],
    ],
    warning: "A PIN or QR match does not override custody, pickup, identity, or emergency procedures.",
  },
  {
    id: "bee-suite-fte-reporting-flow-2026-07-27",
    eyebrow: "WEEKLY FTE",
    title: "Report the selected period",
    subtitle: "The saved reporting week is independent from submission time and is used for reminders, history, corrections, and exports.",
    steps: [
      ["1", "Choose school", "Confirm the location is inside your authorized scope."],
      ["2", "Select week", "Set the intended week start and end; do not assume today's date is the report period."],
      ["3", "Review prefill", "Verify enrolled, full-time, part-time, age-group, billing, payroll, and capacity values."],
      ["4", "Resolve unknowns", "Correct schedules and totals before relying on the calculated FTE and occupancy."],
      ["5", "Submit by cutoff", "Current-week reports are due Friday by 12:00 PM ET."],
      ["6", "Correct or approve", "Executives review the selected period, request corrections, approve, and export."],
    ],
    warning: "A report covering the selected week satisfies reminders even when it was submitted on a different date.",
  },
  {
    id: "bee-suite-terminal-payment-flow-2026-07-27",
    eyebrow: "IN-PERSON CARD",
    title: "School-scoped Stripe Terminal",
    subtitle: "Authorized directors and executives can collect an in-person card payment on a certified reader assigned to the school.",
    steps: [
      ["1", "Verify context", "Confirm the school, family, billing account, invoice or amount, and connected payout account."],
      ["2", "Choose reader", "Select an online reader registered to that school's Stripe Terminal location."],
      ["3", "Confirm parent present", "The parent must be present and able to review and cancel from the reader."],
      ["4", "Review total", "Confirm the account payment, any approved card recovery, and the amount shown on the reader."],
      ["5", "Collect card", "The parent taps, inserts, or swipes on Stripe hardware; no full card data enters The BEE Suite."],
      ["6", "Wait for ledger", "Finish only after processor status and webhook reconciliation record the payment correctly."],
    ],
    warning: "Smart readers are controlled over the network. Direct USB data use requires Stripe's Android mobile-reader SDK.",
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

function textLines(value, x, y, { size = 24, fill = "#cbd5e1", weight = 500, maxChars = 48, lineHeight = 31 } = {}) {
  return wrap(value, maxChars)
    .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" fill="${fill}" font-size="${size}" font-weight="${weight}">${escapeXml(line)}</text>`)
    .join("\n");
}

function stepCard(step, index) {
  const [number, title, body] = step;
  const column = index % 3;
  const row = Math.floor(index / 3);
  const x = 72 + column * 496;
  const y = 314 + row * 238;
  return `
    <g>
      <rect x="${x}" y="${y}" width="456" height="204" rx="24" fill="rgba(255,255,255,.075)" stroke="rgba(255,255,255,.16)"/>
      <circle cx="${x + 48}" cy="${y + 48}" r="27" fill="url(#gold)"/>
      <text x="${x + 48}" y="${y + 58}" text-anchor="middle" fill="#15100a" font-size="27" font-weight="900">${escapeXml(number)}</text>
      <text x="${x + 88}" y="${y + 58}" fill="#fff" font-size="29" font-weight="900">${escapeXml(title)}</text>
      ${textLines(body, x + 32, y + 108, { size: 22, maxChars: 38, lineHeight: 29 })}
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
  <text x="158" y="111" fill="#94a3b8" font-size="17" font-weight="700">${snapshot}</text>
  <text x="72" y="194" fill="#fff" font-size="62" font-weight="950">${escapeXml(graphic.title)}</text>
  ${textLines(graphic.subtitle, 72, 242, { size: 27, maxChars: 104, lineHeight: 35 })}
  ${graphic.steps.map(stepCard).join("\n")}
  <rect x="72" y="814" width="1456" height="118" rx="24" fill="rgba(245,181,27,.11)" stroke="rgba(245,181,27,.42)"/>
  <text x="104" y="858" fill="#fde68a" font-size="20" font-weight="900" letter-spacing=".08em">STOP / VERIFY</text>
  ${textLines(graphic.warning, 104, 895, { size: 23, fill: "#f8fafc", maxChars: 112, lineHeight: 29 })}
  <text x="72" y="972" fill="#94a3b8" font-size="18">Operational instructions only. Follow the named school's current approval, safety, privacy, billing, and support policies.</text>
  </svg>`;
}

async function renderPng(svgPath, pngPath) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(svgPath).href);
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
    const svgPath = path.join(outDir, `${graphic.id}.svg`);
    const pngPath = path.join(outDir, `${graphic.id}.png`);
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
