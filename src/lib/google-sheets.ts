import { createHash, createSign } from "crypto";
import { getTenantIntegrationCredentialMap } from "@/lib/integration-credentials";

export type GoogleSheetValue = string | number | boolean | null;

export type GoogleSheetsAppendResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  mode?: "google_sheets_api";
  spreadsheetId?: string;
  sheetName?: string;
  updatedRange?: string;
};

export type GoogleSheetsReadResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  mode?: "google_sheets_api";
  spreadsheetId?: string;
  range?: string;
  values?: string[][];
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type SpreadsheetMetadata = {
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
};

type ValuesResponse = {
  values?: string[][];
};

type AppendValuesResponse = {
  updates?: {
    updatedRange?: string;
  };
};

type CachedToken = {
  token: string;
  expiresAt: number;
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

type EnvMap = Record<string, string | undefined>;

type GoogleSheetsCredentialInput = {
  tenantId?: string | null;
  credentials?: Record<string, string>;
  env?: EnvMap;
};

type GoogleSheetsRuntimeConfig = {
  spreadsheetId: string;
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
};

const cachedTokens = new Map<string, CachedToken>();

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function configuredValue(credentials: Record<string, string>, env: EnvMap, name: string) {
  return clean(credentials[name]) || clean(env[name]);
}

async function resolveGoogleSheetsCredentials(input: GoogleSheetsCredentialInput = {}) {
  if (input.credentials) return input.credentials;
  return getTenantIntegrationCredentialMap(input.tenantId, "google_sheets");
}

export function googleSheetsRuntimeConfig({
  credentials = {},
  env = process.env,
  spreadsheetId,
}: GoogleSheetsCredentialInput & { spreadsheetId?: string } = {}): GoogleSheetsRuntimeConfig {
  return {
    spreadsheetId: spreadsheetId || getSpreadsheetId(credentials, env),
    serviceAccountEmail: getServiceAccountEmail(credentials, env),
    serviceAccountPrivateKey: getServiceAccountPrivateKey(credentials, env),
  };
}

export function hasGoogleSheetsApiConfig(input: GoogleSheetsCredentialInput & { spreadsheetId?: string } = {}) {
  const config = googleSheetsRuntimeConfig(input);
  return Boolean(
    config.spreadsheetId &&
      config.serviceAccountEmail &&
      config.serviceAccountPrivateKey,
  );
}

export function spreadsheetIdFromUrl(value?: string | null) {
  const input = value?.trim() || "";
  if (!input) return "";
  return input.match(/\/spreadsheets\/d\/([^/]+)/)?.[1] || input;
}

export async function appendRowToGoogleSheet({
  headers,
  row,
  spreadsheetId,
  sheetName,
  tenantId,
  credentials,
  env = process.env,
}: {
  headers: string[];
  row: GoogleSheetValue[];
  spreadsheetId?: string;
  sheetName?: string;
  tenantId?: string | null;
  credentials?: Record<string, string>;
  env?: EnvMap;
}): Promise<GoogleSheetsAppendResult> {
  const resolvedCredentials = await resolveGoogleSheetsCredentials({ tenantId, credentials });
  const config = googleSheetsRuntimeConfig({ credentials: resolvedCredentials, env, spreadsheetId });
  const targetSheetName = sheetName || configuredValue(resolvedCredentials, env, "GOOGLE_SHEETS_SHEET_NAME") || "Inquiries";

  if (!config.spreadsheetId || !config.serviceAccountEmail || !config.serviceAccountPrivateKey) {
    return { ok: true, skipped: true };
  }

  try {
    const token = await getAccessToken(config);

    await ensureSheet(config.spreadsheetId, targetSheetName, token);
    await ensureHeaders(config.spreadsheetId, targetSheetName, headers, token);

    const appendRange = `${quoteSheetName(targetSheetName)}!A:${columnName(headers.length)}`;
    const response = await googleFetch<AppendValuesResponse>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        config.spreadsheetId,
      )}/values/${encodeURIComponent(
        appendRange,
      )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ values: [row] }),
      },
    );

    return {
      ok: true,
      mode: "google_sheets_api",
      spreadsheetId: config.spreadsheetId,
      sheetName: targetSheetName,
      updatedRange: response.updates?.updatedRange,
    };
  } catch (error) {
    return {
      ok: false,
      mode: "google_sheets_api",
      spreadsheetId: config.spreadsheetId,
      sheetName: targetSheetName,
      error: error instanceof Error ? error.message : "Google Sheets API failed.",
    };
  }
}

