import type { IntegrationProvider } from "@/lib/integration-setup";

type JsonRecord = Record<string, unknown>;

export type AdCampaignMetric = {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
};

export type AdAnalyticsSnapshot = {
  provider: IntegrationProvider;
  period: "last_30_days";
  syncedAt: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  campaigns: AdCampaignMetric[];
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
function rows(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function total(campaigns: AdCampaignMetric[], key: "spend" | "impressions" | "clicks" | "leads") {
  return campaigns.reduce((sum, campaign) => sum + campaign[key], 0);
}

function snapshot(provider: IntegrationProvider, campaigns: AdCampaignMetric[]): AdAnalyticsSnapshot {
  return {
    provider,
    period: "last_30_days",
    syncedAt: new Date().toISOString(),
    spend: total(campaigns, "spend"),
    impressions: total(campaigns, "impressions"),
    clicks: total(campaigns, "clicks"),
    leads: total(campaigns, "leads"),
    campaigns,
  };
}

function providerError(json: JsonRecord | null, status: number) {
  const error = record(json?.error);
  return String(error.message || json?.message || `Advertising provider returned ${status}.`).slice(0, 500);
}

async function jsonRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const json = await response.json().catch(() => null) as JsonRecord | null;
  if (!response.ok) throw new Error(providerError(json, response.status));
  return json ?? {};
}

function actionLeads(value: unknown) {
  const leadTypes = new Set([
    "lead",
    "onsite_conversion.lead_grouped",
    "offsite_conversion.fb_pixel_lead",
    "onsite_conversion.messaging_first_reply",
  ]);
  return rows(value).reduce((sum, action) => (
    leadTypes.has(text(action.action_type)) ? sum + number(action.value) : sum
  ), 0);
}

function dateParts() {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 86_400_000);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { start, end, startDate: iso(start), endDate: iso(end) };
}

