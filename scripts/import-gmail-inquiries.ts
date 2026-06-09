import "./load-env";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EnrollmentStage, type Prisma } from "@prisma/client";

type GmailRow = {
  ID: string;
  Thread: string;
  Date: string;
  From: string;
  To: string;
  Subject: string;
  Body: string;
  Link: string;
};

type CenterMatch = {
  id: string;
  name: string;
  status: string;
  crmLocationId: string | null;
  locationId: string | null;
};

type ParsedInquiry = {
  gmailId: string;
  gmailThreadId: string;
  gmailDate: Date;
  from: string;
  to: string;
  subject: string;
  link: string;
  parentName: string;
  email: string;
  phone: string;
  program: string;
  locationId: string;
  publicLocationId: string;
  locationName: string;
  pageUrl: string;
  sourceForm: string;
  originalSubmittedAt: string;
  message: string;
  beeSuiteLeadId: string;
  format: "bee_suite" | "kidcity_enterprises" | "brunerdigital";
};

type ImportCandidate = ParsedInquiry & {
  center: CenterMatch;
  dedupeKey: string;
};

const defaultStart = "2026-05-13T00:00:00.000Z";
const defaultEnd = new Date().toISOString();

function argValue(name: string, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const inputPath = resolve(argValue("--file", "D:/Brenden Bruner/Downloads/Gmail export.csv"));
const envFile = argValue("--env-file");
const startDate = new Date(argValue("--start", defaultStart));
const endDate = new Date(argValue("--end", defaultEnd));
const commit = process.argv.includes("--commit");
const parseOnly = process.argv.includes("--parse-only");
const sqlMode = argValue("--sql-mode") as "" | "dry-run" | "import";
const sqlBatch = Number.parseInt(argValue("--sql-batch", "0"), 10);
const sqlBatchSize = Number.parseInt(argValue("--sql-batch-size", "50"), 10);

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const separator = trimmed.indexOf("=");
  if (separator === -1) return null;
  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value: value.replace(/\\n/g, "\n") };
}

function loadEnvFile(path: string) {
  if (!path || !existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed || !parsed.value.trim()) continue;
    process.env[parsed.key] = parsed.value;
  }
}

loadEnvFile(envFile);

if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || "";
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(value);
      value = "";
      continue;
    }
    if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += char;
  }

  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

function readGmailRows(path: string): GmailRow[] {
  const rows = parseCsv(readFileSync(path, "utf8"));
  const headers = rows.shift() || [];
  return rows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = row[index] || "";
      });
      return record as GmailRow;
    });
}

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function cleanMultiline(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function normalizeEmail(value: string) {
  return clean(value).toLowerCase();
}

function normalizeLocation(value: string) {
  return clean(value).replace(/\s*\|\s*/g, " | ");
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function titleFromEmail(email: string) {
  const local = email.split("@")[0] || "website inquiry";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .slice(0, 80);
}

function splitName(name: string) {
  const parts = clean(name).split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function makeImportId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(8).toString("hex")}`;
}

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

function dollarQuote(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  let tag = "gmail_import_payload";
  while (text.includes(`$${tag}$`)) {
    tag += "_x";
  }
  return `$${tag}$${text}$${tag}$`;
}

const locationAliasMap: Record<string, string[]> = {
  "co | woodland park - east midland": ["CO | Woodland Par", "Kid City USA - Woodland Park - East Midland"],
  "co | woodland park - forest edge": ["CO | Forest Edge", "Kid City USA - Woodland Park - Forest Edge"],
  "fl | douglas": ["FL | Altamonte - Douglas", "FL | Altamonte Springs 1 - Douglas Ave", "Kid City USA - Altamonte - Douglas"],
  "nv | las vegas - bonanza": ["NV | Las Vegas 2 - Bonanza", "Kid City USA - NV | Las Vegas 2 - Bonanza"],
  "nv | las vegas - page": ["NV | Las Vegas 1 - Page", "Kid City USA - NV | Las Vegas 1 - Page"],
};

function locationAliases(inquiry: ParsedInquiry) {
  const keys = [inquiry.locationId, inquiry.publicLocationId, inquiry.locationName]
    .map((value) => centerKey(value))
    .filter(Boolean);
  return Array.from(new Set(keys.flatMap((key) => locationAliasMap[key] || [])));
}

function fieldFromBody(body: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(.+)$`, "im");
    const match = body.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
}

