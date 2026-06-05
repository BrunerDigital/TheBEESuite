import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const markdownPath = resolve(root, "docs", "UPDATED_COMPLETION_CHECKLIST_2026-06-04.md");
const htmlPath = resolve(root, "docs", "UPDATED_COMPLETION_CHECKLIST_2026-06-04.html");

const markdown = readFileSync(markdownPath, "utf8");

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function closeList(state) {
  if (!state.inList) return "";
  state.inList = false;
  return "</ul>";
}

function renderMarkdown(source) {
  const state = { inList: false };
  const html = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      html.push(closeList(state));
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      html.push(closeList(state));
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const checklist = line.match(/^-\s+\[([ xX])\]\s+(.+)$/);
    if (checklist) {
      if (!state.inList) {
        state.inList = true;
        html.push('<ul class="checklist">');
      }
      const done = checklist[1].toLowerCase() === "x";
      html.push(
        `<li class="${done ? "done" : "open"}"><span class="box">${done ? "✓" : ""}</span><span>${inlineMarkdown(checklist[2])}</span></li>`,
      );
      continue;
    }

    const bullet = line.match(/^-\s+(.+)$/);
    if (bullet) {
      if (!state.inList) {
        state.inList = true;
        html.push('<ul class="checklist notes">');
      }
      html.push(`<li class="note"><span class="dot">•</span><span>${inlineMarkdown(bullet[1])}</span></li>`);
      continue;
    }

    html.push(closeList(state));
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  html.push(closeList(state));
  return html.join("\n");
}

const total = (markdown.match(/-\s+\[[ xX]\]\s+/g) ?? []).length;
const complete = (markdown.match(/-\s+\[[xX]\]\s+/g) ?? []).length;
const open = total - complete;
const percent = total ? Math.round((complete / total) * 100) : 0;
const lastUpdated = markdown.match(/Last updated:\s*(.+)/)?.[1] ?? "Not specified";

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>The BEE Suite Updated Completion Checklist</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #171717;
      --muted: #5f5f5f;
      --line: #ded6c5;
      --paper: #fffdf8;
      --back: #f6f0e2;
      --gold: #c58a04;
      --ok: #087f5b;
      --warn: #9a3412;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--back);
    }
    main {
      max-width: 1120px;
      margin: 0 auto;
      min-height: 100vh;
      padding: 34px 28px 64px;
      background: var(--paper);
    }
    .hero {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 24px;
      margin-bottom: 26px;
      color: #fff;
      background: linear-gradient(135deg, #171717, #332405 62%, #815b05);
    }
    .hero h1 { margin: 0 0 8px; font-size: 34px; letter-spacing: 0; }
    .hero p { margin: 0; color: #f1dfae; }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 20px;
    }
    .stat {
      border: 1px solid rgba(255, 255, 255, .18);
      border-radius: 14px;
      padding: 14px;
      background: rgba(255, 255, 255, .08);
    }
    .stat strong { display: block; font-size: 25px; }
    .stat span { color: #f1dfae; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      margin: 0 0 20px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: rgba(255, 253, 248, .94);
      backdrop-filter: blur(8px);
    }
    .toolbar input {
      min-width: min(100%, 340px);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 9px 11px;
      background: #fff;
      font: inherit;
    }
    .toolbar button {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 9px 11px;
      background: #fff;
      color: var(--ink);
      font: inherit;
      cursor: pointer;
    }
    h1, h2, h3 { break-after: avoid; }
    h1 { font-size: 30px; margin: 30px 0 8px; }
    h2 {
      font-size: 20px;
      margin: 30px 0 12px;
      padding-top: 14px;
      border-top: 1px solid var(--line);
      color: #3c2b04;
    }
    h3 { font-size: 16px; margin: 18px 0 8px; color: #4b5563; }
    p { margin: 8px 0; color: var(--muted); }
    ul { margin: 0 0 10px; padding: 0; list-style: none; }
    li { break-inside: avoid; }
    .checklist li {
      display: grid;
      grid-template-columns: 24px 1fr;
      gap: 10px;
      align-items: start;
      padding: 7px 0;
      border-bottom: 1px solid #f0eadc;
      font-size: 13px;
      line-height: 1.4;
    }
    .box {
      width: 17px;
      height: 17px;
      border: 1.5px solid #9c8f76;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 800;
      margin-top: 1px;
    }
    .done .box { background: var(--ok); border-color: var(--ok); color: #fff; }
    .open .box { background: #fff; }
    .done span:last-child { color: #374151; }
    .open span:last-child { color: #111827; font-weight: 520; }
    .dot { color: var(--gold); font-weight: 800; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: #f5ebd4;
      padding: 1px 4px;
      border-radius: 4px;
    }
    mark { background: #fde68a; color: inherit; padding: 0 2px; border-radius: 3px; }
    .hidden { display: none !important; }
    @media (max-width: 760px) {
      main { padding: 24px 16px 44px; }
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .hero h1 { font-size: 28px; }
    }
    @media print {
      body { background: #fff; }
      main { padding: 0; max-width: none; }
      .hero { color-adjust: exact; print-color-adjust: exact; }
      .toolbar { display: none; }
      h2 { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>The BEE Suite Updated Completion Checklist</h1>
      <p>Generated from <code>docs/UPDATED_COMPLETION_CHECKLIST_2026-06-04.md</code>. Last updated: ${escapeHtml(lastUpdated)}.</p>
      <div class="stats">
        <div class="stat"><strong>${total}</strong><span>Total Items</span></div>
        <div class="stat"><strong>${complete}</strong><span>Checked</span></div>
        <div class="stat"><strong>${open}</strong><span>Open</span></div>
        <div class="stat"><strong>${percent}%</strong><span>Complete</span></div>
      </div>
    </section>
    <section class="toolbar" aria-label="Checklist tools">
      <input id="filter" type="search" placeholder="Filter checklist items..." aria-label="Filter checklist items">
      <div>
        <button type="button" data-filter="all">All</button>
        <button type="button" data-filter="open">Open only</button>
        <button type="button" data-filter="done">Complete only</button>
        <button type="button" onclick="window.print()">Print</button>
      </div>
    </section>
    <section id="content">
${renderMarkdown(markdown)}
    </section>
  </main>
  <script>
    const searchInput = document.querySelector("#filter");
    const buttons = document.querySelectorAll("[data-filter]");
    let statusFilter = "all";

    function applyFilters() {
      const query = searchInput.value.trim().toLowerCase();
      document.querySelectorAll(".checklist li").forEach((item) => {
        const statusMatch = statusFilter === "all" || item.classList.contains(statusFilter);
        const queryMatch = !query || item.textContent.toLowerCase().includes(query);
        item.classList.toggle("hidden", !(statusMatch && queryMatch));
      });
    }

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        statusFilter = button.dataset.filter;
        applyFilters();
      });
    });
    searchInput.addEventListener("input", applyFilters);
  </script>
</body>
</html>
`;

writeFileSync(htmlPath, html);
console.log(`Wrote ${htmlPath}`);
