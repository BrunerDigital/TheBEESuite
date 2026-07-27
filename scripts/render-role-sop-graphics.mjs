import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const sourceDir = path.join(
  root,
  "public",
  "brand",
  "the-bee-suite",
  "screenshots",
  "2026-07-27-light",
);
const outDir = path.join(
  root,
  "public",
  "brand",
  "the-bee-suite",
  "sop-graphics",
  "2026-07-27",
);
const iconPath = path.join(root, "public", "brand", "the-bee-suite", "app-icon-yellow.png");
const width = 1600;
const height = 1000;

const colors = {
  ink: "#111827",
  body: "#344054",
  muted: "#667085",
  gold: "#f5b51b",
  goldSoft: "#fff4cf",
  cream: "#fffdf7",
  line: "#eadfca",
  white: "#ffffff",
  teacher: "#0f766e",
  director: "#b45309",
  executive: "#4338ca",
  parent: "#be185d",
};

const graphics = [
  {
    id: "teacher-classroom-device-guide",
    eyebrow: "TEACHER SOP",
    title: "Classroom work stays visible and verified",
    subtitle: "Use the iPad for in-room work. Desktop remains available for review and follow-up.",
    accent: colors.teacher,
    deviceLabel: "iPad primary • Desktop supported",
    screens: [
      {
        src: "teacher-ipad-daily-report-light.png",
        x: 72,
        y: 232,
        width: 516,
        height: 688,
        radius: 32,
        label: "iPad • Daily report",
      },
      {
        src: "teacher-desktop-roster-light.png",
        x: 624,
        y: 232,
        width: 720,
        height: 500,
        radius: 24,
        label: "Desktop • Classroom roster",
      },
    ],
    steps: [
      ["1", "Confirm scope", "Verify your name, school, classroom, and roster before recording anything."],
      ["2", "Record the day", "Use attendance, meals, naps, potty, activities, mood, supplies, and notes."],
      ["3", "Check save state", "Verify the correct child, date, and saved or synced state before moving on."],
      ["4", "Escalate safely", "Send incidents and roster or safety conflicts to the director for review."],
    ],
  },
  {
    id: "director-desktop-operations-guide",
    eyebrow: "DIRECTOR SOP",
    title: "Operate the school from one verified desktop",
    subtitle: "Confirm school context first, then move from operating pulse to the exact family, billing, or compliance record.",
    accent: colors.director,
    deviceLabel: "Desktop required",
    screens: [
      {
        src: "director-desktop-reports-light.png",
        x: 72,
        y: 232,
        width: 730,
        height: 507,
        radius: 24,
        label: "Desktop • Daily reports",
      },
      {
        src: "director-desktop-billing-light.png",
        x: 830,
        y: 232,
        width: 698,
        height: 485,
        radius: 24,
        label: "Desktop • Billing and invoices",
      },
    ],
    steps: [
      ["1", "Verify school", "Confirm the assigned location, local time, staffing, attendance, and current exceptions."],
      ["2", "Open exact context", "Check family, child, invoice, classroom, or record identifiers before editing."],
      ["3", "Review outcomes", "Reconcile balances, payment status, reports, incidents, documents, and queued actions."],
      ["4", "Close with an owner", "Leave every unresolved item with a named person, next action, and follow-up time."],
    ],
  },
  {
    id: "executive-desktop-oversight-guide",
    eyebrow: "EXECUTIVE SOP",
    title: "Review trends, scope, and weekly FTE on desktop",
    subtitle: "Use the executive view for authorized rollups, school comparison, corrections, approvals, and exports.",
    accent: colors.executive,
    deviceLabel: "Desktop required",
    screens: [
      {
        src: "executive-desktop-admin-light.png",
        x: 72,
        y: 232,
        width: 730,
        height: 507,
        radius: 24,
        label: "Desktop • Executive admin",
      },
      {
        src: "executive-desktop-fte-light.png",
        x: 830,
        y: 232,
        width: 698,
        height: 485,
        radius: 24,
        label: "Desktop • Weekly FTE",
      },
    ],
    steps: [
      ["1", "Confirm scope", "Verify brand, region, school access, reporting period, and data-as-of time."],
      ["2", "Review rollups", "Compare enrollment, occupancy, billing, staffing, compliance, and follow-up trends."],
      ["3", "Validate FTE", "Check the intended week, missing schools, totals, corrections, and approval state."],
      ["4", "Export deliberately", "Use reviewed filters and retain the report period and scope with every export."],
    ],
  },
  {
    id: "parent-multidevice-portal-guide",
    eyebrow: "PARENT SOP",
    title: "Your family portal, led by iPhone",
    subtitle: "Use iPhone for everyday updates and payments. The same portal also adapts to iPad and desktop.",
    accent: colors.parent,
    deviceLabel: "iPhone primary • iPad + desktop supported",
    phoneScreens: [
      ["parent-iphone-overview-light.png", "Family overview"],
      ["parent-iphone-daily-reports-light.png", "Daily report"],
      ["parent-iphone-billing-light.png", "Billing history"],
    ],
    steps: [
      ["1", "Verify family", "Confirm the school, family, child, and selected day before using an update."],
      ["2", "Review the day", "Open reports, activities, photos, meals, naps, care details, and teacher notes."],
      ["3", "Use Billing", "Check the invoice, payment status, amount, and ledger before starting a payment."],
      ["4", "Protect access", "Use only your guardian login and contact the school when a record looks wrong."],
    ],
  },
  {
    id: "role-device-standards-guide",
    eyebrow: "SCREENSHOT + TRAINING STANDARD",
    title: "Show each role on the device they actually use",
    subtitle: "All approved July 27 visuals use current light-mode screens, synthetic demo records, and no warning banners.",
    accent: colors.gold,
    deviceLabel: "Current visual standard • July 27, 2026",
    roleCards: [
      {
        role: "Teachers",
        device: "iPad + desktop",
        note: "Lead with the iPad classroom workflow; add desktop for review.",
        src: "teacher-ipad-roster-light.png",
        accent: colors.teacher,
      },
      {
        role: "Directors",
        device: "Desktop",
        note: "Show school operations, family context, billing, and exceptions.",
        src: "director-desktop-billing-light.png",
        accent: colors.director,
      },
      {
        role: "Executives",
        device: "Desktop",
        note: "Show authorized rollups, comparisons, weekly FTE, and exports.",
        src: "executive-desktop-fte-light.png",
        accent: colors.executive,
      },
      {
        role: "Parents",
        device: "iPhone first",
        note: "Use iPhone most often; include iPad and desktop for responsive coverage.",
        src: "parent-iphone-overview-light.png",
        accent: colors.parent,
      },
    ],
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

function textBlock(value, x, y, options = {}) {
  const {
    size = 24,
    weight = 500,
    fill = colors.body,
    maxChars = 54,
    lineHeight = Math.round(size * 1.32),
    anchor = "start",
  } = options;
  return wrap(value, maxChars)
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(line)}</text>`,
    )
    .join("\n");
}

function header(graphic, iconDataUrl) {
  return `
    <image href="${iconDataUrl}" x="72" y="48" width="58" height="58"/>
    <text x="150" y="73" fill="${graphic.accent}" font-size="18" font-weight="900" letter-spacing=".12em">THE BEE SUITE • ${escapeXml(graphic.eyebrow)}</text>
    <text x="150" y="99" fill="${colors.muted}" font-size="16" font-weight="700">CURRENT LIGHT-MODE VISUALS • JULY 27, 2026</text>
    <rect x="1128" y="54" width="400" height="46" rx="23" fill="${graphic.accent}" opacity=".12"/>
    <text x="1328" y="83" fill="${graphic.accent}" font-size="18" font-weight="850" text-anchor="middle">${escapeXml(graphic.deviceLabel)}</text>
    <text x="72" y="166" fill="${colors.ink}" font-size="52" font-weight="950">${escapeXml(graphic.title)}</text>
    ${textBlock(graphic.subtitle, 72, 208, { size: 23, maxChars: 104, lineHeight: 30 })}
  `;
}

function defs() {
  return `
    <defs>
      <linearGradient id="page" x1="0" x2="1" y1="0" y2="1">
        <stop stop-color="#fffdf8"/>
        <stop offset=".58" stop-color="#f8fbff"/>
        <stop offset="1" stop-color="#fff5da"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#111827" flood-opacity=".14"/>
      </filter>
      <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse">
        <path d="M56 0H0V56" fill="none" stroke="#f5b51b" stroke-opacity=".07"/>
      </pattern>
      <style>text{font-family:Inter,Arial,sans-serif;letter-spacing:0}</style>
    </defs>
  `;
}

function stepStrip(graphic) {
  return graphic.steps
    .map(([number, title, body], index) => {
      const x = 72 + index * 364;
      return `
        <g>
          <rect x="${x}" y="770" width="338" height="168" rx="22" fill="${colors.white}" stroke="${colors.line}" stroke-width="2"/>
          <circle cx="${x + 38}" cy="808" r="23" fill="${graphic.accent}"/>
          <text x="${x + 38}" y="816" fill="#fff" font-size="22" font-weight="900" text-anchor="middle">${number}</text>
          <text x="${x + 72}" y="816" fill="${colors.ink}" font-size="23" font-weight="900">${escapeXml(title)}</text>
          ${textBlock(body, x + 24, 856, { size: 18, maxChars: 34, lineHeight: 24, fill: colors.muted })}
        </g>`;
    })
    .join("\n");
}

function screenFrame(screen, dataUrl, index) {
  const labelWidth = Math.max(220, screen.label.length * 11 + 42);
  return `
    <g filter="url(#shadow)">
      <clipPath id="screen-${index}">
        <rect x="${screen.x}" y="${screen.y}" width="${screen.width}" height="${screen.height}" rx="${screen.radius}"/>
      </clipPath>
      <rect x="${screen.x - 8}" y="${screen.y - 8}" width="${screen.width + 16}" height="${screen.height + 16}" rx="${screen.radius + 7}" fill="#121826"/>
      <image href="${dataUrl}" x="${screen.x}" y="${screen.y}" width="${screen.width}" height="${screen.height}" preserveAspectRatio="xMidYMin slice" clip-path="url(#screen-${index})"/>
      <rect x="${screen.x + 18}" y="${screen.y + 18}" width="${labelWidth}" height="38" rx="19" fill="#111827" opacity=".9"/>
      <text x="${screen.x + 36}" y="${screen.y + 44}" fill="#fff" font-size="17" font-weight="800">${escapeXml(screen.label)}</text>
    </g>`;
}

async function renderStandardGuide(graphic, iconDataUrl, imageData) {
  const screenMarkup = graphic.screens
    .map((screen, index) => screenFrame(screen, imageData.get(screen.src), index))
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${defs()}
    <rect width="${width}" height="${height}" fill="url(#page)"/>
    <rect width="${width}" height="${height}" fill="url(#grid)"/>
    ${header(graphic, iconDataUrl)}
    ${screenMarkup}
    ${stepStrip(graphic)}
  </svg>`;
}

function phoneFrame(src, label, x, dataUrl, index) {
  return `
    <g filter="url(#shadow)">
      <clipPath id="phone-${index}">
        <rect x="${x}" y="250" width="280" height="606" rx="36"/>
      </clipPath>
      <rect x="${x - 10}" y="240" width="300" height="626" rx="46" fill="#111827"/>
      <rect x="${x + 94}" y="250" width="92" height="18" rx="9" fill="#111827"/>
      <image href="${dataUrl}" x="${x}" y="250" width="280" height="606" preserveAspectRatio="xMidYMin slice" clip-path="url(#phone-${index})"/>
      <rect x="${x + 34}" y="810" width="212" height="34" rx="17" fill="#111827" opacity=".92"/>
      <text x="${x + 140}" y="833" fill="#fff" font-size="16" font-weight="850" text-anchor="middle">${escapeXml(label)}</text>
    </g>`;
}

async function renderParentGuide(graphic, iconDataUrl, imageData) {
  const phones = graphic.phoneScreens
    .map(([src, label], index) => phoneFrame(src, label, 72 + index * 322, imageData.get(src), index))
    .join("\n");
  const steps = graphic.steps
    .map(([number, title, body], index) => {
      const y = 282 + index * 146;
      return `
        <circle cx="1098" cy="${y}" r="24" fill="${graphic.accent}"/>
        <text x="1098" y="${y + 8}" fill="#fff" font-size="22" font-weight="900" text-anchor="middle">${number}</text>
        <text x="1140" y="${y + 2}" fill="${colors.ink}" font-size="25" font-weight="900">${escapeXml(title)}</text>
        ${textBlock(body, 1140, y + 38, { size: 19, maxChars: 34, lineHeight: 25, fill: colors.muted })}
      `;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${defs()}
    <rect width="${width}" height="${height}" fill="url(#page)"/>
    <rect width="${width}" height="${height}" fill="url(#grid)"/>
    ${header(graphic, iconDataUrl)}
    ${phones}
    <rect x="1052" y="248" width="476" height="618" rx="30" fill="#fff" stroke="${colors.line}" stroke-width="2"/>
    ${steps}
    <rect x="1052" y="892" width="476" height="48" rx="24" fill="${graphic.accent}" opacity=".12"/>
    <text x="1290" y="923" fill="${graphic.accent}" font-size="18" font-weight="900" text-anchor="middle">The same verified family record follows every screen.</text>
  </svg>`;
}

async function renderDeviceStandards(graphic, iconDataUrl, imageData) {
  const cards = graphic.roleCards
    .map((card, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 72 + col * 764;
      const y = 250 + row * 344;
      const screenshotWidth = card.role === "Parents" || card.role === "Teachers" ? 174 : 306;
      const screenshotHeight = 248;
      const copyX = x + screenshotWidth + 48;
      return `
        <g filter="url(#shadow)">
          <rect x="${x}" y="${y}" width="728" height="310" rx="26" fill="#fff" stroke="${colors.line}" stroke-width="2"/>
          <clipPath id="role-${index}">
            <rect x="${x + 24}" y="${y + 24}" width="${screenshotWidth}" height="${screenshotHeight}" rx="18"/>
          </clipPath>
          <rect x="${x + 18}" y="${y + 18}" width="${screenshotWidth + 12}" height="${screenshotHeight + 12}" rx="24" fill="#111827"/>
          <image href="${imageData.get(card.src)}" x="${x + 24}" y="${y + 24}" width="${screenshotWidth}" height="${screenshotHeight}" preserveAspectRatio="xMidYMin slice" clip-path="url(#role-${index})"/>
          <rect x="${copyX}" y="${y + 34}" width="${card.role.length * 18 + 44}" height="42" rx="21" fill="${card.accent}" opacity=".13"/>
          <text x="${copyX + 20}" y="${y + 63}" fill="${card.accent}" font-size="22" font-weight="900">${escapeXml(card.role)}</text>
          <text x="${copyX}" y="${y + 114}" fill="${colors.ink}" font-size="31" font-weight="950">${escapeXml(card.device)}</text>
          ${textBlock(card.note, copyX, y + 158, { size: 21, maxChars: card.role === "Parents" || card.role === "Teachers" ? 35 : 26, lineHeight: 29, fill: colors.muted })}
          <text x="${copyX}" y="${y + 260}" fill="${card.accent}" font-size="17" font-weight="850">LIGHT MODE • CURRENT UI • NO WARNING BANNERS</text>
        </g>`;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${defs()}
    <rect width="${width}" height="${height}" fill="url(#page)"/>
    <rect width="${width}" height="${height}" fill="url(#grid)"/>
    ${header(graphic, iconDataUrl)}
    ${cards}
    <rect x="72" y="946" width="1456" height="3" rx="2" fill="${colors.gold}"/>
    <text x="72" y="980" fill="${colors.muted}" font-size="18">Use these device priorities for SOPs, resource cards, training packets, and future screenshot refreshes.</text>
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
  const iconDataUrl = `data:image/png;base64,${(await readFile(iconPath)).toString("base64")}`;
  const imageData = new Map();
  for (const graphic of graphics) {
    const sources = [
      ...(graphic.screens?.map((screen) => screen.src) ?? []),
      ...(graphic.phoneScreens?.map(([src]) => src) ?? []),
      ...(graphic.roleCards?.map((card) => card.src) ?? []),
    ];
    for (const src of sources) {
      if (!imageData.has(src)) {
        const bytes = await readFile(path.join(sourceDir, src));
        imageData.set(src, `data:image/png;base64,${bytes.toString("base64")}`);
      }
    }

    let svg;
    if (graphic.phoneScreens) {
      svg = await renderParentGuide(graphic, iconDataUrl, imageData);
    } else if (graphic.roleCards) {
      svg = await renderDeviceStandards(graphic, iconDataUrl, imageData);
    } else {
      svg = await renderStandardGuide(graphic, iconDataUrl, imageData);
    }

    const svgPath = path.join(outDir, `${graphic.id}.svg`);
    const pngPath = path.join(outDir, `${graphic.id}.png`);
    svg = svg.replace(/[ \t]+(?=\r?$)/gm, "");
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
