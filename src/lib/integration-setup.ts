import { credentialPresenceFromKeys, integrationCredentialFields, type IntegrationCredentialField, type IntegrationCredentialPresence } from "@/lib/integration-credentials";

export type IntegrationProvider = "supabase" | "sendgrid" | "google_sheets" | "google_calendar" | "openai" | "stripe" | "twilio";

export type IntegrationDisplayStatus = "Connected" | "Configured" | "Missing" | "Placeholder";
export type IntegrationSetupStatus = "not_started" | "in_progress" | "needs_credentials" | "ready_for_test" | "verified";
export type IntegrationSetupFieldType = "text" | "email" | "url" | "textarea" | "select" | "checkbox";

export type IntegrationSetupField = {
  key: string;
  label: string;
  type: IntegrationSetupFieldType;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
};

export type IntegrationEnvRequirement = {
  label: string;
  names: string[];
  mode?: "all" | "any";
};

export type IntegrationSetupDefinition = {
  provider: IntegrationProvider;
  name: string;
  purpose: string;
  detail: string;
  fields: IntegrationSetupField[];
  envRequirements: IntegrationEnvRequirement[];
};

export type IntegrationRuntimeStatus = {
  status: IntegrationDisplayStatus;
  configured: boolean;
  configuredRequirements: string[];
  missingRequirements: string[];
};

export type StoredIntegrationSetup = {
  id: string;
  provider: string;
  status: string;
  configPlaceholder: unknown;
  lastSyncAt: Date | string | null;
};

export type IntegrationSetupView = {
  id: string | null;
  provider: IntegrationProvider;
  name: string;
  purpose: string;
  detail: string;
  status: IntegrationDisplayStatus;
  setupStatus: IntegrationSetupStatus;
  config: Record<string, string | boolean>;
  fields: IntegrationSetupField[];
  credentialFields: IntegrationCredentialField[];
  credentials: IntegrationCredentialPresence[];
  env: IntegrationRuntimeStatus;
  lastSyncAt: Date | string | null;
};

type EnvMap = Record<string, string | undefined>;

const setupStatuses = new Set<IntegrationSetupStatus>([
  "not_started",
  "in_progress",
  "needs_credentials",
  "ready_for_test",
  "verified",
]);