function parseBeeOrKidCityBody(row: GmailRow): ParsedInquiry | null {
  const body = cleanMultiline(row.Body);
  const parentName = fieldFromBody(body, ["Parent", "Parent Name"]);
  const email = normalizeEmail(fieldFromBody(body, ["Email"]));
  const phone = clean(fieldFromBody(body, ["Phone"]));
  const program = clean(fieldFromBody(body, ["Program"]));
  const locationId = normalizeLocation(fieldFromBody(body, ["Location ID", "Location"]));
  const publicLocationId = normalizeLocation(fieldFromBody(body, ["Public Location ID"]));
  const pageUrl = clean(fieldFromBody(body, ["Page", "Source Url", "Source URL"]));
  const beeSuiteLeadId = clean(fieldFromBody(body, ["BEE Suite Lead ID"]));

  if (!email || !isEmail(email) || !locationId || !/kid city|inquiry|location id|parent name|parent:/i.test(body)) {
    return null;
  }

  return {
    gmailId: row.ID,
    gmailThreadId: row.Thread,
    gmailDate: new Date(row.Date),
    from: row.From,
    to: row.To,
    subject: row.Subject,
    link: row.Link,
    parentName: parentName || titleFromEmail(email),
    email,
    phone,
    program: program || "Website Inquiry",
    locationId,
    publicLocationId,
    locationName: normalizeLocation(fieldFromBody(body, ["Location"])),
    pageUrl,
    sourceForm: "",
    originalSubmittedAt: "",
    message: "",
    beeSuiteLeadId,
    format: beeSuiteLeadId || /mrbee@thebeesuite\.io/i.test(row.From) ? "bee_suite" : "kidcity_enterprises",
  };
}

function parseBrunerDigitalBody(row: GmailRow): ParsedInquiry | null {
  const lines = cleanMultiline(row.Body)
    .split("\n")
    .map((line) => clean(line))
    .filter(Boolean);

  if (lines.length < 5) return null;
  const locationId = normalizeLocation(lines[0]);
  const email = normalizeEmail(lines[1]);
  if (!/^[A-Z]{2}\s\|\s/i.test(locationId) || !isEmail(email)) return null;

  return {
    gmailId: row.ID,
    gmailThreadId: row.Thread,
    gmailDate: new Date(row.Date),
    from: row.From,
    to: row.To,
    subject: row.Subject,
    link: row.Link,
    parentName: titleFromEmail(email),
    email,
    phone: clean(lines[3]),
    program: "Website Inquiry",
    locationId,
    publicLocationId: locationId,
    locationName: locationId,
    pageUrl: "",
    sourceForm: clean(lines[4]),
    originalSubmittedAt: clean(lines[2]),
    message: lines.slice(5).join("\n").slice(0, 2_000),
    beeSuiteLeadId: "",
    format: "brunerdigital",
  };
}

function parseInquiry(row: GmailRow) {
  return parseBeeOrKidCityBody(row) || parseBrunerDigitalBody(row);
}

function isTestInquiry(inquiry: ParsedInquiry) {
  return (
    inquiry.email.endsWith("@example.com") ||
    /bee route test|test inquiry/i.test(inquiry.parentName) ||
    /bee_form_test=1/i.test(inquiry.pageUrl)
  );
}

function hasChildcareIntent(value: string) {
  return /\b(day\s*care|daycare|child\s*care|infant|toddler|preschool|pre-?k|vpk|after\s*school|school\s*age|summer\s+(camp|care)|enroll|tour|tuition|month[-\s]?old|year[-\s]?old|daughter|son|children|child|baby|availability|waitlist|rates?|opening|spot|part[-\s]?time|full[-\s]?time)\b/i.test(
    value,
  );
}

