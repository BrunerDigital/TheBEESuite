"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  function save() {
    startTransition(async () => {
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
        router.refresh();
      }
    });
  }

  return (
    <div className="flex min-w-72 flex-col gap-2">
      <Select value={status} onValueChange={(value) => value && setStatus(value)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="reviewed">Reviewed</SelectItem>
          <SelectItem value="needs_follow_up">Needs follow-up</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>
      <Input value={followUpTask} onChange={(event) => setFollowUpTask(event.target.value)} placeholder="Optional follow-up task" />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={notified} onChange={(event) => setNotified(event.target.checked)} />
        Parent notified
      </label>
      <div className="text-xs text-muted-foreground">
        {parentAcknowledgedAt ? `Parent acknowledged ${new Date(parentAcknowledgedAt).toLocaleDateString()}` : "Parent acknowledgement pending"}
      </div>
      <Button size="sm" disabled={isPending} onClick={save}>
        {status === "closed" ? <CheckCircle2 data-icon="inline-start" /> : <ClipboardCheck data-icon="inline-start" />}
        Save Review
      </Button>
    </div>
  );
}
