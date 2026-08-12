"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SchoolDateTime } from "@/components/school-time-zone-context";

export function IncidentReviewActions({
  incidentId,
  currentStatus,
  parentNotified,
  parentAcknowledgedAt,
}: {
  incidentId: string;
  currentStatus: string;
  parentNotified: boolean;
  parentAcknowledgedAt?: Date | string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(currentStatus);
  const [notified, setNotified] = useState(parentNotified);
  const [followUpTask, setFollowUpTask] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function save() {
    startTransition(async () => {
      setMessage("");
      setError("");
      const response = await fetch(`/api/incidents/${incidentId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminReviewStatus: status,
          parentNotified: notified,
          followUpTask,
        }),
      });
      if (response.ok) {
        setFollowUpTask("");
        setMessage("Incident review saved.");
        router.refresh();
      } else {
        const json = await response.json().catch(() => null) as { error?: string } | null;
        setError(json?.error || "Incident review could not be saved.");
      }
    });
  }

  return (
    <div className="flex min-w-72 flex-col gap-2">
      <Select value={status} onValueChange={(value) => value && setStatus(value)}>
        <SelectTrigger aria-label="Incident review status"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="reviewed">Reviewed</SelectItem>
          <SelectItem value="needs_follow_up">Needs follow-up</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>
      <Input
        value={followUpTask}
        onChange={(event) => setFollowUpTask(event.target.value)}
        placeholder="Optional follow-up task"
        aria-label="Incident follow-up task"
      />
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <input className="size-5 accent-primary" type="checkbox" checked={notified} onChange={(event) => setNotified(event.target.checked)} />
        Parent notified
      </label>
      <div className="text-xs text-muted-foreground">
        {parentAcknowledgedAt ? <>Parent acknowledged <SchoolDateTime value={parentAcknowledgedAt} options={{ month: "short", day: "numeric", year: "numeric" }} /></> : "Parent acknowledgement pending"}
      </div>
      {message ? <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{message}</p> : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <Button type="button" size="sm" disabled={isPending} aria-busy={isPending} onClick={save}>
        {status === "closed" ? <CheckCircle2 data-icon="inline-start" /> : <ClipboardCheck data-icon="inline-start" />}
        {isPending ? "Saving…" : "Save review"}
      </Button>
    </div>
  );
}