function isLikelySpamInquiry(inquiry: ParsedInquiry) {
  if (inquiry.format !== "brunerdigital" || inquiry.sourceForm !== "Embed Form" || !inquiry.message.trim()) {
    return false;
  }
  if (hasChildcareIntent(inquiry.message)) return false;

  return [
    /\bthis product\b/i,
    /\bone of these\b/i,
    /\bmy neighbor\b/i,
    /\bmy co-worker\b/i,
    /\bi saw one of these\b/i,
    /\bheard about this on .+ radio\b/i,
    /\bi use it .+ when i'm in my\b/i,
    /\bit only works when i'm\b/i,
    /\btalk about\b/i,
    /\bthe box this comes in\b/i,
    /\bi tried to .+ but got .+ all over it\b/i,
    /\bone of my hobbies is\b/i,
    /\bmy .+ loves to play with it\b/i,
    /\bworks .+ improves my\b/i,
  ].some((pattern) => pattern.test(inquiry.message));
}

function dedupeKey(inquiry: ParsedInquiry) {
  return [
    normalizeLocation(inquiry.locationId || inquiry.publicLocationId || inquiry.locationName).toLowerCase(),
    inquiry.email,
  ].join("|");
}

function scoreLead(inquiry: ParsedInquiry) {
  let score = 70;
  if (/daycare|preschool|toddler|infant|summer|school/i.test(inquiry.program)) score += 10;
  if (inquiry.locationId) score += 5;
  if (inquiry.message) score += 5;
  return Math.min(score, 95);
}

function centerKey(value: string | null | undefined) {
  return normalizeLocation(value || "").toLowerCase();
}

function centerMatches(center: CenterMatch, inquiry: ParsedInquiry) {
  const keys = new Set(
    [inquiry.locationId, inquiry.publicLocationId, inquiry.locationName]
      .map(centerKey)
      .filter(Boolean),
  );
  return Boolean(
    (center.crmLocationId && keys.has(centerKey(center.crmLocationId))) ||
      (center.locationId && keys.has(centerKey(center.locationId))) ||
      keys.has(centerKey(center.name)),
  );
}

function leadCustomFields(inquiry: ParsedInquiry, center: CenterMatch): Prisma.InputJsonObject {
  return {
    intakeType: "gmail_inquiry_repair_import",
    repairImportVersion: "gmail-inquiry-repair-2026-06-09",
    gmailMessageId: inquiry.gmailId,
    gmailThreadId: inquiry.gmailThreadId,
    gmailDate: inquiry.gmailDate.toISOString(),
    gmailSubject: inquiry.subject,
    gmailFrom: inquiry.from,
    gmailTo: inquiry.to,
    gmailLink: inquiry.link,
    originalFormat: inquiry.format,
    originalSubmittedAt: inquiry.originalSubmittedAt || null,
    originalFormSource: inquiry.sourceForm || null,
    originalMessage: inquiry.message || null,
    parentName: inquiry.parentName,
    email: inquiry.email,
    phone: inquiry.phone,
    program: inquiry.program,
    locationId: inquiry.locationId,
    publicLocationId: inquiry.publicLocationId,
    locationName: inquiry.locationName,
    pageUrl: inquiry.pageUrl,
    resolvedCenterId: center.id,
    resolvedCenterName: center.name,
    resolvedCrmLocationId: center.crmLocationId,
    resolvedLocationId: center.locationId,
  };
}

function noteBody(inquiry: ParsedInquiry) {
  const lines = [
    `Imported from Gmail inquiry notification dated ${inquiry.gmailDate.toISOString()}.`,
    `Location: ${inquiry.locationId || inquiry.locationName}`,
    `Program: ${inquiry.program}`,
    `Email: ${inquiry.email}`,
    `Phone: ${inquiry.phone || "not provided"}`,
  ];
  if (inquiry.sourceForm) lines.push(`Original form: ${inquiry.sourceForm}`);
  if (inquiry.originalSubmittedAt) lines.push(`Original submitted at: ${inquiry.originalSubmittedAt}`);
  if (inquiry.message) lines.push(`Original message: ${inquiry.message}`);
  return lines.join("\n");
}

