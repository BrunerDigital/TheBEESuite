import type { ReportRows } from "@/lib/reporting-analytics";

const widths = [86, 100, 103, 76, 85, 110, 95, 89];

function escapeText(value: string) {
  const punctuation: Record<string, number> = { "’": 146, "‘": 145, "“": 147, "”": 148, "–": 150, "—": 151 };
  return Array.from(value).map(char => {
    if (char === "\\" || char === "(" || char === ")") return `\\${char}`;
    const code = punctuation[char] ?? char.charCodeAt(0);
    return code >= 32 && code <= 126 ? char : code >= 128 && code <= 255 ? `\\${code.toString(8).padStart(3, "0")}` : "?";
  }).join("");
}

function wrap(value: unknown, length: number) {
  const words = String(value ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + word.length + 1 > length) { lines.push(current); current = ""; }
    let rest = word;
    while (rest.length > length) { if (current) { lines.push(current); current = ""; } lines.push(rest.slice(0, length)); rest = rest.slice(length); }
    current = current ? `${current} ${rest}` : rest;
  }
  if (current || !lines.length) lines.push(current);
  return lines;
}

/** Landscape tables repeat column headings and paginate by wrapped row height. */
export function tuitionScheduleRowsToPdf(input: ReportRows) {
  const text = (value: string, x: number, y: number, size = 7, font = "F1") => `BT /${font} ${size} Tf ${x} ${y} Td (${escapeText(value)}) Tj ET`;
  const streams: string[][] = [];
  let commands: string[];
  let top: number;
  function drawRow(cells: unknown[], header = false) {
    const lines = cells.map((value, index) => wrap(value, Math.floor((widths[index] - 8) / 4.2)));
    const height = Math.max(...lines.map(cell => cell.length)) * 9 + 8;
    if (!header && top - height < 32) startPage();
    let x = 24;
    lines.forEach((cell, index) => {
      commands.push(`${x} ${top - height} ${widths[index]} ${height} re S`);
      cell.forEach((line, lineIndex) => commands.push(text(line, x + 4, top - 11 - lineIndex * 9)));
      x += widths[index];
    });
    top -= height;
  }
  function startPage() {
    commands = ["0.75 G 0.4 w"];
    streams.push(commands);
    commands.push(text(input.title, 24, 582, 15, "F2"));
    commands.push(text(`Data as of ${input.traceability.generatedAt} | ${input.rows.length} children | ${input.traceability.centers.length} schools`, 24, 566, 8));
    commands.push(text("Saved net rates include recurring additions and credits. Biweekly = 2 weekly rates; every 4 weeks = 4 weekly rates.", 24, 551, 7));
    commands.push(text("Monthly is a calendar-month rate. Disabled assignments do not create recurring invoices. Missing and $0 rates stay visible.", 24, 540, 7));
    commands.push(text("Source: saved child tuition assignments. Amounts are scheduled tuition, not balances, payments or autopay status.", 24, 529, 7));
    top = 516;
    drawRow(input.headers, true);
  }
  startPage();
  input.rows.forEach(row => drawRow(row));
  if (!input.rows.length) commands!.push(text("No currently enrolled children match the report filters.", 28, top! - 15));
  streams.forEach((stream, index) => stream.push(text(`Page ${index + 1} of ${streams.length}`, 670, 16)));

  const pageIds = streams.map((_, index) => 5 + index * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${streams.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  streams.forEach((commands, index) => {
    const stream = commands.join("\n");
    const pageId = pageIds[index];
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  });
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body)); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}
