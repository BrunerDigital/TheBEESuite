"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, MessageSquarePlus, Save, Send, Sparkles, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { buildReviewRequestCopy } from "@/lib/marketing-workflows";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedDateTime, zonedDateTimeLocalToUtc } from "@/lib/zoned-date-time";

type CenterOption = {
  id: string;
  name: string;
  crmLocationId: string | null;
};

type ReviewRow = {
  id: string;
  source: string;
  rating: number;
  body: string | null;
  responseDraft: string | null;
  approvedForPublicTestimonial: boolean;
  status: string;
  createdAt: Date | string;
  center: { name: string; crmLocationId: string | null } | null;
};

type SurveyResponseRow = {
  id: string;
  score: number;
  comment: string | null;
  respondentName: string | null;
  submittedAt: Date | string;
};

type SurveyRow = {
  id: string;
  centerId: string | null;
  name: string;
  type: string;
  description: string | null;
  status: string;
  results: unknown;
  createdAt: Date | string;
  center: { name: string; crmLocationId: string | null } | null;
  _count: { responses: number };
  responses: SurveyResponseRow[];
};

export type ReputationWorkspaceData = {
  centers: CenterOption[];
  reviews: ReviewRow[];
  surveys: SurveyRow[];
  stats: { reviews: number; averageRating: number; testimonials: number; surveys: number };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatDate(value: Date | string, timeZone: string) {
  return formatZonedDateTime(value, timeZone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }, "Unknown");
}

function npsStats(survey: SurveyRow) {
  const nps = asRecord(asRecord(survey.results).nps);
  return {
    total: survey._count.responses || numberValue(nps.total),
    promoters: numberValue(nps.promoters),
    passives: numberValue(nps.passives),
    detractors: numberValue(nps.detractors),
    score: numberValue(nps.score),
  };
}

function ReviewDraftButton({ review }: { review: ReviewRow }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      setMessage("");
      const response = await fetch(`/api/reputation/reviews/${review.id}/ai-response`, { method: "POST" });
      const json = await response.json().catch(() => null) as { error?: string; guardrailNote?: string } | null;
      if (!response.ok) {
        setMessage(json?.error || "Draft failed.");
        return;
      }
      setMessage("Draft ready for staff review.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={generate}>
        <Sparkles data-icon="inline-start" />
        Generate
      </Button>
      {message ? <div className="text-xs text-muted-foreground">{message}</div> : null}
    </div>
  );
}