function sqlLocationKeysExpression(alias: string) {
  return `array_remove(array[
    nullif(lower(regexp_replace(coalesce(${alias}."locationId", ''), '\\s*\\|\\s*', ' | ', 'g')), ''),
    nullif(lower(regexp_replace(coalesce(${alias}."publicLocationId", ''), '\\s*\\|\\s*', ' | ', 'g')), ''),
    nullif(lower(regexp_replace(coalesce(${alias}."locationName", ''), '\\s*\\|\\s*', ' | ', 'g')), '')
  ] || coalesce((
    select array_agg(nullif(lower(regexp_replace(location_alias.value, '\\s*\\|\\s*', ' | ', 'g')), ''))
    from jsonb_array_elements_text(coalesce(${alias}."locationAliases", '[]'::jsonb)) as location_alias(value)
  ), array[]::text[]), null)`;
}

function sqlCenterMatchClause(keysAlias: string) {
  return `lower(regexp_replace(coalesce(c."crmLocationId", ''), '\\s*\\|\\s*', ' | ', 'g')) = any(${keysAlias})
       or lower(regexp_replace(coalesce(c."locationId", ''), '\\s*\\|\\s*', ' | ', 'g')) = any(${keysAlias})
       or lower(regexp_replace(coalesce(c.name, ''), '\\s*\\|\\s*', ' | ', 'g')) = any(${keysAlias})`;
}

function buildSqlDryRun(uniqueParsed: ParsedInquiry[], batch: number, batchSize: number) {
  if (!Number.isInteger(batch) || batch < 0) {
    throw new Error("--sql-batch must be a non-negative integer.");
  }
  if (!Number.isInteger(batchSize) || batchSize <= 0 || batchSize > 1_000) {
    throw new Error("--sql-batch-size must be between 1 and 1000.");
  }

  const batchItems = uniqueParsed.slice(batch * batchSize, (batch + 1) * batchSize);
  const payload = batchItems.map((inquiry) => ({
    gmailId: inquiry.gmailId,
    emailHash: md5(inquiry.email),
    locationId: inquiry.locationId,
    publicLocationId: inquiry.publicLocationId,
    locationName: inquiry.locationName,
    locationAliases: locationAliases(inquiry),
    format: inquiry.format,
  }));

  return `
with raw as (
  select *
  from jsonb_to_recordset(${dollarQuote(payload)}::jsonb) as r(
    "gmailId" text,
    "emailHash" text,
    "locationId" text,
    "publicLocationId" text,
    "locationName" text,
    "locationAliases" jsonb,
    "format" text
  )
),
candidate_locations as (
  select r.*, ${sqlLocationKeysExpression("r")} as location_keys
  from raw r
),
matched as (
  select r.*, c.id as "centerId", coalesce(c."crmLocationId", c."locationId", c.name) as "centerLabel"
  from candidate_locations r
  left join lateral (
    select c.*
    from "Center" c
    where c.status <> 'closed'
      and (${sqlCenterMatchClause("r.location_keys")})
    order by c."createdAt" asc
    limit 1
  ) c on true
),
classified as (
  select
    m.*,
    exists (
      select 1
      from "Lead" l
      where l."centerId" = m."centerId"
        and l."externalId" = 'gmail-inquiry:' || m."gmailId"
    ) as external_exists,
    exists (
      select 1
      from "Lead" l
      where l."centerId" = m."centerId"
        and l.email is not null
        and md5(lower(trim(l.email))) = m."emailHash"
    ) as email_exists
  from matched m
),
rollup as (
  select
    *,
    case
      when "centerId" is null then 'unresolved'
      when external_exists or email_exists then 'existing_crm_duplicate'
      else 'planned_import'
    end as import_status
  from classified
)
select jsonb_build_object(
  'batch', ${batch},
  'batchSize', ${batchSize},
  'candidateRows', (select count(*) from raw),
  'matchedCenters', (select count(*) from rollup where "centerId" is not null),
  'unresolvedCenters', (select count(*) from rollup where import_status = 'unresolved'),
  'existingCrmDuplicates', (select count(*) from rollup where import_status = 'existing_crm_duplicate'),
  'plannedImports', (select count(*) from rollup where import_status = 'planned_import'),
  'byStatus', (
    select coalesce(jsonb_object_agg(import_status, row_count order by import_status), '{}'::jsonb)
    from (
      select import_status, count(*) as row_count
      from rollup
      group by import_status
    ) counts
  ),
  'plannedImportsByLocation', (
    select coalesce(jsonb_agg(jsonb_build_object('location', "centerLabel", 'count', row_count) order by row_count desc, "centerLabel"), '[]'::jsonb)
    from (
      select "centerLabel", count(*) as row_count
      from rollup
      where import_status = 'planned_import'
      group by "centerLabel"
      order by row_count desc, "centerLabel"
      limit 100
    ) counts
  ),
  'duplicatesByLocation', (
    select coalesce(jsonb_agg(jsonb_build_object('location', "centerLabel", 'count', row_count) order by row_count desc, "centerLabel"), '[]'::jsonb)
    from (
      select "centerLabel", count(*) as row_count
      from rollup
      where import_status = 'existing_crm_duplicate'
      group by "centerLabel"
      order by row_count desc, "centerLabel"
      limit 50
    ) counts
  ),
  'unresolvedLocations', (
    select coalesce(jsonb_agg(jsonb_build_object('location', coalesce(nullif("locationId", ''), nullif("locationName", ''), 'unknown'), 'count', row_count) order by row_count desc), '[]'::jsonb)
    from (
      select coalesce(nullif("locationId", ''), nullif("locationName", ''), 'unknown') as "locationId", "locationName", count(*) as row_count
      from rollup
      where import_status = 'unresolved'
      group by coalesce(nullif("locationId", ''), nullif("locationName", ''), 'unknown'), "locationName"
      order by row_count desc
      limit 50
    ) counts
  )
) as summary
from rollup
limit 1;
`.trim();
}

