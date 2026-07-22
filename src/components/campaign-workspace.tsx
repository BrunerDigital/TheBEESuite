"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedDateTime, zonedDateTimeLocalToUtc, zonedDateTimeLocalValue } from "@/lib/zoned-date-time";
import { ArrowRight, BarChart3, CalendarClock, CheckCircle2, CopyCheck, Library, LineChart, Link2, Save, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { campaignTemplates } from "@/lib/marketing-workflows";
import { SocialPublishingStudio, type SocialConnection } from "@/components/social-publishing-studio";

type CampaignRow = {
  id: string;
  name: string;
  type: string;
  subject: string | null;
  body: string | null;
  templateKey: string | null;
  audience: unknown;
  status: string;
  scheduledAt: Date | string | null;
  sentAt: Date | string | null;
  metrics: unknown;
  brand: { name: string } | null;
};

export type CampaignWorkspaceData = {
  campaigns: CampaignRow[];
  marketingConnections: Array<{
    provider: string;
    name: string;
    purpose: string;
    status: "Connected" | "Configured" | "Missing" | "Placeholder";
    setupStatus: string;
    configured: boolean;
    accountLabel: string;
    lastSyncAt: Date | string | null;
  }>;
  socialConnections: SocialConnection[];
  stats: {
    total: number;
    active: number;
    draft: number;
    paused: number;
    scheduled?: number;
    sent?: number;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function formatDate(value: Date | string | null, timeZone: string) {
  return formatZonedDateTime(value, timeZone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }, "Not set");
}

function reportMetric(metrics: unknown, key: string) {
  const value = asRecord(metrics)[key];
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "None";
}

function numericMetric(metrics: unknown, keys: string[]) {
  const record = asRecord(metrics);
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: value >= 1_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function CampaignWorkspace({ data }: { data: CampaignWorkspaceData }) {
  const timeZone = useSchoolTimeZone();
  const router = useRouter();
  const firstCampaign = data.campaigns[0] ?? null;
  const [selectedId, setSelectedId] = useState(firstCampaign?.id ?? "");
  const [templateKey, setTemplateKey] = useState(firstCampaign?.templateKey ?? campaignTemplates[0]?.key ?? "");
  const [name, setName] = useState(firstCampaign?.name ?? campaignTemplates[0]?.name ?? "");
  const [type, setType] = useState(firstCampaign?.type ?? campaignTemplates[0]?.type ?? "email");
  const [audience, setAudience] = useState(textValue(asRecord(firstCampaign?.audience).label) || campaignTemplates[0]?.audienceLabel || "");
  const [subject, setSubject] = useState(firstCampaign?.subject ?? campaignTemplates[0]?.subject ?? "");
  const [body, setBody] = useState(firstCampaign?.body ?? campaignTemplates[0]?.body ?? "");
  const [status, setStatus] = useState(firstCampaign?.status ?? "draft");
  const [scheduledAt, setScheduledAt] = useState(firstCampaign?.scheduledAt ? zonedDateTimeLocalValue(firstCampaign.scheduledAt, timeZone) : "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const connectedPlatforms = data.marketingConnections.filter((connection) => connection.configured);
  const campaignTotals = data.campaigns.reduce((totals, campaign) => ({
    spend: totals.spend + numericMetric(campaign.metrics, ["spend", "amountSpent", "cost"]),
    impressions: totals.impressions + numericMetric(campaign.metrics, ["impressions", "views"]),
    clicks: totals.clicks + numericMetric(campaign.metrics, ["clicks", "linkClicks"]),
    leads: totals.leads + numericMetric(campaign.metrics, ["leads", "conversions", "inquiries"]),
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0 });

  const selectedCampaign = useMemo(
    () => data.campaigns.find((campaign) => campaign.id === selectedId) ?? null,
    [data.campaigns, selectedId],
  );

  function loadCampaign(campaign: CampaignRow) {
    setSelectedId(campaign.id);
    setTemplateKey(campaign.templateKey ?? "");
    setName(campaign.name);
    setType(campaign.type);
    setAudience(textValue(asRecord(campaign.audience).label));
    setSubject(campaign.subject ?? "");
    setBody(campaign.body ?? "");
    setStatus(campaign.status);
    setScheduledAt(campaign.scheduledAt ? zonedDateTimeLocalValue(campaign.scheduledAt, timeZone) : "");
    setMessage("");
    setError("");
  }

  function loadTemplate(key: string) {
    const template = campaignTemplates.find((item) => item.key === key);
    if (!template) return;
    setTemplateKey(template.key);
    setName(template.name);
    setType(template.type);
    setAudience(template.audienceLabel);
    setSubject(template.subject);
    setBody(template.body);
    setStatus("draft");
    setMessage("");
    setError("");
  }

  async function saveCampaign(nextStatus = status) {
    const response = await fetch("/api/operations/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "campaign",
        id: selectedId || undefined,
        name,
        type,
        templateKey,
        audience,
        subject,
        body,
        status: nextStatus,
        scheduledAt: scheduledAt ? zonedDateTimeLocalToUtc(scheduledAt, timeZone)?.toISOString() : undefined,
      }),
    });
    const json = await response.json().catch(() => null) as { error?: string; record?: { id?: string } } | null;
    if (!response.ok) throw new Error(json?.error || "Campaign could not be saved.");
    const id = json?.record?.id;
    if (id) setSelectedId(id);
    return id || selectedId;
  }

  function save(nextStatus = status) {
    startTransition(async () => {
      setMessage("");
      setError("");
      try {
        await saveCampaign(nextStatus);
        setStatus(nextStatus);
        setMessage("Campaign saved.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Campaign could not be saved.");
      }
    });
  }

  function sendOrSchedule(mode: "send" | "schedule") {
    startTransition(async () => {
      setMessage("");
      setError("");
      try {
        const id = await saveCampaign(mode === "schedule" ? "scheduled" : status);
        if (!id) throw new Error("Save the campaign before sending.");
        const response = await fetch(`/api/communications/campaigns/${id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            body,
            audience,
            scheduledAt: mode === "schedule" ? scheduledAt : undefined,
          }),
        });
        const json = await response.json().catch(() => null) as { error?: string; recipientCount?: number; scheduled?: boolean } | null;
        if (!response.ok) throw new Error(json?.error || "Campaign could not be queued.");
        setMessage(json?.scheduled ? "Campaign scheduled." : `${json?.recipientCount ?? 0} campaign emails queued.`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Campaign could not be queued.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border bg-card/80 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-4 border-b bg-gradient-to-r from-primary/10 via-card to-card p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold"><BarChart3 className="size-5 text-primary" /> Cross-platform campaign analytics</div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Monitor connected advertising channels, compare results, and keep enrollment attribution in one director workspace.</p>
          </div>
          <Button variant="outline" render={<Link href="/billing-settings?view=integrations&provider=meta_ads" />}>
            <Link2 data-icon="inline-start" /> Manage ad accounts
          </Button>
        </div>
        <div className="grid gap-px bg-border md:grid-cols-4">
          {[
            ["Spend", currency(campaignTotals.spend)],
            ["Impressions", compactNumber(campaignTotals.impressions)],
            ["Clicks", compactNumber(campaignTotals.clicks)],
            ["Leads", compactNumber(campaignTotals.leads)],
          ].map(([label, value]) => (
            <div key={label} className="bg-card px-5 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
              <div className="mt-2 text-2xl font-semibold">{value}</div>
            </div>
          ))}
        </div>
      </section>

      {!connectedPlatforms.length ? (
        <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-6">
          <div className="max-w-3xl">
            <h2 className="text-xl font-semibold">Connect your advertising channels</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">No ad account is connected yet. Choose a platform to open its exact configuration in Settings & Setup. Campaign editing and Bee Suite email reporting remain available while you connect external channels.</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {data.marketingConnections.map((connection) => (
              <Button key={connection.provider} variant="outline" className="h-auto justify-between py-3" render={<Link href={`/billing-settings?view=integrations&provider=${connection.provider}`} />}>
                <span className="text-left"><span className="block font-medium">{connection.name}</span><span className="block text-xs text-muted-foreground">Configure account</span></span>
                <ArrowRight className="size-4" />
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {data.marketingConnections.map((connection) => (
          <div key={connection.provider} className="rounded-xl border bg-card/70 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium">{connection.name}</div>
              {connection.configured ? <CheckCircle2 className="size-4 text-emerald-500" /> : <Link2 className="size-4 text-muted-foreground" />}
            </div>
            <div className="mt-1 min-h-9 text-xs leading-4 text-muted-foreground">{connection.accountLabel || connection.purpose}</div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Badge variant={connection.configured ? "default" : "outline"}>{connection.configured ? "Connected" : "Setup needed"}</Badge>
              <Link className="text-xs font-medium text-primary hover:underline" href={`/billing-settings?view=integrations&provider=${connection.provider}`}>{connection.configured ? "Manage" : "Connect"}</Link>
            </div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="editor" className="gap-4">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="social">Social Publisher</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="social">
          <SocialPublishingStudio connections={data.socialConnections} />
        </TabsContent>
        <TabsContent value="editor" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Campaign Editor</CardTitle>
              <CardDescription>Draft, schedule, and send enrollment marketing campaigns with saved templates.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {message ? <div className="rounded-lg border bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{message}</div> : null}
              {error ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Saved Campaign</Label>
                  <Select value={selectedId || "new"} onValueChange={(value) => {
                    if (value === "new") {
                      setSelectedId("");
                      setMessage("");
                      setError("");
                      return;
                    }
                    const campaign = data.campaigns.find((item) => item.id === value);
                    if (campaign) loadCampaign(campaign);
                  }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New campaign</SelectItem>
                      {data.campaigns.map((campaign) => (
                        <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Template</Label>
                  <Select value={templateKey || "custom"} onValueChange={(value) => {
                    if (!value) return;
                    if (value === "custom") {
                      setTemplateKey("");
                      return;
                    }
                    loadTemplate(value);
                  }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom campaign</SelectItem>
                      {campaignTemplates.map((template) => (
                        <SelectItem key={template.key} value={template.key}>{template.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(value) => value && setType(value)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="newsletter">Newsletter</SelectItem>
                      <SelectItem value="nurture">Nurture</SelectItem>
                      <SelectItem value="review_request">Review request</SelectItem>
                      <SelectItem value="survey">Survey</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Audience</Label>
                  <Input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Open inquiries, enrolled families, waitlist, classroom, tag" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Subject</Label>
                  <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Body</Label>
                  <Textarea className="min-h-56" value={body} onChange={(event) => setBody(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(value) => value && setStatus(value)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Schedule</Label>
                  <Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={isPending || !name} onClick={() => save()}>
                  <Save data-icon="inline-start" />
                  Save Draft
                </Button>
                <Button variant="outline" disabled={isPending || !body || !scheduledAt} onClick={() => sendOrSchedule("schedule")}>
                  <CalendarClock data-icon="inline-start" />
                  Schedule Send
                </Button>
                <Button variant="outline" disabled={isPending || !body} onClick={() => sendOrSchedule("send")}>
                  <Send data-icon="inline-start" />
                  Send Now
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Send Readiness</CardTitle>
              <CardDescription>Saved content, schedule, and delivery state for the selected campaign.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-xl border bg-background/40 p-4">
                <div className="text-muted-foreground">Selected</div>
                <div className="mt-1 font-medium">{selectedCampaign?.name ?? "New campaign"}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-background/40 p-3">
                  <div className="text-muted-foreground">Status</div>
                  <Badge className="mt-2" variant={status === "active" ? "default" : "outline"}>{status}</Badge>
                </div>
                <div className="rounded-xl border bg-background/40 p-3">
                  <div className="text-muted-foreground">Scheduled</div>
                  <div className="mt-2 font-medium">{scheduledAt || "Not set"}</div>
                </div>
              </div>
              <div className="rounded-xl border bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <LineChart className="size-4" />
                  Last Delivery
                </div>
                <div className="space-y-1 text-muted-foreground">
                  <div>Sent: {formatDate(selectedCampaign?.sentAt ?? null, timeZone)}</div>
                  <div>Recipients: {reportMetric(selectedCampaign?.metrics, "lastRecipientCount")}</div>
                  <div>Status: {reportMetric(selectedCampaign?.metrics, "lastDeliveryStatus")}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="templates">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {campaignTemplates.map((template) => (
              <Card key={template.key} className="glass-panel">
                <CardHeader>
                  <Badge className="w-fit" variant="outline">
                    <Library data-icon="inline-start" />
                    {template.type}
                  </Badge>
                  <CardTitle>{template.name}</CardTitle>
                  <CardDescription>{template.audienceLabel}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border bg-background/40 p-3 text-sm">
                    <div className="font-medium">{template.subject}</div>
                    <div className="mt-2 line-clamp-5 whitespace-pre-line text-muted-foreground">{template.body}</div>
                  </div>
                  <Button variant="outline" onClick={() => loadTemplate(template.key)}>
                    <CopyCheck data-icon="inline-start" />
                    Use Template
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="reports">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Campaign Send Reporting</CardTitle>
              <CardDescription>Schedule status, delivery attempts, and last-send metrics.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Spend</TableHead>
                    <TableHead>Results</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.campaigns.map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <div className="font-medium">{campaign.name}</div>
                        <div className="text-xs text-muted-foreground">{campaign.brand?.name ?? "Tenant-wide"} · {campaign.type}</div>
                      </TableCell>
                      <TableCell>{textValue(asRecord(campaign.audience).label) || "All eligible"}</TableCell>
                      <TableCell>{formatDate(campaign.scheduledAt, timeZone)}</TableCell>
                      <TableCell>{formatDate(campaign.sentAt, timeZone)}</TableCell>
                      <TableCell>{reportMetric(campaign.metrics, "platform") === "None" ? campaign.type : reportMetric(campaign.metrics, "platform")}</TableCell>
                      <TableCell>{currency(numericMetric(campaign.metrics, ["spend", "amountSpent", "cost"]))}</TableCell>
                      <TableCell>
                        <div className="text-sm">{compactNumber(numericMetric(campaign.metrics, ["clicks", "linkClicks"]))} clicks</div>
                        <div className="text-xs text-muted-foreground">{compactNumber(numericMetric(campaign.metrics, ["leads", "conversions", "inquiries"]))} leads</div>
                      </TableCell>
                      <TableCell><Badge variant={campaign.status === "active" ? "default" : "outline"}>{campaign.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {!data.campaigns.length ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-muted-foreground">No tenant campaigns have been configured yet.</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
