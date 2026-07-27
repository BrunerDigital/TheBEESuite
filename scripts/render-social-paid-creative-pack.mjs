import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const releaseDate = "2026-07-27";
const releaseVersion = `${releaseDate}-v3`;
const publicDir = path.join(
  root,
  "public",
  "brand",
  "the-bee-suite",
  "marketing",
  releaseVersion,
);
const outputDir = path.join(
  root,
  "outputs",
  "marketing",
  `the-bee-suite-social-paid-pack-${releaseDate}`,
);
const logoPath = path.join(
  root,
  "public",
  "brand",
  "the-bee-suite",
  "logo-primary-horizontal-white.png",
);
const iconPath = path.join(
  root,
  "public",
  "brand",
  "the-bee-suite",
  "app-icon-yellow.png",
);

const formats = {
  square: {
    width: 1080,
    height: 1080,
    placements: ["Instagram feed", "Facebook feed", "LinkedIn feed"],
  },
  portrait: {
    width: 1080,
    height: 1350,
    placements: ["Instagram portrait feed", "Facebook feed", "LinkedIn feed"],
  },
  story: {
    width: 1080,
    height: 1920,
    placements: ["Instagram Stories", "Facebook Stories", "Instagram Reels", "TikTok"],
  },
  landscape: {
    width: 1200,
    height: 628,
    placements: ["LinkedIn sponsored content", "Facebook link ad"],
  },
};

const googleFormats = {
  "google-square-clean": {
    width: 1200,
    height: 1200,
    placements: ["Google Demand Gen image asset", "Google responsive display image asset"],
  },
  "google-landscape-clean": {
    width: 1200,
    height: 628,
    placements: ["Google Demand Gen image asset", "Google responsive display image asset"],
  },
};

const allFormats = { ...formats, ...googleFormats };

const googleCopyByConcept = {
  "one-suite-school-day": {
    shortHeadlines: [
      "One Suite for Childcare",
      "Connect the Whole School Day",
      "Childcare Operations, Clear",
      "One Workspace for Every Role",
      "See The BEE Suite",
    ],
    longHeadline: "Connect the whole childcare day in one role-safe operating workspace",
    descriptions: [
      "Connect directors, classrooms, families, billing readiness, and reporting.",
      "Give every role a clear workspace built around the real childcare day.",
      "Bring school operations and family workflows into one connected suite.",
      "Explore childcare CRM and operations designed around real school roles.",
    ],
  },
  "parents-informed-teachers-focused": {
    shortHeadlines: [
      "Keep Families Informed",
      "Help Teachers Stay Focused",
      "A Clearer Daily Report",
      "Connect Classroom to Family",
      "See the Daily Flow",
    ],
    longHeadline: "Connect classroom documentation with a clear family daily-report workflow",
    descriptions: [
      "Give teachers a practical iPad workflow and families a clear mobile view.",
      "Move daily reports through one school-approved classroom-to-family flow.",
      "Help teachers document the day without losing focus on the classroom.",
      "Give families one clear place to review school-approved daily updates.",
    ],
  },
  "right-view-every-role": {
    shortHeadlines: [
      "The Right View for Every Role",
      "Role-Safe Childcare Tools",
      "Clear Access by School Role",
      "One Suite, Purpose-Built Views",
      "Explore Role-Safe Operations",
    ],
    longHeadline: "Give executives, directors, teachers, and parents the right view for their role",
    descriptions: [
      "Keep each role in the school and family context designed for its work.",
      "Support executive, director, teacher, and parent workflows in one suite.",
      "Build clearer childcare operations around role and school boundaries.",
      "Explore purpose-built views for every role across the childcare day.",
    ],
  },
  "every-school-clearly": {
    shortHeadlines: [
      "See Every School Clearly",
      "Multi-Location Childcare View",
      "Executive Visibility by School",
      "Keep Location Context Clear",
      "Explore the Executive View",
    ],
    longHeadline: "Review multi-location childcare operations without losing school-level context",
    descriptions: [
      "Review organization-wide signals while keeping each school clearly in view.",
      "Bring executive dashboards and FTE reporting into one operating workspace.",
      "See location-level reporting and operational context across the organization.",
      "Explore an executive workspace designed for multi-location childcare teams.",
    ],
  },
  "billing-connected": {
    shortHeadlines: [
      "Connect Childcare Billing",
      "Keep Tuition Context Clear",
      "A Clearer Billing Workflow",
      "Billing in the School Record",
      "Explore Connected Billing",
    ],
    longHeadline: "Keep weekly tuition, invoices, payment status, and family history connected",
    descriptions: [
      "Review tuition, invoices, payment status, and family history in one workflow.",
      "Keep childcare billing connected to the right child and school record.",
      "Give authorized teams clearer school-scoped context around family billing.",
      "Explore a connected billing workflow built into childcare operations.",
    ],
  },
  "launch-by-feature": {
    shortHeadlines: [
      "Launch Childcare Tech Clearly",
      "Roll Out by School and Feature",
      "Use Independent Launch Gates",
      "A School-Ready Rollout",
      "See the Launch Framework",
    ],
    longHeadline: "Use independent readiness gates for every school, feature, and rollout stage",
    descriptions: [
      "Separate setup, parent access, kiosk, billing, payments, and rollout gates.",
      "Give each school and feature a clear readiness decision before launch.",
      "Use a deliberate framework for childcare software implementation.",
      "Explore a school-ready rollout framework built for childcare teams.",
    ],
  },
};