function buildSqlImport(uniqueParsed: ParsedInquiry[], batch: number, batchSize: number) {
  if (!Number.isInteger(batch) || batch < 0) {
    throw new Error("--sql-batch must be a non-negative integer.");
  }
  if (!Number.isInteger(batchSize) || batchSize <= 0 || batchSize > 100) {
    throw new Error("--sql-batch-size must be between 1 and 100.");
  }

  const batchItems = uniqueParsed.slice(batch * batchSize, (batch + 1) * batchSize);
  const payload = batchItems.map((inquiry) => {
    const names = splitName(inquiry.parentName);
    return {
      leadId: makeImportId("lead"),
      taskId: makeImportId("task"),
      noteId: makeImportId("note"),
      gmailId: inquiry.gmailId,
      gmailDate: inquiry.gmailDate.toISOString(),
      familyName: inquiry.parentName || "Website Inquiry",
      parentFirstName: names.firstName || null,
      parentLastName: names.lastName || null,
      email: inquiry.email,
      emailHash: md5(inquiry.email),
      phone: inquiry.phone || null,
      program: inquiry.program,
      score: scoreLead(inquiry),
      locationId: inquiry.locationId,
      publicLocationId: inquiry.publicLocationId,
      locationName: inquiry.locationName,
      locationAliases: locationAliases(inquiry),
      pageUrl: inquiry.pageUrl || null,
      gmailThreadId: inquiry.gmailThreadId || null,
      gmailSubject: inquiry.subject || null,
      gmailFrom: inquiry.from || null,
      gmailTo: inquiry.to || null,
      gmailLink: inquiry.link || null,
      originalFormat: inquiry.format,
      originalSubmittedAt: inquiry.originalSubmittedAt || null,
      originalFormSource: inquiry.sourceForm || null,
      originalMessage: inquiry.message || null,
    };
  });

  return `
with raw as (
  select *
  from jsonb_to_recordset(${dollarQuote(payload)}::jsonb) as r(
    "leadId" text,
    "taskId" text,
    "noteId" text,
    "gmailId" text,
    "gmailDate" text,
    "familyName" text,
    "parentFirstName" text,
    "parentLastName" text,
    "email" text,
    "emailHash" text,
    "phone" text,
    "program" text,
    "score" integer,
    "locationId" text,
    "publicLocationId" text,
    "locationName" text,
    "locationAliases" jsonb,
    "pageUrl" text,
    "gmailThreadId" text,
    "gmailSubject" text,
    "gmailFrom" text,
    "gmailTo" text,
    "gmailLink" text,
    "originalFormat" text,
    "originalSubmittedAt" text,
    "originalFormSource" text,
    "originalMessage" text
  )
),
candidate_locations as (
  select r.*, ${sqlLocationKeysExpression("r")} as location_keys
  from raw r
),
matched as (
  select r.*, c.id as "centerId", c.name as "centerName", c."crmLocationId", c."locationId" as "resolvedLocationId"
  from candidate_locations r
  left join lateral (
    select c.*
    from "Center" c
    where c.status <> 'closed'
      and (${sqlCenterMatchClause("r.location_keys")})
    order by c."createdAt" asc
    limit 1
  ) c on true
),
eligible as (
  select
    m.*,
    jsonb_build_object(
      'intakeType', 'gmail_inquiry_repair_import',
      'repairImportVersion', 'gmail-inquiry-repair-2026-06-09',
      'gmailMessageId', m."gmailId",
      'gmailThreadId', m."gmailThreadId",
      'gmailDate', m."gmailDate",
      'gmailSubject', m."gmailSubject",
      'gmailFrom', m."gmailFrom",
      'gmailTo', m."gmailTo",
      'gmailLink', m."gmailLink",
      'originalFormat', m."originalFormat",
      'originalSubmittedAt', m."originalSubmittedAt",
      'originalFormSource', m."originalFormSource",
      'originalMessage', m."originalMessage",
      'parentName', m."familyName",
      'email', m.email,
      'phone', m.phone,
      'program', m.program,
      'locationId', m."locationId",
      'publicLocationId', m."publicLocationId",
      'locationName', m."locationName",
      'pageUrl', m."pageUrl",
      'resolvedCenterId', m."centerId",
      'resolvedCenterName', m."centerName",
      'resolvedCrmLocationId', m."crmLocationId",
      'resolvedLocationId', m."resolvedLocationId"
    ) as "resolvedCustomFields"
  from matched m
  where m."centerId" is not null
    and not exists (
      select 1
      from "Lead" l
      where l."centerId" = m."centerId"
        and l."externalId" = 'gmail-inquiry:' || m."gmailId"
    )
    and not exists (
      select 1
      from "Lead" l
      where l."centerId" = m."centerId"
        and l.email is not null
        and md5(lower(trim(l.email))) = m."emailHash"
    )
),
inserted_leads as (
  insert into "Lead" (
    id,
    "centerId",
    "externalId",
    "familyName",
    "parentFirstName",
    "parentLastName",
    email,
    phone,
    "leadSource",
    "ageGroupInterest",
    "programInterest",
    stage,
    score,
    status,
    "customFields",
    "createdAt",
    "updatedAt"
  )
  select
    e."leadId",
    e."centerId",
    'gmail-inquiry:' || e."gmailId",
    e."familyName",
    e."parentFirstName",
    e."parentLastName",
    e.email,
    e.phone,
    'Kid City USA Website Inquiry Email Repair',
    e.program,
    e.program,
    'NEW_INQUIRY'::"EnrollmentStage",
    e.score,
    'open',
    e."resolvedCustomFields",
    (e."gmailDate"::timestamptz at time zone 'UTC'),
    now()
  from eligible e
  on conflict ("centerId", "externalId") do nothing
  returning id
),
inserted_tasks as (
  insert into "Task" (id, "leadId", title, status)
  select e."taskId", e."leadId", 'Follow up with ' || e."familyName", 'open'
  from eligible e
  join inserted_leads l on l.id = e."leadId"
  returning id
),
inserted_notes as (
  insert into "Note" (id, "leadId", body, restricted, "createdAt")
  select
    e."noteId",
    e."leadId",
    concat_ws(
      E'\n',
      'Imported from Gmail inquiry notification dated ' || e."gmailDate" || '.',
      'Location: ' || coalesce(nullif(e."locationId", ''), nullif(e."locationName", ''), 'not provided'),
      'Program: ' || coalesce(nullif(e.program, ''), 'not provided'),
      'Email: ' || e.email,
      'Phone: ' || coalesce(nullif(e.phone, ''), 'not provided'),
      case when nullif(e."originalFormSource", '') is not null then 'Original form: ' || e."originalFormSource" end,
      case when nullif(e."originalSubmittedAt", '') is not null then 'Original submitted at: ' || e."originalSubmittedAt" end,
      case when nullif(e."originalMessage", '') is not null then 'Original message: ' || e."originalMessage" end
    ),
    false,
    now()
  from eligible e
  join inserted_leads l on l.id = e."leadId"
  returning id
)
select jsonb_build_object(
  'batch', ${batch},
  'batchSize', ${batchSize},
  'batchCandidateRows', (select count(*) from raw),
  'eligibleRows', (select count(*) from eligible),
  'insertedLeads', (select count(*) from inserted_leads),
  'insertedTasks', (select count(*) from inserted_tasks),
  'insertedNotes', (select count(*) from inserted_notes),
  'skippedUnresolvedOrDuplicate', (select count(*) from raw) - (select count(*) from eligible)
) as summary;
`.trim();
}

