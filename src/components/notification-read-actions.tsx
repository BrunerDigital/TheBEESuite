"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  notificationId?: string;
  readAt?: string | Date | null;
  label?: string;
  compact?: boolean;
};

export function NotificationReadAction({ notificationId, readAt, label = "Mark read", compact = false }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      setError("");
      const response = await fetch("/api/notifications/summary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationId ? { notificationId } : { action: "mark_all_read" }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(json?.error || "Notification could not be updated.");
        return;
      }
      router.refresh();
    });
  }

  if (readAt && notificationId) {
    return <span className="text-xs text-muted-foreground">Read</span>;
  }

  return (
    <div className="space-y-1">
      <Button disabled={isPending} onClick={submit} variant="outline" size={compact ? "sm" : "default"}>
        <CheckCheck data-icon="inline-start" />
        {label}
      </Button>
      {error ? <p className="max-w-48 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