export async function fetchAdCampaignAnalytics({
  provider,
  config,
  credentials,
}: {
  provider: IntegrationProvider;
  config: Record<string, string | boolean>;
  credentials: Record<string, string>;
}): Promise<AdAnalyticsSnapshot> {
  if (provider === "meta_ads") {
    const token = credentials.META_ADS_ACCESS_TOKEN || credentials.META_ADS_USER_ACCESS_TOKEN || "";
    const accountId = text(config.adAccountId);
    if (!token || !accountId) throw new Error("Connect a Meta ad account before syncing.");
    const graphVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
    const params = new URLSearchParams({
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
      level: "campaign",
      date_preset: "last_30d",
      limit: "100",
      access_token: token,
    });
    const json = await jsonRequest(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(accountId)}/insights?${params}`,
      { method: "GET" },
    );
    const campaigns = rows(json.data).map((row) => ({
      id: text(row.campaign_id),
      name: text(row.campaign_name) || text(row.campaign_id),
      spend: number(row.spend),
      impressions: number(row.impressions),
      clicks: number(row.clicks),
      leads: actionLeads(row.actions),
    }));
    return snapshot(provider, campaigns);
  }

  if (provider === "google_ads") {
    const token = credentials.GOOGLE_ADS_ACCESS_TOKEN || "";
    const developerToken = credentials.GOOGLE_ADS_DEVELOPER_TOKEN || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
    const customerId = text(config.customerId).replace(/\D/g, "");
    if (!token || !developerToken || !customerId) throw new Error("Google Ads OAuth, developer token, and customer ID are required.");
    const apiVersion = process.env.GOOGLE_ADS_API_VERSION || "v22";
    const query = [
      "SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions,",
      "metrics.clicks, metrics.conversions",
      "FROM campaign",
      "WHERE segments.date DURING LAST_30_DAYS",
      "AND campaign.status != 'REMOVED'",
    ].join(" ");
    const json = await jsonRequest(
      `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
          ...(text(config.managerCustomerId)
            ? { "login-customer-id": text(config.managerCustomerId).replace(/\D/g, "") }
            : {}),
        },
        body: JSON.stringify({ query }),
      },
    );
    const stream = Array.isArray(json) ? json : [json];
    const resultRows = stream.flatMap((batch) => rows(record(batch).results));
    const campaigns = resultRows.map((row) => {
      const campaign = record(row.campaign);
      const metrics = record(row.metrics);
      return {
        id: text(campaign.id),
        name: text(campaign.name) || text(campaign.id),
        spend: number(metrics.costMicros) / 1_000_000,
        impressions: number(metrics.impressions),
        clicks: number(metrics.clicks),
        leads: number(metrics.conversions),
      };
    });
    return snapshot(provider, campaigns);
  }

  if (provider === "tiktok_ads") {
    const token = credentials.TIKTOK_ADS_ACCESS_TOKEN || "";
    const advertiserId = text(config.advertiserId);
    if (!token || !advertiserId) throw new Error("Connect a TikTok advertiser before syncing.");
    const { startDate, endDate } = dateParts();
    const params = new URLSearchParams({
      advertiser_id: advertiserId,
      report_type: "BASIC",
      data_level: "AUCTION_CAMPAIGN",
      dimensions: JSON.stringify(["campaign_id"]),
      metrics: JSON.stringify(["campaign_name", "spend", "impressions", "clicks", "conversion"]),
      start_date: startDate,
      end_date: endDate,
      page_size: "100",
    });
    const json = await jsonRequest(
      `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?${params}`,
      { headers: { "Access-Token": token } },
    );
    const campaigns = rows(record(json.data).list).map((row) => {
      const dimensions = record(row.dimensions);
      const metrics = record(row.metrics);
      return {
        id: text(dimensions.campaign_id),
        name: text(metrics.campaign_name) || text(dimensions.campaign_id),
        spend: number(metrics.spend),
        impressions: number(metrics.impressions),
        clicks: number(metrics.clicks),
        leads: number(metrics.conversion),
      };
    });
    return snapshot(provider, campaigns);
  }

  if (provider === "linkedin_ads") {
    const token = credentials.LINKEDIN_ADS_ACCESS_TOKEN || "";
    const accountId = text(config.adAccountId);
    if (!token || !accountId) throw new Error("Connect a LinkedIn ad account before syncing.");
    const { start, end } = dateParts();
    const dateRange = `(start:(year:${start.getUTCFullYear()},month:${start.getUTCMonth() + 1},day:${start.getUTCDate()}),end:(year:${end.getUTCFullYear()},month:${end.getUTCMonth() + 1},day:${end.getUTCDate()}))`;
    const params = new URLSearchParams({
      q: "analytics",
      pivot: "CAMPAIGN",
      timeGranularity: "ALL",
      dateRange,
      accounts: `List(urn:li:sponsoredAccount:${accountId})`,
      fields: "pivotValues,impressions,clicks,costInLocalCurrency,externalWebsiteConversions",
    });
    const json = await jsonRequest(`https://api.linkedin.com/rest/adAnalytics?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "LinkedIn-Version": process.env.LINKEDIN_API_VERSION || "202604",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });
    const campaigns = rows(json.elements).map((row) => {
      const pivot = Array.isArray(row.pivotValues) ? text(row.pivotValues[0]) : "";
      const id = pivot.split(":").at(-1) || pivot;
      return {
        id,
        name: id ? `LinkedIn campaign ${id}` : "LinkedIn campaign",
        spend: number(row.costInLocalCurrency),
        impressions: number(row.impressions),
        clicks: number(row.clicks),
        leads: number(row.externalWebsiteConversions),
      };
    });
    return snapshot(provider, campaigns);
  }

  if (provider === "microsoft_ads") {
    throw new Error("Microsoft Advertising OAuth is connected; reporting requires the approved developer token and SOAP reporting adapter.");
  }

  throw new Error("This provider does not expose advertising campaign analytics.");
}
