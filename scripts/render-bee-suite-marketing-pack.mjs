import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const runDir = path.join(root, "outputs", "marketing", "the-bee-suite-creative-pack-2026-06-16");
const sourceDir = path.join(runDir, "source", "generated-layers");
const exportDir = path.join(runDir, "exports");
const reviewPath = path.join(runDir, "review-board.html");
const manifestPath = path.join(runDir, "manifest.json");
const logoPath = path.join(root, "public", "brand", "the-bee-suite", "logo-primary-horizontal-white.png");
const iconPath = path.join(root, "public", "brand", "the-bee-suite", "app-icon-yellow.png");

const cards = [
  {
    id: "real-school-days",
    title: "The childcare command center built for real school days.",
    eyebrow: "REAL SCHOOL DAYS",
    body: "Enrollment, classrooms, parent communication, billing readiness, compliance support, and reporting in one role-safe suite.",
    cta: "Request a workspace",
    bg: "real-school-days-bg.png",
    accent: "#f5b51b",
    chips: ["Owners", "Directors", "Teachers", "Parents"],
  },
  {
    id: "inquiry-to-enrolled-family",
    title: "Do not let the next enrolled family get lost in the inbox.",
    eyebrow: "INQUIRY TO ENROLLED FAMILY",
    body: "Track every inquiry, tour, registration packet, family handoff, and follow-up from one childcare CRM workspace.",
    cta: "See the enrollment workflow",
    bg: "inquiry-to-enrolled-family-bg.png",
    accent: "#f59e0b",
    chips: ["Inquiries", "Tours", "Packets", "Follow-up"],
  },
  {
    id: "role-safe-operations",
    title: "Every role sees what they need. Nothing more.",
    eyebrow: "ROLE-SAFE OPERATIONS",
    body: "Support executives, owners, directors, teachers, parents, auditors, and pickup users with properly scoped access.",
    cta: "Review the access model",
    bg: "role-safe-operations-bg.png",
    accent: "#38bdf8",
    chips: ["Tenant", "Brand", "Center", "Classroom"],
  },
  {
    id: "helpful-drafts-human-decisions",
    title: "Helpful drafts. Human decisions.",
    eyebrow: "MR. BEE AI ASSISTANT",
    body: "Mr. Bee can draft parent replies and summarize leads while sensitive school decisions stay with authorized staff.",
    cta: "Use AI with guardrails",
    bg: "helpful-drafts-human-decisions-bg.png",
    accent: "#a78bfa",
    chips: ["Drafts", "Summaries", "Review", "Control"],
  },
];

