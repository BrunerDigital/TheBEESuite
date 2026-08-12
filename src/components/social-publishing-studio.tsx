"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, ExternalLink, ImageIcon, RefreshCw, Save, Send, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SOCIAL_CHANNELS, type SocialChannel } from "@/lib/social-publishing";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { zonedDateTimeLocalToUtc, zonedDateTimeLocalValue } from "@/lib/zoned-date-time";

export type SocialConnection = {
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

function localFutureValue(timeZone: string) {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return zonedDateTimeLocalValue(date, timeZone);
}

export function SocialPublishingStudio({ connections }: { connections: SocialConnection[] }) {
  const timeZone = useSchoolTimeZone();
  const [profiles, setProfiles] = useState(connections);
  const configuredChannels = new Set(profiles.flatMap((item) => item.configured ? item.availableChannels : []));
  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => localFutureValue(timeZone));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<"draft" | "schedule" | "publish" | `sync:${string}` | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(channel: SocialChannel) {
    setChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]);
  }

  function submit(mode: "draft" | "schedule" | "publish") {
    startTransition(async () => {
      setPendingAction(mode);
      setMessage("");
      setError("");
      try {
        const response = await fetch("/api/marketing/social-posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, channels, title, text, mediaUrl, linkUrl, scheduledAt: mode === "schedule" ? zonedDateTimeLocalToUtc(scheduledAt, timeZone)?.toISOString() : undefined }),
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
        setMessage(mode === "draft" ? "Draft saved." : mode === "schedule" ? "Post scheduled." : `${published} profile${published === 1 ? "" : "s"} published successfully.`);
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
        const response = await fetch("/api/marketing/social-analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider }) });
        const json = await response.json().catch(() => null) as { error?: string; analytics?: Record<string, number>; syncedAt?: string } | null;
        if (!response.ok || !json?.analytics) {
          setError(json?.error || "Profile analytics could not be synced.");
          return;
        }
        setProfiles((current) => current.map((profile) => profile.provider === provider ? { ...profile, analytics: json.analytics!, lastSyncAt: json.syncedAt ?? new Date().toISOString() } : profile));
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
          <CardDescription>Create once, select approved business profiles, then save, schedule, or publish through each platform&apos;s official API.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5" aria-busy={isPending}>
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
                    <span className="mt-1 block text-xs text-muted-foreground">{connected ? channel.publishing === "review_required" ? "Connected · provider review applies" : "Connected" : "Connect in Settings"}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {message ? <div role="status" aria-live="polite" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{message}</div> : null}
          {error ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

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
            <Button variant="outline" disabled={isPending || !text || !channels.length} onClick={() => submit("draft")} aria-busy={pendingAction === "draft"}><Save data-icon="inline-start" aria-hidden="true" /> {pendingAction === "draft" ? "Saving draft…" : "Save draft"}</Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle as="h2">Profile readiness</CardTitle><CardDescription>Owned business profiles and API review status.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {profiles.map((connection) => (
              <div key={connection.provider} className="rounded-lg border bg-background p-3">
                <div className="flex items-start justify-between gap-2"><div><div className="font-medium">{connection.name}</div><div className="text-xs text-muted-foreground">{connection.profileHandle || connection.accountLabel || connection.purpose}</div></div><Badge variant={connection.configured ? "default" : "outline"}>{connection.configured ? "Ready" : "Setup"}</Badge></div>
                {connection.provider === "tiktok_social" && connection.auditStatus !== "approved" ? <p className="mt-2 text-xs text-amber-600">Public Direct Post remains limited until TikTok approves the app audit.</p> : null}
                {Object.keys(connection.analytics).length ? <div className="mt-3 grid grid-cols-2 gap-2">{Object.entries(connection.analytics).slice(0, 4).map(([label, value]) => <div key={label} className="rounded-md bg-muted/50 p-2"><div className="text-xs text-muted-foreground">{label.replaceAll("_", " ")}</div><div className="font-semibold">{value.toLocaleString()}</div></div>)}</div> : null}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Link href={`/billing-settings?view=integrations&provider=${connection.provider}`} className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${connection.configured ? "Manage connection" : "Connect profile"} for ${connection.name}`}>{connection.configured ? "Manage connection" : "Connect profile"}<ExternalLink className="size-3" aria-hidden="true" /></Link>
                  {connection.configured ? <button type="button" disabled={isPending} onClick={() => syncAnalytics(connection.provider)} aria-busy={pendingAction === `sync:${connection.provider}`} className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><RefreshCw className="size-3" aria-hidden="true" />{pendingAction === `sync:${connection.provider}` ? `Syncing ${connection.name}…` : `Sync ${connection.name} analytics`}</button> : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
