import type { IntegrationProvider } from "@/lib/integration-setup";

type JsonRecord = Record<string, unknown>;

export type MarketingAccountCandidate = {
  id: string;
  label: string;
  kind: string;
};

export type MarketingAccountDiscovery = {
  config: Record<string, string | boolean>;
  credentials: Record<string, string>;
  candidates: MarketingAccountCandidate[];
  selections: Record<string, MarketingAccountSelection>;
};

export type MarketingAccountSelection = {
  config: Record<string, string | boolean>;
  credentials: Record<string, string>;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function items(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function providerError(json: JsonRecord | null, status: number) {
  const error = record(json?.error);
  return String(error.message || json?.message || `Provider account discovery returned ${status}.`);
}

async function fetchJson(
  url: string,
  token: string,
  headers: Record<string, string> = {},
  init?: RequestInit,
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...headers,
      ...(init?.headers ?? {}),
    },
  });
  const json = await response.json().catch(() => null) as JsonRecord | null;
  if (!response.ok) throw new Error(providerError(json, response.status));
  return json ?? {};
}

function chosen(candidates: MarketingAccountCandidate[], selectedId?: string | null) {
  if (selectedId) return candidates.find((candidate) => candidate.id === selectedId) ?? null;
  return candidates.length === 1 ? candidates[0] : null;
}

function discoveryResult(
  candidates: MarketingAccountCandidate[],
  selectedId: string | null | undefined,
  selectionFor: (candidate: MarketingAccountCandidate) => MarketingAccountSelection,
): MarketingAccountDiscovery {
  const selections = Object.fromEntries(candidates.map((candidate) => [candidate.id, selectionFor(candidate)]));
  const selected = chosen(candidates, selectedId);
  return {
    candidates,
    selections,
    ...(selected ? selections[selected.id] : { config: {}, credentials: {} }),
  };
}

