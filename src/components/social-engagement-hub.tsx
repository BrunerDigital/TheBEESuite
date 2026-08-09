"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ExternalLink, Inbox, Link2, MessageSquareReply, RefreshCw, Send, ShieldCheck, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ExternalReview, SocialInboxItem } from "@/lib/social-engagement";

export type MarketingCenterOption = {
  id: string;
  name: string;
  crmLocationId: string | null;
};

type Props = {
  centers: MarketingCenterOption[];
  initialCenterId: string | null;
};

type InboxResponse = {
  ok?: boolean;
  configured?: boolean;
  error?: string;
  items?: SocialInboxItem[];
  warnings?: string[];
  inboxUrl?: string;
  syncedAt?: string;
};

type ReviewResponse = {
  ok?: boolean;
  configured?: boolean;
  error?: string;
  reviews?: ExternalReview[];
  averageRating?: number | null;
  totalReviewCount?: number;
  syncedAt?: string;
};

const capabilities = [
  { provider: "Facebook & Instagram", publish: "Direct API", analytics: "Organic + paid", engagement: "Direct unified inbox", note: "Meta app review required" },
  { provider: "Google Business Profile", publish: "Direct API", analytics: "Profile performance", engagement: "Reviews + public replies", note: "Verified location required" },
  { provider: "LinkedIn", publish: "Direct API", analytics: "Organic + paid", engagement: "Comments via native tools", note: "Community Management approval" },
  { provider: "TikTok", publish: "Direct API", analytics: "Organic + paid", engagement: "Native inbox handoff", note: "Public posting audit required" },
  { provider: "Pinterest", publish: "Direct API", analytics: "Organic", engagement: "Native inbox handoff", note: "Business app access required" },
  { provider: "X", publish: "Direct API", analytics: "Organic", engagement: "Native inbox handoff", note: "Access-tier dependent" },
  { provider: "Google & Microsoft Ads", publish: "Ad platforms", analytics: "Paid campaigns", engagement: "Not applicable", note: "Official ad APIs" },
] as const;

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function networkLabel(value: string) {
  return value.toLocaleLowerCase("en-US").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function SocialEngagementHub({ centers, initialCenterId }: Props) {
  const [centerId, setCenterId] = useState(initialCenterId || centers[0]?.id || "");
  const [inboxItems, setInboxItems] = useState<SocialInboxItem[]>([]);
  const [reviews, setReviews] = useState<ExternalReview[]>([]);
  const [reviewSummary, setReviewSummary] = useState({ averageRating: null as number | null, totalReviewCount: 0 });
  const [inboxStatus, setInboxStatus] = useState("Select Refresh Inbox to load current provider data.");
  const [reviewStatus, setReviewStatus] = useState("Select Refresh Reviews to load current Google data.");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyTarget, setReplyTarget] = useState<ExternalReview | null>(null);
  const [isPending, startTransition] = useTransition();

  function selectCenter(nextCenterId: string) {
    setCenterId(nextCenterId);
    setInboxItems([]);
    setReviews([]);
    setReviewSummary({ averageRating: null, totalReviewCount: 0 });
    setInboxStatus("Select Refresh Inbox to load current provider data.");
    setReviewStatus("Select Refresh Reviews to load current Google data.");
  }

  function refreshInbox() {
    if (!centerId) return;
    startTransition(async () => {
      setInboxStatus("Loading the school’s Meta inbox…");
      const response = await fetch(`/api/marketing/engagement?source=meta_inbox&centerId=${encodeURIComponent(centerId)}`, { cache: "no-store" });
      const json = await response.json().catch(() => null) as InboxResponse | null;
      if (!response.ok || !json?.ok) {
        setInboxItems([]);
        setInboxStatus(json?.error || "The social inbox could not be loaded. Check the school’s Meta connection and messaging permissions.");
        return;
      }
      setInboxItems(json.items ?? []);
      const warning = json.warnings?.length ? ` ${json.warnings.join(" ")}` : "";
      setInboxStatus(`${json.items?.length ?? 0} recent message${json.items?.length === 1 ? "" : "s"} loaded directly from Meta.${warning}`);
    });
  }

  function refreshReviews() {
    if (!centerId) return;
    startTransition(async () => {
      setReviewStatus("Loading the school’s Google reviews…");
      const response = await fetch(`/api/marketing/engagement?source=google_reviews&centerId=${encodeURIComponent(centerId)}`, { cache: "no-store" });
      const json = await response.json().catch(() => null) as ReviewResponse | null;
      if (!response.ok || !json?.ok) {
        setReviews([]);
        setReviewStatus(json?.error || "Google reviews could not be loaded. Check the school’s Business Profile connection.");
        return;
      }
      setReviews(json.reviews ?? []);
      setReviewSummary({ averageRating: json.averageRating ?? null, totalReviewCount: json.totalReviewCount ?? json.reviews?.length ?? 0 });
      setReviewStatus(`${json.reviews?.length ?? 0} recent review${json.reviews?.length === 1 ? "" : "s"} loaded from Google.`);
    });
  }

  function publishReply() {
    if (!replyTarget || !centerId) return;
    const comment = replyDrafts[replyTarget.name]?.trim() || "";
    startTransition(async () => {
      setReviewStatus("Publishing the confirmed Google review response…");
      const response = await fetch("/api/marketing/engagement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply_google_review", centerId, reviewName: replyTarget.name, comment, confirm: true }),
      });
      const json = await response.json().catch(() => null) as { ok?: boolean; error?: string; reply?: { comment: string; updateTime: string; state?: string } } | null;
      if (!response.ok || !json?.ok || !json.reply) {
        setReviewStatus(json?.error || "The Google review response could not be published.");
        setReplyTarget(null);
        return;
      }
      setReviews((current) => current.map((review) => review.name === replyTarget.name
        ? { ...review, reply: json.reply?.comment || comment, replyUpdatedAt: json.reply?.updateTime || new Date().toISOString(), replyState: json.reply?.state || review.replyState }
        : review));
      setReviewStatus("The public Google review response was published and audit logged.");
      setReplyTarget(null);
    });
  }

  if (!centers.length) {
    return (
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Social Inbox & Reviews</CardTitle>
          <CardDescription>An active, authorized school is required before social provider data can be loaded.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Card className="glass-panel">
        <CardHeader>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle>Social Inbox & Reputation</CardTitle>
              <CardDescription className="mt-2 max-w-3xl">
                Work from one school-scoped command center while official platform APIs continue to handle publishing, reviews, and paid campaign reporting.
              </CardDescription>
            </div>
            <Link href="/integrations" className={buttonVariants({ variant: "outline" })}>
              <Link2 data-icon="inline-start" aria-hidden="true" />
              Manage Connections
            </Link>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2 md:max-w-xl">
            <Label htmlFor="engagement-center">School</Label>
            <select
              id="engagement-center"
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={centerId}
              onChange={(event) => selectCenter(event.target.value)}
            >
              {centers.map((center) => (
                <option key={center.id} value={center.id}>{center.crmLocationId ? `${center.crmLocationId} · ` : ""}{center.name}</option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <p>Provider tokens stay encrypted and school scoped. Message and review content is loaded on demand and is not copied into family messages, billing records, or the BEE Suite database.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="inbox" className="gap-4">
        <TabsList>
          <TabsTrigger value="inbox">Unified Inbox</TabsTrigger>
          <TabsTrigger value="reviews">Google Reviews</TabsTrigger>
          <TabsTrigger value="coverage">Platform Coverage</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="grid gap-4">
          <Card className="glass-panel">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Facebook & Instagram Inbox</CardTitle>
                  <CardDescription className="mt-2">Recent Messenger and Instagram professional-account conversations loaded directly through Meta’s official API.</CardDescription>
                </div>
                <Button type="button" onClick={refreshInbox} disabled={isPending || !centerId}>
                  <RefreshCw data-icon="inline-start" aria-hidden="true" />
                  Refresh Inbox
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm text-muted-foreground" aria-live="polite">{inboxStatus}</p>
              {inboxItems.length ? (
                <div className="grid gap-3">
                  {inboxItems.map((item) => (
                    <article key={item.id} className="min-w-0 rounded-xl border bg-background/50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{networkLabel(item.network)}</Badge>
                        <Badge variant="secondary">{networkLabel(item.type)}</Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
                      </div>
                      <h3 className="mt-3 font-medium text-pretty">{item.author}</h3>
                      <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{item.text || "This provider item has no text content."}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.inboxPermalink ? <a href={item.inboxPermalink} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm" })}><Inbox data-icon="inline-start" aria-hidden="true" />Respond in Meta</a> : null}
                        {item.permalink ? <a href={item.permalink} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}><ExternalLink data-icon="inline-start" aria-hidden="true" />Open Network Post</a> : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No provider messages are loaded for this school.</div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Direct Connection Readiness</CardTitle>
              <CardDescription>Use the school’s existing Meta OAuth connection—no social-management intermediary or separate inbox token is required.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border bg-background/40 p-4 text-sm leading-6 text-muted-foreground">
                Connect Facebook & Instagram in Settings & Setup → Integrations, select the correct Page and linked professional account, then complete Meta’s messaging-permission review. The BEE Suite uses that same encrypted school connection for publishing, profile analytics, and this inbox.
                <div className="mt-3"><Link href="/integrations" className={buttonVariants({ size: "sm", variant: "outline" })}><Link2 data-icon="inline-start" aria-hidden="true" />Open Meta Connection</Link></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews">
          <Card className="glass-panel">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Google Business Reviews</CardTitle>
                  <CardDescription className="mt-2">Read current location reviews and publish a confirmed public response from the selected school.</CardDescription>
                </div>
                <Button type="button" onClick={refreshReviews} disabled={isPending || !centerId}><RefreshCw data-icon="inline-start" aria-hidden="true" />Refresh Reviews</Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline"><Star data-icon="inline-start" aria-hidden="true" />{reviewSummary.averageRating === null ? "Rating not loaded" : `${reviewSummary.averageRating.toFixed(1)} average`}</Badge>
                <Badge variant="outline">{reviewSummary.totalReviewCount} total reviews</Badge>
              </div>
              <p className="text-sm text-muted-foreground" aria-live="polite">{reviewStatus}</p>
              <div className="grid gap-4">
                {reviews.map((review) => (
                  <article key={review.name} className="rounded-xl border bg-background/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{review.reviewer}</h3><Badge variant="outline">{review.rating || "—"} / 5</Badge></div>
                      <span className="text-xs text-muted-foreground">{formatDate(review.updatedAt || review.createdAt)}</span>
                    </div>
                    <p className="mt-3 break-words text-sm leading-6 text-muted-foreground">{review.comment || "This reviewer left a rating without a written comment."}</p>
                    {review.reply ? <div className="mt-4 rounded-lg border bg-primary/5 p-3 text-sm"><div className="font-medium">Current public response</div><p className="mt-1 break-words text-muted-foreground">{review.reply}</p></div> : null}
                    <div className="mt-4 grid gap-2">
                      <Label htmlFor={`review-reply-${review.id}`}>{review.reply ? "Update Public Response" : "Public Response"}</Label>
                      <Textarea id={`review-reply-${review.id}`} name={`review_reply_${review.id}`} autoComplete="off" maxLength={4096} placeholder="Write a helpful, privacy-safe response…" value={replyDrafts[review.name] ?? review.reply} onChange={(event) => setReplyDrafts((current) => ({ ...current, [review.name]: event.target.value }))} />
                      <div><Button type="button" size="sm" onClick={() => setReplyTarget(review)} disabled={isPending || !(replyDrafts[review.name] ?? review.reply).trim()}><MessageSquareReply data-icon="inline-start" aria-hidden="true" />Review & Publish</Button></div>
                    </div>
                  </article>
                ))}
                {!reviews.length ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No Google reviews are loaded for this school.</div> : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coverage">
          <Card className="glass-panel">
            <CardHeader><CardTitle>Platform Capability Map</CardTitle><CardDescription>The BEE Suite uses direct official APIs for publishing and reporting, with explicit native handoffs where a platform does not offer the required inbox capability.</CardDescription></CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader><TableRow><TableHead>Platform</TableHead><TableHead>Publishing</TableHead><TableHead>Analytics</TableHead><TableHead>Inbox & Reviews</TableHead><TableHead>Connection Gate</TableHead></TableRow></TableHeader>
                  <TableBody>{capabilities.map((row) => <TableRow key={row.provider}><TableCell className="font-medium">{row.provider}</TableCell><TableCell>{row.publish}</TableCell><TableCell>{row.analytics}</TableCell><TableCell>{row.engagement}</TableCell><TableCell>{row.note}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(replyTarget)} onOpenChange={(open) => { if (!open) setReplyTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Publish Public Google Response?</DialogTitle><DialogDescription>This response will appear publicly on the selected school’s Google Business Profile. Confirm that it contains no private child, family, or staff information.</DialogDescription></DialogHeader>
          <div className="max-h-64 overflow-y-auto rounded-lg border bg-background/50 p-3 text-sm leading-6 whitespace-pre-wrap break-words">{replyTarget ? replyDrafts[replyTarget.name] ?? replyTarget.reply : ""}</div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setReplyTarget(null)}>Cancel</Button><Button type="button" onClick={publishReply} disabled={isPending}><Send data-icon="inline-start" aria-hidden="true" />Publish Response</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
