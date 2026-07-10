import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const dateStamp = "2026-07-09";
const sourceDir = path.join(root, "docs", "kidcity-enterprise-rollout");
const outputDir = path.join(root, "output", "pdf", "kidcity-enterprise-rollout-2026-07-09");
const tmpDir = path.join(root, "tmp", "pdfs", "kidcity-enterprise-rollout-2026-07-09");
const manifestPath = path.join(outputDir, "manifest.json");

const beeIcon = path.join(root, "public", "brand", "the-bee-suite", "app-icon-dark.png");
const kidCityLogo = path.join(root, "public", "brand", "kid-city-usa", "logo-horizontal.png");

const documents = [
  {
    source: "README.md",
    output: "00-kidcity-enterprise-rollout-index.pdf",
    label: "Packet Index",
    audience: "Corporate rollout team",
    orientation: "portrait",
  },
  {
    source: "MASTER_CORPORATE_ROLLOUT_PLAYBOOK.md",
    output: "01-master-corporate-rollout-playbook.pdf",
    label: "Master Playbook",
    audience: "Executives, implementation, operations, support",
    orientation: "portrait",
  },
  {
    source: "DIRECTOR_IMPLEMENTATION_GUIDE.md",
    output: "02-director-implementation-guide.pdf",
    label: "Director Guide",
    audience: "School directors and assistant directors",
    orientation: "portrait",
  },
  {
    source: "CHECKLISTS.md",
    output: "03-rollout-checklists.pdf",
    label: "Operational Checklists",
    audience: "Implementation lead, directors, corporate operations",
    orientation: "portrait",
  },
  {
    source: "EXECUTIVE_DASHBOARD.md",
    output: "04-executive-dashboard.pdf",
    label: "Executive Dashboard",
    audience: "Leadership and rollout command center",
    orientation: "portrait",
  },
  {
    source: "RISK_CONTINGENCY_ROLLBACK.md",
    output: "05-risk-contingency-rollback.pdf",
    label: "Risk And Rollback",
    audience: "Leadership, support, implementation, technical owners",
    orientation: "landscape",
  },
  {
    source: "SOPS_HELP_TRAINING_PACKET.md",
    output: "06-sops-help-training-packet.pdf",
    label: "SOPs And Training",
    audience: "Customer success, support, school leaders",
    orientation: "portrait",
  },
  {
    source: "PRINTABLE_IMPLEMENTATION_PACKET.md",
    output: "07-printable-implementation-packet.pdf",
    label: "School Packet",
    audience: "One printed copy per school evidence folder",
    orientation: "portrait",
  },
  {
    source: "ROLLOUT_ORDER_2026-07.md",
    output: "08-suggested-rollout-order.pdf",
    label: "Rollout Order",
    audience: "Corporate leadership and rollout scheduler",
    orientation: "landscape",
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inlineMarkdown(value) {
  const codeTokens = [];
  let html = escapeHtml(value).replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE${codeTokens.length}@@`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    return `<a href="${escapeHtml(href)}">${inlineMarkdown(text)}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  codeTokens.forEach((replacement, index) => {
    html = html.replace(`@@CODE${index}@@`, replacement);
  });
  return html;
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function renderTable(lines, start) {
  const header = parseTableRow(lines[start]);
  let index = start + 2;
  const rows = [];
  while (index < lines.length && /^\s*\|/.test(lines[index]) && lines[index].trim() !== "") {
    rows.push(parseTableRow(lines[index]));
    index += 1;
  }
  const className = header.length >= 6 ? "wide-table" : header.length >= 4 ? "medium-table" : "";
  const html = `<table class="${className}"><thead><tr>${header
    .map((cell) => `<th>${inlineMarkdown(cell)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${header.map((_, cellIndex) => `<td>${inlineMarkdown(row[cellIndex] || "")}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
  return { html, next: index };
}

function renderList(lines, start, ordered) {
  const tag = ordered ? "ol" : "ul";
  let index = start;
  const items = [];
  const pattern = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*-\s+(.*)$/;
  while (index < lines.length) {
    const match = lines[index].match(pattern);
    if (!match) break;
    let content = match[1];
    const checked = content.match(/^\[(x|X| )\]\s+(.*)$/);
    if (checked) {
      const box = checked[1].trim() ? "checked" : "";
      content = `<span class="checkbox ${box}"></span>${inlineMarkdown(checked[2])}`;
    } else {
      content = inlineMarkdown(content);
    }
    items.push(`<li>${content}</li>`);
    index += 1;
  }
  return { html: `<${tag}>${items.join("")}</${tag}>`, next: index };
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = trimmed.match(/^```(\w+)?/);
    if (fence) {
      const language = fence[1] || "";
      index += 1;
      const code = [];
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(`<pre class="code-block ${language ? `language-${escapeHtml(language)}` : ""}"><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push("<hr />");
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = inlineMarkdown(heading[2]);
      const id = slugify(heading[2]);
      blocks.push(`<h${level} id="${id}">${text}</h${level}>`);
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && /^\s*\|/.test(line) && isTableSeparator(lines[index + 1])) {
      const table = renderTable(lines, index);
      blocks.push(table.html);
      index = table.next;
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const list = renderList(lines, index, false);
      blocks.push(list.html);
      index = list.next;
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const list = renderList(lines, index, true);
      blocks.push(list.html);
      index = list.next;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${inlineMarkdown(quote.join(" "))}</blockquote>`);
      continue;
    }

    const paragraph = [trimmed];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^\s*(```|\||-|>|\d+\.)/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return blocks.join("\n");
}

function readTitle(markdown, fallback) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function assetUrl(filePath) {
  return existsSync(filePath) ? pathToFileURL(filePath).href : "";
}

function css(orientation) {
  const landscape = orientation === "landscape";
  return `<style>
    :root {
      --ink: #17202a;
      --muted: #596579;
      --line: #d9cdb4;
      --paper: #fff8ec;
      --paper-2: #fffdf7;
      --gold: #f5b51b;
      --gold-soft: #fff0c2;
      --teal: #0f8b8d;
      --green: #2f855a;
      --navy: #223244;
      --rose: #b42318;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: white; color: var(--ink); font-family: Arial, Helvetica, sans-serif; }
    body { font-size: ${landscape ? "9pt" : "9.4pt"}; line-height: 1.45; }
    .cover {
      margin: 0 0 0.26in;
      padding: ${landscape ? "0.26in 0.34in" : "0.34in 0.38in"};
      border: 1px solid var(--line);
      border-radius: 10px;
      background:
        linear-gradient(135deg, rgba(245,181,27,0.28), rgba(255,255,255,0) 45%),
        linear-gradient(180deg, var(--paper), var(--paper-2));
      break-inside: avoid;
    }
    .brand-row { display: flex; align-items: center; justify-content: space-between; gap: 0.24in; margin-bottom: 0.22in; }
    .brand-left { display: flex; align-items: center; gap: 0.12in; min-width: 0; }
    .bee-icon { width: 0.44in; height: 0.44in; object-fit: contain; }
    .kid-logo { max-width: 1.8in; max-height: 0.44in; object-fit: contain; }
    .brand-title { display: flex; flex-direction: column; gap: 0.03in; }
    .brand-title strong { font-size: 12pt; }
    .brand-title span { color: var(--muted); font-size: 7.4pt; letter-spacing: 0.1em; text-transform: uppercase; }
    .doc-pill {
      flex: 0 0 auto;
      border: 1px solid rgba(245,181,27,0.95);
      background: rgba(255,240,194,0.9);
      border-radius: 999px;
      padding: 0.07in 0.13in;
      font-size: 8pt;
      font-weight: 700;
      color: #4f3903;
      text-align: center;
    }
    .cover h1 {
      margin: 0;
      max-width: ${landscape ? "9in" : "6.7in"};
      font-size: ${landscape ? "25pt" : "27pt"};
      line-height: 1.04;
      letter-spacing: 0;
      color: var(--ink);
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.1in;
      margin-top: 0.22in;
    }
    .meta-card {
      border: 1px solid #e4dac6;
      background: white;
      border-radius: 8px;
      padding: 0.11in;
      min-height: 0.62in;
    }
    .meta-card strong { display: block; font-size: 7.2pt; text-transform: uppercase; letter-spacing: 0.08em; color: var(--teal); }
    .meta-card span { display: block; margin-top: 0.04in; color: var(--navy); font-size: 8.4pt; line-height: 1.35; }
    .content { padding: 0 0.03in; }
    h1, h2, h3, h4, h5, h6 { color: var(--ink); letter-spacing: 0; line-height: 1.18; break-after: avoid; }
    .content h1 { margin: 0.2in 0 0.12in; font-size: 22pt; }
    .content h2 {
      margin: 0.26in 0 0.09in;
      padding-top: 0.07in;
      border-top: 2px solid var(--gold);
      font-size: 15pt;
    }
    .content h3 { margin: 0.18in 0 0.07in; font-size: 12pt; color: var(--navy); }
    .content h4 { margin: 0.14in 0 0.05in; font-size: 10.2pt; color: var(--teal); }
    p { margin: 0 0 0.09in; color: #334155; orphans: 3; widows: 3; }
    a { color: var(--teal); text-decoration: none; font-weight: 700; }
    ul, ol { margin: 0 0 0.12in 0.22in; padding: 0; }
    li { margin: 0.035in 0; color: #334155; }
    .checkbox {
      display: inline-block;
      width: 0.12in;
      height: 0.12in;
      margin-right: 0.06in;
      border: 1.3px solid var(--navy);
      border-radius: 2px;
      vertical-align: -0.02in;
    }
    .checkbox.checked { background: var(--gold); box-shadow: inset 0 0 0 2px white; }
    table {
      width: 100%;
      margin: 0.12in 0 0.17in;
      border-collapse: collapse;
      table-layout: fixed;
      break-inside: auto;
      background: white;
    }
    thead { display: table-header-group; }
    tr { break-inside: avoid; break-after: auto; }
    th, td {
      border: 1px solid #e0d7c5;
      padding: ${landscape ? "0.055in 0.06in" : "0.06in 0.065in"};
      vertical-align: top;
      overflow-wrap: anywhere;
      word-break: normal;
    }
    th {
      background: var(--gold-soft);
      color: #463404;
      font-size: ${landscape ? "7.4pt" : "7.6pt"};
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    td { color: #2f3b4a; font-size: ${landscape ? "7.8pt" : "8.1pt"}; line-height: 1.3; }
    .medium-table td, .medium-table th { font-size: ${landscape ? "7.2pt" : "7.5pt"}; }
    .wide-table td, .wide-table th { font-size: ${landscape ? "6.6pt" : "6.8pt"}; padding: 0.045in; }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      margin: 0.12in 0 0.16in;
      padding: 0.12in;
      border: 1px solid #d7e3e3;
      border-left: 4px solid var(--teal);
      border-radius: 8px;
      background: #f7fbfb;
      color: #21313f;
      break-inside: avoid;
    }
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 0.86em;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 0.01in 0.035in;
    }
    pre code { border: 0; background: transparent; padding: 0; font-size: ${landscape ? "7.2pt" : "7.4pt"}; }
    blockquote {
      margin: 0.12in 0;
      padding: 0.1in 0.14in;
      border-left: 4px solid var(--gold);
      background: #fffaf0;
      color: #334155;
    }
    hr { border: 0; height: 1px; background: var(--line); margin: 0.18in 0; }
    .callout {
      margin-top: 0.18in;
      padding: 0.12in 0.14in;
      border: 1px solid #e2d6bd;
      border-radius: 8px;
      background: #fffaf0;
      color: #3b2f12;
      break-inside: avoid;
    }
    @page {
      size: Letter ${landscape ? "landscape" : "portrait"};
    }
    @media print {
      .cover, table, pre, blockquote { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>`;
}

function htmlDocument({ title, label, audience, sourceName, markdown, orientation }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${css(orientation)}
</head>
<body>
  <section class="cover">
    <div class="brand-row">
      <div class="brand-left">
        ${assetUrl(beeIcon) ? `<img class="bee-icon" src="${assetUrl(beeIcon)}" alt="The Bee Suite" />` : ""}
        <div class="brand-title">
          <strong>The Bee Suite</strong>
          <span>Kid City USA Enterprise Rollout</span>
        </div>
      </div>
      ${assetUrl(kidCityLogo) ? `<img class="kid-logo" src="${assetUrl(kidCityLogo)}" alt="Kid City USA" />` : ""}
      <div class="doc-pill">${escapeHtml(label)}</div>
    </div>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta-grid">
      <div class="meta-card"><strong>Audience</strong><span>${escapeHtml(audience)}</span></div>
      <div class="meta-card"><strong>Generated</strong><span>${dateStamp}</span></div>
      <div class="meta-card"><strong>Source</strong><span>${escapeHtml(sourceName)}</span></div>
    </div>
    <div class="callout">ProCare remains active until leadership approves final ProCare retirement for each school.</div>
  </section>
  <main class="content">
    ${renderMarkdown(markdown)}
  </main>
</body>
</html>`;
}

function footerTemplate(title) {
  return `<div style="box-sizing:border-box;width:100%;font-family:Arial,Helvetica,sans-serif;font-size:7px;color:#6b7280;padding:0 0.35in;display:flex;align-items:center;justify-content:space-between;">
    <span>Kid City USA x The Bee Suite</span>
    <span>${escapeHtml(title)}</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;
}

async function renderDocument(browser, doc) {
  const sourcePath = path.join(sourceDir, doc.source);
  const markdown = await readFile(sourcePath, "utf8");
  const title = readTitle(markdown, doc.label);
  const html = htmlDocument({
    title,
    label: doc.label,
    audience: doc.audience,
    sourceName: doc.source,
    markdown,
    orientation: doc.orientation,
  });

  const htmlPath = path.join(tmpDir, doc.output.replace(/\.pdf$/, ".html"));
  const pdfPath = path.join(outputDir, doc.output);
  await writeFile(htmlPath, html, "utf8");

  const page = await browser.newPage({
    viewport: doc.orientation === "landscape" ? { width: 1100, height: 850 } : { width: 850, height: 1100 },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.pdf({
    path: pdfPath,
    format: "Letter",
    landscape: doc.orientation === "landscape",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: footerTemplate(title),
    margin: { top: "0.38in", right: "0.42in", bottom: "0.48in", left: "0.42in" },
  });
  await page.close();

  return {
    title,
    source: path.relative(root, sourcePath).replaceAll("\\", "/"),
    pdf: path.relative(root, pdfPath).replaceAll("\\", "/"),
    orientation: doc.orientation,
  };
}

async function main() {
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch();
  const rendered = [];
  try {
    for (const doc of documents) {
      rendered.push(await renderDocument(browser, doc));
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    title: "Kid City USA Enterprise Rollout Printable PDFs",
    generatedAt: dateStamp,
    outputDirectory: path.relative(root, outputDir).replaceAll("\\", "/"),
    documents: rendered,
    combinedBinder: "kidcity-enterprise-rollout-complete-print-binder.pdf",
    notes: [
      "Individual PDFs are branded for printed school and corporate rollout binders.",
      "The combined binder is produced by the follow-up merge step in this workflow.",
      "ProCare remains active until leadership approves final ProCare retirement for each school.",
    ],
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Output: ${outputDir}`);
  for (const item of rendered) console.log(`${item.pdf}`);
  console.log(`Manifest: ${manifestPath}`);
}

await main();
