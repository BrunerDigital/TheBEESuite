import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  MAX_PROCARE_MULTIPART_BYTES,
  MAX_PROCARE_MULTIPART_LABEL,
  procareMultipartSizeBytes,
} from "@/lib/procare-upload-limits";

type ImportSummary = {
  sourceSha256?: string;
  reviewFingerprint?: string;
  warningRowNumbers?: number[];
  duplicateReviewRowNumbers?: number[];
  correlationReview?: Array<{ id?: string; required?: boolean }>;
  datasetCoverage?: unknown;
  rows?: number;
  totalRows?: number;
  imported?: number;
  disposed?: number;
  unresolved?: number;
  createdFamilies?: number;
  updatedFamilies?: number;
  createdChildren?: number;
  createdClassrooms?: number;
  emergencyContacts?: number;
  authorizedPickups?: number;
};

type ImportResponse = {
  ok?: boolean;
  error?: string;
  dryRun?: boolean;
  partial?: boolean;
  batchId?: string;
  nextRow?: number;
  totalRows?: number;
  summary?: ImportSummary;
};

function flag(name: string) {
  return process.argv.includes(name);
}

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() ?? "" : "";
}

function cookieHeader(response: Response) {
  return response.headers.getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
}

function publicSummary(summary: ImportSummary | undefined) {
  if (!summary) return null;
  return {
    rows: summary.rows,
    totalRows: summary.totalRows,
    imported: summary.imported,
    disposed: summary.disposed,
    unresolved: summary.unresolved,
    warningRows: summary.warningRowNumbers?.length,
    duplicateReviewRows: summary.duplicateReviewRowNumbers?.length,
    createdFamilies: summary.createdFamilies,
    updatedFamilies: summary.updatedFamilies,
    createdChildren: summary.createdChildren,
    createdClassrooms: summary.createdClassrooms,
    emergencyContacts: summary.emergencyContacts,
    authorizedPickups: summary.authorizedPickups,
  };
}

async function responseJson(response: Response) {
  return await response.json().catch(() => null) as ImportResponse | null;
}

export async function importReviewedProcarePackage(input: {
  baseUrl: string;
  centerId: string;
  email: string;
  password: string;
  filePath: string;
  commit: boolean;
  disposeWarnings: boolean;
}) {
  const filePath = path.resolve(input.filePath);
  if (!fs.statSync(filePath).isFile()) throw new Error("The reviewed ProCare CSV was not found.");
  if (input.commit && !input.disposeWarnings) {
    throw new Error("Commit mode requires --dispose-warnings so no preview warning can be imported.");
  }

  const loginResponse = await fetch(`${input.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      appMode: "admin",
      deviceLabel: "Reviewed ProCare import",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const loginJson = await responseJson(loginResponse);
  if (!loginResponse.ok || !loginJson?.ok) {
    throw new Error(loginJson?.error || `Login failed with status ${loginResponse.status}.`);
  }
  const cookie = cookieHeader(loginResponse);
  if (!cookie) throw new Error("Login succeeded without an application session cookie.");

  const fileBuffer = fs.readFileSync(filePath);
  const upload = new File([fileBuffer], path.basename(filePath), { type: "text/csv" });
  const sendImport = async (fields: Record<string, string>) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    formData.append("file", upload);
    const multipartBytes = await procareMultipartSizeBytes(formData, { batchId: "x".repeat(64) });
    if (multipartBytes > MAX_PROCARE_MULTIPART_BYTES) {
      throw new Error(`The complete reviewed request is larger than the ${MAX_PROCARE_MULTIPART_LABEL} secure request limit. Run the file-only preflight and retain the review packet.`);
    }
    const response = await fetch(`${input.baseUrl}/api/imports/procare`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: formData,
      signal: AbortSignal.timeout(180_000),
    });
    return { response, json: await responseJson(response) };
  };

  try {
    const previewResult = await sendImport({
      centerId: input.centerId,
      dryRun: "true",
      duplicateMatchMode: "review",
      fieldMapping: "{}",
    });
    if (!previewResult.response.ok || !previewResult.json?.ok || !previewResult.json.summary) {
      throw new Error(previewResult.json?.error || `Dry run failed with status ${previewResult.response.status}.`);
    }
    const preview = previewResult.json.summary;
    const warningRowNumbers = preview.warningRowNumbers ?? [];
    const duplicateReviewRowNumbers = preview.duplicateReviewRowNumbers ?? [];
    const requiredCorrelationIds = (preview.correlationReview ?? [])
      .filter((section) => section.required && section.id)
      .map((section) => section.id as string);
    const previewOutput = {
      dryRun: true,
      file: path.basename(filePath),
      centerId: input.centerId,
      sourceSha256: preview.sourceSha256,
      ...publicSummary(preview),
    };
    if (!input.commit) return previewOutput;
    if (!preview.sourceSha256 || !preview.reviewFingerprint) {
      throw new Error("The dry run did not return immutable review evidence.");
    }

    let batchId = "";
    let finalResponse: ImportResponse | null = null;
    do {
      const commitResult = await sendImport({
        centerId: input.centerId,
        dryRun: "false",
        duplicateMatchMode: "review",
        duplicateReviewConfirmed: "true",
        sourceInventoryConfirmed: String(Boolean(preview.datasetCoverage)),
        fieldMapping: "{}",
        correlationConfirmations: requiredCorrelationIds.join(","),
        disposedRowNumbers: warningRowNumbers.join(","),
        sourceSha256: preview.sourceSha256,
        reviewFingerprint: preview.reviewFingerprint,
        reviewWarningRowNumbers: warningRowNumbers.join(","),
        reviewDuplicateWarningRowNumbers: duplicateReviewRowNumbers.join(","),
        chunkSize: "20",
        ...(batchId ? { batchId } : {}),
      });
      if (!commitResult.response.ok || !commitResult.json?.ok) {
        throw new Error(commitResult.json?.error || `Import failed with status ${commitResult.response.status}.`);
      }
      finalResponse = commitResult.json;
      batchId = commitResult.json.batchId ?? batchId;
    } while (finalResponse?.partial);

    return {
      dryRun: false,
      file: path.basename(filePath),
      centerId: input.centerId,
      batchId,
      sourceSha256: preview.sourceSha256,
      ...publicSummary(finalResponse?.summary),
    };
  } finally {
    await fetch(`${input.baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(30_000),
    }).catch(() => undefined);
  }
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedScriptUrl === import.meta.url) {
  const email = process.env.BEE_PROCARE_IMPORT_EMAIL?.trim() ?? "";
  const password = process.env.BEE_PROCARE_IMPORT_PASSWORD?.trim() ?? "";
  const filePath = option("--file");
  const centerId = option("--center");
  const baseUrl = (option("--base-url") || "https://thebeesuite.io").replace(/\/+$/, "");
  if (!email || !password || !filePath || !centerId) {
    throw new Error(
      "Set BEE_PROCARE_IMPORT_EMAIL and BEE_PROCARE_IMPORT_PASSWORD, then pass --file and --center.",
    );
  }
  void importReviewedProcarePackage({
    baseUrl,
    centerId,
    email,
    password,
    filePath,
    commit: flag("--commit"),
    disposeWarnings: flag("--dispose-warnings"),
  })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
