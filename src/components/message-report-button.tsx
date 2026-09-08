"use client";

import { useState } from "react";
import { Flag, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MessageReportButton({ messageId, inverse = false }: { messageId: string; inverse?: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "reported" | "error">("idle");

  async function report() {
    if (!window.confirm("Report this message for a safety or conduct review? The message will be preserved for authorized reviewers.")) return;
    setState("sending");
    try {
      const response = await fetch(`/api/communications/messages/${encodeURIComponent(messageId)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "inappropriate_or_abusive" }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Report could not be submitted.");
      setState("reported");
    } catch {
      setState("error");
    }
  }

  const label = state === "reported" ? "Reported" : state === "error" ? "Try report again" : "Report";
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={`mt-2 min-h-11 px-2 text-xs ${inverse ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-muted-foreground"}`}
      disabled={state === "sending" || state === "reported"}
      aria-label={`${label} this message`}
      onClick={report}
    >
      {state === "sending" ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Flag aria-hidden="true" />}
      {state === "sending" ? "Reporting…" : label}
    </Button>
  );
}
