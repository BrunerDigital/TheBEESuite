"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CommunicationSendButton({
  endpoint,
  label = "Send email",
  requireBody = false,
}: {
  endpoint: string;
  label?: string;
  requireBody?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function send() {
    const body = requireBody ? window.prompt("Email body")?.trim() : "";
    if (requireBody && !body) {
      setMessage("Body required.");
      return;
    }

    startTransition(async () => {
      setMessage("");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ? { body } : {}),
      });
      const json = await response.json().catch(() => null) as { recipientCount?: number; error?: string } | null;
      if (!response.ok) {
        setMessage(json?.error || "Email could not be queued.");
        return;
      }
      setMessage(`${json?.recipientCount ?? 0} queued.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={send}>
        <Send data-icon="inline-start" />
        {label}
      </Button>
      {message ? <div className="text-xs text-muted-foreground">{message}</div> : null}
    </div>
  );
}
