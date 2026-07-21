import yauzl from "yauzl";

type CsvRow = Record<string, string>;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim()); field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = (rows[0] ?? []).map((value) => value.replace(/^\ufeff/, ""));
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""])));
}

function zipEntries(buffer: Buffer) {
  return new Promise<Map<string, Buffer>>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error ?? new Error("The ProCare ZIP could not be opened."));
      const entries = new Map<string, Buffer>();
      let totalUncompressedBytes = 0;
      zip.readEntry();
      zip.on("entry", (entry) => {
        totalUncompressedBytes += entry.uncompressedSize;
        if (entries.size >= 20 || totalUncompressedBytes > 25 * 1024 * 1024) {
          zip.close();
          return reject(new Error("The ProCare ZIP exceeds the safe import size or file-count limit."));
        }
        if (/\/$/.test(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return reject(streamError ?? new Error("A ProCare ZIP entry could not be read."));
          const chunks: Buffer[] = [];
          stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          stream.on("error", reject);
          stream.on("end", () => { entries.set(entry.fileName.toLowerCase().split("/").pop() ?? entry.fileName.toLowerCase(), Buffer.concat(chunks)); zip.readEntry(); });
        });
      });
      zip.on("end", () => resolve(entries));
      zip.on("error", reject);
    });
  });
}

function fullName(row: CsvRow) {
  return row["Full Name"] || [row["First Name"], row["Middle Initial"], row["Last Name"]].filter(Boolean).join(" ");
}

function address(row?: CsvRow) {
  if (!row) return "";
  const locality = [row["Add 1, City"], row["Add 1, Region"], row["Add 1, Postal Code"]].filter(Boolean).join(", ");
  return [row["Add 1, Line 1"], row["Add 1, Line 2"], locality].filter(Boolean).join("\n");
}

export async function buildProcareMultiReportRowsFromFiles(entries: Map<string, Buffer>) {
  const required = ["enrollment.csv", "parentinfo.csv", "relationships.csv", "childinfo.csv"];
  const missing = required.filter((name) => !entries.has(name));
  if (missing.length) throw new Error(`The ProCare export is missing: ${missing.join(", ")}. Select all four CSV reports together or upload their ZIP.`);
  const read = (name: string) => parseCsv(entries.get(name)!.toString("utf8"));
  const enrollment = read("enrollment.csv");
  const parents = read("parentinfo.csv");
  const relationships = read("relationships.csv");
  const childInfo = read("childinfo.csv");

  const accountsByPerson = new Map<string, Set<string>>();
  const peopleByAccount = new Map<string, CsvRow[]>();
  for (const person of parents) {
    const personAccounts = accountsByPerson.get(person["Person ID"]) ?? new Set<string>();
    personAccounts.add(person["Account ID"]);
    accountsByPerson.set(person["Person ID"], personAccounts);
    peopleByAccount.set(person["Account ID"], [...(peopleByAccount.get(person["Account ID"]) ?? []), person]);
  }
  const relationshipsByChild = new Map<string, CsvRow[]>();
  for (const relationship of relationships) {
    relationshipsByChild.set(relationship["Child ID"], [...(relationshipsByChild.get(relationship["Child ID"]) ?? []), relationship]);
  }
  const childDetails = new Map<string, CsvRow[]>();
  for (const detail of childInfo) childDetails.set(detail["Child ID"], [...(childDetails.get(detail["Child ID"]) ?? []), detail]);

  return enrollment.map((child) => {
    const related = (relationshipsByChild.get(child["Child ID"]) ?? []).filter((row) => row["Person Type"] === "Relationship");
    const accountIds = new Set<string>();
    for (const relationship of related) for (const accountId of accountsByPerson.get(relationship["Person ID"]) ?? []) accountIds.add(accountId);
    const accountId = accountIds.size === 1 ? [...accountIds][0] : "";
    const payers = (peopleByAccount.get(accountId) ?? []).filter((row) => row["Person Type"] === "Payer");
    const payerPersonIds = new Set(payers.map((row) => row["Person ID"]).filter(Boolean));
    const primary = payers[0];
    const secondary = payers[1];
    const allergyRecords = (childDetails.get(child["Child ID"]) ?? [])
      .filter((row) => row["Category Description"].toLowerCase() === "allergies" && row["Item Is Active"] === "Checked")
      .map((row) => row["Item Description"]).filter(Boolean);
    const allergies = allergyRecords.join("; ");
    const relationshipRecords = related.map((row) => ({
      externalId: row["Person ID"], name: fullName(row), relation: row["Relationship Type"] || "Guardian",
      email: row["Email"], phone: row["Phone 1"] || row["Phone 2"], livesWith: row["Lives With"] === "Checked",
      emergency: row["Emergency"] === "Checked", authorizedPickup: row["Authorized Pickup"] === "Checked",
      guardian: payerPersonIds.has(row["Person ID"]) || row["Lives With"] === "Checked" || /^(mom|dad|mother|father|parent|foster parent)$/i.test(row["Relationship Type"]),
    }));
    return {
      "row type": "cordera_multi_report_child",
      "account id": accountId,
      "family name": primary?.["Last Name"] ? `${primary["Last Name"]} Household` : "",
      "child id": child["Child ID"], "child name": fullName(child), "child first name": child["First Name"],
      "child middle name": child["Middle Initial"], "child last name": child["Last Name"], "date of birth": child["Date of Birth"],
      "gender": child["Gender"], "classroom": child["Primary Classroom"], "classroom id": child["Classroom ID"],
      "child status": child["Enrollment Status"], "start date": child["Status Start Date"], "end date": child["Status End Date"],
      "guardian id": primary?.["Person ID"] ?? "", "guardian name": primary ? fullName(primary) : "", "guardian email": primary?.["Email"] ?? "",
      "guardian phone": primary?.["Phone 1"] ?? "", "address": address(primary),
      "secondary guardian id": secondary?.["Person ID"] ?? "", "secondary guardian": secondary ? fullName(secondary) : "",
      "secondary email": secondary?.["Email"] ?? "", "secondary phone": secondary?.["Phone 1"] ?? "",
      "allergies": allergies, "procare allergy records": JSON.stringify(allergyRecords), "procare relationship records": JSON.stringify(relationshipRecords),
      "import warning": accountIds.size === 0 ? "No reliable ProCare account link was found." : accountIds.size > 1 ? "Multiple ProCare account links were found." : "",
    };
  });
}

export async function buildProcareMultiReportRows(buffer: Buffer) {
  return buildProcareMultiReportRowsFromFiles(await zipEntries(buffer));
}