export const INTEGRATION_SETUP_DEFINITIONS: IntegrationSetupDefinition[] = [
  {
    provider: "supabase",
    name: "Supabase",
    purpose: "Database, Auth, and Storage",
    detail: "Stores app data, supports login and password recovery, and signs private child media/document storage URLs.",
    envRequirements: [
      { label: "Database URL", names: ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"], mode: "any" },
      { label: "Project URL", names: ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], mode: "any" },
      { label: "Anon key", names: ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"], mode: "any" },
      { label: "Service role key", names: ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"], mode: "any" },
    ],
    fields: [
      { key: "projectRef", label: "Project ref", type: "text", placeholder: "nqjrlktoewiueiwrubas" },
      { key: "projectUrl", label: "Project URL", type: "url", placeholder: "https://project-ref.supabase.co" },
      { key: "authRedirectUrl", label: "Password reset redirect", type: "url", placeholder: "https://thebeesuite.io/reset-password" },
      { key: "storageBucket", label: "Child media bucket", type: "text", placeholder: "child-media" },
      { key: "owner", label: "Setup owner", type: "text", placeholder: "Platform admin" },
      { key: "notes", label: "Setup notes", type: "textarea", placeholder: "Migration, auth, and storage notes" },
    ],
  },
  {
    provider: "sendgrid",
    name: "SendGrid",
    purpose: "Transactional Email",
    detail: "Sends inquiry notifications, account setup messages, registration emails, reviewed lead replies, and parent communication.",
    envRequirements: [
      { label: "API key", names: ["SENDGRID_API_KEY"] },
      { label: "From email", names: ["SENDGRID_FROM_EMAIL"] },
    ],
    fields: [
      { key: "fromEmail", label: "From email", type: "email", placeholder: "hello@thebeesuite.io" },
      { key: "fromName", label: "From name", type: "text", placeholder: "The BEE Suite" },
      { key: "replyToEmail", label: "Reply-to email", type: "email", placeholder: "support@thebeesuite.io" },
      { key: "verifiedDomain", label: "Verified sending domain", type: "text", placeholder: "thebeesuite.io" },
      { key: "templateInventory", label: "Template inventory", type: "textarea", placeholder: "Onboarding, inquiry, billing, registration" },
      { key: "notes", label: "Setup notes", type: "textarea", placeholder: "DNS, suppression, and sender review notes" },
    ],
  },
  {
    provider: "google_sheets",
    name: "Google Sheets",
    purpose: "Inquiry and FTE Backup",
    detail: "Backs up website inquiries and supports executive FTE reporting through Apps Script or Google Sheets API credentials.",
    envRequirements: [
      { label: "Webhook or service account", names: ["GOOGLE_SHEETS_WEBHOOK_URL", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"], mode: "any" },
      { label: "Inquiry sheet", names: ["GOOGLE_SHEETS_SPREADSHEET_ID", "GOOGLE_SHEETS_SPREADSHEET_URL"], mode: "any" },
    ],
    fields: [
      {
        key: "deliveryMode",
        label: "Delivery mode",
        type: "select",
        options: [
          { value: "apps_script", label: "Apps Script webhook" },
          { value: "service_account", label: "Service account API" },
        ],
      },
      { key: "spreadsheetId", label: "Inquiry spreadsheet ID", type: "text", placeholder: "Google Sheet ID" },
      { key: "inquiryTabName", label: "Inquiry tab name", type: "text", placeholder: "Inquiries" },
      { key: "fteSpreadsheetId", label: "FTE spreadsheet ID", type: "text", placeholder: "Kid City FTE sheet ID" },
      { key: "appsScriptDeploymentId", label: "Apps Script deployment ID", type: "text", placeholder: "Deployment ID only" },
      { key: "notes", label: "Setup notes", type: "textarea", placeholder: "Backup routing and ownership notes" },
    ],
  },
  {
    provider: "google_calendar",
    name: "Google Calendar",
    purpose: "Calendar Sync",
    detail: "Pushes closures, holidays, recurring events, and school calendar items to Google Calendar and can import external Google Calendar events into the school calendar.",
    envRequirements: [
      { label: "Calendar ID", names: ["GOOGLE_CALENDAR_ID"] },
      { label: "OAuth access token or refresh credentials", names: ["GOOGLE_CALENDAR_ACCESS_TOKEN", "GOOGLE_CALENDAR_REFRESH_TOKEN"], mode: "any" },
    ],
    fields: [
      {
        key: "syncMode",
        label: "Sync mode",
        type: "select",
        options: [
          { value: "bee_to_google", label: "The BEE Suite to Google" },
          { value: "two_way", label: "Two-way sync" },
        ],
      },
      { key: "syncOwner", label: "Calendar owner", type: "email", placeholder: "director@example.com" },
      { key: "notes", label: "Setup notes", type: "textarea", placeholder: "Calendar sharing, OAuth app, and sync ownership notes" },
    ],
  },
  {
    provider: "openai",
    name: "OpenAI",
    purpose: "Guardrailed AI Drafting",
    detail: "Supports Mr. Bee drafting and assistant workflows with human approval before family-facing messages are sent.",
    envRequirements: [
      { label: "API key", names: ["OPENAI_API_KEY"] },
    ],
    fields: [
      { key: "defaultModel", label: "Default model", type: "text", placeholder: "gpt-5-mini" },
      {
        key: "reviewMode",
        label: "Review mode",
        type: "select",
        options: [
          { value: "human_required", label: "Human review required" },
          { value: "internal_only", label: "Internal drafting only" },
        ],
      },
      { key: "approvedUseCases", label: "Approved use cases", type: "textarea", placeholder: "Lead replies, policy summaries, parent message drafts" },
      { key: "fallbackMode", label: "Fallback mode", type: "text", placeholder: "Manual templates" },
      { key: "notes", label: "Setup notes", type: "textarea", placeholder: "Approval and prompt-safety notes" },
    ],
  },
  {
    provider: "stripe",
    name: "Stripe",
    purpose: "Payments and School Payouts",
    detail: "Powers parent checkout, webhook reconciliation, fee handling, refunds, and Stripe Connect payout onboarding.",
    envRequirements: [
      { label: "Secret key", names: ["STRIPE_SECRET_KEY"] },
      { label: "Webhook secret", names: ["STRIPE_WEBHOOK_SECRET"] },
    ],
    fields: [
      {
        key: "mode",
        label: "Stripe mode",
        type: "select",
        options: [
          { value: "test", label: "Test mode" },
          { value: "live", label: "Live mode" },
        ],
      },
      { key: "webhookEndpointPath", label: "Webhook endpoint path", type: "text", placeholder: "/api/billing/stripe-webhook" },
      {
        key: "feeDisclosureStatus",
        label: "Fee disclosure status",
        type: "select",
        options: [
          { value: "draft", label: "Draft" },
          { value: "review_needed", label: "Needs review" },
          { value: "approved", label: "Approved" },
        ],
      },
      { key: "connectOwnerEmail", label: "Connect owner email", type: "email", placeholder: "finance@example.com" },
      { key: "supportEmail", label: "Payment support email", type: "email", placeholder: "billing@example.com" },
      { key: "notes", label: "Setup notes", type: "textarea", placeholder: "Connect, webhook, refund, and dispute notes" },
    ],
  },
  {
    provider: "twilio",
    name: "Twilio",
    purpose: "SMS Messaging",
    detail: "Sends SMS communication and prepares emergency/attendance messaging once approved senders and compliance are complete.",
    envRequirements: [
      { label: "Account SID", names: ["TWILIO_ACCOUNT_SID"] },
      { label: "Auth token", names: ["TWILIO_AUTH_TOKEN"] },
      { label: "Sender", names: ["TWILIO_FROM_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"], mode: "any" },
    ],
    fields: [
      { key: "messagingServiceSid", label: "Messaging service SID", type: "text", placeholder: "MG..." },
      { key: "fromNumber", label: "From number", type: "text", placeholder: "+1..." },
      { key: "statusCallbackPath", label: "Status callback path", type: "text", placeholder: "/api/twilio/status" },
      {
        key: "senderType",
        label: "Sender type",
        type: "select",
        options: [
          { value: "long_code", label: "10DLC long code" },
          { value: "toll_free", label: "Toll-free" },
          { value: "messaging_service", label: "Messaging service" },
        ],
      },
      { key: "emergencyUseApproved", label: "Emergency messaging approved", type: "checkbox" },
      { key: "notes", label: "Setup notes", type: "textarea", placeholder: "A2P, opt-in, and emergency SMS notes" },
    ],
  },
];

export function normalizeIntegrationProvider(value: unknown): IntegrationProvider | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return INTEGRATION_SETUP_DEFINITIONS.some((definition) => definition.provider === normalized)
    ? normalized as IntegrationProvider
    : null;
}

export function getIntegrationDefinition(provider: IntegrationProvider) {
  return INTEGRATION_SETUP_DEFINITIONS.find((definition) => definition.provider === provider);
}

export function normalizeIntegrationSetupStatus(value: unknown): IntegrationSetupStatus {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "connected" || normalized === "configured" || normalized === "mock_connected") return "verified";
  if (normalized === "missing" || normalized === "placeholder") return "not_started";
  return setupStatuses.has(normalized as IntegrationSetupStatus) ? normalized as IntegrationSetupStatus : "in_progress";
}

function isConfiguredValue(env: EnvMap, credentialKeys: Set<string>, name: string) {
  return Boolean(env[name]?.trim()) || credentialKeys.has(name);
}

function runtimeFromRequirements(definition: IntegrationSetupDefinition, env: EnvMap, credentialKeys: Set<string>): IntegrationRuntimeStatus {
  const configuredRequirements: string[] = [];
  const missingRequirements: string[] = [];

  for (const requirement of definition.envRequirements) {
    const mode = requirement.mode ?? "all";
    const configured = mode === "any"
      ? requirement.names.some((name) => isConfiguredValue(env, credentialKeys, name))
      : requirement.names.every((name) => isConfiguredValue(env, credentialKeys, name));

    if (configured) configuredRequirements.push(requirement.label);
    else missingRequirements.push(requirement.label);
  }

  const configured = missingRequirements.length === 0;
  const partiallyConfigured = configuredRequirements.length > 0;
  let status: IntegrationDisplayStatus = "Placeholder";
  if (configured) {
    status = definition.provider === "supabase" || definition.provider === "sendgrid" || definition.provider === "google_sheets" || definition.provider === "stripe"
      ? "Connected"
      : "Configured";
  } else if ((definition.provider === "stripe" || definition.provider === "twilio") && partiallyConfigured) {
    status = "Configured";
  } else if (definition.provider === "supabase" || definition.provider === "sendgrid" || definition.provider === "google_sheets") {
    status = "Missing";
  }

  return { status, configured, configuredRequirements, missingRequirements };
}

export function getIntegrationRuntimeStatus(provider: IntegrationProvider, env: EnvMap, credentialKeysInput: string[] = []): IntegrationRuntimeStatus {
  const definition = getIntegrationDefinition(provider);
  const credentialKeys = new Set(credentialKeysInput);
  if (!definition) {
    return { status: "Placeholder", configured: false, configuredRequirements: [], missingRequirements: ["Unknown integration"] } satisfies IntegrationRuntimeStatus;
  }
  if (provider === "google_sheets") {
    const webhook = isConfiguredValue(env, credentialKeys, "GOOGLE_SHEETS_WEBHOOK_URL");
    const serviceAccount = (
      (isConfiguredValue(env, credentialKeys, "GOOGLE_SERVICE_ACCOUNT_EMAIL") || isConfiguredValue(env, credentialKeys, "GOOGLE_CLIENT_EMAIL")) &&
      (isConfiguredValue(env, credentialKeys, "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") || isConfiguredValue(env, credentialKeys, "GOOGLE_PRIVATE_KEY")) &&
      (isConfiguredValue(env, credentialKeys, "GOOGLE_SHEETS_SPREADSHEET_ID") || isConfiguredValue(env, credentialKeys, "GOOGLE_SHEETS_SPREADSHEET_URL"))
    );
    const configuredRequirements = [
      webhook ? "Apps Script webhook" : "",
      serviceAccount ? "Service account API" : "",
    ].filter(Boolean);
    const configured = webhook || serviceAccount;
    const status: IntegrationDisplayStatus = configured ? "Connected" : "Missing";
    return {
      status,
      configured,
      configuredRequirements,
      missingRequirements: configured ? [] : ["Apps Script webhook or service account API"],
    };
  }
  if (provider === "google_calendar") {
    const calendarId = isConfiguredValue(env, credentialKeys, "GOOGLE_CALENDAR_ID");
    const directAccessToken = isConfiguredValue(env, credentialKeys, "GOOGLE_CALENDAR_ACCESS_TOKEN");
    const refreshToken = isConfiguredValue(env, credentialKeys, "GOOGLE_CALENDAR_REFRESH_TOKEN");
    const oauthClient = isConfiguredValue(env, credentialKeys, "GOOGLE_CLIENT_ID") && isConfiguredValue(env, credentialKeys, "GOOGLE_CLIENT_SECRET");
    const configured = calendarId && (directAccessToken || (refreshToken && oauthClient));
    const configuredRequirements = [
      calendarId ? "Calendar ID" : "",
      directAccessToken ? "Access token" : "",
      refreshToken && oauthClient ? "Refresh token OAuth" : "",
    ].filter(Boolean);
    const missingRequirements = [
      calendarId ? "" : "Calendar ID",
      directAccessToken || (refreshToken && oauthClient) ? "" : "OAuth access token or refresh credentials",
    ].filter(Boolean);
    return {
      status: configured ? "Connected" : configuredRequirements.length ? "Configured" : "Missing",
      configured,
      configuredRequirements,
      missingRequirements,
    };
  }
  return runtimeFromRequirements(definition, env, credentialKeys);
}

function fieldValue(field: IntegrationSetupField, raw: unknown) {
  if (field.type === "checkbox") return raw === true || raw === "true" || raw === "on";

  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  const limited = value.slice(0, field.type === "textarea" ? 2_000 : 300);

  if (field.type === "select") {
    const allowed = field.options?.some((option) => option.value === limited);
    return allowed ? limited : field.options?.[0]?.value ?? "";
  }

  if (field.type === "email") return limited.includes("@") ? limited : "";
  if (field.type === "url") {
    try {
      const url = new URL(limited);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
    } catch {
      return "";
    }
  }
  return limited;
}

export function sanitizeIntegrationConfig(provider: IntegrationProvider, value: unknown) {
  const definition = getIntegrationDefinition(provider);
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const config: Record<string, string | boolean> = {};
  if (!definition) return config;

  for (const field of definition.fields) {
    const sanitized = fieldValue(field, input[field.key]);
    if (field.type === "checkbox" || sanitized) config[field.key] = sanitized;
  }
  return config;
}

export function readIntegrationConfig(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const config = record.setup && typeof record.setup === "object" && !Array.isArray(record.setup)
    ? record.setup as Record<string, unknown>
    : record;
  const result: Record<string, string | boolean> = {};
  for (const [key, raw] of Object.entries(config)) {
    if (typeof raw === "string") result[key] = raw;
    if (typeof raw === "boolean") result[key] = raw;
  }
  return result;
}

export function buildIntegrationSetupViews(
  records: StoredIntegrationSetup[],
  env: EnvMap,
  credentialRecords: Array<{ provider: string; key: string; lastFour: string | null }> = [],
): IntegrationSetupView[] {
  return INTEGRATION_SETUP_DEFINITIONS.map((definition) => {
    const existing = records.find((record) => record.provider === definition.provider);
    const setupStatus = normalizeIntegrationSetupStatus(existing?.status || "not_started");
    const credentialFields = integrationCredentialFields(definition.provider);
    const providerCredentials = credentialRecords.filter((credential) => credential.provider === definition.provider);
    const credentialPresence = credentialPresenceFromKeys(credentialFields, providerCredentials);
    const runtime = getIntegrationRuntimeStatus(
      definition.provider,
      env,
      providerCredentials.map((credential) => credential.key),
    );
    return {
      id: existing?.id ?? null,
      provider: definition.provider,
      name: definition.name,
      purpose: definition.purpose,
      detail: definition.detail,
      status: runtime.status,
      setupStatus,
      config: sanitizeIntegrationConfig(definition.provider, readIntegrationConfig(existing?.configPlaceholder)),
      fields: definition.fields,
      credentialFields,
      credentials: credentialPresence,
      env: runtime,
      lastSyncAt: existing?.lastSyncAt ? new Date(existing.lastSyncAt).toISOString() : null,
    };
  });
}

export function integrationRecordConfig({
  config,
  checkedAt,
  checkedById,
}: {
  config: Record<string, string | boolean>;
  checkedAt?: Date | null;
  checkedById?: string | null;
}) {
  return {
    setup: config,
    checkedAt: checkedAt ? checkedAt.toISOString() : null,
    checkedById: checkedById || null,
    storesTenantSecrets: true,
  };
}
