"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, ClipboardCheck, ExternalLink, ImageIcon, RefreshCw, Save, Send, ShieldAlert, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SOCIAL_CHANNELS, type SocialChannel } from "@/lib/social-publishing";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedDateTime, zonedDateTimeLocalToUtc, zonedDateTimeLocalValue } from "@/lib/zoned-date-time";

export type SocialConnection = {
  centerId: string | null;
  provider: string;
  name: string;
  purpose: string;
  configured: boolean;
  availableChannels: string[];
  accountLabel: string;
  profileHandle: string;
  auditStatus: string;
  analytics: Record<string, number>;
  lastSyncAt: Date | string | null;
};

export type SocialPublishingCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  timeZone?: string;
};

export type SocialCampaignRow = {
  id: string;
  name: string;
  type: string;
  body: string | null;
  audience: unknown;
  status: string;
  scheduledAt: Date | string | null;
  sentAt: Date | string | null;
  metrics: unknown;
};

const socialPostTemplates = [
  {
    key: "open-enrollment",
    label: "Open Enrollment",
    title: "Open enrollment",
    text: "Enrollment is open for families looking for a safe, nurturing child care experience. Schedule a tour with our school team today.",
  },
  {
    key: "tour-invite",
    label: "Tour Invite",
    title: "Schedule a tour",
    text: "Come see our classrooms, meet the team, and learn how our program supports children every day. Tour times are available this week.",
  },
  {
    key: "community-moment",
    label: "Community Moment",
    title: "School community highlight",
    text: "A quick look at the learning, friendships, and routines that make our school community special.",
  },
  {
    key: "staff-spotlight",
    label: "Staff Spotlight",
    title: "Staff spotlight",
    text: "We are grateful for the educators who make each day welcoming, structured, and full of care for our children and families.",
  },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function campaignCenterId(campaign: SocialCampaignRow) {
  return typeof asRecord(campaign.audience).centerId === "string" ? String(asRecord(campaign.audience).centerId) : "";
}

function campaignChannels(campaign: SocialCampaignRow) {
  return textArray(asRecord(campaign.audience).channels);
}

function statusVariant(status: string): "default" | "outline" | "secondary" | "destructive" {
  if (["sent", "scheduled", "approved"].includes(status)) return "default";
  if (["failed", "changes_requested"].includes(status)) return "destructive";
  if (["needs_approval", "partial"].includes(status)) return "secondary";
  return "outline";
}

function localFutureValue(timeZone: string) {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return zonedDateTimeLocalValue(date, timeZone);
}

export function SocialPublishingStudio({
  connections,
  centers,
  initialCenterId,
  campaigns: initialCampaigns,
  canApproveSocialPosts,
}: {
  connections: SocialConnection[];
  centers: SocialPublishingCenter[];
  initialCenterId: string | null;
  campaigns: SocialCampaignRow[];
  canApproveSocialPosts: boolean;
}) {
  const timeZone = useSchoolTimeZone();
  const router = useRouter();
  const [profiles, setProfiles] = useState(connections);
  const [reviewedCampaigns, setReviewedCampaigns] = useState<Record<string, Partial<SocialCampaignRow>>>({});
  const initialSelectedCenter = centers.find((center) => center.id === initialCenterId) ?? centers[0] ?? null;
  const [centerId, setCenterId] = useState(initialSelectedCenter?.id || "");
  const selectedCenter = centers.find((center) => center.id === centerId) ?? null;
  const selectedTimeZone = selectedCenter?.timeZone || timeZone;
  const selectedProfiles = profiles.filter((item) => item.centerId === centerId);
  const configuredChannels = new Set(selectedProfiles.flatMap((item) => item.configured ? item.availableChannels : []));
  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => localFutureValue(initialSelectedCenter?.timeZone || timeZone));
  const [approvalScheduleById, setApprovalScheduleById] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<"draft" | "schedule" | "publish" | "approval" | `approve:${string}` | `changes:${string}` | `sync:${string}` | null>(null);
  const [isPending, startTransition] = useTransition();
  const campaigns = useMemo(
    () => initialCampaigns.map((campaign) => ({ ...campaign, ...reviewedCampaigns[campaign.id] })),
    [initialCampaigns, reviewedCampaigns],
  );
  const selectedCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.type === "social_post" && campaignCenterId(campaign) === centerId),
    [campaigns, centerId],
  );
  const approvalQueue = selectedCampaigns.filter((campaign) => campaign.status === "needs_approval");
  const recentCampaigns = selectedCampaigns.slice(0, 8);
  const readinessChecks = useMemo(() => {
    const needsImage = channels.some((channel) => channel === "instagram" || channel === "pinterest_social");
    const needsVideo = channels.includes("tiktok_social");
    return [
      { label: "School selected", ok: Boolean(centerId), required: true },
      { label: "Profile selected", ok: channels.length > 0, required: true },
      { label: "Copy entered", ok: text.trim().length > 0, required: true },
      { label: "Image ready", ok: !needsImage || Boolean(mediaUrl), required: needsImage },
      { label: "Video ready", ok: !needsVideo || Boolean(mediaUrl), required: needsVideo },
      { label: "Link included", ok: Boolean(linkUrl), required: false },
      { label: "Copy length", ok: text.length <= 2200, required: false },
    ];
  }, [centerId, channels, text, mediaUrl, linkUrl]);

  function selectCenter(nextCenterId: string) {
    const nextCenter = centers.find((center) => center.id === nextCenterId) ?? null;
    setCenterId(nextCenterId);
    setChannels([]);
    setScheduledAt(localFutureValue(nextCenter?.timeZone || timeZone));
    setMessage("");
    setError("");
  }

  function toggle(channel: SocialChannel) {
    setChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]);
  }

  function submit(mode: "draft" | "schedule" | "publish" | "approval") {
    startTransition(async () => {
      setPendingAction(mode);
      setMessage("");
      setError("");
      try {
        const response = await fetch("/api/marketing/social-posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            centerId,
            channels,
            title,
            text,
            mediaUrl,
            linkUrl,
            scheduledAt: mode === "schedule" ? zonedDateTimeLocalToUtc(scheduledAt, selectedTimeZone)?.toISOString() : undefined,
          }),
        });
        const json = await response.json().catch(() => null) as { error?: string; status?: string; results?: Array<{ ok: boolean; channel: string; error?: string }> } | null;
        if (!response.ok && response.status !== 207) {
          setError(json?.error || "The social post could not be saved.");
          return;
        }
        const failed = json?.results?.filter((result) => !result.ok) ?? [];
        if (failed.length) {
          setError(failed.map((result) => `${result.channel}: ${result.error || "Publishing failed"}`).join(" · "));
        }
        const published = json?.results?.filter((result) => result.ok).length ?? 0;
        setMessage(mode === "draft" ? "Draft saved." : mode === "schedule" ? "Post scheduled." : mode === "approval" ? "Post submitted for approval." : `${published} profile${published === 1 ? "" : "s"} published successfully.`);
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  function loadCampaign(campaign: SocialCampaignRow) {
    setTitle(campaign.name);
    setText(campaign.body ?? "");
    const audience = asRecord(campaign.audience);
    setMediaUrl(typeof audience.mediaUrl === "string" ? audience.mediaUrl : "");
    setLinkUrl(typeof audience.linkUrl === "string" ? audience.linkUrl : "");
    setChannels(campaignChannels(campaign).filter((channel): channel is SocialChannel => SOCIAL_CHANNELS.some((item) => item.channel === channel)));
    setScheduledAt(campaign.scheduledAt ? zonedDateTimeLocalValue(campaign.scheduledAt, selectedTimeZone) : localFutureValue(selectedTimeZone));
    setMessage("");
    setError("");
  }

  function applyTemplate(template: typeof socialPostTemplates[number]) {
    setTitle(template.title);
    setText(template.text);
    setMessage("");
    setError("");
  }

  function approvalScheduleValue(campaign: SocialCampaignRow) {
    return approvalScheduleById[campaign.id] ?? (campaign.scheduledAt ? zonedDateTimeLocalValue(campaign.scheduledAt, selectedTimeZone) : localFutureValue(selectedTimeZone));
  }

  function reviewCampaign(campaign: SocialCampaignRow, action: "approve" | "request_changes") {
    startTransition(async () => {
      setPendingAction(action === "approve" ? `approve:${campaign.id}` : `changes:${campaign.id}`);
      setMessage("");
      setError("");
      try {
        const response = await fetch(`/api/marketing/social-posts/${campaign.id}/approval`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            note: action === "request_changes" ? "Requested revisions before scheduling." : undefined,
            scheduledAt: action === "approve" ? zonedDateTimeLocalToUtc(approvalScheduleValue(campaign), selectedTimeZone)?.toISOString() : undefined,
          }),
        });
        const json = await response.json().catch(() => null) as { error?: string; status?: string; scheduledAt?: string | null } | null;
        if (!response.ok) {
          setError(json?.error || "The social post could not be reviewed.");
          return;
        }
        setReviewedCampaigns((current) => ({
          ...current,
          [campaign.id]: { status: json?.status ?? campaign.status, scheduledAt: json?.scheduledAt ?? campaign.scheduledAt },
        }));
        setMessage(action === "approve" ? "Post approved and scheduled." : "Changes requested.");
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  }

  function syncAnalytics(provider: string) {
    startTransition(async () => {
      setPendingAction(`sync:${provider}`);
      setMessage("");
      setError("");
      try {
        const response = await fetch("/api/marketing/social-analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, centerId }) });
        const json = await response.json().catch(() => null) as { error?: string; analytics?: Record<string, number>; syncedAt?: string } | null;
        if (!response.ok || !json?.analytics) {
          setError(json?.error || "Profile analytics could not be synced.");
          return;
        }
        setProfiles((current) => current.map((profile) =>
          profile.provider === provider && profile.centerId === centerId
            ? { ...profile, analytics: json.analytics!, lastSyncAt: json.syncedAt ?? new Date().toISOString() }
            : profile
        ));
        setMessage("Profile analytics refreshed.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Social Publisher</CardTitle>
          <CardDescription>Create once, select approved business profiles, then save, route for approval, schedule, or publish through each platform&apos;s official API.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5" aria-busy={isPending}>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-1">
              <Label htmlFor="social-post-school">School</Label>
              <select
                id="social-post-school"
                name="social-post-school"
                autoComplete="off"
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={centerId}
                onChange={(event) => selectCenter(event.target.value)}
              >
                {centers.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.crmLocationId ? `${center.crmLocationId} - ${center.name}` : center.name}
                  </option>
                ))}
              </select>
            </div>
            <Badge className="w-fit" variant={configuredChannels.size ? "default" : "outline"}>
              {configuredChannels.size ? `${configuredChannels.size} channel${configuredChannels.size === 1 ? "" : "s"} ready` : "No social profiles ready"}
            </Badge>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Publish to</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SOCIAL_CHANNELS.map((channel) => {
                const connected = configuredChannels.has(channel.channel);
                const selected = channels.includes(channel.channel);
                return (
                  <button
                    key={channel.channel}
                    type="button"
                    disabled={!connected}
                    onClick={() => toggle(channel.channel)}
                    aria-pressed={selected}
                    aria-label={`${channel.name}: ${connected ? selected ? "selected" : "not selected" : "not connected"}`}
                    className={`min-h-16 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/10" : "bg-background hover:border-primary/40"} disabled:cursor-not-allowed disabled:opacity-55`}
                  >
                    <span className="flex items-center justify-between gap-2"><span className="font-medium">{channel.name}</span>{connected ? <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" /> : <ShieldAlert className="size-4" aria-hidden="true" />}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{connected ? channel.publishing === "review_required" ? "Connected · provider review applies" : "Connected" : selectedCenter ? `Connect for ${selectedCenter.name}` : "Choose a school"}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 text-primary" aria-hidden="true" /> Templates</div>
            <div className="flex flex-wrap gap-2">
              {socialPostTemplates.map((template) => (
                <Button key={template.key} type="button" variant="outline" size="sm" onClick={() => applyTemplate(template)}>
                  {template.label}
                </Button>
              ))}
            </div>
          </div>

          {message ? <div role="status" aria-live="polite" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{message}</div> : null}
          {error ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

          <div className="grid gap-2 rounded-lg border bg-muted/25 p-3 sm:grid-cols-2 lg:grid-cols-4">
            {readinessChecks.map((check) => (
              <div key={check.label} className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-sm">
                <span>{check.label}</span>
                <Badge variant={check.ok ? "default" : check.required ? "destructive" : "outline"}>{check.ok ? "OK" : check.required ? "Needed" : "Optional"}</Badge>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2"><Label htmlFor="social-post-title">Internal title</Label><Input id="social-post-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Back-to-school enrollment reminder" /></div>
            <div className="space-y-1 md:col-span-2"><Label htmlFor="social-post-copy">Post copy</Label><Textarea id="social-post-copy" className="min-h-40" value={text} onChange={(event) => setText(event.target.value)} placeholder="Write the message that will appear on the selected profiles..." /></div>
            <div className="space-y-1"><Label htmlFor="social-post-media-url">Public image or video URL</Label><Input id="social-post-media-url" type="url" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="https://..." /></div>
            <div className="space-y-1"><Label htmlFor="social-post-destination-url">Destination link</Label><Input id="social-post-destination-url" type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://..." /></div>
            <div className="space-y-1"><Label htmlFor="social-post-schedule-time">Schedule time</Label><Input id="social-post-schedule-time" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></div>
            <div className="flex items-end text-xs leading-5 text-muted-foreground"><ImageIcon className="mr-2 size-4 shrink-0" aria-hidden="true" /> Instagram and Pinterest require an image. TikTok requires a video and explicit platform approval.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={isPending || !text || !channels.length} onClick={() => submit("publish")} aria-busy={pendingAction === "publish"}><Send data-icon="inline-start" aria-hidden="true" /> {pendingAction === "publish" ? "Publishing…" : "Publish now"}</Button>
            <Button variant="outline" disabled={isPending || !text || !channels.length || !scheduledAt} onClick={() => submit("schedule")} aria-busy={pendingAction === "schedule"}><CalendarClock data-icon="inline-start" aria-hidden="true" /> {pendingAction === "schedule" ? "Scheduling…" : "Schedule"}</Button>
            <Button variant="outline" disabled={isPending || !text || !channels.length} onClick={() => submit("approval")} aria-busy={pendingAction === "approval"}><ClipboardCheck data-icon="inline-start" aria-hidden="true" /> {pendingAction === "approval" ? "Submitting…" : "Submit for approval"}</Button>
            <Button variant="outline" disabled={isPending || !text || !channels.length} onClick={() => submit("draft")} aria-busy={pendingAction === "draft"}><Save data-icon="inline-start" aria-hidden="true" /> {pendingAction === "draft" ? "Saving draft…" : "Save draft"}</Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle as="h2">Approval queue</CardTitle><CardDescription>Director submissions waiting on executive review.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {approvalQueue.map((campaign) => (
              <div key={campaign.id} className="rounded-lg border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{campaign.name}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{campaign.body}</div>
                  </div>
                  <Badge variant="secondary">Pending</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {campaignChannels(campaign).map((channel) => <Badge key={channel} variant="outline">{channel.replace("_social", "")}</Badge>)}
                </div>
                {canApproveSocialPosts ? (
                  <div className="mt-3 space-y-2">
                    <Label htmlFor={`approval-schedule-${campaign.id}`}>Schedule time</Label>
                    <Input
                      id={`approval-schedule-${campaign.id}`}
                      type="datetime-local"
                      value={approvalScheduleValue(campaign)}
                      onChange={(event) => setApprovalScheduleById((current) => ({ ...current, [campaign.id]: event.target.value }))}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={isPending} aria-busy={pendingAction === `approve:${campaign.id}`} onClick={() => reviewCampaign(campaign, "approve")}>
                        <CalendarClock data-icon="inline-start" aria-hidden="true" />
                        {pendingAction === `approve:${campaign.id}` ? "Approving…" : "Approve & schedule"}
                      </Button>
                      <Button size="sm" variant="outline" disabled={isPending} aria-busy={pendingAction === `changes:${campaign.id}`} onClick={() => reviewCampaign(campaign, "request_changes")}>
                        {pendingAction === `changes:${campaign.id}` ? "Requesting…" : "Request changes"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            {!approvalQueue.length ? (
              <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                No social posts are waiting for this school.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2">Social history</CardTitle><CardDescription>Recent drafts, approvals, schedules, and publish outcomes for the selected school.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {recentCampaigns.map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                onClick={() => loadCampaign(campaign)}
                className="w-full rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{campaign.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {campaign.sentAt ? `Sent ${formatZonedDateTime(campaign.sentAt, selectedTimeZone)}` : campaign.scheduledAt ? `Scheduled ${formatZonedDateTime(campaign.scheduledAt, selectedTimeZone)}` : "Not scheduled"}
                    </div>
                  </div>
                  <Badge variant={statusVariant(campaign.status)}>{campaign.status.replaceAll("_", " ")}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {campaignChannels(campaign).map((channel) => <Badge key={channel} variant="outline">{channel.replace("_social", "")}</Badge>)}
                </div>
              </button>
            ))}
            {!recentCampaigns.length ? (
              <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                No social posts have been saved for this school.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2">Profile readiness</CardTitle><CardDescription>Owned business profiles and API review status.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {selectedProfiles.map((connection) => (
              <div key={connection.provider} className="rounded-lg border bg-background p-3">
                <div className="flex items-start justify-between gap-2"><div><div className="font-medium">{connection.name}</div><div className="text-xs text-muted-foreground">{connection.profileHandle || connection.accountLabel || connection.purpose}</div></div><Badge variant={connection.configured ? "default" : "outline"}>{connection.configured ? "Ready" : "Setup"}</Badge></div>
                {connection.provider === "tiktok_social" && connection.auditStatus !== "approved" ? <p className="mt-2 text-xs text-amber-600">Public Direct Post remains limited until TikTok approves the app audit.</p> : null}
                {Object.keys(connection.analytics).length ? <div className="mt-3 grid grid-cols-2 gap-2">{Object.entries(connection.analytics).slice(0, 4).map(([label, value]) => <div key={label} className="rounded-md bg-muted/50 p-2"><div className="text-xs text-muted-foreground">{label.replaceAll("_", " ")}</div><div className="font-semibold">{value.toLocaleString()}</div></div>)}</div> : null}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Link href={`/integrations?provider=${connection.provider}`} className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${connection.configured ? "Manage connection" : "Connect profile"} for ${connection.name}`}>{connection.configured ? "Manage connection" : "Connect profile"}<ExternalLink className="size-3" aria-hidden="true" /></Link>
                  {connection.configured ? <button type="button" disabled={isPending} onClick={() => syncAnalytics(connection.provider)} aria-busy={pendingAction === `sync:${connection.provider}`} className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><RefreshCw className="size-3" aria-hidden="true" />{pendingAction === `sync:${connection.provider}` ? `Syncing ${connection.name}…` : `Sync ${connection.name} analytics`}</button> : null}
                </div>
              </div>
            ))}
            {!selectedProfiles.length ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                Choose a school with connected social profiles, or connect profiles from Integrations.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