async function imageDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  const data = await readFile(filePath);
  return `data:${mime};base64,${data.toString("base64")}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cardHtml(card, assets) {
  const background = assets.backgrounds[card.bg];
  const logo = assets.logo;
  const icon = assets.icon;
  const chips = card.chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(card.title)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 1080px;
      height: 1080px;
      overflow: hidden;
      background: #05070a;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: white;
    }

    .card {
      position: relative;
      width: 1080px;
      height: 1080px;
      overflow: hidden;
      background: #05070a;
    }

    .bg {
      position: absolute;
      inset: 0;
      background-image: url("${background}");
      background-size: cover;
      background-position: center;
      transform: scale(1.022);
      filter: saturate(1.05) contrast(1.04);
    }

    .shade {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 16% 18%, color-mix(in srgb, ${card.accent} 24%, transparent), transparent 19rem),
        linear-gradient(90deg, rgba(5,7,10,0.96) 0%, rgba(5,7,10,0.86) 31%, rgba(5,7,10,0.34) 61%, rgba(5,7,10,0.12) 100%),
        linear-gradient(0deg, rgba(5,7,10,0.86) 0%, rgba(5,7,10,0.08) 45%, rgba(5,7,10,0.22) 100%);
    }

    .hive {
      position: absolute;
      inset: -80px auto auto -60px;
      width: 440px;
      height: 540px;
      opacity: 0.24;
      background-image:
        linear-gradient(30deg, color-mix(in srgb, ${card.accent} 28%, transparent) 12%, transparent 12.5%, transparent 87%, color-mix(in srgb, ${card.accent} 28%, transparent) 87.5%, color-mix(in srgb, ${card.accent} 28%, transparent)),
        linear-gradient(150deg, color-mix(in srgb, ${card.accent} 24%, transparent) 12%, transparent 12.5%, transparent 87%, color-mix(in srgb, ${card.accent} 24%, transparent) 87.5%, color-mix(in srgb, ${card.accent} 24%, transparent)),
        linear-gradient(30deg, color-mix(in srgb, ${card.accent} 18%, transparent) 12%, transparent 12.5%, transparent 87%, color-mix(in srgb, ${card.accent} 18%, transparent) 87.5%, color-mix(in srgb, ${card.accent} 18%, transparent)),
        linear-gradient(150deg, color-mix(in srgb, ${card.accent} 18%, transparent) 12%, transparent 12.5%, transparent 87%, color-mix(in srgb, ${card.accent} 18%, transparent) 87.5%, color-mix(in srgb, ${card.accent} 18%, transparent));
      background-position: 0 0, 0 0, 21px 36px, 21px 36px;
      background-size: 42px 72px;
      mask-image: linear-gradient(120deg, black, transparent 75%);
    }

    .content {
      position: absolute;
      inset: 64px 60px 56px 60px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      max-width: 650px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 18px;
    }

    .logo img.wordmark {
      width: 286px;
      height: auto;
      display: block;
    }

    .logo img.icon {
      width: 54px;
      height: 54px;
      display: block;
      border-radius: 14px;
      box-shadow: 0 0 34px rgba(245,181,27,0.24);
    }

    .copy {
      margin-top: 88px;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      color: ${card.accent};
      font-size: 18px;
      line-height: 1;
      font-weight: 800;
      text-transform: uppercase;
    }

    .eyebrow::before {
      content: "";
      width: 46px;
      height: 2px;
      border-radius: 999px;
      background: ${card.accent};
      box-shadow: 0 0 18px color-mix(in srgb, ${card.accent} 60%, transparent);
    }

    h1 {
      margin: 28px 0 0;
      max-width: 640px;
      font-size: 72px;
      line-height: 0.96;
      font-weight: 760;
      letter-spacing: 0;
      text-wrap: balance;
    }

    .body {
      margin: 30px 0 0;
      max-width: 560px;
      color: rgba(244,244,245,0.84);
      font-size: 27px;
      line-height: 1.34;
      font-weight: 470;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 34px;
      max-width: 590px;
    }

    .chips span {
      display: inline-flex;
      align-items: center;
      min-height: 42px;
      padding: 0 16px;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 999px;
      background: rgba(255,255,255,0.075);
      color: rgba(255,255,255,0.88);
      font-size: 16px;
      font-weight: 700;
      backdrop-filter: blur(18px);
    }

    .bottom {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 28px;
      max-width: 780px;
    }

    .cta {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      min-height: 58px;
      padding: 0 24px;
      border-radius: 16px;
      background: ${card.accent};
      color: #101318;
      font-size: 19px;
      font-weight: 820;
      box-shadow: 0 0 38px color-mix(in srgb, ${card.accent} 32%, transparent);
    }

    .cta::after {
      content: "→";
      font-size: 23px;
      line-height: 1;
      transform: translateY(-1px);
    }

    .url {
      color: rgba(255,255,255,0.76);
      font-size: 18px;
      font-weight: 760;
      text-align: right;
    }

    .review-note {
      margin-top: 6px;
      color: rgba(255,255,255,0.42);
      font-size: 10px;
      font-weight: 620;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="bg"></div>
    <div class="shade"></div>
    <div class="hive"></div>
    <section class="content">
      <div>
        <div class="logo">
          <img class="icon" src="${icon}" alt="" />
          <img class="wordmark" src="${logo}" alt="The BEE Suite" />
        </div>
        <div class="copy">
          <div class="eyebrow">${escapeHtml(card.eyebrow)}</div>
          <h1>${escapeHtml(card.title)}</h1>
          <p class="body">${escapeHtml(card.body)}</p>
          <div class="chips">${chips}</div>
        </div>
      </div>
      <div class="bottom">
        <div class="cta">${escapeHtml(card.cta)}</div>
        <div>
          <div class="url">TheBeeSuite.io</div>
          <div class="review-note">Generated visual layer + locked brand copy</div>
        </div>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function reviewHtml() {
  const items = cards.map((card) => {
    const src = `exports/${card.id}.png`;
    return `<article>
      <a href="${src}"><img src="${src}" alt="${escapeHtml(card.title)}" /></a>
      <div class="meta">
        <strong>${escapeHtml(card.eyebrow)}</strong>
        <span>${escapeHtml(card.title)}</span>
      </div>
    </article>`;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>The BEE Suite Creative Marketing Graphics Pack</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #05070a;
      color: white;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      padding: 42px 44px 26px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      background:
        radial-gradient(circle at 14% 0%, rgba(245,181,27,0.17), transparent 24rem),
        linear-gradient(135deg, #080b0f, #05070a);
    }
    h1 {
      margin: 0;
      font-size: 34px;
      line-height: 1.1;
      letter-spacing: 0;
    }
    p {
      max-width: 780px;
      color: rgba(255,255,255,0.68);
      line-height: 1.6;
      margin: 14px 0 0;
      font-size: 15px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 22px;
      padding: 34px;
    }
    article {
      border: 1px solid rgba(255,255,255,0.11);
      border-radius: 14px;
      overflow: hidden;
      background: rgba(255,255,255,0.04);
      box-shadow: 0 18px 70px rgba(0,0,0,0.28);
    }
    img {
      display: block;
      width: 100%;
      height: auto;
      background: #111;
    }
    .meta {
      display: grid;
      gap: 8px;
      padding: 16px 18px 18px;
    }
    strong {
      color: #f5b51b;
      font-size: 12px;
    }
    span {
      color: rgba(255,255,255,0.86);
      font-size: 14px;
      line-height: 1.35;
    }
  </style>
</head>
<body>
  <header>
    <h1>The BEE Suite Creative Marketing Graphics Pack</h1>
    <p>Four square campaign graphics using generated background layers with deterministic brand, copy, CTA, and review language overlaid in HTML/CSS.</p>
  </header>
  <section class="grid">${items}</section>
</body>
</html>`;
}