function byCount<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) || 0) + 1);
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => ({ name, count }));
}

async function main() {
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid --start or --end date.");
  }

  const rows = readGmailRows(inputPath);
  const inRange = rows.filter((row) => {
    const date = new Date(row.Date);
    return !Number.isNaN(date.getTime()) && date >= startDate && date < endDate;
  });

  const parsed: ParsedInquiry[] = [];
  let skippedUnparseable = 0;
  let skippedAlreadyBeeSuite = 0;
  let skippedTests = 0;
  let skippedLikelySpam = 0;
  for (const row of inRange) {
    const inquiry = parseInquiry(row);
    if (!inquiry) {
      skippedUnparseable += 1;
      continue;
    }
    if (inquiry.beeSuiteLeadId) {
      skippedAlreadyBeeSuite += 1;
      continue;
    }
    if (isTestInquiry(inquiry)) {
      skippedTests += 1;
      continue;
    }
    if (isLikelySpamInquiry(inquiry)) {
      skippedLikelySpam += 1;
      continue;
    }
    parsed.push(inquiry);
  }

  const inputDedupe = new Map<string, ParsedInquiry>();
  const inputDuplicateIds: string[] = [];
  for (const inquiry of parsed.sort((left, right) => left.gmailDate.getTime() - right.gmailDate.getTime())) {
    const key = dedupeKey(inquiry);
    if (inputDedupe.has(key)) {
      inputDuplicateIds.push(inquiry.gmailId);
      continue;
    }
    inputDedupe.set(key, inquiry);
  }

  const uniqueParsed = Array.from(inputDedupe.values());

  if (sqlMode) {
    if (sqlMode === "dry-run") {
      console.log(buildSqlDryRun(uniqueParsed, sqlBatch, sqlBatchSize));
      return;
    }
    if (sqlMode === "import") {
      console.log(buildSqlImport(uniqueParsed, sqlBatch, sqlBatchSize));
      return;
    }
    throw new Error("--sql-mode must be dry-run or import.");
  }

  if (parseOnly) {
    console.log(
      JSON.stringify(
        {
          mode: "parse-only",
          inputPath,
          dateWindow: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
          counts: {
            totalCsvRows: rows.length,
            rowsInDateWindow: inRange.length,
            parsedInquiryRows: parsed.length,
            skippedUnparseable,
            skippedAlreadyBeeSuite,
            skippedTests,
            skippedLikelySpam,
            inputDuplicates: inputDuplicateIds.length,
            uniqueParsed: uniqueParsed.length,
          },
          uniqueParsedByLocation: byCount(uniqueParsed, (item) => item.locationId || item.locationName).slice(0, 100),
          uniqueParsedByFormat: byCount(uniqueParsed, (item) => item.format),
        },
        null,
        2,
      ),
    );
    return;
  }

  const { prisma } = await import("@/lib/prisma");
  const centers = await prisma.center.findMany({
    where: { status: { not: "closed" } },
    select: {
      id: true,
      name: true,
      status: true,
      crmLocationId: true,
      locationId: true,
    },
  });

  const candidates: ImportCandidate[] = [];
  const unresolved: ParsedInquiry[] = [];
  for (const inquiry of uniqueParsed) {
    const center = centers.find((item) => centerMatches(item, inquiry));
    if (!center) {
      unresolved.push(inquiry);
      continue;
    }
    candidates.push({ ...inquiry, center, dedupeKey: dedupeKey(inquiry) });
  }

  const candidateCenterIds = Array.from(new Set(candidates.map((candidate) => candidate.center.id)));
  const existingLeads = await prisma.lead.findMany({
    where: {
      centerId: { in: candidateCenterIds },
      OR: [
        { externalId: { in: candidates.map((candidate) => `gmail-inquiry:${candidate.gmailId}`) } },
        { email: { not: null } },
      ],
    },
    select: {
      id: true,
      centerId: true,
      email: true,
      externalId: true,
    },
  });
  const existingExternalIds = new Set(existingLeads.map((lead) => lead.externalId).filter(Boolean));
  const existingByCenterEmail = new Set(
    existingLeads
      .filter((lead) => lead.email)
      .map((lead) => `${lead.centerId}|${normalizeEmail(lead.email || "")}`),
  );

  const existingCrmDuplicates: ImportCandidate[] = [];
  const toImport: ImportCandidate[] = [];
  for (const candidate of candidates) {
    const externalId = `gmail-inquiry:${candidate.gmailId}`;
    const centerEmailKey = `${candidate.center.id}|${candidate.email}`;
    if (existingExternalIds.has(externalId) || existingByCenterEmail.has(centerEmailKey)) {
      existingCrmDuplicates.push(candidate);
      continue;
    }
    toImport.push(candidate);
  }

  let imported = 0;
  if (commit) {
    for (const inquiry of toImport) {
      const [parentFirstName, parentLastName] = Object.values(splitName(inquiry.parentName));
      await prisma.lead.create({
        data: {
          centerId: inquiry.center.id,
          externalId: `gmail-inquiry:${inquiry.gmailId}`,
          familyName: inquiry.parentName || "Website Inquiry",
          parentFirstName: parentFirstName || null,
          parentLastName: parentLastName || null,
          email: inquiry.email,
          phone: inquiry.phone || null,
          leadSource: "Kid City USA Website Inquiry Email Repair",
          ageGroupInterest: inquiry.program,
          programInterest: inquiry.program,
          stage: EnrollmentStage.NEW_INQUIRY,
          score: scoreLead(inquiry),
          status: "open",
          customFields: leadCustomFields(inquiry, inquiry.center),
          createdAt: inquiry.gmailDate,
          tasks: {
            create: [{ title: `Follow up with ${inquiry.parentName}`, status: "open" }],
          },
          notes: {
            create: [{ body: noteBody(inquiry) }],
          },
        },
      });
      imported += 1;
    }
  }

  const summary = {
    mode: commit ? "commit" : "dry-run",
    inputPath,
    dateWindow: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
    counts: {
      totalCsvRows: rows.length,
      rowsInDateWindow: inRange.length,
      parsedInquiryRows: parsed.length,
      skippedUnparseable,
      skippedAlreadyBeeSuite,
      skippedTests,
      skippedLikelySpam,
      inputDuplicates: inputDuplicateIds.length,
      uniqueParsed: uniqueParsed.length,
      unresolvedCenters: unresolved.length,
      existingCrmDuplicates: existingCrmDuplicates.length,
      plannedImports: toImport.length,
      imported,
    },
    plannedImportsByLocation: byCount(toImport, (item) => item.center.crmLocationId || item.center.locationId || item.center.name),
    existingDuplicatesByLocation: byCount(existingCrmDuplicates, (item) => item.center.crmLocationId || item.center.locationId || item.center.name).slice(0, 25),
    unresolvedLocations: byCount(unresolved, (item) => item.locationId || item.locationName).slice(0, 50),
  };

  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