export function ReputationWorkspace({ data }: { data: ReputationWorkspaceData }) {
  const timeZone = useSchoolTimeZone();
  const router = useRouter();
  const [reviewCenterId, setReviewCenterId] = useState("all");
  const [reviewUrl, setReviewUrl] = useState("");
  const [reviewSubject, setReviewSubject] = useState("How was your experience with our school?");
  const [reviewBody, setReviewBody] = useState(buildReviewRequestCopy({ centerName: "our school" }));
  const [reviewSendAt, setReviewSendAt] = useState("");
  const [reviewLimit, setReviewLimit] = useState("500");
  const [surveyId, setSurveyId] = useState(data.surveys[0]?.id ?? "");
  const selectedSurvey = data.surveys.find((survey) => survey.id === surveyId) ?? null;
  const [surveyName, setSurveyName] = useState(selectedSurvey?.name ?? "Family satisfaction NPS");
  const [surveyCenterId, setSurveyCenterId] = useState(selectedSurvey?.centerId ?? "all");
  const [surveyType, setSurveyType] = useState(selectedSurvey?.type ?? "nps");
  const [surveyStatus, setSurveyStatus] = useState(selectedSurvey?.status ?? "active");
  const [surveyDescription, setSurveyDescription] = useState(selectedSurvey?.description ?? "How likely are you to recommend our school to another family?");
  const [responseSurveyId, setResponseSurveyId] = useState(data.surveys[0]?.id ?? "");
  const [responseScore, setResponseScore] = useState("10");
  const [responseComment, setResponseComment] = useState("");
  const [respondentName, setRespondentName] = useState("");
  const [respondentEmail, setRespondentEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function centerName(centerId: string) {
    return data.centers.find((center) => center.id === centerId)?.name ?? "our school";
  }

  function updateReviewCenter(value: string) {
    setReviewCenterId(value);
    const name = value === "all" ? "our school" : centerName(value);
    setReviewSubject(`How was your experience with ${name}?`);
    setReviewBody(buildReviewRequestCopy({ centerName: name, reviewUrl }));
  }

  function submitReviewRequest() {
    startTransition(async () => {
      setMessage("");
      setError("");
      const response = await fetch("/api/reputation/review-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId: reviewCenterId === "all" ? undefined : reviewCenterId,
          subject: reviewSubject,
          body: reviewBody,
          reviewUrl,
          sendAt: reviewSendAt ? zonedDateTimeLocalToUtc(reviewSendAt, timeZone)?.toISOString() : undefined,
          limit: reviewLimit,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; recipientCount?: number; scheduled?: boolean } | null;
      if (!response.ok) {
        setError(json?.error || "Review request could not be queued.");
        return;
      }
      setMessage(json?.scheduled ? "Review request scheduled." : `${json?.recipientCount ?? 0} review requests queued.`);
      router.refresh();
    });
  }

  function loadSurvey(value: string) {
    setSurveyId(value);
    const survey = data.surveys.find((item) => item.id === value);
    if (!survey) return;
    setSurveyName(survey.name);
    setSurveyType(survey.type);
    setSurveyStatus(survey.status);
    setSurveyDescription(survey.description ?? "");
    setSurveyCenterId(survey.centerId ?? "all");
  }

  function saveSurvey() {
    startTransition(async () => {
      setMessage("");
      setError("");
      const response = await fetch("/api/reputation/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: surveyId || undefined,
          centerId: surveyCenterId === "all" ? undefined : surveyCenterId,
          name: surveyName,
          type: surveyType,
          description: surveyDescription,
          status: surveyStatus,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; survey?: { id?: string } } | null;
      if (!response.ok) {
        setError(json?.error || "Survey could not be saved.");
        return;
      }
      if (json?.survey?.id) {
        setSurveyId(json.survey.id);
        setResponseSurveyId(json.survey.id);
      }
      setMessage("Survey saved.");
      router.refresh();
    });
  }

  function recordResponse() {
    startTransition(async () => {
      setMessage("");
      setError("");
      if (!responseSurveyId) {
        setError("Choose a survey before recording a response.");
        return;
      }
      const response = await fetch(`/api/reputation/surveys/${responseSurveyId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score: Number(responseScore),
          comment: responseComment,
          respondentName,
          respondentEmail,
          source: "director_entry",
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(json?.error || "Survey response could not be recorded.");
        return;
      }
      setResponseComment("");
      setRespondentName("");
      setRespondentEmail("");
      setMessage("Survey response recorded.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {(message || error) ? (
        <div className={error ? "rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" : "rounded-lg border bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"}>
          {error || message}
        </div>
      ) : null}
      <Tabs defaultValue="reviews" className="gap-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="requests">Review Requests</TabsTrigger>
          <TabsTrigger value="surveys">Surveys/NPS</TabsTrigger>
        </TabsList>
        <TabsContent value="reviews">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Review Queue</CardTitle>
              <CardDescription>AI-assisted drafts require staff approval before posting or sending.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead>AI Draft</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.reviews.map((review) => (
                    <TableRow key={review.id}>
                      <TableCell>
                        <div className="font-medium">{review.source}</div>
                        <div className="text-xs text-muted-foreground">{review.center?.name ?? "Tenant-wide"} · {formatDate(review.createdAt, timeZone)}</div>
                      </TableCell>
                      <TableCell>{review.rating}/5</TableCell>
                      <TableCell className="max-w-sm whitespace-normal text-muted-foreground">{review.body ?? ""}</TableCell>
                      <TableCell className="max-w-sm whitespace-normal">{review.responseDraft ?? "Not drafted"}</TableCell>
                      <TableCell>
                        {review.approvedForPublicTestimonial ? <Badge>Approved</Badge> : <Badge variant="outline">{review.status}</Badge>}
                      </TableCell>
                      <TableCell><ReviewDraftButton review={review} /></TableCell>
                    </TableRow>
                  ))}
                  {!data.reviews.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">No tenant reviews have been captured yet.</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="requests" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Review Request Workflow</CardTitle>
              <CardDescription>Send or schedule family review requests for selected centers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Center</Label>
                  <Select value={reviewCenterId} onValueChange={(value) => {
                    if (!value) return;
                    updateReviewCenter(value);
                  }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All accessible centers</SelectItem>
                      {data.centers.map((center) => (
                        <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Limit</Label>
                  <Input inputMode="numeric" value={reviewLimit} onChange={(event) => setReviewLimit(event.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Google Review URL</Label>
                  <Input value={reviewUrl} onChange={(event) => {
                    setReviewUrl(event.target.value);
                    const name = reviewCenterId === "all" ? "our school" : centerName(reviewCenterId);
                    setReviewBody(buildReviewRequestCopy({ centerName: name, reviewUrl: event.target.value }));
                  }} placeholder="https://g.page/r/..." />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Subject</Label>
                  <Input value={reviewSubject} onChange={(event) => setReviewSubject(event.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Message</Label>
                  <Textarea className="min-h-48" value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Schedule</Label>
                  <Input type="datetime-local" value={reviewSendAt} onChange={(event) => setReviewSendAt(event.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={isPending || !reviewBody} onClick={submitReviewRequest}>
                  <Send data-icon="inline-start" />
                  Send / Schedule
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Review Request Rules</CardTitle>
              <CardDescription>Recommended workflow controls for school directors.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                "Target recently enrolled or currently active families.",
                "Use center-specific Google Business links when available.",
                "Do not send requests to families with unresolved incidents or billing disputes.",
                "Review AI response drafts before posting publicly.",
              ].map((item) => (
                <div key={item} className="flex gap-2 rounded-xl border bg-background/40 p-3">
                  <ClipboardCheck className="mt-0.5 size-4 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="surveys" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>Survey Builder</CardTitle>
                <CardDescription>Create NPS and satisfaction surveys for a tenant or center.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Saved Survey</Label>
                    <Select value={surveyId || "new"} onValueChange={(value) => {
                      if (!value) return;
                      if (value === "new") {
                        setSurveyId("");
                        setSurveyName("Family satisfaction NPS");
                        setSurveyType("nps");
                        setSurveyStatus("active");
                        setSurveyDescription("How likely are you to recommend our school to another family?");
                        return;
                      }
                      loadSurvey(value);
                    }}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New survey</SelectItem>
                        {data.surveys.map((survey) => (
                          <SelectItem key={survey.id} value={survey.id}>{survey.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Center</Label>
                    <Select value={surveyCenterId} onValueChange={(value) => value && setSurveyCenterId(value)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tenant-wide</SelectItem>
                        {data.centers.map((center) => (
                          <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={surveyName} onChange={(event) => setSurveyName(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Select value={surveyType} onValueChange={(value) => value && setSurveyType(value)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nps">NPS</SelectItem>
                        <SelectItem value="family_satisfaction">Family satisfaction</SelectItem>
                        <SelectItem value="tour_feedback">Tour feedback</SelectItem>
                        <SelectItem value="exit_feedback">Exit feedback</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Status</Label>
                    <Select value={surveyStatus} onValueChange={(value) => value && setSurveyStatus(value)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Prompt</Label>
                    <Textarea value={surveyDescription} onChange={(event) => setSurveyDescription(event.target.value)} />
                  </div>
                </div>
                <Button disabled={isPending || !surveyName} onClick={saveSurvey}>
                  <Save data-icon="inline-start" />
                  Save Survey
                </Button>
              </CardContent>
            </Card>
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>Record NPS Response</CardTitle>
                <CardDescription>Manual entry for phone, paper, or director-entered family feedback.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1 md:col-span-2">
                    <Label>Survey</Label>
                    <Select value={responseSurveyId || "none"} onValueChange={(value) => {
                      if (!value) return;
                      setResponseSurveyId(value === "none" ? "" : value);
                    }}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Choose survey</SelectItem>
                        {data.surveys.map((survey) => (
                          <SelectItem key={survey.id} value={survey.id}>{survey.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Score</Label>
                    <Select value={responseScore} onValueChange={(value) => value && setResponseScore(value)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 11 }, (_, score) => (
                          <SelectItem key={score} value={String(score)}>{score}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Respondent</Label>
                    <Input value={respondentName} onChange={(event) => setRespondentName(event.target.value)} placeholder="Optional name" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Email</Label>
                    <Input value={respondentEmail} onChange={(event) => setRespondentEmail(event.target.value)} placeholder="Optional email" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Comment</Label>
                    <Textarea value={responseComment} onChange={(event) => setResponseComment(event.target.value)} />
                  </div>
                </div>
                <Button disabled={isPending || !responseSurveyId} onClick={recordResponse}>
                  <MessageSquarePlus data-icon="inline-start" />
                  Record Response
                </Button>
              </CardContent>
            </Card>
          </div>
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Survey Reporting</CardTitle>
              <CardDescription>NPS score, response counts, and latest comments.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Survey</TableHead>
                    <TableHead>Center</TableHead>
                    <TableHead>NPS</TableHead>
                    <TableHead>Responses</TableHead>
                    <TableHead>Latest Feedback</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.surveys.map((survey) => {
                    const nps = npsStats(survey);
                    return (
                      <TableRow key={survey.id}>
                        <TableCell>
                          <div className="font-medium">{survey.name}</div>
                          <div className="text-xs text-muted-foreground">POST /api/reputation/surveys/{survey.id}/responses</div>
                        </TableCell>
                        <TableCell>{survey.center?.name ?? "Tenant-wide"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Star className="size-4 text-primary" />
                            <span className="font-medium">{nps.score}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">{nps.promoters} promoters · {nps.passives} passive · {nps.detractors} detractors</div>
                        </TableCell>
                        <TableCell>{nps.total}</TableCell>
                        <TableCell className="max-w-sm whitespace-normal text-muted-foreground">
                          {survey.responses[0]?.comment ?? "No comments yet"}
                        </TableCell>
                        <TableCell><Badge variant={survey.status === "active" ? "default" : "outline"}>{survey.status}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                  {!data.surveys.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">No tenant surveys have been configured yet.</TableCell>
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
