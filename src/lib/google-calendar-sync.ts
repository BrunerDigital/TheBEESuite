import { Prisma, type CalendarEvent } from "@prisma/client";
import { calendarEventToGooglePayload, isGoogleAllDayEvent, readGoogleEventDate } from "@/lib/calendar-events";
import { credentialEnvValue, getTenantIntegrationCredentialMap } from "@/lib/integration-credentials";

type GoogleCalendarConfig = {
  configured: boolean;
  provider: "google_calendar";
  calendarId: string;
  accessToken: string;
  error?: string;
};

type GoogleCalendarApiEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
  htmlLink?: string;
  extendedProperties?: {
    private?: Record<string, string>;
  };
};

export type GoogleCalendarSyncResult = {
  ok: boolean;
  configured: boolean;
  provider: "google_calendar";
  id?: string;
  htmlLink?: string;
  error?: string;
  payload?: Record<string, unknown>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function refreshGoogleAccessToken(credentials: Record<string, string>) {
  const refreshToken = credentialEnvValue(credentials, "GOOGLE_CALENDAR_REFRESH_TOKEN");
  const clientId = credentialEnvValue(credentials, "GOOGLE_CLIENT_ID");
  const clientSecret = credentialEnvValue(credentials, "GOOGLE_CLIENT_SECRET");

  if (!refreshToken || !clientId || !clientSecret) {
    return { token: "", error: "Google Calendar OAuth refresh credentials are not configured." };
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = await response.json().catch(() => null) as { access_token?: string; error_description?: string; error?: string } | null;
    if (!response.ok || !json?.access_token) {
      return { token: "", error: json?.error_description || json?.error || `Google OAuth returned ${response.status}.` };
    }
    return { token: json.access_token, error: undefined };
  } catch (error) {
    return { token: "", error: error instanceof Error ? error.message : "Google OAuth token refresh failed." };
  }
}

export async function getGoogleCalendarConfiguration(tenantId: string | null | undefined): Promise<GoogleCalendarConfig> {
  const credentials = await getTenantIntegrationCredentialMap(tenantId, "google_calendar");
  const calendarId = credentialEnvValue(credentials, "GOOGLE_CALENDAR_ID") || clean(process.env.GOOGLE_CALENDAR_PRIMARY_ID);
  const directAccessToken = credentialEnvValue(credentials, "GOOGLE_CALENDAR_ACCESS_TOKEN");

  if (!calendarId) {
    return {
      configured: false,
      provider: "google_calendar",
      calendarId: "",
      accessToken: "",
      error: "Google Calendar ID is not configured.",
    };
  }

  if (directAccessToken) {
    return {
      configured: true,
      provider: "google_calendar",
      calendarId,
      accessToken: directAccessToken,
    };
  }

  const refreshed = await refreshGoogleAccessToken(credentials);
  return {
    configured: Boolean(refreshed.token),
    provider: "google_calendar",
    calendarId,
    accessToken: refreshed.token,
    error: refreshed.error,
  };
}

function googleCalendarUrl(calendarId: string, eventId?: string) {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

export async function syncCalendarEventToGoogle({
  event,
  centerName,
  calendarId,
  accessToken,
}: {
  event: CalendarEvent;
  centerName?: string | null;
  calendarId: string;
  accessToken: string;
}): Promise<GoogleCalendarSyncResult> {
  const payload = calendarEventToGooglePayload({
    title: event.title,
    eventType: event.eventType,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    timeZone: event.timeZone,
    recurrenceRule: event.recurrenceRule,
    visibility: event.visibility,
    notes: event.notes,
    centerName,
  });
  const method = event.googleEventId ? "PATCH" : "POST";
  const url = method === "PATCH"
    ? googleCalendarUrl(calendarId, event.googleEventId ?? undefined)
    : `${googleCalendarUrl(calendarId)}?sendUpdates=none`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return {
      ok: false,
      configured: true,
      provider: "google_calendar",
      error: error instanceof Error ? error.message : "Google Calendar request failed.",
      payload: payload as Record<string, unknown>,
    };
  }

  const json = await response.json().catch(() => null) as { id?: string; htmlLink?: string; error?: { message?: string } } | null;
  if (!response.ok) {
    return {
      ok: false,
      configured: true,
      provider: "google_calendar",
      error: json?.error?.message || `Google Calendar returned ${response.status}.`,
      payload: payload as Record<string, unknown>,
    };
  }

  return {
    ok: true,
    configured: true,
    provider: "google_calendar",
    id: json?.id,
    htmlLink: json?.htmlLink,
    payload: payload as Record<string, unknown>,
  };
}

export async function listGoogleCalendarEvents({
  calendarId,
  accessToken,
  timeMin,
  timeMax,
}: {
  calendarId: string;
  accessToken: string;
  timeMin: Date;
  timeMax: Date;
}) {
  const url = new URL(googleCalendarUrl(calendarId));
  url.searchParams.set("timeMin", timeMin.toISOString());
  url.searchParams.set("timeMax", timeMax.toISOString());
  url.searchParams.set("singleEvents", "false");
  url.searchParams.set("showDeleted", "false");
  url.searchParams.set("maxResults", "2500");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json().catch(() => null) as { items?: GoogleCalendarApiEvent[]; error?: { message?: string } } | null;
  if (!response.ok) {
    return {
      ok: false as const,
      events: [],
      error: json?.error?.message || `Google Calendar returned ${response.status}.`,
    };
  }

  return {
    ok: true as const,
    events: json?.items ?? [],
    error: undefined,
  };
}

export function googleEventToCalendarData({
  event,
  tenantId,
  centerId,
  calendarId,
  fallbackTimeZone,
}: {
  event: GoogleCalendarApiEvent;
  tenantId: string;
  centerId: string | null;
  calendarId: string;
  fallbackTimeZone: string;
}) {
  const startsAt = readGoogleEventDate(event.start);
  const endsAt = readGoogleEventDate(event.end);
  const allDay = isGoogleAllDayEvent(event.start);
  const privateProperties = event.extendedProperties?.private ?? {};
  const recurrenceRule = event.recurrence?.find((item) => item.startsWith("RRULE:")) ?? null;
  const privateEventType = clean(privateProperties.beeSuiteEventType);
  const privateVisibility = clean(privateProperties.beeSuiteVisibility);
  const eventType = ["event", "closure", "holiday"].includes(privateEventType)
    ? privateEventType
    : "event";
  const visibility = ["staff", "parents", "public"].includes(privateVisibility)
    ? privateVisibility
    : "staff";

  if (!event.id || !startsAt || Number.isNaN(startsAt.getTime())) return null;

  return {
    tenantId,
    centerId,
    title: clean(event.summary) || "Google Calendar event",
    eventType,
    startsAt,
    endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
    allDay,
    timeZone: clean(event.start?.timeZone) || fallbackTimeZone,
    status: event.status === "cancelled" ? "cancelled" : "scheduled",
    visibility,
    recurrenceRule,
    recurrenceEndAt: null,
    source: "google",
    googleCalendarId: calendarId,
    googleEventId: event.id,
    googleSyncStatus: "synced",
    googleSyncedAt: new Date(),
    lastGooglePayload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonObject,
    notes: clean(event.description).slice(0, 2_000) || null,
  };
}
