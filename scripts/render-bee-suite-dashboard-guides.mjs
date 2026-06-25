import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = path.join(root, "public", "brand", "the-bee-suite", "explainers");
const iconPath = path.join(root, "public", "brand", "the-bee-suite", "app-icon-yellow.png");
const width = 1600;
const height = 3000;

const colors = {
  ink: "#101827",
  body: "#263244",
  muted: "#667085",
  gold: "#f5b51b",
  gold2: "#ffd86b",
  cream: "#fffaf0",
  soft: "#fffdf8",
  line: "#e8dbc0",
  teal: "#52b69a",
  blue: "#4ea1d3",
  rose: "#d86b73",
  violet: "#8c75d9",
};

const guides = [
  {
    id: "bee-suite-director-dashboard-guide-2026-06-25",
    title: "Director Dashboard Guide",
    subtitle: "Daily steps for running tuition, families, forms, attendance, staff, and parent follow-up from The BEE Suite.",
    audience: "For directors and assistant directors",
    accent: colors.gold,
    intro: [
      "Use this as the daily operating checklist before billing, drop-off, pickup, and closeout.",
      "Confirm the family, invoice, amount, and payment method before submitting any tuition payment.",
    ],
    stepsTitle: "Daily dashboard flow",
    steps: [
      ["1", "Log in", "Use your school account, then confirm you are in the right center before working families or billing."],
      ["2", "Read the dashboard", "Review attendance, open tasks, billing readiness, parent messages, documents, staffing, and compliance alerts."],
      ["3", "Work family records", "Search or open the family. Confirm guardians, children, pickup permissions, classroom, schedule, balance, and notes."],
      ["4", "Process tuition", "Go to Billing, select the family or invoice, choose total balance or custom amount, then choose the payment method."],
      ["5", "Send parent actions", "Email payment links, instant bank verification, portal invites, document requests, forms, or reminders from the family view."],
      ["6", "Close the loop", "Check ledger entries, attendance, forms, messages, incident/document reviews, and unresolved setup items before closeout."],
    ],
    workflowTitle: "Tuition payment options directors can use today",
    workflow: [
      ["Saved card", "Charge the parent's stored debit or credit card for total balance, invoice amount, or a custom amount."],
      ["Open Card Terminal", "Take card details over the phone using Stripe's secure card entry page. Do not type card numbers into notes."],
      ["Parent payment link", "Send the parent a branded checkout link when they need to pay from their own phone or computer."],
      ["Instant Bank", "Send instant bank login verification if ACH is pending, or use verified ACH when it is ready."],
    ],
    recordsTitle: "Forms, records, and parent follow-up",
    records: [
      "Use Documents for family, child, staff, signature, upload, and expiration work.",
      "Use Parent Portal invites for parents who need login access.",
      "Use Required Checklist to see missing forms, rejected files, and expiring documents.",
      "Use Messages and Announcements for parent communication after review.",
      "Use Kiosk and Attendance to confirm check-in/out, pickup authorization, and daily attendance.",
    ],
    faqs: [
      ["How do I get tuition paid today?", "Use saved card, Open Card Terminal, or send a card payment link. Use ACH only when verified."],
      ["ACH is still pending. What now?", "Send Instant Bank verification, or have the parent pay by debit or credit card today."],
      ["Can I charge a card on file?", "Yes, when the family has a saved Stripe card and the amount/family are confirmed."],
      ["Can I process a custom amount?", "Yes. Select the family, choose custom amount, confirm the reason, then process the selected method."],
      ["How do I avoid billing the wrong family?", "Open the family record first, verify guardian and child names, invoice number, balance, and amount before checkout."],
      ["Where do I see payment history?", "Open the family billing area to view invoices, ledger entries, payments, balance, and reconciliation status."],
      ["How do parents pay themselves?", "Send a payment link or portal invite. The kiosk also shows balance and a parent portal pay link after PIN/QR lookup."],
      ["Are card and bank numbers stored here?", "No. Stripe handles sensitive payment entry. The BEE Suite stores only safe payment labels and reconciliation data."],
    ],
    footer: "Director guardrail: confirm school, family, child, invoice, amount, and payment method before charging. Fix mistakes in the ledger/invoice workflow immediately.",
  },
  {
    id: "bee-suite-parent-dashboard-guide-2026-06-25",
    title: "Parent Portal Guide",
    subtitle: "Steps for families to set up their account, pay tuition, update payment methods, view forms, and use check-in/out.",
    audience: "For parents and guardians",
    accent: colors.teal,
    intro: [
      "The parent portal is the family's home for tuition, payment methods, forms, child information, messages, and kiosk credentials.",
      "Parents can still check in/out when a balance exists. The kiosk shows the balance and a pay link after PIN/QR lookup.",
    ],
    stepsTitle: "Parent setup flow",
    steps: [
      ["1", "Open invite or login", "Use the portal invite from the school or go to The BEE Suite login page with your parent portal user."],
      ["2", "Review your family", "Confirm children, guardians, contact details, pickup permissions, classroom, schedule, and school messages."],
      ["3", "Check balance", "The billing section shows tuition balance, open invoices, payment history, and ledger activity."],
      ["4", "Pay tuition", "Choose Pay With Card for debit/credit card, or Instant Bank/ACH when bank verification is complete."],
      ["5", "Update payment info", "Save or replace a card, verify bank account, manage autopay, and keep billing contact details current."],
      ["6", "Finish forms", "Open required documents, sign forms, upload requested files, and review messages or incident acknowledgments."],
    ],
    workflowTitle: "Payment choices for parents",
    workflow: [
      ["Debit or credit card", "Use Pay With Card when tuition needs to be paid immediately today."],
      ["Instant Bank login", "Use bank login verification when ACH is pending and you want the bank verified right away."],
      ["Verified ACH", "Use ACH after verification is complete for bank account payments."],
      ["Autopay", "Set up or update autopay when offered by the school. One-time payments are still available."],
    ],
    recordsTitle: "What parents can manage in the portal",
    records: [
      "See current balance, open invoices, receipts, ledger history, and payment method status.",
      "Pay by card, verify bank instantly, set up ACH, or update saved payment information.",
      "View child details, school messages, announcements, daily reports, media, and acknowledgments.",
      "Complete required forms, signatures, uploads, registration items, and document requests.",
      "Manage kiosk PIN/QR credentials for check-in and check-out when enabled by the school.",
    ],
    faqs: [
      ["Where do I pay?", "Open Parent Portal, go to Billing, then choose Pay With Card or Instant Bank/ACH."],
      ["My bank is pending. Can I pay today?", "Yes. Use Pay With Card now, or use Instant Bank login to verify your bank immediately."],
      ["Do I have to use autopay?", "No. Autopay is optional when offered. You can also make one-time payments on open invoices."],
      ["Will check-in/out be blocked by a balance?", "No. The kiosk can show your balance and pay link while still allowing normal check-in/out."],
      ["How do I update my card?", "Go to Billing and choose the payment method setup/update option. Stripe securely saves the card."],
      ["Where are forms and documents?", "Open the portal sections for documents, forms, signatures, uploads, and acknowledgments."],
      ["Who sees my payment details?", "The school sees safe labels and payment status. Full card and bank numbers are handled securely by Stripe."],
      ["What if something looks wrong?", "Contact the school director and include the child name, invoice, payment date, and what needs corrected."],
    ],
    footer: "Parent reminder: keep your email, phone, payment method, pickup permissions, and required forms current so school records stay accurate.",
  },
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapText(value, maxChars) {
  const words = String(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textBlock(lines, x, y, options = {}) {
  const {
    size = 28,
    weight = 500,
    fill = colors.body,
    maxChars = 54,
    lineHeight = Math.round(size * 1.36),
    anchor = "start",
  } = options;
  const wrapped = Array.isArray(lines)
    ? lines.flatMap((line) => wrapText(line, maxChars))
    : wrapText(lines, maxChars);
  return wrapped.map((line, index) => (
    `<text x="${x}" y="${y + index * lineHeight}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(line)}</text>`
  )).join("\n");
}

function pill(x, y, label, fill, stroke = "none", textFill = colors.ink) {
  const w = Math.max(180, label.length * 15 + 42);
  return `
    <rect x="${x}" y="${y}" width="${w}" height="48" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="${stroke === "none" ? 0 : 2}"/>
    <text x="${x + 22}" y="${y + 32}" fill="${textFill}" font-size="23" font-weight="800">${escapeXml(label)}</text>
  `;
}

function stepCard(step, index) {
  const [number, title, body] = step;
  const col = index % 3;
  const row = Math.floor(index / 3);
  const x = 92 + col * 472;
  const y = 704 + row * 252;
  return `
    <g filter="url(#shadow)">
      <rect x="${x}" y="${y}" width="420" height="214" rx="18" fill="${colors.soft}" stroke="${colors.line}" stroke-width="2"/>
      <circle cx="${x + 48}" cy="${y + 50}" r="28" fill="${index % 2 === 0 ? colors.gold : colors.teal}"/>
      <text x="${x + 48}" y="${y + 61}" fill="${colors.ink}" font-size="30" font-weight="900" text-anchor="middle">${number}</text>
      <text x="${x + 88}" y="${y + 48}" fill="${colors.ink}" font-size="30" font-weight="900">${escapeXml(title)}</text>
      ${textBlock(body, x + 28, y + 102, { size: 22, maxChars: 34, lineHeight: 30, fill: colors.muted })}
    </g>
  `;
}

function workflowCard(item, index) {
  const [title, body] = item;
  const x = 92 + (index % 2) * 708;
  const y = 1328 + Math.floor(index / 2) * 174;
  const fills = [colors.gold, colors.blue, colors.rose, colors.violet];
  return `
    <g>
      <rect x="${x}" y="${y}" width="646" height="144" rx="18" fill="${colors.soft}" stroke="${colors.line}" stroke-width="2"/>
      <rect x="${x + 24}" y="${y + 32}" width="12" height="80" rx="6" fill="${fills[index]}"/>
      <text x="${x + 56}" y="${y + 48}" fill="${colors.ink}" font-size="27" font-weight="900">${escapeXml(title)}</text>
      ${textBlock(body, x + 56, y + 84, { size: 21, maxChars: 48, lineHeight: 28, fill: colors.muted })}
    </g>
  `;
}

function faqCard(item, index) {
  const [question, answer] = item;
  const col = index % 2;
  const row = Math.floor(index / 2);
  const x = 92 + col * 708;
  const y = 2246 + row * 150;
  return `
    <g>
      <rect x="${x}" y="${y}" width="646" height="122" rx="16" fill="${colors.soft}" stroke="${colors.line}" stroke-width="2"/>
      <text x="${x + 24}" y="${y + 34}" fill="${colors.ink}" font-size="23" font-weight="900">${escapeXml(question)}</text>
      ${textBlock(answer, x + 24, y + 68, { size: 19, maxChars: 58, lineHeight: 25, fill: colors.muted })}
    </g>
  `;
}

function renderGuide(guide, iconDataUrl) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">The BEE Suite ${escapeXml(guide.title)}</title>
  <desc id="desc">${escapeXml(guide.subtitle)}</desc>
  <defs>
    <linearGradient id="page" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#fffaf0"/>
      <stop offset="0.52" stop-color="#f8fbff"/>
      <stop offset="1" stop-color="#fff4d6"/>
    </linearGradient>
    <linearGradient id="header" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#101827"/>
      <stop offset="0.72" stop-color="#0b111d"/>
      <stop offset="1" stop-color="#2b2107"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#101827" flood-opacity="0.13"/>
    </filter>
    <pattern id="honey" width="108" height="94" patternUnits="userSpaceOnUse" patternTransform="translate(12 4)">
      <path d="M27 2h54l27 45-27 45H27L0 47z" fill="none" stroke="#f5b51b" stroke-opacity="0.18" stroke-width="3"/>
    </pattern>
    <style>
      text { font-family: Arial, Helvetica, sans-serif; letter-spacing: 0; }
    </style>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#page)"/>
  <rect width="${width}" height="392" fill="url(#header)"/>
  <rect width="${width}" height="392" fill="url(#honey)" opacity="0.48"/>

  <image href="${iconDataUrl}" x="88" y="72" width="88" height="88"/>
  <text x="198" y="108" fill="${colors.gold2}" font-size="34" font-weight="900">The BEE Suite</text>
  <text x="198" y="148" fill="#d1d7e0" font-size="24" font-weight="650">Childcare CRM &amp; Operations</text>
  ${pill(1040, 78, guide.audience, "rgba(255,250,240,0.12)", colors.gold, colors.cream)}

  <text x="88" y="248" fill="${colors.cream}" font-size="72" font-weight="900">${escapeXml(guide.title)}</text>
  ${textBlock(guide.subtitle, 92, 306, { size: 29, maxChars: 90, lineHeight: 40, fill: "#d1d7e0" })}

  <g filter="url(#shadow)">
    <rect x="92" y="438" width="1416" height="160" rx="22" fill="${colors.ink}"/>
    <circle cx="146" cy="497" r="25" fill="${guide.accent}"/>
    <text x="145" y="507" fill="${colors.ink}" font-size="24" font-weight="900" text-anchor="middle">!</text>
    ${textBlock(guide.intro, 188, 482, { size: 25, maxChars: 92, lineHeight: 36, fill: colors.cream })}
  </g>

  <text x="92" y="666" fill="${colors.ink}" font-size="40" font-weight="900">${escapeXml(guide.stepsTitle)}</text>
  ${guide.steps.map(stepCard).join("\n")}

  <text x="92" y="1278" fill="${colors.ink}" font-size="40" font-weight="900">${escapeXml(guide.workflowTitle)}</text>
  ${guide.workflow.map(workflowCard).join("\n")}

  <g filter="url(#shadow)">
    <rect x="92" y="1708" width="1416" height="394" rx="22" fill="${colors.ink}"/>
    <text x="126" y="1764" fill="${colors.gold2}" font-size="34" font-weight="900">${escapeXml(guide.recordsTitle)}</text>
    ${guide.records.map((item, index) => {
      const split = Math.ceil(guide.records.length / 2);
      const leftColumn = index < split;
      const x = leftColumn ? 126 : 804;
      const y = 1832 + (leftColumn ? index : index - split) * 86;
      return `<circle cx="${x + 8}" cy="${y - 7}" r="6" fill="${index % 2 ? colors.teal : colors.gold}"/>${textBlock(item, x + 28, y, { size: 21, maxChars: 58, lineHeight: 28, fill: colors.cream })}`;
    }).join("\n")}
  </g>

  <text x="92" y="2210" fill="${colors.ink}" font-size="40" font-weight="900">FAQs</text>
  ${guide.faqs.map(faqCard).join("\n")}

  <g filter="url(#shadow)">
    <rect x="92" y="2860" width="1416" height="108" rx="20" fill="${colors.ink}"/>
    ${textBlock(guide.footer, 126, 2912, { size: 22, maxChars: 126, lineHeight: 30, fill: colors.cream })}
  </g>
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

  for (const guide of guides) {
    const svg = renderGuide(guide, iconDataUrl);
    const svgPath = path.join(outDir, `${guide.id}.svg`);
    const pngPath = path.join(outDir, `${guide.id}.png`);
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