await mkdir(exportDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });

const assets = {
  logo: await imageDataUrl(logoPath),
  icon: await imageDataUrl(iconPath),
  backgrounds: Object.fromEntries(
    await Promise.all(cards.map(async (card) => [card.bg, await imageDataUrl(path.join(sourceDir, card.bg))])),
  ),
};

for (const card of cards) {
  await page.setContent(cardHtml(card, assets), { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(exportDir, `${card.id}.png`), type: "png" });
}

await browser.close();

await writeFile(reviewPath, reviewHtml(), "utf8");

const manifest = {
  title: "The BEE Suite Creative Marketing Graphics Pack",
  createdAt: "2026-06-16",
  strategy: "Warm Command Center",
  outputDirectory: path.relative(root, runDir),
  mode: "Generative background layers with deterministic brand/copy composition",
  assets: cards.map((card) => ({
    id: card.id,
    headline: card.title,
    campaign: card.eyebrow,
    sourceLayer: path.join("source", "generated-layers", card.bg).replaceAll("\\", "/"),
    export: path.join("exports", `${card.id}.png`).replaceAll("\\", "/"),
    dimensions: "1080x1080",
    reviewStatus: "draft",
    notes: "Generated visual layer; exact text, CTA, logo, chips, and URL are deterministic HTML/CSS overlays.",
  })),
  copyGuardrails: [
    "Do not treat ImageGen-rendered UI or documents as final product proof.",
    "Use deterministic overlays for all public claims and text.",
    "Avoid compliance, safety, legal, medical, custody, billing, or licensing guarantees.",
    "Anonymize all real child, family, staff, school, billing, custody, and medical data before replacing generated scenes with real screenshots or photos.",
  ],
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Rendered ${cards.length} marketing graphics to ${exportDir}`);
console.log(`Review board: ${reviewPath}`);
