import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "outputs", "walkthroughs", "actual-app-kokomo");
const tempDir = path.join(outputDir, ".tmp");

const baseUrl = process.env.KOKOMO_APP_URL || "https://thebeesuite.io";
const email = process.env.KOKOMO_EMAIL || "kokomo@kidcityusa.com";
const password = process.env.KOKOMO_PASSWORD;

if (!password) {
  throw new Error("Set KOKOMO_PASSWORD before running this script.");
}

const viewport = { width: 1440, height: 900 };

const flows = [
  {
    slug: "01-center-director-dashboard-setup",
    title: "Kokomo Center Director: Dashboard and Setup",
    note: "Actual Kokomo center director account. Covers the starting dashboard, school setup, and daily center view.",
    routes: [
      ["/dashboard", "Start on the Kokomo dashboard", "Verify the account is scoped to Kokomo before entering real child data."],
      ["/school-setup", "Open School Setup", "Use this checklist to complete profile, classrooms, staff, family records, billing, parent portal, and launch signoff."],
      ["/center-dashboard", "Review the Center Dashboard", "Use this daily view for today's tasks, tours, attendance, messages, billing alerts, and staffing signals."],
      ["/notifications", "Check Notifications", "Review action items and reminders routed to the Kokomo center director account."],
    ],
  },
  {
    slug: "02-enrollment-crm",
    title: "Kokomo Enrollment: CRM, Pipeline, Tours, and Waitlist",
    note: "Actual Kokomo account. Covers inquiry and enrollment follow-up without editing lead records.",
    routes: [
      ["/crm-leads", "Open CRM Leads", "This is where Kokomo inquiries, walk-ins, notes, and follow-up tasks are managed."],
      ["/enrollment-pipeline", "Review the Enrollment Pipeline", "Use the pipeline to understand where families are from inquiry through enrolled or waitlisted."],
      ["/tours", "Open Tours", "Use tours for scheduled visits, tour preparation, reminders, and post-tour follow-up."],
      ["/waitlist", "Open Waitlist", "Use the waitlist to manage start-date demand and classroom capacity planning."],
      ["/campaigns", "Review Campaigns", "Campaigns support enrollment follow-up and parent newsletters after the audience is verified."],
      ["/automations", "Review Automations", "Automations should stay human-reviewed for sensitive enrollment and parent workflows."],
    ],
  },
  {
    slug: "03-classroom-teacher-workflows",
    title: "Kokomo Classroom and Teacher Workflows",
    note: "Recorded from the director account. True signed-in teacher videos require separate Kokomo teacher credentials.",
    routes: [
      ["/classroom-dashboard", "Open Classroom", "Classroom view shows rosters, capacity, ratios, and daily classroom activity."],
      ["/attendance", "Open Attendance", "Use attendance and kiosk tools to verify check-in, check-out, absences, and daily state."],
      ["/daily-reports", "Open Daily Reports", "Teachers use daily reports for meals, naps, diaper/potty logs, activities, notes, supplies, and parent-ready updates."],
      ["/incident-reports", "Open Incidents", "Incident records require objective notes, director review, and parent acknowledgment where applicable."],
      ["/staff", "Open Teachers", "Use staff tools to create teacher profiles, assign classrooms, track credentials, and hand off logins."],
    ],
  },
  {
    slug: "04-family-parent-readiness",
    title: "Kokomo Families and Parent Portal Readiness",
    note: "Recorded from the director account. True parent portal videos require a linked parent or guardian login.",
    routes: [
      ["/family-detail", "Open Family Detail", "Enter the five starting families, guardians, authorized pickups, emergency contacts, and billing contacts here."],
      ["/child-profile", "Open Child Profile", "Use child records for classroom assignment, schedule, allergies, medical notes, custody warnings, and permissions."],
      ["/documents", "Open Documents", "Review enrollment packets, health records, immunizations, policy acknowledgments, and missing documents."],
      ["/parent-media-review", "Open Media Review", "Teacher photos are reviewed against permission rules before sharing with parents."],
      ["/messages", "Open Messages", "Parent and staff messages stay in the family timeline and should be reviewed before sending sensitive content."],
    ],
  },
  {
    slug: "05-billing-payments",
    title: "Kokomo Billing and Payments",
    note: "Actual Kokomo account. Shows billing setup while keeping live checkout untouched.",
    routes: [
      ["/billing-invoices", "Open Billing and Invoices", "Use this area for verified tuition plans, deposits, fees, invoices, balances, and ledger review."],
      ["/payments", "Open Payments", "Payment actions stay gated until Kokomo's Stripe Connect payout account and approvals are complete."],
      ["/billing-settings", "Open Billing Settings", "Use settings for tuition defaults, payment configuration, and Stripe readiness checks."],
      ["/forms", "Open Forms", "Forms support enrollment packets, parent acknowledgments, medical/allergy information, and staff onboarding."],
    ],
  },
  {
    slug: "06-compliance-reporting-support",
    title: "Kokomo Compliance, FTE, Analytics, and Support",
    note: "Actual Kokomo account. Covers first-week reporting and support areas without submitting records.",
    routes: [
      ["/fte-reports", "Open FTE Reports", "Kokomo should submit weekly FTE before the Friday noon deadline."],
      ["/compliance", "Open Compliance", "Use compliance-ready workflows for licensing support, document reminders, incident review, medication logs, and exports."],
      ["/analytics", "Open Analytics", "Analytics helps monitor enrollment, attendance, billing, messaging, and first-week operating trends."],
      ["/audit-logs", "Open Audit Logs", "Audit logs are used to investigate sensitive reads, record changes, billing activity, and access questions."],
      ["/help", "Open Help", "Use help and support workflows for launch questions and issue reporting."],
    ],
  },
];