export async function readGoogleSheetValues({
  spreadsheetId,
  range,
  tenantId,
  credentials,
  env = process.env,
}: {
  spreadsheetId: string;
  range: string;
  tenantId?: string | null;
  credentials?: Record<string, string>;
  env?: EnvMap;
}): Promise<GoogleSheetsReadResult> {
  const resolvedCredentials = await resolveGoogleSheetsCredentials({ tenantId, credentials });
  const config = googleSheetsRuntimeConfig({ credentials: resolvedCredentials, env, spreadsheetId });

  if (!config.spreadsheetId || !config.serviceAccountEmail || !config.serviceAccountPrivateKey) {
    return { ok: true, skipped: true, spreadsheetId, range };
  }

  try {
    const token = await getAccessToken(config);
    const response = await googleFetch<ValuesResponse>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        config.spreadsheetId,
      )}/values/${encodeURIComponent(range)}`,
      token,
    );

    return {
      ok: true,
      mode: "google_sheets_api",
      spreadsheetId: config.spreadsheetId,
      range,
      values: response.values ?? [],
    };
  } catch (error) {
    return {
      ok: false,
      mode: "google_sheets_api",
      spreadsheetId: config.spreadsheetId,
      range,
      error: error instanceof Error ? error.message : "Google Sheets API read failed.",
    };
  }
}

function getSpreadsheetId(credentials: Record<string, string>, env: EnvMap) {
  const configuredId = configuredValue(credentials, env, "GOOGLE_SHEETS_SPREADSHEET_ID");
  if (configuredId) return configuredId;

  const url = configuredValue(credentials, env, "GOOGLE_SHEETS_SPREADSHEET_URL");
  return spreadsheetIdFromUrl(url);
}

function getServiceAccountEmail(credentials: Record<string, string>, env: EnvMap) {
  return (
    configuredValue(credentials, env, "GOOGLE_SERVICE_ACCOUNT_EMAIL") ||
    configuredValue(credentials, env, "GOOGLE_CLIENT_EMAIL") ||
    ""
  ).trim();
}

function getServiceAccountPrivateKey(credentials: Record<string, string>, env: EnvMap) {
  const key =
    configuredValue(credentials, env, "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") ||
    configuredValue(credentials, env, "GOOGLE_PRIVATE_KEY") ||
    "";

  return key.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");
}

async function getAccessToken(config: GoogleSheetsRuntimeConfig) {
  const cacheKey = createHash("sha256")
    .update(`${config.serviceAccountEmail}:${config.serviceAccountPrivateKey}`)
    .digest("hex");
  const cachedToken = cachedTokens.get(cacheKey);
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const assertion = createJwtAssertion(config);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(8000),
  });

  const data = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        `Google token exchange returned ${response.status}.`,
    );
  }

  cachedTokens.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  });

  return data.access_token;
}

function createJwtAssertion(config: GoogleSheetsRuntimeConfig) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: config.serviceAccountEmail,
    scope: GOOGLE_SHEETS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(claims),
  )}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(config.serviceAccountPrivateKey);

  return `${unsigned}.${base64Url(signature)}`;
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function ensureSheet(spreadsheetId: string, sheetName: string, token: string) {
  const metadata = await googleFetch<SpreadsheetMetadata>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}?fields=sheets.properties(sheetId,title)`,
    token,
  );
  const exists = metadata.sheets?.some(
    (sheet) => sheet.properties?.title === sheetName,
  );

  if (exists) return;

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}:batchUpdate`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName,
              },
            },
          },
        ],
      }),
    },
  );
}

async function ensureHeaders(
  spreadsheetId: string,
  sheetName: string,
  headers: string[],
  token: string,
) {
  const headerRange = `${quoteSheetName(sheetName)}!A1:${columnName(
    headers.length,
  )}1`;
  const current = await googleFetch<ValuesResponse>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${encodeURIComponent(headerRange)}`,
    token,
  );
  const firstRow = current.values?.[0] ?? [];
  const hasHeaderContent = firstRow.some((value) => String(value || "").trim());

  if (hasHeaderContent) return;

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${encodeURIComponent(headerRange)}?valueInputOption=RAW`,
    token,
    {
      method: "PUT",
      body: JSON.stringify({ values: [headers] }),
    },
  );
}

async function googleFetch<T>(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(await googleErrorMessage(response));
  }

  return (await response.json()) as T;
}

async function googleErrorMessage(response: Response) {
  const text = await response.text();

  try {
    const data = JSON.parse(text) as { error?: { message?: string } };
    return data.error?.message || `Google Sheets API returned ${response.status}.`;
  } catch {
    return text || `Google Sheets API returned ${response.status}.`;
  }
}

function quoteSheetName(sheetName: string) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function columnName(columnNumber: number) {
  let number = columnNumber;
  let name = "";

  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }

  return name;
}