function stripResourceName(value: string) {
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

export async function discoverMarketingConnection({
  provider,
  credentials,
  selectedId,
}: {
  provider: IntegrationProvider;
  credentials: Record<string, string>;
  selectedId?: string | null;
}): Promise<MarketingAccountDiscovery> {
  if (provider === "meta_social") {
    const userToken = credentials.META_SOCIAL_USER_ACCESS_TOKEN || credentials.META_SOCIAL_ACCESS_TOKEN || "";
    const graphVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
    const json = await fetchJson(
      `https://graph.facebook.com/${graphVersion}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100`,
      userToken,
    );
    const pages = items(json.data);
    const candidates = pages.flatMap((page) => {
      const id = stringValue(page.id);
      return id ? [{ id, label: stringValue(page.name) || id, kind: "Facebook Page" }] : [];
    });
    return discoveryResult(candidates, selectedId, (candidate) => {
      const page = pages.find((item) => stringValue(item.id) === candidate.id);
      const instagram = record(page?.instagram_business_account);
      const instagramId = stringValue(instagram.id);
      const instagramHandle = stringValue(instagram.username);
      const pageToken = stringValue(page?.access_token);
      const pageCredentials: Record<string, string> = pageToken
        ? { META_SOCIAL_ACCESS_TOKEN: pageToken }
        : {};
      return {
        config: {
          facebookPageId: candidate.id,
          accountLabel: candidate.label,
          ...(instagramId ? { instagramAccountId: instagramId } : {}),
          ...(instagramHandle ? { profileHandle: `@${instagramHandle.replace(/^@/, "")}` } : {}),
        },
        credentials: pageCredentials,
      };
    });
  }

  if (provider === "meta_ads") {
    const token = credentials.META_ADS_ACCESS_TOKEN || credentials.META_ADS_USER_ACCESS_TOKEN || "";
    const graphVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
    const json = await fetchJson(
      `https://graph.facebook.com/${graphVersion}/me/adaccounts?fields=id,name,account_id,account_status&limit=100`,
      token,
    );
    const candidates = items(json.data).flatMap((account) => {
      const id = stringValue(account.id);
      return id ? [{ id, label: stringValue(account.name) || id, kind: "Meta ad account" }] : [];
    });
    return discoveryResult(candidates, selectedId, (candidate) => ({
      config: { adAccountId: candidate.id, accountLabel: candidate.label },
      credentials: {},
    }));
  }

  if (provider === "x_social") {
    const token = credentials.X_SOCIAL_ACCESS_TOKEN || "";
    const json = await fetchJson("https://api.x.com/2/users/me?user.fields=username,name", token);
    const user = record(json.data);
    const id = stringValue(user.id);
    const username = stringValue(user.username);
    const candidates = id ? [{ id, label: stringValue(user.name) || username || id, kind: "X profile" }] : [];
    return discoveryResult(candidates, selectedId, (candidate) => ({
      config: {
        userId: candidate.id,
        accountLabel: candidate.label,
        ...(username ? { profileHandle: `@${username.replace(/^@/, "")}` } : {}),
      },
      credentials: {},
    }));
  }

  if (provider === "tiktok_social") {
    const token = credentials.TIKTOK_SOCIAL_ACCESS_TOKEN || "";
    const json = await fetchJson(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,avatar_url",
      token,
    );
    const user = record(record(json.data).user);
    const id = stringValue(user.open_id);
    const username = stringValue(user.username);
    const candidates = id ? [{ id, label: stringValue(user.display_name) || username || id, kind: "TikTok profile" }] : [];
    return discoveryResult(candidates, selectedId, (candidate) => ({
      config: {
        openId: candidate.id,
        accountLabel: candidate.label,
        ...(username ? { profileHandle: `@${username.replace(/^@/, "")}` } : {}),
      },
      credentials: {},
    }));
  }

  if (provider === "pinterest_social") {
    const token = credentials.PINTEREST_SOCIAL_ACCESS_TOKEN || "";
    const [account, boardsJson] = await Promise.all([
      fetchJson("https://api.pinterest.com/v5/user_account", token),
      fetchJson("https://api.pinterest.com/v5/boards?page_size=100", token),
    ]);
    const candidates = items(boardsJson.items).flatMap((board) => {
      const id = stringValue(board.id);
      return id ? [{ id, label: stringValue(board.name) || id, kind: "Pinterest board" }] : [];
    });
    const username = stringValue(account.username);
    return discoveryResult(candidates, selectedId, (candidate) => ({
      config: {
        accountLabel: stringValue(account.business_name) || username || "Pinterest",
        ...(username ? { profileHandle: username } : {}),
        boardId: candidate.id,
      },
      credentials: {},
    }));
  }

  if (provider === "google_ads") {
    const token = credentials.GOOGLE_ADS_ACCESS_TOKEN || "";
    const developerToken = credentials.GOOGLE_ADS_DEVELOPER_TOKEN || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
    const apiVersion = process.env.GOOGLE_ADS_API_VERSION || "v22";
    const json = await fetchJson(
      `https://googleads.googleapis.com/${apiVersion}/customers:listAccessibleCustomers`,
      token,
      developerToken ? { "developer-token": developerToken } : {},
    );
    const candidates = (Array.isArray(json.resourceNames) ? json.resourceNames : []).flatMap((value) => {
      const resourceName = stringValue(value);
      const id = stripResourceName(resourceName);
      return id ? [{ id, label: id, kind: "Google Ads customer" }] : [];
    });
    return discoveryResult(candidates, selectedId, (candidate) => ({
      config: { customerId: candidate.id, accountLabel: candidate.label },
      credentials: {},
    }));
  }

  if (provider === "google_business") {
    const token = credentials.GOOGLE_BUSINESS_ACCESS_TOKEN || "";
    const accountsJson = await fetchJson("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", token);
    const accounts = items(accountsJson.accounts);
    const accountRows = accounts.flatMap((account) => {
      const name = stringValue(account.name);
      const id = stripResourceName(name);
      return id ? [{ id, label: stringValue(account.accountName) || id }] : [];
    });
    const locationsByAccount = await Promise.all(accountRows.map(async (account) => {
      const locationsJson = await fetchJson(
        `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${encodeURIComponent(account.id)}/locations?readMask=name,title&showAll=true`,
        token,
      );
      return items(locationsJson.locations).flatMap((location) => {
        const name = stringValue(location.name);
        const locationId = stripResourceName(name);
        return locationId
          ? [{
              id: `${account.id}:${locationId}`,
              label: `${stringValue(location.title) || locationId} · ${account.label}`,
              kind: "Google Business location",
            }]
          : [];
      });
    }));
    const candidates = locationsByAccount.flat();
    return discoveryResult(candidates, selectedId, (candidate) => ({
      config: {
        accountId: candidate.id.split(":")[0],
        locationId: candidate.id.split(":").slice(1).join(":"),
        accountLabel: candidate.label,
      },
      credentials: {},
    }));
  }

  if (provider === "tiktok_ads") {
    const token = credentials.TIKTOK_ADS_ACCESS_TOKEN || "";
    const appId = process.env.TIKTOK_ADS_APP_ID || process.env.TIKTOK_ADS_CLIENT_ID || "";
    const appSecret = process.env.TIKTOK_ADS_APP_SECRET || process.env.TIKTOK_ADS_CLIENT_SECRET || "";
    const json = await fetchJson(
      "https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/",
      token,
      { "Access-Token": token },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, secret: appSecret }),
      },
    );
    const advertisers = items(record(json.data).list);
    const candidates = advertisers.flatMap((advertiser) => {
      const id = stringValue(advertiser.advertiser_id);
      return id ? [{ id, label: stringValue(advertiser.advertiser_name) || id, kind: "TikTok advertiser" }] : [];
    });
    return discoveryResult(candidates, selectedId, (candidate) => ({
      config: { advertiserId: candidate.id, accountLabel: candidate.label },
      credentials: {},
    }));
  }

  if (provider === "linkedin_ads") {
    const token = credentials.LINKEDIN_ADS_ACCESS_TOKEN || "";
    const version = process.env.LINKEDIN_API_VERSION || "202604";
    const json = await fetchJson(
      "https://api.linkedin.com/rest/adAccounts?q=search&pageSize=1000",
      token,
      { "LinkedIn-Version": version, "X-Restli-Protocol-Version": "2.0.0" },
    );
    const candidates = items(json.elements).flatMap((account) => {
      const id = stringValue(account.id);
      return id ? [{
        id,
        label: stringValue(account.name) || id,
        kind: account.test === true ? "LinkedIn test ad account" : "LinkedIn ad account",
      }] : [];
    });
    return discoveryResult(candidates, selectedId, (candidate) => ({
      config: { adAccountId: candidate.id, accountLabel: candidate.label },
      credentials: {},
    }));
  }

  if (provider === "microsoft_ads") {
    const token = credentials.MICROSOFT_ADS_ACCESS_TOKEN || "";
    const developerToken = credentials.MICROSOFT_ADS_DEVELOPER_TOKEN || process.env.MICROSOFT_ADS_DEVELOPER_TOKEN || "";
    if (!developerToken) throw new Error("Microsoft Advertising developer token is required for account discovery.");
    const response = await fetch(
      "https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13/Accounts/Find",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          DeveloperToken: developerToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ CustomerId: null, AccountFilter: "", TopN: 5000 }),
      },
    );
    const json = await response.json().catch(() => null) as JsonRecord | null;
    if (!response.ok) throw new Error(providerError(json, response.status));
    const candidates = items(json?.AccountsInfo).flatMap((account) => {
      const id = stringValue(account.Id);
      return id ? [{
        id,
        label: stringValue(account.Name) || stringValue(account.Number) || id,
        kind: "Microsoft Advertising account",
      }] : [];
    });
    return discoveryResult(candidates, selectedId, (candidate) => ({
      config: { accountId: candidate.id, accountLabel: candidate.label },
      credentials: {},
    }));
  }

  if (provider === "linkedin_social") {
    const token = credentials.LINKEDIN_SOCIAL_ACCESS_TOKEN || "";
    const version = process.env.LINKEDIN_API_VERSION || "202604";
    const json = await fetchJson(
      "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
      token,
      { "LinkedIn-Version": version, "X-Restli-Protocol-Version": "2.0.0" },
    );
    const candidates = items(json.elements).flatMap((item) => {
      const urn = stringValue(item.organization || item.organizationalTarget);
      const id = stripResourceName(urn.replaceAll(":", "/"));
      return id ? [{ id, label: `LinkedIn organization ${id}`, kind: "LinkedIn Page" }] : [];
    });
    return discoveryResult(candidates, selectedId, (candidate) => ({
      config: { organizationId: candidate.id, accountLabel: candidate.label },
      credentials: {},
    }));
  }

  return { candidates: [], config: {}, credentials: {}, selections: {} };
}