function absoluteUrl(route) {
  return new URL(route, baseUrl).toString();
}

async function authenticate(page) {
  await page.goto(absoluteUrl("/login"), { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/auth/login")),
    page.locator('button[type="submit"]').click(),
  ]);
  if (!response.ok()) {
    const text = await response.text().catch(() => "");
    throw new Error(`Kokomo login failed with HTTP ${response.status()}: ${text}`);
  }
  await page.goto(absoluteUrl("/dashboard"), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined);
}

async function addCaption(page, title, body) {
  await page.addStyleTag({
    content: `
      #beeActualWalkthroughCaption {
        position: fixed;
        left: 292px;
        right: 28px;
        bottom: 24px;
        z-index: 2147483647;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 18px;
        align-items: center;
        min-height: 72px;
        padding: 16px 20px;
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.96);
        color: white;
        box-shadow: 0 22px 60px rgba(15, 23, 42, 0.32);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }
      #beeActualWalkthroughCaption b {
        display: block;
        margin-bottom: 4px;
        font-size: 17px;
        line-height: 1.2;
      }
      #beeActualWalkthroughCaption span {
        color: #cbd5e1;
        font-size: 14px;
        line-height: 1.38;
      }
      #beeActualWalkthroughCaption i {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 92px;
        border-radius: 999px;
        background: #f5b51b;
        color: #111827;
        padding: 10px 13px;
        font-size: 12px;
        font-style: normal;
        font-weight: 900;
        white-space: nowrap;
      }
      @media (max-width: 900px) {
        #beeActualWalkthroughCaption {
          left: 16px;
          right: 16px;
        }
      }
    `,
  }).catch(() => undefined);

  await page.evaluate(({ title: nextTitle, body: nextBody }) => {
    let caption = document.getElementById("beeActualWalkthroughCaption");
    if (!caption) {
      caption = document.createElement("div");
      caption.id = "beeActualWalkthroughCaption";
      document.body.append(caption);
    }
    caption.innerHTML = `<div><b></b><span></span></div><i>Actual app</i>`;
    caption.querySelector("b").textContent = nextTitle;
    caption.querySelector("span").textContent = nextBody;
  }, { title, body });
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
}

async function recordRoute(page, route, title, body) {
  await page.goto(absoluteUrl(route), { waitUntil: "domcontentloaded" });
  await settle(page);
  await addCaption(page, title, body);
  await page.waitForTimeout(2100);
  await page.evaluate(() => window.scrollTo({ top: Math.min(document.body.scrollHeight * 0.45, 900), behavior: "smooth" }));
  await page.waitForTimeout(1300);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(700);
}

await mkdir(outputDir, { recursive: true });
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

const browser = await chromium.launch();
const written = [];

try {
  for (const flow of flows) {
    const finalPath = path.join(outputDir, `${flow.slug}.webm`);
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      recordVideo: {
        dir: tempDir,
        size: viewport,
      },
    });
    const page = await context.newPage();
    await authenticate(page);
    for (const [route, title, body] of flow.routes) {
      await recordRoute(page, route, title, body);
    }
    const video = page.video();
    await page.close();
    if (!video) throw new Error(`No video captured for ${flow.slug}`);
    await video.saveAs(finalPath);
    await context.close();
    written.push({ ...flow, file: path.basename(finalPath) });
    console.log(`wrote ${finalPath}`);
  }
} finally {
  await browser.close();
  await rm(tempDir, { recursive: true, force: true });
}

const readme = [
  "# Kokomo Actual App Walkthrough Videos",
  "",
  `Generated from the live app at ${baseUrl} using ${email}.`,
  "",
  "These recordings start after authentication and use the actual Kokomo center director account. They are intentionally read-only: no forms are submitted, no messages are sent, no parent invites are created, and no records are changed.",
  "",
  "The Kokomo account is a `CENTER_DIRECTOR` account. True signed-in walkthroughs for teacher, parent/guardian, billing-only, executive, or authorized pickup views require separate credentials for those user types.",
  "",
  "| Video | File | Notes |",
  "| --- | --- | --- |",
  ...written.map((flow) => `| ${flow.title} | \`${flow.file}\` | ${flow.note} |`),
  "",
].join("\n");

await writeFile(path.join(outputDir, "README.md"), readme, "utf8");
console.log(`wrote ${path.join(outputDir, "README.md")}`);