const concepts = [
  {
    id: "one-suite-school-day",
    eyebrow: "BUILT FOR REAL SCHOOL DAYS",
    headline: "One suite for the whole school day.",
    body: "Connect directors, classrooms, families, billing readiness, and reporting in one role-safe workspace.",
    cta: "See The BEE Suite",
    audience: "Childcare owners, operators, and center directors",
    goal: "Broad awareness and qualified workspace requests",
    accent: "#f5b51b",
    googleAsset: "screenshots/2026-07-27-light/director-desktop-dashboard-light.png",
    assets: [
      {
        path: "screenshots/2026-07-27-light/director-desktop-dashboard-light.png",
        kind: "desktop",
        label: "DIRECTOR DESKTOP",
      },
      {
        path: "screenshots/2026-07-27-light/teacher-ipad-daily-report-light.png",
        kind: "tablet",
        label: "TEACHER IPAD",
      },
      {
        path: "screenshots/2026-07-27-light/parent-iphone-overview-light.png",
        kind: "phone",
        label: "PARENT IPHONE",
      },
    ],
    organicCaption:
      "Childcare teams should not have to rebuild the school day across disconnected tabs. The BEE Suite connects director operations, classroom work, parent updates, billing readiness, and reporting in one role-safe workspace.",
    paidPrimary:
      "Bring the school day into one connected operating workspace built for childcare owners, directors, teachers, and families.",
    paidHeadline: "One suite for the whole school day",
    paidDescription: "Childcare CRM and operations built around real roles and real school workflows.",
    hashtags: ["#ChildcareOperations", "#ChildcareCRM", "#EarlyEducation", "#SchoolLeadership"],
  },
  {
    id: "parents-informed-teachers-focused",
    eyebrow: "CLASSROOM TO FAMILY",
    headline: "Parents stay informed. Teachers stay focused.",
    body: "Daily reports and classroom updates move through one clear, school-approved family workflow.",
    cta: "See the daily flow",
    audience: "Center directors, education leaders, and school operators",
    goal: "Feature awareness and teacher-parent workflow interest",
    accent: "#22c7b8",
    googleAsset: "screenshots/2026-07-27-light/teacher-ipad-daily-report-light.png",
    assets: [
      {
        path: "screenshots/2026-07-27-light/teacher-ipad-daily-report-light.png",
        kind: "tablet",
        label: "TEACHER IPAD",
      },
      {
        path: "screenshots/2026-07-27-light/parent-iphone-overview-light.png",
        kind: "phone",
        label: "PARENT IPHONE",
      },
    ],
    organicCaption:
      "The daily report should support the classroom—not interrupt it. Teachers record the day on iPad, and families review clear updates from the same school-approved portal.",
    paidPrimary:
      "Give teachers a practical classroom workflow and families a clearer place to review daily updates.",
    paidHeadline: "Parents informed. Teachers focused.",
    paidDescription: "Connect classroom documentation with the family portal.",
    hashtags: ["#ChildcareTeachers", "#ParentCommunication", "#PreschoolLeadership", "#EdTech"],
  },
  {
    id: "right-view-every-role",
    eyebrow: "ROLE-SAFE BY DESIGN",
    headline: "The right view for every role.",
    body: "Executives, directors, teachers, and parents each work in the scope designed for them.",
    cta: "Explore role-safe operations",
    audience: "Multi-location owners, franchise teams, and operational leaders",
    goal: "Differentiate role-safe, school-scoped operations",
    accent: "#38bdf8",
    googleAsset: "screenshots/2026-07-27-light/executive-desktop-dashboard-light.png",
    assets: [
      {
        path: "sop-graphics/2026-07-27-v2/role-device-standards-guide.png",
        kind: "graphic",
        label: "ROLE + DEVICE STANDARD",
      },
    ],
    organicCaption:
      "Every childcare role needs a different view. Owners need rollups. Directors need school operations. Teachers need classroom tools. Parents need their family portal. The BEE Suite is designed around those boundaries.",
    paidPrimary:
      "Give every role the tools and school context they need—without flattening the organization into one shared view.",
    paidHeadline: "The right view for every role",
    paidDescription: "Role-safe childcare operations from executive oversight to family updates.",
    hashtags: ["#ChildcareLeadership", "#MultiLocation", "#RoleBasedAccess", "#ChildcareTechnology"],
  },
  {
    id: "every-school-clearly",
    eyebrow: "MULTI-LOCATION CLARITY",
    headline: "See every school without losing the details.",
    body: "Executive dashboards and FTE reporting keep location-level truth visible across the organization.",
    cta: "See the executive view",
    audience: "Childcare groups, franchise operators, and executive teams",
    goal: "Generate interest from multi-location buyers",
    accent: "#a78bfa",
    googleAsset: "screenshots/2026-07-27-light/executive-desktop-dashboard-light.png",
    assets: [
      {
        path: "screenshots/2026-07-27-light/executive-desktop-dashboard-light.png",
        kind: "desktop",
        label: "EXECUTIVE DASHBOARD",
      },
      {
        path: "screenshots/2026-07-27-light/executive-desktop-fte-light.png",
        kind: "desktop",
        label: "FTE REPORTING",
      },
    ],
    organicCaption:
      "Multi-location visibility should not erase school-level truth. The BEE Suite helps executive teams review organization-wide signals while keeping each location’s reporting and operating context intact.",
    paidPrimary:
      "Review school-level operations and reporting from one executive workspace built for multi-location childcare.",
    paidHeadline: "See every school clearly",
    paidDescription: "Executive visibility with location-level context.",
    hashtags: ["#ChildcareBusiness", "#FranchiseOperations", "#MultiLocation", "#ExecutiveDashboard"],
  },
  {
    id: "billing-connected",
    eyebrow: "CONNECTED BILLING WORKFLOW",
    headline: "Billing belongs in the same operating record.",
    body: "Review weekly tuition, invoices, payment status, and family history in one school-scoped workflow.",
    cta: "Explore connected billing",
    audience: "Owners, directors, and childcare billing teams",
    goal: "Build consideration for billing and family payment workflows",
    accent: "#f59e0b",
    googleAsset: "screenshots/2026-07-27-light/director-desktop-billing-light.png",
    assets: [
      {
        path: "explainers/bee-suite-weekly-tuition-flow-2026-07-27-v3.png",
        kind: "graphic",
        label: "WEEKLY TUITION FLOW",
      },
      {
        path: "screenshots/2026-07-27-light/parent-iphone-billing-light.png",
        kind: "phone",
        label: "PARENT BILLING",
      },
    ],
    organicCaption:
      "Tuition setup, invoice creation, payment status, and family history work better when they stay connected to the right child and school record.",
    paidPrimary:
      "Keep weekly tuition, family invoices, payment status, and school context connected in one childcare operations workspace.",
    paidHeadline: "A more connected billing workflow",
    paidDescription: "School-scoped billing context from assignment to family history.",
    hashtags: ["#ChildcareBilling", "#ChildcareManagement", "#SchoolOperations", "#ParentPortal"],
  },
  {
    id: "launch-by-feature",
    eyebrow: "SCHOOL-READY ROLLOUT",
    headline: "Launch by feature. Grow with confidence.",
    body: "Use independent readiness gates for setup, parent access, kiosk, billing, payments, and rollout.",
    cta: "See the launch framework",
    audience: "Owners, directors, implementation teams, and childcare brands",
    goal: "Communicate deliberate implementation and rollout control",
    accent: "#84cc16",
    googleAsset: "screenshots/2026-07-27-light/director-desktop-reports-light.png",
    assets: [
      {
        path: "explainers/bee-suite-school-launch-gates-2026-07-27-v3.png",
        kind: "graphic",
        label: "LAUNCH GATES",
      },
    ],
    organicCaption:
      "A software release is not the same as a school launch. The BEE Suite rollout framework keeps setup, parent access, kiosk, billing, payments, and wider rollout as separate readiness decisions.",
    paidPrimary:
      "Roll out childcare operations deliberately with independent readiness gates for each school and feature.",
    paidHeadline: "Launch by feature",
    paidDescription: "A school-ready rollout framework for childcare teams.",
    hashtags: ["#ChildcareImplementation", "#SchoolOperations", "#ChangeManagement", "#ChildcareLeadership"],
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function imageDataUrl(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
  const data = await readFile(filePath);
  return `data:${mime};base64,${data.toString("base64")}`;
}

function mediaMarkup(concept, assetData) {
  return concept.assets
    .map((asset, index) => {
      const dataUrl = assetData.get(asset.path);
      return `
        <figure class="media ${asset.kind} media-${index + 1}" data-layout-item="true">
          <div class="media-label">${escapeHtml(asset.label)}</div>
          <img src="${dataUrl}" alt="" />
        </figure>`;
    })
    .join("");
}

function creativeHtml(concept, formatName, format, brandAssets, assetData) {
  const isLandscape = formatName === "landscape";
  const isStory = formatName === "story";
  const isPortrait = formatName === "portrait";
  const bodyClass = `${formatName} assets-${concept.assets.length}`;
  const media = mediaMarkup(concept, assetData);
  const headlineSize = isLandscape ? 54 : isStory ? 84 : isPortrait ? 69 : 60;
  const bodySize = isLandscape ? 22 : isStory ? 30 : isPortrait ? 27 : 24;
  const logoWidth = isLandscape ? 210 : isStory ? 292 : 250;
  const safeX = isLandscape ? 52 : isStory ? 78 : 64;
  const safeY = isLandscape ? 42 : isStory ? 108 : 58;
  const safeBottom = isStory ? 210 : isLandscape ? 40 : 52;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${format.width}, initial-scale=1" />
  <title>${escapeHtml(concept.headline)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: ${format.width}px;
      height: ${format.height}px;
      overflow: hidden;
      background: #05070a;
      color: white;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .canvas {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background:
        radial-gradient(circle at 88% 10%, color-mix(in srgb, ${concept.accent} 22%, transparent), transparent 31%),
        radial-gradient(circle at 4% 82%, rgba(245,181,27,.14), transparent 28%),
        linear-gradient(145deg, #101820 0%, #070b10 48%, #030507 100%);
    }
    .honeycomb {
      position: absolute;
      inset: 0;
      opacity: .16;
      background-image:
        linear-gradient(30deg, rgba(245,181,27,.24) 12%, transparent 12.5%, transparent 87%, rgba(245,181,27,.24) 87.5%),
        linear-gradient(150deg, rgba(245,181,27,.20) 12%, transparent 12.5%, transparent 87%, rgba(245,181,27,.20) 87.5%),
        linear-gradient(30deg, rgba(245,181,27,.14) 12%, transparent 12.5%, transparent 87%, rgba(245,181,27,.14) 87.5%),
        linear-gradient(150deg, rgba(245,181,27,.12) 12%, transparent 12.5%, transparent 87%, rgba(245,181,27,.12) 87.5%);
      background-position: 0 0, 0 0, 24px 42px, 24px 42px;
      background-size: 48px 84px;
      mask-image: linear-gradient(115deg, rgba(0,0,0,.95), transparent 76%);
    }
    .safe {
      position: absolute;
      inset: ${safeY}px ${safeX}px ${safeBottom}px;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 15px;
      flex: 0 0 auto;
    }
    .brand-icon {
      width: ${isStory ? 64 : isLandscape ? 42 : 52}px;
      height: ${isStory ? 64 : isLandscape ? 42 : 52}px;
      border-radius: ${isStory ? 17 : 13}px;
      box-shadow: 0 12px 34px rgba(245,181,27,.22);
    }
    .brand-logo {
      width: ${logoWidth}px;
      height: auto;
      display: block;
    }
    .platform-label {
      margin-left: auto;
      color: rgba(255,255,255,.58);
      font-size: ${isLandscape ? 12 : isStory ? 18 : 14}px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    .main {
      display: ${isLandscape ? "grid" : "flex"};
      grid-template-columns: ${isLandscape ? "51% 49%" : "none"};
      flex-direction: column;
      gap: ${isLandscape ? 24 : isStory ? 44 : 28}px;
      flex: 1 1 auto;
      min-height: 0;
      margin-top: ${isLandscape ? 28 : isStory ? 96 : 52}px;
    }
    .copy {
      position: relative;
      z-index: 3;
      align-self: ${isLandscape ? "center" : "stretch"};
      min-width: 0;
    }
    .eyebrow {
      display: flex;
      align-items: center;
      gap: 13px;
      color: ${concept.accent};
      font-size: ${isLandscape ? 15 : isStory ? 21 : 17}px;
      line-height: 1.1;
      font-weight: 900;
      letter-spacing: .1em;
    }
    .eyebrow::before {
      content: "";
      width: ${isStory ? 58 : 42}px;
      height: 3px;
      flex: 0 0 auto;
      border-radius: 999px;
      background: ${concept.accent};
    }
    h1 {
      max-width: ${isLandscape ? 570 : isStory ? 900 : 890}px;
      margin: ${isStory ? 34 : 24}px 0 0;
      font-size: ${headlineSize}px;
      line-height: ${isLandscape ? .98 : 1.01};
      font-weight: 830;
      letter-spacing: -.035em;
      text-wrap: balance;
    }
    .body-copy {
      max-width: ${isLandscape ? 530 : isStory ? 850 : 850}px;
      margin: ${isStory ? 32 : 24}px 0 0;
      color: rgba(244,247,250,.78);
      font-size: ${bodySize}px;
      line-height: 1.34;
      font-weight: 500;
      text-wrap: balance;
    }
    .visual-stage {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: ${isStory ? 24 : isLandscape ? 16 : 20}px;
      min-width: 0;
      min-height: 0;
      flex: 1 1 auto;
      padding: ${isLandscape ? "8px 0 6px 18px" : isStory ? "20px 0" : "12px 0"};
    }
    .media {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-width: 0;
      max-height: 100%;
      margin: 0;
      padding: ${isStory ? 15 : 11}px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,.20);
      border-radius: ${isStory ? 26 : 20}px;
      background: rgba(255,255,255,.08);
      box-shadow: 0 24px 70px rgba(0,0,0,.38);
      backdrop-filter: blur(18px);
    }
    .media img {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 0;
      object-fit: contain;
      object-position: center;
      border-radius: ${isStory ? 16 : 12}px;
      background: #f8fafc;
    }
    .media-label {
      position: absolute;
      z-index: 2;
      top: ${isStory ? 27 : 21}px;
      left: ${isStory ? 27 : 21}px;
      max-width: calc(100% - 42px);
      padding: ${isStory ? "10px 15px" : "8px 12px"};
      overflow: hidden;
      border-radius: 999px;
      background: rgba(10,16,24,.88);
      color: white;
      font-size: ${isLandscape ? 10 : isStory ? 14 : 12}px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: .08em;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .media.graphic .media-label { display: none; }
    .media.phone .media-label {
      top: 18px;
      left: 14px;
      max-width: calc(100% - 28px);
      padding: 7px 8px;
      font-size: ${isStory ? 12 : isLandscape ? 9 : 10}px;
      letter-spacing: .04em;
    }
    .media.desktop { flex: 1.65 1 0; }
    .media.tablet { flex: 1.12 1 0; }
    .media.phone { flex: .58 1 0; }
    .media.graphic { flex: 2 1 0; }
    .assets-1 .media { flex: 1 1 100%; }
    .assets-1 .visual-stage { max-width: ${isLandscape ? 570 : isStory ? 920 : 950}px; width: 100%; align-self: center; }
    .assets-2 .media.graphic { flex: 2.2 1 0; }
    .assets-2 .media.phone { flex: .72 1 0; }
    .assets-2 .media.desktop { flex: 1.35 1 0; }
    .footer {
      position: relative;
      z-index: 4;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 22px;
      flex: 0 0 auto;
      margin-top: ${isLandscape ? 18 : isStory ? 48 : 24}px;
    }
    .cta {
      display: inline-flex;
      align-items: center;
      min-height: ${isStory ? 68 : isLandscape ? 46 : 56}px;
      padding: 0 ${isStory ? 28 : 22}px;
      border-radius: ${isStory ? 18 : 14}px;
      background: ${concept.accent};
      color: #071016;
      font-size: ${isLandscape ? 15 : isStory ? 21 : 17}px;
      font-weight: 900;
      box-shadow: 0 16px 38px color-mix(in srgb, ${concept.accent} 24%, transparent);
    }
    .url {
      color: rgba(255,255,255,.78);
      font-size: ${isLandscape ? 14 : isStory ? 21 : 17}px;
      font-weight: 800;
      white-space: nowrap;
    }
    .story .main { margin-top: 88px; }
    .story .visual-stage { max-height: 800px; }
    .portrait .visual-stage { max-height: 580px; }
    .square .visual-stage { max-height: 430px; }
    .landscape .visual-stage { height: 100%; max-height: 468px; }
    .landscape .media.graphic {
      height: auto;
      aspect-ratio: 1.6 / 1;
      align-self: center;
    }
    .landscape .media-label { top: 16px; left: 16px; }
    .landscape.assets-2 .visual-stage,
    .landscape.assets-3 .visual-stage { gap: 11px; }
    .landscape.assets-3 .media-label { display: none; }
  </style>
</head>
<body class="${bodyClass}">
  <main class="canvas">
    <div class="honeycomb"></div>
    <section
      class="safe"
      data-safe-box="true"
      data-safe-x="${safeX}"
      data-safe-y="${safeY}"
      data-safe-width="${format.width - safeX * 2}"
      data-safe-height="${format.height - safeY - safeBottom}"
    >
      <header class="brand" data-layout-item="true">
        <img class="brand-icon" src="${brandAssets.icon}" alt="" />
        <img class="brand-logo" src="${brandAssets.logo}" alt="The BEE Suite" />
        <span class="platform-label">Childcare CRM + Operations</span>
      </header>
      <div class="main">
        <div class="copy" data-layout-item="true">
          <div class="eyebrow">${escapeHtml(concept.eyebrow)}</div>
          <h1>${escapeHtml(concept.headline)}</h1>
          <p class="body-copy">${escapeHtml(concept.body)}</p>
        </div>
        <div class="visual-stage" data-layout-item="true">${media}</div>
      </div>
      <footer class="footer" data-layout-item="true">
        <div class="cta">${escapeHtml(concept.cta)}</div>
        <div class="url">TheBeeSuite.io</div>
      </footer>
    </section>
  </main>
</body>
</html>`;
}

function googleCleanCreativeHtml(concept, format, assetData) {
  const dataUrl = assetData.get(concept.googleAsset);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${format.width}, initial-scale=1" />
  <title>${escapeHtml(concept.headline)} clean image asset</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: ${format.width}px;
      height: ${format.height}px;
      overflow: hidden;
      background: #f8fafc;
    }
    main {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #f8fafc;
    }
    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center;
    }
  </style>
</head>
<body>
  <main data-layout-item="true">
    <img src="${dataUrl}" alt="" />
  </main>
</body>
</html>`;
}

async function validatePage(page, fileName, format) {
  const result = await page.evaluate(({ width, height }) => {
    const root = document.documentElement;
    const images = [...document.images].map((image) => ({
      alt: image.alt,
      loaded: image.complete && image.naturalWidth > 0,
    }));
    const tolerance = 1;
    const outside = [...document.querySelectorAll("[data-layout-item]")].flatMap((element) => {
      const box = element.getBoundingClientRect();
      return box.left < -tolerance ||
        box.top < -tolerance ||
        box.right > width + tolerance ||
        box.bottom > height + tolerance
        ? [
            {
              element: element.className,
              box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
            },
          ]
        : [];
    });
    const overflow = [...document.querySelectorAll(".copy, h1, .body-copy, .visual-stage, .footer")].flatMap(
      (element) => {
        const textElement = element.matches("h1, .body-copy");
        const hasOverflow =
          element.scrollWidth > element.clientWidth + tolerance ||
          (!textElement && element.scrollHeight > element.clientHeight + tolerance);
        return hasOverflow
          ? [
              {
                element: element.className || element.localName,
                scroll: [element.scrollWidth, element.scrollHeight],
                client: [element.clientWidth, element.clientHeight],
              },
            ]
          : [];
      },
    );
    return {
      root: root.localName,
      dimensions: [root.scrollWidth, root.scrollHeight],
      images,
      outside,
      overflow,
    };
  }, format);

  const failedImages = result.images.filter((image) => !image.loaded);
  if (
    result.root !== "html" ||
    result.dimensions[0] !== format.width ||
    result.dimensions[1] !== format.height ||
    failedImages.length ||
    result.outside.length ||
    result.overflow.length
  ) {
    throw new Error(
      `${fileName} failed layout validation:\n${JSON.stringify(
        { ...result, failedImages },
        null,
        2,
      )}`,
    );
  }
}

function manifest() {
  return {
    title: "The BEE Suite Social and Paid Creative Pack",
    createdAt: releaseDate,
    releaseVersion,
    strategy: "Warm Command Center with current product proof",
    landingPage: "https://thebeesuite.io",
    concepts: concepts.map((concept) => ({
      id: concept.id,
      audience: concept.audience,
      goal: concept.goal,
      copy: {
        eyebrow: concept.eyebrow,
        headline: concept.headline,
        body: concept.body,
        cta: concept.cta,
        organicCaption: concept.organicCaption,
        paidPrimary: concept.paidPrimary,
        paidHeadline: concept.paidHeadline,
        paidDescription: concept.paidDescription,
        hashtags: concept.hashtags,
        platformCopy: {
          meta: {
            primaryText: concept.paidPrimary,
            headline: concept.paidHeadline,
            description: concept.paidDescription,
          },
          linkedin: {
            introText: concept.paidPrimary,
            headline: concept.paidHeadline,
          },
          tiktok: {
            hook: concept.headline,
            caption: `${concept.paidDescription} ${concept.hashtags.slice(0, 3).join(" ")}`,
          },
          google: {
            businessName: "The BEE Suite",
            ...googleCopyByConcept[concept.id],
          },
        },
      },
      sourceAssets: concept.assets.map((asset) => ({
        path: `public/brand/the-bee-suite/${asset.path}`,
        deviceOrType: asset.label,
      })).concat({
        path: `public/brand/the-bee-suite/${concept.googleAsset}`,
        deviceOrType: "GOOGLE CLEAN IMAGE SOURCE",
      }),
      exports: Object.entries(allFormats).map(([formatName, format]) => ({
        format: formatName,
        dimensions: `${format.width}x${format.height}`,
        placements: format.placements,
        file: `${concept.id}--${formatName}.png`,
      })),
    })),
    guardrails: [
      "All user-facing copy, logos, dimensions, and safe zones are deterministic.",
      "Every product image comes from the approved July 27, 2026 light-mode screenshot and SOP graphic set.",
      "Google clean image candidates contain one intact light-mode product screenshot and no added logo, headline, CTA, button, or collage.",
      "No customer results, prices, testimonials, certifications, or compliance guarantees are claimed.",
      "Sensitive decisions remain with authorized staff; creative does not imply autonomous legal, medical, safety, custody, billing, licensing, or compliance decisions.",
      "Campaign activation, budgets, targeting, and destination tracking require separate approval.",
    ],
  };
}

function copyMarkdown() {
  const sections = concepts
    .map(
      (concept) => {
        const googleCopy = googleCopyByConcept[concept.id];
        return `## ${concept.headline}

**Campaign ID:** \`${concept.id}\`
**Audience:** ${concept.audience}
**Goal:** ${concept.goal}
**Landing page:** https://thebeesuite.io

### Organic social caption

${concept.organicCaption}

${concept.hashtags.join(" ")}

### Paid-ad copy

**Primary text:** ${concept.paidPrimary}

**Headline:** ${concept.paidHeadline}

**Description:** ${concept.paidDescription}

**CTA:** ${concept.cta}

### Google asset-field copy

**Business name:** The BEE Suite

**Short headlines (30 characters maximum):**

${googleCopy.shortHeadlines.map((headline) => `- ${headline}`).join("\n")}

**Long headline (90 characters maximum):** ${googleCopy.longHeadline}

**Descriptions (90 characters maximum):**

${googleCopy.descriptions.map((description) => `- ${description}`).join("\n")}

### Recommended files

- Meta and Instagram: square, portrait, and story exports.
- LinkedIn: landscape or portrait export.
- Google responsive display and Demand Gen: \`google-square-clean\` and \`google-landscape-clean\` image candidates, paired with the Google copy fields above.
- TikTok and Reels: story export; use as a static end card or animate the product frames without changing the copy.
`;
      },
    )
    .join("\n");

  return `# The BEE Suite Social and Paid Campaign Library

Updated: July 27, 2026

This pack turns the approved light-mode product screenshots and SOP graphics into platform-ready organic and paid creative. It is a creative library, not authorization to activate campaigns or spend budget.

## Platform export map

| Export | Dimensions | Primary use |
| --- | ---: | --- |
| Square | 1080 x 1080 | Instagram, Facebook, LinkedIn |
| Portrait | 1080 x 1350 | Instagram and Facebook feed, LinkedIn |
| Story | 1080 x 1920 | Instagram Stories, Facebook Stories, Reels, TikTok |
| Landscape | 1200 x 628 | LinkedIn sponsored content and Facebook link ads |
| Google square clean | 1200 x 1200 | Google Demand Gen and responsive display image candidate |
| Google landscape clean | 1200 x 628 | Google Demand Gen and responsive display image candidate |

## Campaign rules

- Keep headlines and CTAs exactly as exported unless a replacement is reviewed for fit.
- Use \`https://thebeesuite.io\` as the default destination.
- Add platform-specific UTM parameters at campaign setup; do not bake tracking parameters into creative.
- Do not add unsupported performance claims, testimonials, prices, certifications, or compliance guarantees.
- Keep product screenshots intact. Do not crop away role, school, family, or reporting context that explains the screen.
- Pair story exports with motion only when the first and final frames preserve the exact headline and CTA.
- Use the clean Google files with the supplied Google text fields. Final acceptance remains subject to Google Ads review and account policy.

${sections}
`.trimEnd() + "\n";
}

function reviewHtml() {
  const sections = concepts
    .map((concept) => {
      const cards = Object.entries(allFormats)
        .map(
          ([formatName, format]) => `<article>
            <a href="${concept.id}--${formatName}.png">
              <img src="${concept.id}--${formatName}.png" alt="${escapeHtml(
                `${concept.headline} ${formatName} creative`,
              )}" loading="lazy" />
            </a>
            <div class="meta">
              <strong>${escapeHtml(formatName.toUpperCase())}</strong>
              <span>${format.width} × ${format.height}</span>
            </div>
          </article>`,
        )
        .join("");
      return `<section>
        <div class="section-copy">
          <span>${escapeHtml(concept.eyebrow)}</span>
          <h2>${escapeHtml(concept.headline)}</h2>
          <p>${escapeHtml(concept.audience)}</p>
        </div>
        <div class="grid">${cards}</div>
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>The BEE Suite Social and Paid Creative Library</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #05070a;
      color: white;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      padding: 54px clamp(24px, 5vw, 72px);
      border-bottom: 1px solid rgba(255,255,255,.1);
      background:
        radial-gradient(circle at 10% 0%, rgba(245,181,27,.22), transparent 30rem),
        linear-gradient(135deg, #101820, #05070a);
    }
    h1 { max-width: 900px; margin: 0; font-size: clamp(38px, 6vw, 72px); line-height: .98; }
    header p { max-width: 780px; margin: 22px 0 0; color: rgba(255,255,255,.7); font-size: 18px; line-height: 1.55; }
    section { padding: 44px clamp(24px, 5vw, 72px); border-bottom: 1px solid rgba(255,255,255,.08); }
    .section-copy span { color: #f5b51b; font-size: 13px; font-weight: 900; letter-spacing: .1em; }
    h2 { margin: 10px 0 0; font-size: clamp(28px, 4vw, 48px); }
    .section-copy p { margin: 10px 0 0; color: rgba(255,255,255,.62); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-top: 28px; align-items: start; }
    article { overflow: hidden; border: 1px solid rgba(255,255,255,.12); border-radius: 16px; background: rgba(255,255,255,.05); }
    article a { display: block; background: #0b1118; }
    article img { display: block; width: 100%; height: auto; }
    .meta { display: flex; justify-content: space-between; gap: 16px; padding: 14px 16px; color: rgba(255,255,255,.68); font-size: 13px; }
    .meta strong { color: white; }
  </style>
</head>
<body>
  <header>
    <h1>Social and paid creative built from real product proof.</h1>
    <p>Six campaign directions with branded Meta, Instagram, LinkedIn, TikTok, and Reels creative plus clean Google image candidates and platform-specific copy fields.</p>
  </header>
  ${sections}
</body>
</html>`;
}

async function main() {
  await mkdir(publicDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const brandAssets = {
    logo: await imageDataUrl(logoPath),
    icon: await imageDataUrl(iconPath),
  };
  const uniqueAssets = [
    ...new Set(
      concepts.flatMap((concept) => [
        ...concept.assets.map((asset) => asset.path),
        concept.googleAsset,
      ]),
    ),
  ];
  const assetData = new Map(
    await Promise.all(
      uniqueAssets.map(async (relativePath) => [
        relativePath,
        await imageDataUrl(path.join(root, "public", "brand", "the-bee-suite", relativePath)),
      ]),
    ),
  );

  const browser = await chromium.launch();
  try {
    for (const concept of concepts) {
      for (const [formatName, format] of Object.entries(formats)) {
        const page = await browser.newPage({
          viewport: { width: format.width, height: format.height },
          deviceScaleFactor: 1,
        });
        const fileName = `${concept.id}--${formatName}.png`;
        try {
          await page.setContent(
            creativeHtml(concept, formatName, format, brandAssets, assetData),
            { waitUntil: "networkidle" },
          );
          await validatePage(page, fileName, format);
          await page.screenshot({
            path: path.join(publicDir, fileName),
            type: "png",
          });
          console.log(`Rendered ${fileName}`);
        } finally {
          await page.close();
        }
      }
      for (const [formatName, format] of Object.entries(googleFormats)) {
        const page = await browser.newPage({
          viewport: { width: format.width, height: format.height },
          deviceScaleFactor: 1,
        });
        const fileName = `${concept.id}--${formatName}.png`;
        try {
          await page.setContent(
            googleCleanCreativeHtml(concept, format, assetData),
            { waitUntil: "networkidle" },
          );
          await validatePage(page, fileName, format);
          await page.screenshot({
            path: path.join(publicDir, fileName),
            type: "png",
          });
          console.log(`Rendered ${fileName}`);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const manifestContent = `${JSON.stringify(manifest(), null, 2)}\n`;
  const copyContent = copyMarkdown();
  const reviewContent = reviewHtml();
  await writeFile(path.join(publicDir, "manifest.json"), manifestContent, "utf8");
  await writeFile(path.join(publicDir, "index.html"), reviewContent, "utf8");
  await writeFile(path.join(outputDir, "manifest.json"), manifestContent, "utf8");
  await writeFile(path.join(outputDir, "campaign-copy.md"), copyContent, "utf8");
  await writeFile(path.join(outputDir, "review-board.html"), reviewContent, "utf8");
  await writeFile(
    path.join(root, "docs", "BEE_SUITE_SOCIAL_AND_PAID_CAMPAIGN_LIBRARY_2026-07-27.md"),
    copyContent,
    "utf8",
  );

  console.log(`Rendered ${concepts.length * Object.keys(allFormats).length} assets.`);
  console.log(`Public review: ${path.relative(root, path.join(publicDir, "index.html"))}`);
}

await main();
