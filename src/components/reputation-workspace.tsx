"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, MessageSquarePlus, Save, Send, Star } from "lucide-react";
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

function reputationDisplayLabel(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const normalized = value.trim();
  if (!normalized) return fallback;
  if (!normalized.includes("_") && !normalized.includes("-") && normalized !== normalized.toLocaleLowerCase("en-US") && normalized !== normalized.toLocaleUpperCase("en-US")) {
    return normalized;
  }
  const words = normalized.replaceAll("_", " ").replaceAll("-", " ").toLocaleLowerCase("en-US").split(/\s+/);
  return words.map((word, index) => {
    if (word === "nps") return "NPS";
    return index === 0 ? word.charAt(0).toLocaleUpperCase("en-US") + word.slice(1) : word;
  }).join(" ");
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
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-busy={isPending}
        aria-label={`Create a response draft for the ${review.rating}-star ${reputationDisplayLabel(review.source, "review")} review`}
        disabled={isPending}
        onClick={generate}
      >
        Create draft
      </Button>
      {message ? <div role="status" aria-live="polite" className="text-xs text-muted-foreground">{message}</div> : null}
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
        <div
          role={error ? "alert" : "status"}
          aria-live={error ? "assertive" : "polite"}
          className={error ? "rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" : "rounded-lg border bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"}
        >
          {error || message}
        </div>
      ) : null}
      <Tabs defaultValue="reviews" className="gap-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="requests">Review requests</TabsTrigger>
          <TabsTrigger value="surveys">Surveys/NPS</TabsTrigger>
        </TabsList>
        <TabsContent value="reviews">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Review queue</CardTitle>
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
                        <div className="font-medium">{reputationDisplayLabel(review.source, "Source unavailable")}</div>
                        <div className="text-xs text-muted-foreground">{review.center?.name ?? "All locations"} · {formatDate(review.createdAt, timeZone)}</div>
                      </TableCell>
                      <TableCell>{review.rating}/5</TableCell>
                      <TableCell className="max-w-sm whitespace-normal text-muted-foreground">{review.body ?? ""}</TableCell>
                      <TableCell className="max-w-sm whitespace-normal">{review.responseDraft ?? "Not drafted"}</TableCell>
                      <TableCell>
                        {review.approvedForPublicTestimonial ? <Badge>Approved</Badge> : <Badge variant="outline">{reputationDisplayLabel(review.status, "Status unavailable")}</Badge>}
                      </TableCell>
                      <TableCell><ReviewDraftButton review={review} /></TableCell>
                    </TableRow>
                  ))}
                  {!data.reviews.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">No reviews have been received for the selected schools.</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="requests" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Request reviews</CardTitle>
              <CardDescription>Send now or schedule a family review request for the selected schools.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="reputation-review-center">Center</Label>
                  <Select value={reviewCenterId} onValueChange={(value) => {
                    if (!value) return;
                    updateReviewCenter(value);
                  }}>
                    <SelectTrigger id="reputation-review-center" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All available schools</SelectItem>
                      {data.centers.map((center) => (
                        <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reputation-review-limit">Limit</Label>
                  <Input id="reputation-review-limit" inputMode="numeric" value={reviewLimit} onChange={(event) => setReviewLimit(event.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="reputation-review-url">Google Review URL</Label>
                  <Input id="reputation-review-url" type="url" value={reviewUrl} onChange={(event) => {
                    setReviewUrl(event.target.value);
                    const name = reviewCenterId === "all" ? "our school" : centerName(reviewCenterId);
                    setReviewBody(buildReviewRequestCopy({ centerName: name, reviewUrl: event.target.value }));
                  }} placeholder="https://g.page/r/..." />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="reputation-review-subject">Subject</Label>
                  <Input id="reputation-review-subject" value={reviewSubject} onChange={(event) => setReviewSubject(event.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="reputation-review-message">Message</Label>
                  <Textarea id="reputation-review-message" className="min-h-48" value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="reputation-review-schedule">Schedule</Label>
                  <Input id="reputation-review-schedule" type="datetime-local" value={reviewSendAt} onChange={(event) => setReviewSendAt(event.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" aria-busy={isPending} disabled={isPending || !reviewBody} onClick={submitReviewRequest}>
                  <Send data-icon="inline-start" />
                  {reviewSendAt ? "Schedule review request" : "Send review request"}
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle as="h2">Review request guidance</CardTitle>
              <CardDescription>Check each request before sending it to families.</CardDescription>
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
            <Card>
              <CardHeader>
                <CardTitle as="h2">Survey builder</CardTitle>
                <CardDescription>Create an NPS or satisfaction survey for one or more schools.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="reputation-saved-survey">Saved survey</Label>
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
                      <SelectTrigger id="reputation-saved-survey" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New survey</SelectItem>
                        {data.surveys.map((survey) => (
                          <SelectItem key={survey.id} value={survey.id}>{survey.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reputation-survey-center">Center</Label>
                    <Select value={surveyCenterId} onValueChange={(value) => value && setSurveyCenterId(value)}>
                      <SelectTrigger id="reputation-survey-center" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All locations</SelectItem>
                        {data.centers.map((center) => (
                          <SelectItem key={center.id} value={center.id}>{center.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reputation-survey-name">Name</Label>
                    <Input id="reputation-survey-name" value={surveyName} onChange={(event) => setSurveyName(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reputation-survey-type">Type</Label>
                    <Select value={surveyType} onValueChange={(value) => value && setSurveyType(value)}>
                      <SelectTrigger id="reputation-survey-type" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nps">NPS</SelectItem>
                        <SelectItem value="family_satisfaction">Family satisfaction</SelectItem>
                        <SelectItem value="tour_feedback">Tour feedback</SelectItem>
                        <SelectItem value="exit_feedback">Exit feedback</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reputation-survey-status">Status</Label>
                    <Select value={surveyStatus} onValueChange={(value) => value && setSurveyStatus(value)}>
                      <SelectTrigger id="reputation-survey-status" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="reputation-survey-prompt">Prompt</Label>
                    <Textarea id="reputation-survey-prompt" value={surveyDescription} onChange={(event) => setSurveyDescription(event.target.value)} />
                  </div>
                </div>
                <Button type="button" aria-busy={isPending} disabled={isPending || !surveyName} onClick={saveSurvey}>
                  <Save data-icon="inline-start" />
                  Save survey
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle as="h2">Record NPS response</CardTitle>
                <CardDescription>Manual entry for phone, paper, or director-entered family feedback.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="reputation-response-survey">Survey</Label>
                    <Select value={responseSurveyId || "none"} onValueChange={(value) => {
                      if (!value) return;
                      setResponseSurveyId(value === "none" ? "" : value);
                    }}>
                      <SelectTrigger id="reputation-response-survey" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Choose survey</SelectItem>
                        {data.surveys.map((survey) => (
                          <SelectItem key={survey.id} value={survey.id}>{survey.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reputation-response-score">Score</Label>
                    <Select value={responseScore} onValueChange={(value) => value && setResponseScore(value)}>
                      <SelectTrigger id="reputation-response-score" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 11 }, (_, score) => (
                          <SelectItem key={score} value={String(score)}>{score}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reputation-respondent-name">Respondent</Label>
                    <Input id="reputation-respondent-name" value={respondentName} onChange={(event) => setRespondentName(event.target.value)} placeholder="Optional name" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="reputation-respondent-email">Email</Label>
                    <Input id="reputation-respondent-email" type="email" value={respondentEmail} onChange={(event) => setRespondentEmail(event.target.value)} placeholder="Optional email" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="reputation-response-comment">Comment</Label>
                    <Textarea id="reputation-response-comment" value={responseComment} onChange={(event) => setResponseComment(event.target.value)} />
                  </div>
                </div>
                <Button type="button" aria-busy={isPending} disabled={isPending || !responseSurveyId} onClick={recordResponse}>
                  <MessageSquarePlus data-icon="inline-start" />
                  Record response
                </Button>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle as="h2">Survey reporting</CardTitle>
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
                    <TableHead>Latest feedback</TableHead>
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
                          <div className="text-xs text-muted-foreground">Created {formatDate(survey.createdAt, timeZone)}</div>
                        </TableCell>
                        <TableCell>{survey.center?.name ?? "All locations"}</TableCell>
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
                        <TableCell><Badge variant={survey.status === "active" ? "default" : "outline"}>{reputationDisplayLabel(survey.status, "Status unavailable")}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                  {!data.surveys.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">No surveys have been created for the selected schools.</TableCell>
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
